import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { calculateOutlierScore } from "../../../lib/utils";
import { getSettings } from "../../../lib/db";
import prisma from "../../../lib/prisma";
import { authOptions } from "@/lib/auth";
import {
  DATE_RANGE_TO_MONTHS,
  METRIC_KEYS,
  type DateRangeOption,
  type FormatShowdownEntry,
  type InstagramOutlierResponse,
  type InstagramPost,
  type InstagramPostFormat,
  type MetricKey,
  type MetricStatsMap,
  type PostMetrics,
  type ZScoreMap,
} from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTLIER_THRESHOLD = 1.5;
const APIFY_ACTOR = "apify~instagram-profile-scraper";
const APIFY_ENDPOINT = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;
const APIFY_TIMEOUT_MS = 45_000;

const DATE_RANGE_MAP: Record<string, DateRangeOption> = {
  "1m": "1M",
  "3m": "3M",
  "12m": "12M",
  "past 1 month": "1M",
  "past 3 months": "3M",
  "past 12 months": "12M",
};

type UnknownRecord = Record<string, unknown>;

type DataSourceResult = {
  posts: InstagramPost[];
  source: "apify" | "mock";
  warnings: string[];
};

type ResultsType = "reels" | "posts";

const METRIC_PATHS: Record<MetricKey, string[]> = {
  views: [
    "videoPlayCount",
    "videoViewCount",
    "video_view_count",
    "playCount",
    "viewCount",
    "views",
    "plays",
    "video_views",
    "insights.video_views",
    "statistics.views",
  ],
  likes: [
    "likesCount",
    "likeCount",
    "likes",
    "edge_media_preview_like.count",
    "statistics.likes",
  ],
  comments: ["commentsCount", "commentCount", "comments", "edge_media_to_comment.count", "statistics.comments"],
  saves: ["savesCount", "saveCount", "saves", "statistics.saves"],
  shares: ["sharesCount", "shareCount", "shares", "statistics.shares"],
};

const TIMESTAMP_PATHS = [
  "timestamp",
  "createdAt",
  "created_at",
  "publishedAt",
  "takenAtTimestamp",
  "taken_at_timestamp",
  "takenAt",
  "date",
];

const PERMALINK_PATHS = ["url", "permalink", "shortcodeUrl", "link"];
const ID_PATHS = ["id", "pk", "shortcode", "code"];
const SHORTCODE_PATHS = ["shortcode", "code"];
const CAPTION_PATHS = ["caption", "text", "captionText", "description"];
const DISPLAY_URL_PATHS = ["displayUrl", "display_url", "imageUrl", "thumbnailSrc", "image"];
const VIDEO_URL_PATHS = ["videoUrl", "video_url", "video", "videoSrc"];
const FOLLOWER_PATHS = [
  "ownerFollowers",
  "owner.followersCount",
  "owner.followers_count",
  "owner.followerCount",
  "owner.edge_followed_by.count",
  "author.followers",
  "author.followersCount",
  "author.followers_count",
  "profile.followersCount",
  "followersCount",
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function toStringSafe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readPath(obj: UnknownRecord, path: string): unknown {
  const keys = path.split(".");
  let cursor: unknown = obj;

  for (const key of keys) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }

  return cursor;
}

function firstDefined(obj: UnknownRecord, paths: string[]): unknown {
  for (const path of paths) {
    const value = path.includes(".") ? readPath(obj, path) : obj[path];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizeDateRange(value: unknown): DateRangeOption {
  if (typeof value !== "string") return "3M";
  return DATE_RANGE_MAP[value.trim().toLowerCase()] ?? "3M";
}

function sanitizeUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^@+/, "").replace(/\s+/g, "");
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const maybeNumeric = Number(value);
    if (Number.isFinite(maybeNumeric) && value.trim() !== "") {
      return parseTimestamp(maybeNumeric);
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function inferFormat(candidate: UnknownRecord): InstagramPostFormat {
  const rawType = String(
    firstDefined(candidate, ["mediaType", "type", "__typename", "productType", "media_type"]) ?? "",
  ).toUpperCase();

  const isCarousel = rawType.includes("CAROUSEL") || rawType.includes("SIDECAR") || Boolean(candidate["isCarousel"]);
  if (isCarousel) return "CAROUSEL";

  const isVideo =
    Boolean(candidate["isVideo"]) ||
    rawType.includes("VIDEO") ||
    rawType.includes("REEL") ||
    rawType.includes("CLIP") ||
    Boolean(firstDefined(candidate, VIDEO_URL_PATHS));
  if (isVideo) return rawType.includes("REEL") || rawType.includes("CLIP") ? "REEL" : "REEL";

  if (rawType.includes("IMAGE") || rawType.includes("PHOTO")) return "IMAGE";

  return "UNKNOWN";
}

function isLikelyPostObject(candidate: UnknownRecord): boolean {
  const hasId = firstDefined(candidate, ID_PATHS) !== undefined;
  const hasDate = firstDefined(candidate, TIMESTAMP_PATHS) !== undefined;
  const hasMetrics = METRIC_KEYS.some((metric) => firstDefined(candidate, METRIC_PATHS[metric]) !== undefined);
  const hasMedia =
    firstDefined(candidate, PERMALINK_PATHS) !== undefined ||
    firstDefined(candidate, DISPLAY_URL_PATHS) !== undefined ||
    firstDefined(candidate, VIDEO_URL_PATHS) !== undefined;

  return hasId && (hasDate || hasMedia || hasMetrics);
}

function collectCandidates(payload: unknown, bucket: UnknownRecord[], depth = 0): void {
  if (depth > 8 || payload === null || payload === undefined) return;

  if (Array.isArray(payload)) {
    for (const item of payload) collectCandidates(item, bucket, depth + 1);
    return;
  }

  if (!isRecord(payload)) return;

  if (isLikelyPostObject(payload)) {
    bucket.push(payload);
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value) || isRecord(value)) {
      collectCandidates(value, bucket, depth + 1);
    }
  }
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizePost(candidate: UnknownRecord, username: string, index: number): InstagramPost | null {
  const idRaw = firstDefined(candidate, ID_PATHS);
  const shortcode = toStringSafe(firstDefined(candidate, SHORTCODE_PATHS));
  const id = toStringSafe(idRaw) || shortcode || `${username}-${index}`;

  const postedAt = parseTimestamp(firstDefined(candidate, TIMESTAMP_PATHS));
  if (!postedAt) return null;

  const permalink =
    toStringSafe(firstDefined(candidate, PERMALINK_PATHS)) ||
    (shortcode ? `https://www.instagram.com/p/${shortcode}/` : `https://www.instagram.com/${username}/`);

  const mediaType = inferFormat(candidate);
  const videoUrl = toStringSafe(firstDefined(candidate, VIDEO_URL_PATHS)) || undefined;
  const displayUrl = toStringSafe(firstDefined(candidate, DISPLAY_URL_PATHS)) || undefined;
  const followersCountRaw = toNumber(firstDefined(candidate, FOLLOWER_PATHS));
  const followersCount = followersCountRaw > 0 ? followersCountRaw : undefined;

  const metrics: PostMetrics = {
    views: Math.max(0, toNumber(firstDefined(candidate, METRIC_PATHS.views))),
    likes: Math.max(0, toNumber(firstDefined(candidate, METRIC_PATHS.likes))),
    comments: Math.max(0, toNumber(firstDefined(candidate, METRIC_PATHS.comments))),
    saves: Math.max(0, toNumber(firstDefined(candidate, METRIC_PATHS.saves))),
    shares: Math.max(0, toNumber(firstDefined(candidate, METRIC_PATHS.shares))),
  };

  const engagementCount = metrics.likes + metrics.comments + metrics.saves + metrics.shares;
  const engagementRate = metrics.views > 0 ? (engagementCount / metrics.views) * 100 : 0;

  const zScores = METRIC_KEYS.reduce<ZScoreMap>((acc, metric) => {
    acc[metric] = 0;
    return acc;
  }, {} as ZScoreMap);

  return {
    id,
    username,
    followersCount,
    shortcode: shortcode || undefined,
    permalink,
    caption: toStringSafe(firstDefined(candidate, CAPTION_PATHS)),
    mediaType,
    isVideo: mediaType === "REEL" || Boolean(videoUrl),
    displayUrl,
    videoUrl,
    postedAt: postedAt.toISOString(),
    metrics,
    engagementCount,
    engagementRate: round(engagementRate),
    zScores,
    outlierScore: 0,
    isOutlier: false,
  };
}

function buildMetricStats(posts: InstagramPost[]): MetricStatsMap {
  return METRIC_KEYS.reduce<MetricStatsMap>((acc, metric) => {
    const values = posts.map((post) => post.metrics[metric]);
    if (values.length === 0) {
      acc[metric] = { mean: 0, stdDev: 0, min: 0, max: 0 };
      return acc;
    }

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    acc[metric] = {
      mean: round(mean),
      stdDev: round(stdDev),
      min: Math.min(...values),
      max: Math.max(...values),
    };

    return acc;
  }, {} as MetricStatsMap);
}

function withZScores(posts: InstagramPost[], metricStats: MetricStatsMap): InstagramPost[] {
  return posts.map((post) => {
    const zScores = METRIC_KEYS.reduce<ZScoreMap>((acc, metric) => {
      const { mean, stdDev } = metricStats[metric];
      const z = stdDev > 0 ? (post.metrics[metric] - mean) / stdDev : 0;
      acc[metric] = round(z, 3);
      return acc;
    }, {} as ZScoreMap);

    const outlierScore = calculateOutlierScore(post.metrics.views, metricStats.views.mean) ?? 0;
    const isOutlier = outlierScore >= OUTLIER_THRESHOLD;

    return {
      ...post,
      zScores,
      outlierScore,
      isOutlier,
    };
  });
}

function buildFormatShowdown(posts: InstagramPost[]): FormatShowdownEntry[] {
  const formats: Array<FormatShowdownEntry["format"]> = ["REEL", "CAROUSEL", "IMAGE"];

  return formats
    .map((format) => {
      const subset = posts.filter((post) => post.mediaType === format);
      if (subset.length === 0) {
        return {
          format,
          postCount: 0,
          averageViews: 0,
          averageEngagementCount: 0,
          averageEngagementRate: 0,
        };
      }

      const postCount = subset.length;
      const totalViews = subset.reduce((sum, post) => sum + post.metrics.views, 0);
      const totalEngagement = subset.reduce((sum, post) => sum + post.engagementCount, 0);
      const totalEngagementRate = subset.reduce((sum, post) => sum + post.engagementRate, 0);

      return {
        format,
        postCount,
        averageViews: round(totalViews / postCount),
        averageEngagementCount: round(totalEngagement / postCount),
        averageEngagementRate: round(totalEngagementRate / postCount),
      };
    })
    .sort((a, b) => b.averageViews - a.averageViews);
}

function dateRangeCutoff(dateRange: DateRangeOption): Date {
  const now = new Date();
  const monthsBack = DATE_RANGE_TO_MONTHS[dateRange] ?? 3;
  const cutoff = new Date(now);
  const targetDay = now.getDate();

  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - monthsBack);

  const lastDayOfTargetMonth = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  cutoff.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

  return cutoff;
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}

function seededRandom(seedRef: { value: number }): number {
  seedRef.value = (seedRef.value * 1664525 + 1013904223) % 4294967296;
  return seedRef.value / 4294967296;
}

function createMockPosts(username: string, count = 42): InstagramPost[] {
  const seedRef = { value: hashSeed(username) };
  const now = Date.now();

  return Array.from({ length: count }, (_, index) => {
    const formatRoll = seededRandom(seedRef);
    const mediaType: InstagramPostFormat = formatRoll < 0.45 ? "REEL" : formatRoll < 0.75 ? "CAROUSEL" : "IMAGE";

    const ageDays = Math.floor(seededRandom(seedRef) * 360);
    const postedAt = new Date(now - ageDays * 24 * 60 * 60 * 1000).toISOString();

    const baseViews = mediaType === "REEL" ? 25000 : mediaType === "CAROUSEL" ? 14000 : 9000;
    const volatility = 0.55 + seededRandom(seedRef) * 1.15;
    const views = Math.floor(baseViews * volatility);

    const likes = Math.floor(views * (0.028 + seededRandom(seedRef) * 0.035));
    const comments = Math.floor(views * (0.003 + seededRandom(seedRef) * 0.01));
    const saves = Math.floor(views * (0.002 + seededRandom(seedRef) * 0.015));
    const shares = Math.floor(views * (0.001 + seededRandom(seedRef) * 0.008));

    const engagementCount = likes + comments + saves + shares;

    return {
      id: `${username}-mock-${index + 1}`,
      username,
      shortcode: `mock${index + 1}`,
      permalink: `https://www.instagram.com/p/mock${index + 1}/`,
      caption: `Mock ${mediaType.toLowerCase()} post ${index + 1} for @${username}`,
      mediaType,
      isVideo: mediaType === "REEL",
      displayUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80",
      videoUrl: undefined,
      postedAt,
      metrics: {
        views,
        likes,
        comments,
        saves,
        shares,
      },
      engagementCount,
      engagementRate: round((engagementCount / Math.max(views, 1)) * 100),
      zScores: {
        views: 0,
        likes: 0,
        comments: 0,
        saves: 0,
        shares: 0,
      },
      outlierScore: 0,
      isOutlier: false,
    };
  });
}

function dedupePosts(posts: InstagramPost[]): InstagramPost[] {
  const byId = new Map<string, InstagramPost>();

  for (const post of posts) {
    const dedupeKey = `${post.id}:${post.postedAt}`;
    if (!byId.has(dedupeKey)) {
      byId.set(dedupeKey, post);
    }
  }

  return [...byId.values()];
}


class ApifyHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApifyHttpError";
  }
}

async function fetchFromApify(
  username: string,
  dateRange: DateRangeOption,
  apifyApiKey: string,
  resultsType: ResultsType = "posts",
): Promise<DataSourceResult> {
  const startDate = dateRangeCutoff(dateRange);
  const startIso = startDate.toISOString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), APIFY_TIMEOUT_MS);

  try {
    let response: Response;

    try {
      response = await fetch(`${APIFY_ENDPOINT}?token=${encodeURIComponent(apifyApiKey)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          usernames: [username],
          resultsLimit: 30,
          maxItems: 30,
          reels_count: 30,
          resultsType,
          onlyPostsNewerThan: startIso,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network error";
      throw new Error(`Apify request failed before receiving a response: ${message}`);
    }

    if (!response.ok) {
      const responseText = await response.text();
      throw new ApifyHttpError(response.status, responseText || `Request failed with status ${response.status}`);
    }

    const rawPayload = (await response.json()) as unknown;
    const candidates: UnknownRecord[] = [];
    collectCandidates(rawPayload, candidates);

    const normalized = dedupePosts(
      candidates
        .map((candidate, index) => normalizePost(candidate, username, index))
        .filter((item): item is InstagramPost => item !== null),
    );
    const reelsOnly = normalized.filter((post) => post.mediaType === "REEL" || Boolean(post.videoUrl));
    const scopedPosts = resultsType === "reels" ? reelsOnly : normalized;

    if (scopedPosts.length === 0) {
      throw new Error("Apify response contained no parseable posts.");
    }

    return {
      posts: scopedPosts,
      source: "apify",
      warnings: [],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
function assembleResponse(
  username: string,
  dateRange: DateRangeOption,
  sourcePayload: DataSourceResult,
): InstagramOutlierResponse {
  const cutoff = dateRangeCutoff(dateRange).getTime();
  const now = Date.now();

  const filtered = sourcePayload.posts
    .filter((post) => {
      const ts = Date.parse(post.postedAt);
      return Number.isFinite(ts) && ts >= cutoff && ts <= now;
    })
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));

  const metricStats = buildMetricStats(filtered);
  const postsWithScores = withZScores(filtered, metricStats);
  const outliers = postsWithScores
    .filter((post) => post.isOutlier)
    .sort((a, b) => b.outlierScore - a.outlierScore);

  return {
    username,
    dateRange,
    outlierThreshold: OUTLIER_THRESHOLD,
    totalPosts: sourcePayload.posts.length,
    filteredPosts: postsWithScores.length,
    metricStats,
    formatShowdown: buildFormatShowdown(postsWithScores),
    outliers,
    posts: postsWithScores,
    source: sourcePayload.source,
    warnings: sourcePayload.warnings,
  };
}

async function handleRequest(
  usernameInput: unknown,
  dateRangeInput: unknown,
  apifyApiKeyInput: unknown,
  resultsTypeInput?: unknown,
) {
  const username = sanitizeUsername(usernameInput);
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const dateRange = normalizeDateRange(dateRangeInput);
  const resultsType: ResultsType = resultsTypeInput === "reels" ? "reels" : "posts";

  // Fetch the API key from the database using the current user's session
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const settings = await prisma.settings.findUnique({ where: { userId: user.id } });
  if (!settings?.apifyApiKey) {
    return NextResponse.json(
      { error: "Apify API key missing. Please add it in your Settings." },
      { status: 400 },
    );
  }

  const sourcePayload = await fetchFromApify(
    username,
    dateRange,
    settings.apifyApiKey,
    resultsType,
  );

  const response = assembleResponse(username, dateRange, sourcePayload);
  return NextResponse.json(response, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    console.log("FRONTEND PAYLOAD:", await req.clone().json());
  } catch {
    console.log("FRONTEND PAYLOAD: <invalid or empty JSON>");
  }

  try {
    const body = (await req.json().catch(() => ({}))) as UnknownRecord;
    const headerApiKey = req.headers.get("x-apify-key");
    const apifyApiKey = typeof body.apifyApiKey === "string" && body.apifyApiKey.trim() ? body.apifyApiKey : headerApiKey;

    return await handleRequest(body.username, body.dateRange, apifyApiKey, body.resultsType);
  } catch (error) {
    if (error instanceof ApifyHttpError) {
      return NextResponse.json({ error: "Apify Error: " + error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown Server Error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams;
    const username = search.get("username");
    const dateRange = search.get("dateRange");
    const apifyApiKey = search.get("apifyApiKey") ?? request.headers.get("x-apify-key");

    return await handleRequest(username, dateRange, apifyApiKey, search.get("resultsType"));
  } catch (error) {
    if (error instanceof ApifyHttpError) {
      return NextResponse.json({ error: "Apify Error: " + error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown Server Error" },
      { status: 500 },
    );
  }
}
