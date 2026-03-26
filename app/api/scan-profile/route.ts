import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APIFY_ACTOR = "apify~instagram-profile-scraper";
const APIFY_ENDPOINT = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;
const APIFY_TIMEOUT_MS = 50_000;

// ── minimal type helpers ────────────────────────────────────────────
type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown): number {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
        const n = Number(v.replace(/,/g, "").trim());
        if (Number.isFinite(n)) return n;
    }
    return 0;
}

function toStr(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function firstDefined(obj: UnknownRecord, paths: string[]): unknown {
    for (const p of paths) {
        if (p.includes(".")) {
            const keys = p.split(".");
            let cur: unknown = obj;
            for (const k of keys) {
                if (!isRecord(cur)) { cur = undefined; break; }
                cur = cur[k];
            }
            if (cur !== undefined && cur !== null) return cur;
        } else if (obj[p] !== undefined && obj[p] !== null) return obj[p];
    }
    return undefined;
}

// ── paths matching instagram/route.ts ────────────────────────────────
const VIEW_PATHS = ["videoPlayCount", "videoViewCount", "video_view_count", "playCount", "viewCount", "views", "plays"];
const ID_PATHS = ["id", "pk", "shortcode", "code"];
const SHORTCODE_PATHS = ["shortcode", "code"];
const TIMESTAMP_PATHS = ["timestamp", "createdAt", "created_at", "publishedAt", "takenAtTimestamp", "takenAt", "date"];
const DISPLAY_URL_PATHS = ["displayUrl", "display_url", "imageUrl", "thumbnailSrc", "image"];
const CAPTION_PATHS = ["caption", "text", "captionText", "description"];
const VIDEO_URL_PATHS = ["videoUrl", "video_url", "video", "videoSrc"];
const PERMALINK_PATHS = ["url", "permalink", "shortcodeUrl", "link"];

function parseTimestamp(v: unknown): Date | null {
    if (typeof v === "number" && Number.isFinite(v)) {
        const ms = v > 1_000_000_000_000 ? v : v * 1000;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof v === "string") {
        const n = Number(v);
        if (Number.isFinite(n) && v.trim()) return parseTimestamp(n);
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

function isLikelyPost(c: UnknownRecord): boolean {
    return (
        firstDefined(c, ID_PATHS) !== undefined &&
        (firstDefined(c, TIMESTAMP_PATHS) !== undefined ||
            firstDefined(c, VIEW_PATHS) !== undefined ||
            firstDefined(c, VIDEO_URL_PATHS) !== undefined)
    );
}

function collectCandidates(payload: unknown, bucket: UnknownRecord[], depth = 0): void {
    if (depth > 8 || payload == null) return;
    if (Array.isArray(payload)) { payload.forEach((item) => collectCandidates(item, bucket, depth + 1)); return; }
    if (!isRecord(payload)) return;
    if (isLikelyPost(payload)) bucket.push(payload);
    for (const v of Object.values(payload)) {
        if (Array.isArray(v) || isRecord(v)) collectCandidates(v, bucket, depth + 1);
    }
}

export type OutlierVideo = {
    id: string;
    shortcode?: string;
    permalink: string;
    caption: string;
    displayUrl?: string;
    thumbnailUrl?: string;
    coverUrl?: string;
    videoUrl?: string;
    postedAt: string;
    views: number;
    likes: number;
    averageViews: number;
    outlierScore: number;
    multiplier: number; // how many times average
};

export type ScanProfileResponse = {
    username: string;
    averageViews: number;
    totalVideos: number;
    outliers: OutlierVideo[];
};

function round(v: number, d = 2): number {
    const f = 10 ** d;
    return Math.round(v * f) / f;
}

function normalizeVideo(c: UnknownRecord, username: string, index: number): OutlierVideo | null {
    const postedAt = parseTimestamp(firstDefined(c, TIMESTAMP_PATHS));
    if (!postedAt) return null;

    const idRaw = firstDefined(c, ID_PATHS);
    const shortcode = toStr(firstDefined(c, SHORTCODE_PATHS));
    const id = toStr(idRaw) || shortcode || `${username}-${index}`;

    const views = Math.max(0, toNumber(firstDefined(c, VIEW_PATHS)));
    const likes = Math.max(0, toNumber(firstDefined(c, ["likesCount", "likeCount", "likes"])));
    const permalink =
        toStr(firstDefined(c, PERMALINK_PATHS)) ||
        (shortcode ? `https://www.instagram.com/p/${shortcode}/` : `https://www.instagram.com/${username}/`);

    return {
        id,
        shortcode: shortcode || undefined,
        permalink,
        caption: toStr(firstDefined(c, CAPTION_PATHS)).slice(0, 200),
        displayUrl: toStr(firstDefined(c, DISPLAY_URL_PATHS)) || undefined,
        videoUrl: toStr(firstDefined(c, VIDEO_URL_PATHS)) || undefined,
        postedAt: postedAt.toISOString(),
        views,
        likes,
        averageViews: 0,
        outlierScore: 0,
        multiplier: 0, // computed after average
    };
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as {
            username?: string;
        };

        const username = (body.username || "").trim().replace(/^@+/, "");
        if (!username) {
            return NextResponse.json({ error: "username is required" }, { status: 400 });
        }
        if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) {
            return NextResponse.json({ error: "Invalid Instagram username" }, { status: 400 });
        }

        // 1. Authenticate the user
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Fetch the user's secure API key from the database
        const userSettings = await prisma.settings.findUnique({
            where: { userId: session.user.id },
            select: { apifyApiKey: true },
        });

        // 3. Validate the key exists and isn't the frontend mask
        if (!userSettings?.apifyApiKey || userSettings.apifyApiKey === "••••••••") {
            return NextResponse.json(
                { error: "Apify API key is missing or invalid. Please update it in Settings." },
                { status: 400 },
            );
        }

        // 4. Use only the secure DB key
        const apifyApiKey = userSettings.apifyApiKey;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), APIFY_TIMEOUT_MS);

        let rawPayload: unknown;
        try {
            const response = await fetch(`${APIFY_ENDPOINT}?token=${encodeURIComponent(apifyApiKey)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    usernames: [username],
                    resultsLimit: 30,
                    maxItems: 30,
                    reels_count: 30,
                    resultsType: "reels",
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");
                console.error(`[scan-profile] Apify error ${response.status}:`, text.slice(0, 500));
                return NextResponse.json(
                    { error: "Profile scan failed. Check your Apify API key and try again." },
                    { status: response.status >= 500 ? 502 : response.status },
                );
            }

            rawPayload = await response.json();
        } finally {
            clearTimeout(timeoutId);
        }

        const candidates: UnknownRecord[] = [];
        collectCandidates(rawPayload, candidates);

        const videos = candidates
            .map((c, i) => normalizeVideo(c, username, i))
            .filter((v): v is OutlierVideo => v !== null && v.views > 0);

        // Dedupe by id
        const seen = new Set<string>();
        const deduped = videos.filter((v) => { if (seen.has(v.id)) return false; seen.add(v.id); return true; });

        if (deduped.length === 0) {
            return NextResponse.json<ScanProfileResponse>({
                username,
                averageViews: 0,
                totalVideos: 0,
                outliers: [],
            });
        }

        // Hard cap: only consider videos from the last 12 months
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const recentVideos = [...deduped]
            .filter((v) => new Date(v.postedAt) >= twelveMonthsAgo)
            .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
            .slice(0, 30);

        const totalViews = recentVideos.reduce((sum, video) => sum + video.views, 0);
        const channelAverageViews = totalViews / recentVideos.length;
        const averageViews = round(channelAverageViews);

        const processedVideos = recentVideos.map((video) => {
            const rawScore = channelAverageViews > 0 ? video.views / channelAverageViews : 1.0;
            const outlierScore = Number(rawScore.toFixed(1));

            return {
                ...video,
                averageViews,
                outlierScore,
                multiplier: outlierScore,
            };
        });

        const outliers = processedVideos
            .filter((v) => v.outlierScore >= 2.0)
            .sort((a, b) => b.outlierScore - a.outlierScore || b.views - a.views);

        return NextResponse.json<ScanProfileResponse>({
            username,
            averageViews,
            totalVideos: recentVideos.length,
            outliers,
        });
    } catch (error) {
        console.error("[scan-profile] Unexpected error:", error);
        return NextResponse.json(
            { error: "Scan failed. Please try again." },
            { status: 500 },
        );
    }
}
