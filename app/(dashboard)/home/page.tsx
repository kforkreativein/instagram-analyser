"use client";

import {
  Copy,
  Download,
  FileText,
  KeyRound,
  Menu,
  Mic,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { AIAnalysis, AnalyzeResponse, DateRangeOption, InstagramOutlierResponse, InstagramPost } from "@/lib/types";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import {
  ANALYSIS_CACHE_KEY,
  POSTS_CACHE_KEY,
} from "@/lib/client-settings";
import Metrics from "@/app/components/Metrics";
import SearchForm from "@/app/components/SearchForm";
import Skeleton from "@/app/components/UI/Skeleton";
import EmptyState from "@/app/components/UI/EmptyState";
import { useToast } from "@/app/components/UI/Toast";
import { Search, Info as InfoIcon } from "lucide-react";

type SortOption = "newest" | "views" | "outlier" | "engagement";
type FormatOption = "all" | "reels" | "carousels" | "images";
type ActionType = "director";

type ActionResultState = {
  director?: string;
  loading: ActionType | null;
  error: string;
};

type VaultItem = {
  id: number;
  type: "hook" | "style";
  name: string;
  description: string;
  views: number;
  date: string;
  folder?: string;
};

type SavedVideoData = {
  savedAt: string;
  post: InstagramPost;
  analysis: AnalyzeResponse;
};

type RemixBlueprint = {
  transcript: string;
  subject: string;
  angle: string;
  payoff: string;
  executiveSummary: string;
  keyFacts: string[];
  preferredHookId: string;
  preferredStyleId: string;
};

type RemixData = {
  post: InstagramPost;
  analysis: AnalyzeResponse;
  blueprint: RemixBlueprint;
  transcript?: string;
  hook?: AIAnalysis["hookAnalysis"];
  structure?: AIAnalysis["structureAnalysis"];
  style?: AIAnalysis["styleAnalysis"];
  createdAt?: string;
};

const ANALYZED_HISTORY_KEY = "analyzed_history";
const REMIX_DATA_KEY = "remix_data";
const VAULT_ITEMS_KEY = "vault_items";

const DATE_OPTIONS: Array<{ label: string; value: DateRangeOption }> = [
  { label: "Past 1 Month", value: "1M" },
  { label: "Past 3 Months", value: "3M" },
  { label: "Past 12 Months", value: "12M" },
];

function upsertPostsCache(posts: InstagramPost[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = localStorage.getItem(POSTS_CACHE_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, InstagramPost>) : {};
    const next = { ...existing };

    for (const post of posts) {
      next[post.id] = post;
    }

    localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage serialization issues.
  }
}

async function saveVideoToHistory(newVideoData: SavedVideoData) {
  if (typeof window === "undefined") return;

  try {
    // Always persist to the hard-drive backend (primary source of truth)
    const res = await fetch("/api/database");
    const json = (await res.json().catch(() => ({ data: [] }))) as { data?: unknown };
    const existing = Array.isArray(json.data) ? (json.data as SavedVideoData[]) : [];

    // Avoid duplicates — upsert by post.id
    const deduped = [newVideoData, ...existing.filter((v) => v.post.id !== newVideoData.post.id)];

    await fetch("/api/database", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deduped),
    });

    // Also mirror to localStorage as a cache for fast reads
    try {
      localStorage.setItem(ANALYZED_HISTORY_KEY, JSON.stringify(deduped));
    } catch {
      // Storage quota — ignore
    }
  } catch {
    // Backend unavailable — fall back to localStorage only
    try {
      const existing = JSON.parse(localStorage.getItem(ANALYZED_HISTORY_KEY) || "[]") as SavedVideoData[];
      localStorage.setItem(ANALYZED_HISTORY_KEY, JSON.stringify([newVideoData, ...existing]));
    } catch {
      // Ignore storage failures
    }
  }
}

async function updateVideoHistoryAnalysis(post: InstagramPost, analysis: AnalyzeResponse) {
  if (typeof window === "undefined") return;

  try {
    // Always use the hard-drive backend
    const res = await fetch("/api/database");
    const json = (await res.json().catch(() => ({ data: [] }))) as { data?: unknown };
    const existing = Array.isArray(json.data) ? (json.data as SavedVideoData[]) : [];

    let matched = false;
    const next = existing.map((item) => {
      if (item.post.id !== post.id) return item;
      matched = true;
      return { ...item, analysis };
    });
    if (!matched) next.unshift({ savedAt: new Date().toISOString(), post, analysis });

    await fetch("/api/database", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });

    // Mirror to localStorage as cache
    try { localStorage.setItem(ANALYZED_HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  } catch {
    // Backend unavailable — fall back to localStorage
    try {
      const existing = JSON.parse(localStorage.getItem(ANALYZED_HISTORY_KEY) || "[]") as SavedVideoData[];
      let matched = false;
      const next = existing.map((item) => {
        if (item.post.id !== post.id) return item;
        matched = true;
        return { ...item, analysis };
      });
      if (!matched) next.unshift({ savedAt: new Date().toISOString(), post, analysis });
      localStorage.setItem(ANALYZED_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage failures
    }
  }
}

function updateAnalysisCache(postId: string, analysis: AnalyzeResponse) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = localStorage.getItem(ANALYSIS_CACHE_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, AnalyzeResponse>) : {};
    localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify({ ...existing, [postId]: analysis }));
  } catch {
    // Ignore localStorage serialization issues.
  }
}

// Cleaned up broken snippet
function placeholder() { }

const STANDARD_STYLE_GUIDE_RULES = [
  "Write in a conversational, informal, and friendly tone.",
  "Use short, punchy sentences to create a fast-paced cadence.",
  "Use simple language that anyone can understand.",
  "Avoid jargon and technical terms.",
  "Sound like human-written content. You must not sound like AI-generated content.",
  "Use a first-person tone, as if you are speaking to a friend.",
  "No fluff or wasted words. Be concise and to the point. Get the most value out of every sentence.",
  "Imbue a high degree of excitement and energy into the script.",
  "Do not sound corny or cheesy. Avoid cliches and overused phrases. Sound genuine and authentic.",
  "Output one sentence per line. There should be a blank line between each sentence.",
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function ensureSentence(text: string): string {
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function splitSentences(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function isGenericTranscriptCandidate(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();
  if (!normalized) return true;

  return (
    normalized.includes("problem: low retention from vague intros") ||
    normalized.includes("transcript-led outlier potential") ||
    normalized.includes("outlier potential") ||
    normalized.includes("no transcript") ||
    normalized.includes("transcript is unavailable") ||
    normalized.includes("no content available")
  );
}

function selectBestTranscript(post: InstagramPost, analysis: AIAnalysis): string {
  const candidates = [
    analysis.breakdownBlocks.problemAndSolution || "",
    post.caption || "",
    analysis.summary.coreIdea || "",
    analysis.summary.outlierPotential || "",
  ].map((item) => normalizeWhitespace(item));

  const preferred = candidates.find((item) => item && !isGenericTranscriptCandidate(item));
  if (preferred) return preferred;

  return candidates.find(Boolean) || "";
}

function inferHookIdFromAnalysis(analysis: AIAnalysis): string {
  const hookType = normalizeWhitespace(analysis.hookAnalysis.type || "").toLowerCase();
  if (hookType.includes("question")) return "question-hook";
  if (hookType.includes("myth")) return "myth-bust-hook";
  if (hookType.includes("controvers")) return "controversial-hook";
  return "education-hook";
}

function inferStyleIdFromAnalysis(analysis: AIAnalysis): string {
  const style = analysis.styleAnalysis;
  const haystack = normalizeWhitespace(`${style.tone} ${style.voice} ${style.wordChoice} ${style.pacing}`).toLowerCase();
  if (haystack.includes("day in")) return "day-in-life";
  if (haystack.includes("rapid") || haystack.includes("very fast")) return "rapid-tutorial";
  if (haystack.includes("problem") || haystack.includes("solution")) return "problem-solution";
  if (haystack.includes("case")) return "case-study";
  if (haystack.includes("personal")) return "personal-update";
  return "listicle";
}

function buildRemixBlueprint(post: InstagramPost, payload: AnalyzeResponse): RemixBlueprint {
  const analysis = payload.analysis;
  const transcript = selectBestTranscript(post, analysis);
  const transcriptSentences = splitSentences(transcript).map((item) => ensureSentence(item));

  const subject =
    ensureSentence(normalizeWhitespace(analysis.summary.coreIdea || "")) ||
    transcriptSentences[0] ||
    "The video focuses on a practical transformation viewers care about.";

  const angle =
    ensureSentence(normalizeWhitespace(analysis.hookAnalysis.description || analysis.hookAnalysis.type || "")) ||
    "The idea is introduced through a high-clarity hook and a practical lens.";

  const payoff =
    ensureSentence(
      normalizeWhitespace(
        analysis.summary.outlierPotential ||
        analysis.summary.actionableImprovements[0] ||
        analysis.breakdownBlocks.targetAudienceAndTone ||
        "",
      ),
    ) || "The viewer leaves with a concrete takeaway they can apply immediately.";

  const executiveSummarySentences = dedupePreserveOrder([
    ...transcriptSentences.slice(0, 2),
    ensureSentence(normalizeWhitespace(analysis.summary.coreIdea || "")),
    ensureSentence(normalizeWhitespace(analysis.summary.outlierPotential || "")),
    ensureSentence(normalizeWhitespace(analysis.structureAnalysis.description || "")),
  ])
    .map((item) => ensureSentence(item))
    .slice(0, 3);

  if (executiveSummarySentences.length < 2) {
    executiveSummarySentences.push(ensureSentence(subject), ensureSentence(payoff));
  }

  const keyFacts = dedupePreserveOrder([
    ...transcriptSentences,
    ...analysis.breakdownBlocks.keyTakeaways.map((item) => ensureSentence(item || "")),
    ...analysis.summary.actionableImprovements.map((item) => ensureSentence(item || "")),
  ]).slice(0, 5);

  while (keyFacts.length < 3) {
    keyFacts.push("Use one concrete fact from the video to support the argument.");
  }

  return {
    transcript,
    subject: ensureSentence(subject),
    angle: ensureSentence(angle),
    payoff: ensureSentence(payoff),
    executiveSummary: executiveSummarySentences.map((item) => ensureSentence(item)).slice(0, 3).join(" "),
    keyFacts,
    preferredHookId: inferHookIdFromAnalysis(analysis),
    preferredStyleId: inferStyleIdFromAnalysis(analysis),
  };
}

function buildTopicSummary(transcript: string, analysis: AIAnalysis): string {
  const transcriptSentences = splitSentences(transcript).map(ensureSentence);
  const fallbackSentences = [analysis.summary.coreIdea, analysis.summary.outlierPotential]
    .map((item) => ensureSentence(normalizeWhitespace(item || "")))
    .filter(Boolean);

  const summarySentences = transcriptSentences.slice(0, 3);
  for (const sentence of fallbackSentences) {
    if (summarySentences.length >= 3) break;
    if (!summarySentences.includes(sentence)) {
      summarySentences.push(sentence);
    }
  }

  if (summarySentences.length === 0) {
    summarySentences.push("The transcript summary is currently unavailable.");
  }
  if (summarySentences.length === 1) {
    summarySentences.push("Explain the core idea in clear, simple language.");
  }

  return summarySentences.slice(0, 3).join(" ");
}

function extractTranscriptFacts(transcript: string, analysis: AIAnalysis): [string, string, string] {
  const transcriptSentences = splitSentences(transcript)
    .map((item) => ensureSentence(item))
    .filter((item) => item.length > 10);

  const fallbackFacts = [
    ...analysis.breakdownBlocks.keyTakeaways,
    ...analysis.summary.actionableImprovements,
    analysis.summary.coreIdea,
    analysis.summary.outlierPotential,
  ]
    .map((item) => ensureSentence(normalizeWhitespace(item || "")))
    .filter(Boolean);

  const facts: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [...transcriptSentences, ...fallbackFacts]) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(candidate);
    if (facts.length >= 3) break;
  }

  while (facts.length < 3) {
    facts.push("Use one concrete insight from the transcript to support the script.");
  }

  return [facts[0], facts[1], facts[2]];
}

function buildCreatePromptXml(analysis: AIAnalysis, transcript: string): string {
  const topicSummary = escapeXml(buildTopicSummary(transcript, analysis));
  const [factOne, factTwo, factThree] = extractTranscriptFacts(transcript, analysis).map((item) => escapeXml(item));

  const styleGuideRules = STANDARD_STYLE_GUIDE_RULES.map((rule) => `- ${rule}`).join("\n");

  return [
    "<system_instructions>",
    "<job>You are a world-class script writer for short-form social media videos.</job>",
    "<goal>To create the highest quality content that goes viral every single time.</goal>",
    "<style_guide>",
    styleGuideRules,
    "</style_guide>",
    "<target_audience>Intelligent and curious, but no background in the topic. Speak naturally to a friend.</target_audience>",
    "</system_instructions>",
    "",
    "<script_instructions>",
    "<task>Write a compelling, attention-grabbing script for a social media short-form video that'll go viral. The final output script should be between 90 and 120 words.</task>",
    `<topic>${topicSummary}</topic>`,
    "<hook>",
    "Open the script with an attention-grabbing hook:",
    `- Format: ${escapeXml(analysis.hookAnalysis.type || "Unknown")}`,
    `- Explanation: ${escapeXml(analysis.hookAnalysis.description || "Unknown")}`,
    "</hook>",
    "<structure>",
    "Follow a predefined structure:",
    `- Format: ${escapeXml(analysis.structureAnalysis.type || "Unknown")}`,
    `- Explanation: ${escapeXml(analysis.structureAnalysis.description || "Unknown")}`,
    "</structure>",
    "<style>",
    "Embody the following style:",
    `- Tone: ${escapeXml(analysis.styleAnalysis.tone || "Unknown")}`,
    `- Voice: ${escapeXml(analysis.styleAnalysis.voice || "Unknown")}`,
    `- Word Choice: ${escapeXml(analysis.styleAnalysis.wordChoice || "Unknown")}`,
    `- Pacing: ${escapeXml(analysis.styleAnalysis.pacing || "Unknown")}`,
    "</style>",
    "<content>",
    "Incorporate the following details. Use facts to bolster the story:",
    `1. ${factOne}`,
    `2. ${factTwo}`,
    `3. ${factThree}`,
    "</content>",
    "</script_instructions>",
  ].join("\n");
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeOption>("1M");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [formatFilter, setFormatFilter] = useState<FormatOption>("all");
  const [data, setData] = useState<InstagramOutlierResponse | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPlatform] = useState<"instagram">("instagram");

  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [analysisMap, setAnalysisMap] = useState<Record<string, AnalyzeResponse>>({});
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});
  const [analysisLoadingId, setAnalysisLoadingId] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [actionResults, setActionResults] = useState<Record<string, ActionResultState>>({});
  const [copiedPromptPostId, setCopiedPromptPostId] = useState<string | null>(null);
  const { toast } = useToast();
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const hydratedVideoIdRef = useRef<string | null>(null);

  // Batch state retained for winningFormula compatibility
  const [batchResults] = useState<AnalyzeResponse[]>([]);
  void batchResults;
  const [winningFormula, setWinningFormula] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Restore session memory
    try {
      const saved = sessionStorage.getItem("homeState");
      if (saved) {
        const parsed = JSON.parse(saved) as {
          data?: InstagramOutlierResponse;
          username?: string;
          analysisMap?: Record<string, AnalyzeResponse>;
        };
        if (parsed.data) {
          setData(parsed.data);
          setHasSearched(true);
        }
        if (parsed.username) setUsername(parsed.username);
        if (parsed.analysisMap) setAnalysisMap(parsed.analysisMap);
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Persist home state to sessionStorage
  useEffect(() => {
    if (typeof window === "undefined" || !data) return;
    try {
      sessionStorage.setItem("homeState", JSON.stringify({ data, username, analysisMap }));
    } catch {
      // Ignore storage quota errors
    }
  }, [data, username, analysisMap]);

  function saveFlatSettings() {
    // Settings no longer saved locally - backend handles API keys
  }

  const channelMedianViews = useMemo(() => {
    const values = (data?.posts ?? [])
      .map((post) => post.metrics.views)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);

    if (values.length === 0) return 0;
    const middle = Math.floor(values.length / 2);
    if (values.length % 2 === 0) {
      return (values[middle - 1] + values[middle]) / 2;
    }
    return values[middle];
  }, [data?.posts]);

  async function runDashboardAnalysis() {
    setError("");
    setData(null);
    setAnalysisMap({});
    setAnalysisErrors({});
    setActionResults({});
    setLoadingFeed(true);
    setActiveVideoId(null);
    setHasSearched(true);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          dateRange,
          platform: selectedPlatform,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || "Failed to fetch data");
      }

      const payload = (await response.json()) as InstagramOutlierResponse;
      setData(payload);
      setAnalysisMap({});
      setAnalysisErrors({});
      setAnalysisLoadingId(null);
      setActionResults({});
      upsertPostsCache(payload.posts);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
      toast("error", "Search Failed", message);
    } finally {
      setLoadingFeed(false);
    }
  }

  async function handleAnalyze(post: InstagramPost) {
    if (analysisMap[post.id]) {
      router.push(`/videos/${encodeURIComponent(post.id)}`);
      return;
    }

    const setIsLoading = (value: boolean) => {
      if (value) {
        setAnalysisLoadingId(post.id);
        return;
      }

      setAnalysisLoadingId((current) => (current === post.id ? null : current));
    };

    setIsLoading(true);
    setAnalysisErrors((prev) => ({ ...prev, [post.id]: "" }));

    try {
      setError("");
      const provider = "Gemini";
      const model = "gemini-2.5-flash";

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post: { ...post, authorAverageViews: channelMedianViews },
          provider,
          model,
          platform: selectedPlatform,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to analyze post");
      }

      const payload = (await response.json()) as AnalyzeResponse;
      
      // Update the post with the newly calculated outlier score before saving
      const analyzedPost = { 
        ...post, 
        outlierScore: payload.analysis.outlierScore ?? post.outlierScore 
      };

      setAnalysisMap((prev) => ({ ...prev, [post.id]: payload }));
      updateAnalysisCache(post.id, payload);
      upsertPostsCache([analyzedPost]);
      
      await saveVideoToHistory({
        savedAt: new Date().toISOString(),
        post: analyzedPost,
        analysis: payload,
      });

      router.push(`/videos/${encodeURIComponent(post.id)}`);
    } catch (analysisError) {
      setIsLoading(false);
      const msg = analysisError instanceof Error ? analysisError.message : "Failed to analyze post";
      toast("error", "Analysis Error", msg);
      setAnalysisErrors((prev) => ({
        ...prev,
        [post.id]: msg,
      }));
    } finally {
      setIsLoading(false);
    }
  }

  function openRemixWorkflow() {
    if (!activePost || !activeAnalysis) {
      return;
    }

    const fullAnalysis = analysisMap[activePost.id];
    if (!fullAnalysis) {
      return;
    }

    try {
      const transcript = selectBestTranscript(activePost, fullAnalysis.analysis);
      const remixData: RemixData = {
        post: activePost,
        analysis: fullAnalysis,
        transcript,
        hook: fullAnalysis.analysis.hookAnalysis,
        structure: fullAnalysis.analysis.structureAnalysis,
        style: fullAnalysis.analysis.styleAnalysis,
        createdAt: new Date().toISOString(),
        blueprint: buildRemixBlueprint(activePost, fullAnalysis),
      };

      localStorage.setItem(
        REMIX_DATA_KEY,
        JSON.stringify(remixData),
      );
      router.push("/scripts/editor");
    } catch {
      setActionResults((prev) => ({
        ...prev,
        [activePost.id]: {
          director: prev[activePost.id]?.director,
          loading: null,
          error: "Unable to launch Scripts workflow.",
        },
      }));
    }
  }

  useEffect(() => {
    const requestedVideoId = searchParams.get("videoId");
    if (!requestedVideoId || hydratedVideoIdRef.current === requestedVideoId) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    async function hydrateFromHistory() {
      try {
        const postsRaw = localStorage.getItem(POSTS_CACHE_KEY);
        const cachedPosts = postsRaw ? (JSON.parse(postsRaw) as Record<string, InstagramPost>) : {};
        const analysesRaw = localStorage.getItem(ANALYSIS_CACHE_KEY);
        const cachedAnalyses = analysesRaw ? (JSON.parse(analysesRaw) as Record<string, AnalyzeResponse>) : {};

        const engine = localStorage.getItem("storageEngine") || "localstorage";
        let history: SavedVideoData[] = [];
        if (engine === "json") {
          try {
            const res = await fetch("/api/database");
            const json = (await res.json().catch(() => ({ data: [] }))) as { data?: unknown };
            history = Array.isArray(json.data) ? (json.data as SavedVideoData[]) : [];
          } catch { /* fall through to empty */ }
        } else {
          const historyRaw = localStorage.getItem(ANALYZED_HISTORY_KEY);
          history = historyRaw ? (JSON.parse(historyRaw) as SavedVideoData[]) : [];
        }

        const vid = requestedVideoId as string;
        const selectedFromHistory = history.find((item) => item.post.id === vid);
        const selectedPost = cachedPosts[vid] || selectedFromHistory?.post;
        const selectedAnalysis = cachedAnalyses[vid] || selectedFromHistory?.analysis;

        if (!selectedPost || !selectedAnalysis) {
          return;
        }

        const posts = Object.values(cachedPosts);
        const nextPosts = posts.some((item) => item.id === selectedPost.id) ? posts : [selectedPost, ...posts];
        const nextMetricStats = {
          views: { mean: 0, stdDev: 0, min: 0, max: 0 },
          likes: { mean: 0, stdDev: 0, min: 0, max: 0 },
          comments: { mean: 0, stdDev: 0, min: 0, max: 0 },
          saves: { mean: 0, stdDev: 0, min: 0, max: 0 },
          shares: { mean: 0, stdDev: 0, min: 0, max: 0 },
        };

        setData({
          username: selectedPost.username,
          dateRange: dateRange,
          outlierThreshold: 1.5,
          totalPosts: nextPosts.length,
          filteredPosts: nextPosts.length,
          metricStats: nextMetricStats,
          formatShowdown: [],
          outliers: [],
          posts: nextPosts,
          source: "apify",
          warnings: [],
        });
        setAnalysisMap((prev) => ({ ...cachedAnalyses, ...prev, [selectedPost.id]: selectedAnalysis }));
        setUsername(selectedPost.username);
        setHasSearched(true);
        setActiveVideoId(selectedPost.id);
        hydratedVideoIdRef.current = vid;
      } catch {
        // Ignore malformed storage payloads.
      }
    }

    void hydrateFromHistory();
  }, [dateRange, searchParams]);

  function runDirectorAction() {
    if (!activePost) return;

    const postId = activePost.id;
    const analysis = analysisMap[postId]?.analysis;
    if (!analysis) return;

    const transcript = analysis.breakdownBlocks.problemAndSolution || activePost.caption || "";

    setActionResults((prev) => ({
      ...prev,
      [postId]: {
        director: prev[postId]?.director,
        loading: "director",
        error: "",
      },
    }));

    const directorOutput = buildCreatePromptXml(analysis, transcript);

    setActionResults((prev) => ({
      ...prev,
      [postId]: {
        director: directorOutput,
        loading: null,
        error: "",
      },
    }));
  }

  async function copyDirectorPrompt(postId: string, prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPromptPostId(postId);
      setTimeout(() => {
        setCopiedPromptPostId((current) => (current === postId ? null : current));
      }, 1500);
    } catch {
      setActionResults((prev) => ({
        ...prev,
        [postId]: {
          director: prev[postId]?.director,
          loading: null,
          error: "Unable to copy prompt to clipboard.",
        },
      }));
    }
  }

  async function handleTranscribe() {
    if (!activePost || !activeAnalysis) {
      return;
    }

    if (!activePost.videoUrl) {
      setTranscriptionError("No video URL available for this post.");
      return;
    }

    if (isTranscribing) {
      return;
    }

    const targetPost = activePost;
    const existing = analysisMap[targetPost.id];
    if (!existing) {
      setTranscriptionError("Analyze this video before generating a transcript.");
      return;
    }

    setTranscriptionError("");
    setIsTranscribing(true);

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl: targetPost.videoUrl,
          platform: selectedPlatform,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to transcribe video audio");
      }

      const payload = (await response.json()) as { transcript?: string };
      const transcript = (payload.transcript || "").trim();
      if (!transcript) {
        throw new Error("Transcription completed but returned empty text.");
      }

      const updatedAnalysis: AnalyzeResponse = {
        ...existing,
        analysis: {
          ...existing.analysis,
          breakdownBlocks: {
            ...existing.analysis.breakdownBlocks,
            problemAndSolution: transcript,
          },
        },
      };

      setAnalysisMap((prev) => ({ ...prev, [targetPost.id]: updatedAnalysis }));
      updateAnalysisCache(targetPost.id, updatedAnalysis);
      updateVideoHistoryAnalysis(targetPost, updatedAnalysis);
    } catch (error) {
      setTranscriptionError(error instanceof Error ? error.message : "Failed to transcribe video audio");
    } finally {
      setIsTranscribing(false);
    }
  }

  function handleSaveToVault() {
    if (!activePost || !activeAnalysis || typeof window === "undefined") {
      return;
    }

    const computedOutlierScore = activePost.outlierScore !== undefined && activePost.outlierScore !== null
      ? Number(activePost.outlierScore)
      : 0;

    const engagementRaw = "engagementRate" in activePost.metrics && activePost.metrics.engagementRate !== undefined
      ? (activePost.metrics as any).engagementRate
      : ((activePost.metrics.likes + (activePost.metrics.comments || 0)) / Math.max(activePost.metrics.views, 1));

    const updatedPost = {
      ...activePost,
      calculatedMetrics: {
        outlierScore: computedOutlierScore,
        engagementRate: engagementRaw,
      },
    };

    try {
      const rawHistory = localStorage.getItem("analyzed_history");
      const parsedHistory: { savedAt?: string; post: InstagramPost; analysis: AnalyzeResponse }[] = rawHistory ? JSON.parse(rawHistory) : [];

      const updatedHistory = parsedHistory.map(entry =>
        entry.post.id === updatedPost.id ? { ...entry, post: updatedPost } : entry
      );

      localStorage.setItem("analyzed_history", JSON.stringify(updatedHistory));
    } catch {
      //
    }

    const savedDate = new Date().toLocaleDateString();
    const now = Date.now();

    const hookItem: VaultItem = {
      id: now,
      type: "hook",
      name: activeAnalysis.hookAnalysis.type || "Hook",
      description: activeAnalysis.hookAnalysis.description || "",
      views: activePost.metrics.views,
      date: savedDate,
      folder: "Uncategorized",
    };

    const styleItem: VaultItem = {
      id: now + 1,
      type: "style",
      name: activeAnalysis.styleAnalysis.tone || "Style",
      description: [
        activeAnalysis.styleAnalysis.voice,
        activeAnalysis.styleAnalysis.wordChoice,
        activeAnalysis.styleAnalysis.pacing,
      ]
        .map((item) => item.trim())
        .filter(Boolean)
        .join(" • "),
      views: activePost.metrics.views,
      date: savedDate,
      folder: "Uncategorized",
    };

    try {
      const raw = localStorage.getItem(VAULT_ITEMS_KEY);
      const existing = raw ? (JSON.parse(raw) as VaultItem[]) : [];
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify([...existing, hookItem, styleItem]));
      toast("success", "Saved to Vault", "Extraction saved to your personal library.");
    } catch {
      toast("error", "Vault Error", "Failed to save items to vault.");
    }
  }

  function handleVideoCardClick(post: InstagramPost) {
    const video = videoRefs.current[post.id];
    if (!video || !post.videoUrl) return;

    if (video.paused) {
      video.play().catch(() => {
        // Ignore autoplay/playback interruptions.
      });
      return;
    }

    video.pause();
  }

  const visiblePosts = useMemo(() => {
    if (!data) return [];

    const filteredByFormat = data.posts.filter((post) => {
      if (formatFilter === "all") return true;
      if (formatFilter === "reels") return post.mediaType === "REEL";
      if (formatFilter === "carousels") return post.mediaType === "CAROUSEL";
      if (formatFilter === "images") return post.mediaType === "IMAGE";
      return true;
    });

    return [...filteredByFormat].sort((a, b) => {
      if (sortBy === "views") return b.metrics.views - a.metrics.views;
      if (sortBy === "outlier") return b.outlierScore - a.outlierScore;
      if (sortBy === "engagement") return b.engagementRate - a.engagementRate;
      return Date.parse(b.postedAt) - Date.parse(a.postedAt);
    });
  }, [data, formatFilter, sortBy]);

  const activePost = useMemo(() => {
    if (!activeVideoId) return null;
    const fromVisible = visiblePosts.find((post) => post.id === activeVideoId);
    if (fromVisible) return fromVisible;
    return data?.posts.find((post) => post.id === activeVideoId) ?? null;
  }, [activeVideoId, data?.posts, visiblePosts]);

  const activeAnalysis = activePost ? analysisMap[activePost.id]?.analysis ?? null : null;
  const transcriptBody = activeAnalysis?.breakdownBlocks.problemAndSolution || "";
  const hasGeneratedTranscript = Boolean(transcriptBody.trim()) && !isGenericTranscriptCandidate(transcriptBody);
  const transcriptDisplayText = hasGeneratedTranscript
    ? transcriptBody
    : "Use Transcribe in Actions to generate a transcript.";
  const transcriptWordCount = hasGeneratedTranscript
    ? transcriptBody
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
    : 0;
  useEffect(() => {
    setTranscriptionError("");
  }, [activeVideoId]);

  async function handleCopyTranscript() {
    if (!hasGeneratedTranscript) return;

    try {
      await navigator.clipboard.writeText(transcriptBody);
    } catch {
      // Ignore clipboard failures.
    }
  }

  function handleDownloadTranscript() {
    if (!hasGeneratedTranscript) return;

    const blob = new Blob([transcriptBody], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activePost?.id || "video"}-transcript.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }



  const activeActionState = activePost
    ? actionResults[activePost.id] ?? {
      director: undefined,
      loading: null,
      error: "",
    }
    : {
      director: undefined,
      loading: null,
      error: "",
    };

  const reelsSummary = useMemo(() => {
    const videos = data?.posts ?? [];
    const totalViews = videos.reduce((acc, curr) => acc + curr.metrics.views, 0);
    const avgViews = videos.length > 0 ? totalViews / videos.length : 0;
    const avgEngagement =
      videos.length > 0
        ? (videos.reduce((acc, curr) => acc + curr.engagementRate, 0) / videos.length).toFixed(1)
        : "0.0";

    return `Reels (${videos.length}) • ${formatNumber(totalViews)} Total Views • ${formatNumber(avgViews)} Avg Views • ${avgEngagement}% Avg Engagement`;
  }, [data?.posts]);

  return (
    <>
      <div className="flex w-full min-h-screen text-[var(--text)] flex-col relative z-10">
        <div className="w-full flex-shrink-0 p-0">
          <div
            className={`mx-auto w-full ${hasSearched
              ? "max-w-[1000px]"
              : "max-w-[600px] min-h-[70vh] flex flex-col justify-center"
              }`}
          >
            {/* 1. HERO SECTION */}
            <header className="mb-[32px]">
              <div className="flex items-center gap-[8px] mb-[12px]">
                <div className="w-[16px] h-[1px] bg-[#FF3B57]"></div>
                <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#FF3B57]">
                  Viral Intelligence
                </span>
              </div>
              <h1 className="font-['Syne'] font-[800] text-[clamp(32px,5vw,48px)] tracking-[-0.03em] leading-[1.0] mb-[10px]">
                <span className="text-[#F0F2F7] block">Instagram</span>
                <span className="text-[#FF3B57] block">Viral Analyzer</span>
              </h1>
              <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65] mb-[28px]">
                Paste an Instagram URL or username to detect outliers and run deep AI breakdowns.
              </p>
            </header>

            {/* 2. ANALYZER BOX */}
            <section className="relative overflow-hidden bg-[#0D1017] border border-[rgba(255,255,255,0.1)] rounded-[16px] p-[24px] mb-[24px]">
              {/* Top Glow Line */}
              <div className="absolute top-0 left-0 right-0 h-[1px] opacity-40 bg-gradient-to-r from-transparent via-[#FF3B57] to-transparent"></div>

              {/* SEARCH INPUT AREA */}
              <div className="flex gap-[8px] mb-[18px]">
                <div className="relative flex-1">
                  <div className="absolute left-[14px] top-1/2 -translate-y-1/2 text-[#5A6478] pointer-events-none z-10">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && username.trim() && !loadingFeed) {
                        runDashboardAnalysis();
                      }
                    }}
                    placeholder="Search by username or paste URL..."
                    className="analyze-input w-full p-[13px_18px_13px_42px] font-['DM_Sans'] text-[13.5px] bg-[#111620] border-[rgba(255,255,255,0.1)] focus:bg-[#161C2A]"
                  />
                </div>
                <button
                  type="button"
                  onClick={runDashboardAnalysis}
                  disabled={loadingFeed || !username.trim()}
                  className="flex-shrink-0 bg-[#FF3B57] border-none rounded-[10px] p-[13px_22px] text-white font-['JetBrains_Mono'] text-[12px] font-[500] shadow-[0_0_18px_rgba(255,59,87,0.3)] cursor-pointer transition-all duration-150 hover:shadow-[0_0_28px_rgba(255,59,87,0.5)] hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {loadingFeed ? "..." : "GO ↵"}
                </button>
              </div>

              {/* MODE ROW */}
              <div className="flex flex-wrap items-center justify-end gap-[12px]">
                <div className="flex items-center gap-[16px]">
                  <div className="flex items-center gap-[8px]">
                    <span className="font-['JetBrains_Mono'] text-[10px] uppercase text-[#5A6478] tracking-[0.1em]">SORT</span>
                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as SortOption)}
                        className="appearance-none bg-[#111620] border border-[rgba(255,255,255,0.12)] rounded-[7px] p-[6px_28px_6px_10px] font-['DM_Sans'] text-[11.5px] text-[#F0F2F7] outline-none cursor-pointer transition focus:border-[rgba(255,59,87,0.45)]"
                      >
                        <option value="newest">Newest First</option>
                        <option value="views">Most Views</option>
                        <option value="outlier">Highest Outlier Score</option>
                        <option value="engagement">Highest Engagement</option>
                      </select>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-[8px] top-1/2 -translate-y-1/2 w-3 h-3 text-[#5A6478] pointer-events-none"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                  </div>

                  <div className="flex items-center gap-[8px]">
                    <span className="font-['JetBrains_Mono'] text-[10px] uppercase text-[#5A6478] tracking-[0.1em]">RANGE</span>
                    <div className="relative">
                      <select
                        value={dateRange}
                        onChange={(event) => setDateRange(event.target.value as DateRangeOption)}
                        className="appearance-none bg-[#111620] border border-[rgba(255,255,255,0.12)] rounded-[7px] p-[6px_28px_6px_10px] font-['DM_Sans'] text-[11.5px] text-[#F0F2F7] outline-none cursor-pointer transition focus:border-[rgba(255,59,87,0.45)]"
                      >
                        {DATE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-[8px] top-1/2 -translate-y-1/2 w-3 h-3 text-[#5A6478] pointer-events-none"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                  </div>
                </div>
              </div>

              {error ? <p className="mt-[16px] text-[13px] text-[#FF3B57] font-['DM_Sans']">{error}</p> : null}
            </section>
            {/* HOW IT WORKS SECTION */}
            {!hasSearched ? (
              <div className="w-full mt-[48px] mb-[32px]">
                <h2 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7] mb-[16px] text-center md:text-left">How it works</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
                  {/* Step 1 */}
                  <div className="bg-[#0D1017] border border-[rgba(255,255,255,0.06)] rounded-[12px] p-[18px]">
                    <div className="font-['JetBrains_Mono'] text-[11px] text-[#FF3B57] mb-[8px] tracking-[0.1em]">01 — SEARCH</div>
                    <h3 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7] mb-[6px]">Search or Paste URL</h3>
                    <p className="font-['DM_Sans'] text-[12.5px] text-[#8892A4] leading-[1.6]">
                      Analyze multiple posts at once from a channel profile, or paste a direct video URL from supported platforms.
                    </p>
                  </div>
                  {/* Step 2 */}
                  <div className="bg-[#0D1017] border border-[rgba(255,255,255,0.06)] rounded-[12px] p-[18px]">
                    <div className="font-['JetBrains_Mono'] text-[11px] text-[#3BFFC8] mb-[8px] tracking-[0.1em]">02 — ANALYZE</div>
                    <h3 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7] mb-[6px]">AI processes it</h3>
                    <p className="font-['DM_Sans'] text-[12.5px] text-[#8892A4] leading-[1.6]">
                      The Outlier pipeline extracts the raw transcript, dissects the hook format, structure blocks, and style patterns.
                    </p>
                  </div>
                  {/* Step 3 */}
                  <div className="bg-[#0D1017] border border-[rgba(255,255,255,0.06)] rounded-[12px] p-[18px]">
                    <div className="font-['JetBrains_Mono'] text-[11px] text-[#A78BFA] mb-[8px] tracking-[0.1em]">03 — CREATE</div>
                    <h3 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7] mb-[6px]">Generate scripts</h3>
                    <p className="font-['DM_Sans'] text-[12.5px] text-[#8892A4] leading-[1.6]">
                      Take the exact AI breakdown framework and generate fresh, high-performing scripts using the Script Studio.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* 3. STATS ROW */}
            {hasSearched && data ? (
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-[28px]">
                {[
                  {
                    color: "#FF3B57",
                    label: "TOTAL VIEWS",
                    value: formatNumber(data.posts.reduce((acc, curr) => acc + curr.metrics.views, 0)),
                    sub: `Across ${data.posts.length} reels analyzed`,
                  },
                  {
                    color: "#3BFFC8",
                    label: "AVG VIEWS",
                    value: formatNumber(
                      data.posts.length
                        ? data.posts.reduce((acc, curr) => acc + curr.metrics.views, 0) / data.posts.length
                        : 0
                    ),
                    sub: "Per reel this period",
                  },
                  {
                    color: "#FF8C42",
                    label: "AVG ENGAGEMENT",
                    value: `${data.posts.length
                      ? (data.posts.reduce((acc, curr) => acc + curr.engagementRate, 0) / data.posts.length).toFixed(1)
                      : "0.0"
                      }%`,
                    sub: "Above industry avg",
                  },
                  {
                    color: "#A78BFA",
                    label: "OUTLIER SCORE",
                    value: `${data.posts.length
                      ? Math.max(...data.posts.map(p => p.outlierScore)).toFixed(1)
                      : "0.0"
                      }×`,
                    sub: "Best performing reel",
                  },
                ].map((stat, i) => (
                  <div
                    key={i}
                    className="relative group glass-surface rounded-[12px] p-[18px_20px] overflow-hidden transition-all duration-200 cursor-default hover:border-[rgba(255,255,255,0.12)] hover:-translate-y-[2px]"
                  >
                    <div
                      className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      style={{ background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }}
                    />
                    <div className="flex items-center gap-[6px] font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.15em] text-[#5A6478] mb-[10px]">
                      <div className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: stat.color, boxShadow: `0 0 6px ${stat.color}` }}></div>
                      {stat.label}
                    </div>
                    <div className="font-['Syne'] font-[800] text-[clamp(18px,2.5vw,24px)] tracking-[-0.02em] text-[#F0F2F7] mb-[3px] truncate">
                      {stat.value}
                    </div>
                    <div className="font-['DM_Sans'] text-[11px] text-[#5A6478]">
                      {stat.sub}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            {/* Error/Warnings */}
            {hasSearched && data && data.warnings.length > 0 ? (
              <section className="mb-[28px] rounded-[16px] border border-[rgba(255,140,66,0.2)] glass-surface p-[16px]">
                <p className="text-[12px] text-[#FF8C42] font-['DM_Sans']">{data.warnings.join(" ")}</p>
              </section>
            ) : null}

            {/* Existing Winning Formula Box */}
            {winningFormula ? (
              <div className="mb-[28px] rounded-[16px] border border-[rgba(59,255,200,0.2)] glass-surface p-[28px] relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#3BFFC8] to-transparent opacity-50"></div>
                <div className="flex items-center gap-[8px] mb-[12px]">
                  <Sparkles className="h-4 w-4 text-[#3BFFC8]" />
                  <h2 className="text-[14px] font-semibold text-[#3BFFC8] font-['Syne']">Winning Formula — Common Denominators</h2>
                  <span className="ml-[auto] rounded-full border border-[rgba(255,255,255,0.06)] bg-[#111620] px-[8px] py-[2px] text-[10px] text-[#8892A4] font-['JetBrains_Mono'] uppercase tracking-[0.1em]">videos analysed</span>
                </div>
                <p className="whitespace-pre-wrap text-[13.5px] text-[#F0F2F7] leading-[1.6] font-['DM_Sans']">{winningFormula}</p>
              </div>
            ) : null}

            {/* 4. VIDEO FEED */}
            {hasSearched ? (
              <div className="w-full pb-[128px]">
                {/* Section Header */}
                <div className="flex items-center justify-between mb-[18px]">
                  <div className="flex items-center gap-[10px]">
                    <h2 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">Video Feed</h2>
                    <span className="font-['JetBrains_Mono'] text-[10px] bg-[#111620] border border-[rgba(255,255,255,0.08)] text-[#5A6478] px-[8px] py-[2px] rounded-[4px]">
                      {visiblePosts.length}
                    </span>
                  </div>
                  <Link href="/videos" className="bg-transparent border-none outline-none font-['DM_Sans'] text-[12.5px] text-[#FF3B57] hover:text-[#ff2244] transition-colors cursor-pointer no-underline">
                    View All Videos &rarr;
                  </Link>
                </div>

                {loadingFeed ? (
                  <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="glass-surface rounded-[14px] overflow-hidden">
                        <Skeleton width="100%" height="320px" borderRadius="0" />
                        <div className="p-4 space-y-3">
                          <Skeleton width="100%" height="12px" />
                          <Skeleton width="60%" height="12px" />
                          <Skeleton width="100%" height="36px" borderRadius="8px" />
                        </div>
                      </div>
                    ))}
                  </section>
                ) : visiblePosts.length === 0 ? (
                  <EmptyState
                    icon={<Search size={36} />}
                    title="No results found"
                    description={data ? "No posts match the selected filters. Try adjusting your search or filters." : "Run a search to load videos from a profile."}
                    className="glass-surface rounded-[14px]"
                  />
                ) : (
                  <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {visiblePosts.map((post) => {
                      const isAnalyzing = analysisLoadingId === post.id;
                      const hasAnalysis = Boolean(analysisMap[post.id]);

                      return (
                        <article key={post.id} className="group glass-surface rounded-[14px] overflow-hidden cursor-pointer transition-all duration-300 ease-out relative hover:border-[rgba(255,255,255,0.14)] hover:-translate-y-[4px] hover:shadow-[0_20px_48px_rgba(0,0,0,0.45)]">
                          {/* THUMBNAIL AREA */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleVideoCardClick(post)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleVideoCardClick(post);
                              }
                            }}
                            className="relative aspect-[9/14] overflow-hidden bg-[#111620]"
                          >
                            <video
                              ref={(node) => {
                                videoRefs.current[post.id] = node;
                              }}
                              src={post.videoUrl ? `${post.videoUrl}#t=0.001` : ""}
                              poster={post.thumbnailUrl || post.displayUrl || post.coverUrl || post.videoUrl}
                              controls={false}
                              preload="metadata"
                              playsInline
                              className="w-full h-full object-cover opacity-80 transition-opacity duration-200 group-hover:opacity-100"
                              onLoadedMetadata={(event) => {
                                const video = event.currentTarget;
                                video.pause();
                                try {
                                  video.currentTime = 0;
                                } catch { }
                              }}
                            />

                            {/* Gradient Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.85)] via-[rgba(0,0,0,0.2)] to-transparent opacity-100 pointer-events-none"></div>

                            {/* Badges */}
                            <div className="absolute top-[10px] left-[10px] bg-[rgba(0,0,0,0.65)] backdrop-blur-[12px] border border-[rgba(255,255,255,0.1)] rounded-[5px] px-[7px] py-[3px] font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#3BFFC8] pointer-events-none">
                              {post.mediaType === "REEL" ? "REEL" : post.mediaType === "CAROUSEL" ? "CAROUSEL" : post.mediaType.toUpperCase()}
                            </div>

                            {(() => {
                              const outlierScoreValue = post.outlierScore !== undefined && post.outlierScore !== null
                                ? Number(post.outlierScore).toFixed(1)
                                : "—";
                              
                              return (
                                <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center z-20">
                                  {/* Views Badge (Left) */}
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-xs font-medium text-white/90">
                                    👁 {formatNumber(post.metrics.views)}
                                  </div>

                                  {/* Outlier Score Badge (Right) */}
                                  <div className={`px-2.5 py-1 rounded-md text-xs font-black backdrop-blur-md border ${
                                    Number(outlierScoreValue) >= 2.0 ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]' :
                                    Number(outlierScoreValue) >= 1.0 ? 'bg-white/10 text-white/90 border-white/20' : 
                                    'bg-red-500/10 text-red-400 border-red-500/30'
                                  }`}>
                                    {outlierScoreValue}x
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {/* VIDEO INFO */}
                          <div className="p-[14px]">
                            <p className="font-['DM_Sans'] text-[12.5px] text-[#8892A4] leading-[1.45] mb-[12px] line-clamp-2 transition-colors duration-150 group-hover:text-[#F0F2F7]">
                              {post.caption || "No caption available."}
                            </p>

                            <button
                              type="button"
                              onClick={() => handleAnalyze(post)}
                              disabled={isAnalyzing}
                              className={`w-full flex items-center justify-center gap-[5px] p-[8px] rounded-[8px] cursor-pointer transition-all duration-150 ${isAnalyzing
                                ? "bg-[rgba(59,255,200,0.07)] border border-[rgba(59,255,200,0.22)] text-[#3BFFC8] font-['JetBrains_Mono'] text-[11px] gap-[7px]"
                                : "bg-transparent border border-[rgba(255,255,255,0.1)] text-[#8892A4] font-['DM_Sans'] text-[12px] font-[500] hover:bg-[rgba(255,59,87,0.07)] hover:border-[rgba(255,59,87,0.28)] hover:text-[#FF3B57]"
                                }`}
                            >
                              {isAnalyzing ? (
                                <>
                                  <div className="w-[6px] h-[6px] rounded-full bg-[#3BFFC8] animate-pulse shadow-[0_0_6px_#3BFFC8]"></div>
                                  Analyzing...
                                </>
                              ) : hasAnalysis ? "✦ View Analysis" : "✦ Analyze Video"}
                            </button>

                            {analysisErrors[post.id] ? (
                              <p className="mt-[8px] text-[11px] text-[#FF3B57] font-['DM_Sans']">{analysisErrors[post.id]}</p>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </section>
                )}
              </div>
            ) : (
              <EmptyState
                icon={<div className="text-[48px] opacity-20 select-none pointer-events-none">⬡</div>}
                title="SaaS Intelligence Hub"
                description="Paste a URL or search a username to discover viral outliers and generate high-performing scripts."
                className="pt-[60px] pb-[120px]"
              />
            )}
          </div>
        </div>
        {/* Removed local vaultToast divider */}
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white/50 font-['DM_Sans'] text-sm">Loading Outlier Studio...</div>}>
      <HomePageContent />
    </Suspense>
  );
}
