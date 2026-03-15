"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useToast } from "../components/UI/Toast";
import type { ScanProfileResponse } from "../api/scan-profile/route";
import type { NamedWatchlist, WatchlistChannel } from "../../lib/types";

// ── types ───────────────────────────────────────────────
type Watchlist = { name: string; count: number; avatars: string[] };
type WinningFormat = { format_name: string; why_it_works: string };
type FeedOutlier = ScanProfileResponse["outliers"][number] & { fromUsername: string };

const SEED_WATCHLISTS: Watchlist[] = [
  { name: "AI Education and Tutorials", count: 20, avatars: ["AE", "GT", "NS"] },
  { name: "Short-form Storytelling", count: 14, avatars: ["SS", "RT", "HK"] },
  { name: "Creator Economy Signals", count: 11, avatars: ["CE", "IP", "GL"] },
];

const TRACKED_KEY = "tracked_channels";

function buildInstagramWatchlistChannel(username: string): WatchlistChannel {
  return {
    username,
    platform: "instagram",
    url: `https://www.instagram.com/${username}/`,
    followers: null,
  };
}

function instagramBadge() {
  return (
    <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]" />
  );
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function mergeOutlierFeed(existingFeed: FeedOutlier[], incomingOutliers: FeedOutlier[]): FeedOutlier[] {
  const merged = new Map<string, FeedOutlier>();

  for (const outlier of [...existingFeed, ...incomingOutliers]) {
    merged.set(`${outlier.fromUsername}:${outlier.id}`, outlier);
  }

  return [...merged.values()].sort(
    (a, b) => (b.outlierScore ?? b.multiplier) - (a.outlierScore ?? a.multiplier) || b.views - a.views,
  );
}

export default function ChannelsDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();

  // ── tracked channels ──────────────────────────────────────────
  const [watchlist, setWatchlist] = useState<WatchlistChannel[]>([]);
  const [namedWatchlists, setNamedWatchlists] = useState<NamedWatchlist[]>([]);
  const [isLoadingWatchlists, setIsLoadingWatchlists] = useState(true);
  const [newChannelInput, setNewChannelInput] = useState("");
  const [miningQuadrant, setMiningQuadrant] = useState("Q1");
  // 5x5 Master Grid State
  const [showGridModal, setShowGridModal] = useState(false);
  const [masterGrid, setMasterGrid] = useState<FeedOutlier[]>([]);
  const tracked = watchlist.map((channel) => channel.username);

  async function requestWatchlist(method: "GET" | "POST" | "DELETE", body?: unknown) {
    const response = await fetch("/api/watchlist", {
      method,
      cache: method === "GET" ? "no-store" : undefined,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = (await response.json().catch(() => ({}))) as {
      watchlist?: WatchlistChannel[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Failed to update watchlist.");
    }

    return Array.isArray(payload.watchlist) ? payload.watchlist : [];
  }

  useEffect(() => {
    async function hydrateWatchlist() {
      try {
        const remoteWatchlist = await requestWatchlist("GET");
        if (remoteWatchlist.length > 0) {
          setWatchlist(remoteWatchlist);
          return;
        }
      } catch {
        // Fall back to local storage migration below.
      }

      try {
        const raw = localStorage.getItem(TRACKED_KEY);
        const storedUsernames = raw ? (JSON.parse(raw) as string[]) : [];
        if (!Array.isArray(storedUsernames) || storedUsernames.length === 0) {
          setWatchlist([]);
          return;
        }

        let nextWatchlist: WatchlistChannel[] = [];

        for (const username of storedUsernames) {
          const normalizedUsername = typeof username === "string" ? username.trim().replace(/^@+/, "") : "";
          if (!normalizedUsername) continue;
          nextWatchlist = await requestWatchlist("POST", buildInstagramWatchlistChannel(normalizedUsername));
        }

        setWatchlist(nextWatchlist.length > 0 ? nextWatchlist : storedUsernames.map(buildInstagramWatchlistChannel));
      } catch {
        setWatchlist([]);
      }
    }

    void hydrateWatchlist();
  }, []);

  useEffect(() => {
    async function loadNamedWatchlists() {
      try {
        const res = await fetch("/api/watchlists", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as { watchlists?: NamedWatchlist[] };
        setNamedWatchlists(Array.isArray(payload.watchlists) ? payload.watchlists : []);
      } catch {
        setNamedWatchlists([]);
      } finally {
        setIsLoadingWatchlists(false);
      }
    }
    void loadNamedWatchlists();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TRACKED_KEY, JSON.stringify(tracked));
    } catch {
      // Ignore local storage sync failures.
    }
  }, [tracked]);

  async function handleAddChannel() {
    const username = newChannelInput.trim().replace(/^@/, "");
    if (!username) return;

    if (tracked.some((trackedUsername) => trackedUsername.toLowerCase() === username.toLowerCase())) {
      setNewChannelInput("");
      return;
    }

    try {
      const nextWatchlist = await requestWatchlist("POST", {
        ...buildInstagramWatchlistChannel(username),
        miningQuadrant
      });
      setWatchlist(nextWatchlist);
      setNewChannelInput("");
      setScanError("");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Failed to save watchlist.");
    }
  }

  async function handleRemoveChannel(username: string) {
    try {
      const nextWatchlist = await requestWatchlist("DELETE", { username });
      setWatchlist(nextWatchlist);
      setScanError("");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Failed to update watchlist.");
    }
  }

  // ── outlier radar ─────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanError, setScanError] = useState("");
  const [newOutliers, setNewOutliers] = useState<FeedOutlier[]>([]);

  async function handleScanProfiles(usernames: string[]) {
    if (usernames.length === 0) {
      setScanError("No profiles to scan in this watchlist.");
      return;
    }

    const apifyKey = (() => {
      const v = localStorage.getItem("APIFY_API_KEY");
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    })();

    if (!apifyKey) {
      setScanError("Apify API key missing. Add it in Settings.");
      return;
    }

    setScanError("");
    setIsScanning(true);

    try {
      for (let i = 0; i < usernames.length; i++) {
        const username = usernames[i];
        setScanProgress(`Scanning @${username} (${i + 1} of ${usernames.length})…`);
        try {
          const res = await fetch("/api/scan-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, apifyApiKey: apifyKey }),
          });
          if (res.ok) {
            const payload = (await res.json()) as ScanProfileResponse;
            const channelOutliers = payload.outliers.map((outlier) => ({ ...outlier, fromUsername: username }));

            if (channelOutliers.length > 0) {
              setNewOutliers((prevFeed) => mergeOutlierFeed(prevFeed, channelOutliers));
            }
          }
        } catch {
          // continue to next channel
        }
      }
    } finally {
      setScanProgress("");
      setIsScanning(false);
    }
  }

  async function handleScanTracked() {
    // Collect all unique usernames from all named watchlists
    const allUsernames = Array.from(
      new Set(namedWatchlists.flatMap((wl) => wl.profiles.map((p) => p.username)))
    );
    if (allUsernames.length === 0) {
      setScanError("No profiles tracked. Build a watchlist first.");
      return;
    }
    await handleScanProfiles(allUsernames);
  }

  function handleAnalyzeVideo(outlier: { id: string; fromUsername: string }) {
    try {
      const raw = localStorage.getItem("posts_cache");
      const cache = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      if (!cache[outlier.id]) {
        cache[outlier.id] = { id: outlier.id, username: outlier.fromUsername };
        localStorage.setItem("posts_cache", JSON.stringify(cache));
      }
    } catch { /* ignore */ }
    router.push(`/videos/${encodeURIComponent(outlier.id)}`);
  }

  // ── Format extraction ──────────────────────────────────────────
  const [extractingFor, setExtractingFor] = useState<string | null>(null);
  const [extractError, setExtractError] = useState("");
  const [formatsMap, setFormatsMap] = useState<Record<string, WinningFormat[]>>({});
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);

  async function handleExtractFormats(username: string) {
    // Get outliers for this specific creator
    const creatorOutliers = newOutliers
      .filter((o) => o.fromUsername === username)
      .slice(0, 5);

    if (creatorOutliers.length === 0) {
      setExtractError("Scan channels first to find outliers, then extract formats.");
      return;
    }

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    const model = getStoredKey("activeModel") || "gemini-2.5-flash";
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    if (!apiKey) {
      setExtractError(`${provider} API key missing. Add it in Settings.`);
      return;
    }

    const videoDescriptions = creatorOutliers
      .map((o, i) => `${i + 1}. "${o.caption || "No caption"}" (${formatViews(o.views)} views, ${(o.outlierScore ?? o.multiplier).toFixed(1)}× avg)`)
      .join("\n");

    const prompt = `Analyze these top-performing videos from a single creator (@${username}). Identify their 3 most successful 'Formats' (e.g., 'Walking & Talking Listicle', 'Green Screen Commentary', 'Vlog Hook + Voiceover'). Return ONLY a JSON array of objects with 'format_name' and 'why_it_works'. No markdown fences or extra text.\n\nVideos:\n${videoDescriptions}`;

    setExtractingFor(username);
    setExtractError("");

    try {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, provider, apiKey, model, responseFormat: "json" }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Format extraction failed");
      }

      const payload = (await response.json()) as { text?: string; json?: WinningFormat[] };
      let formats: WinningFormat[] = [];

      if (Array.isArray(payload.json)) {
        formats = payload.json;
      } else if (payload.text) {
        try {
          const cleaned = payload.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleaned);
          formats = Array.isArray(parsed) ? parsed : [];
        } catch {
          throw new Error("AI returned invalid JSON. Try again.");
        }
      }

      setFormatsMap((prev) => ({ ...prev, [username]: formats }));
      setExpandedProfile(username);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Format extraction failed");
    } finally {
      setExtractingFor(null);
    }
  }

  function handleGenerateGrid() {
    if (newOutliers.length === 0) {
      toast("info", "No Outliers Found", "Scan your tracked channels first to populate the feed.");
      return;
    }
    
    // Sort by multiplier (outlier score) first, then by views
    const sorted = [...newOutliers].sort((a, b) => {
      const scoreA = a.outlierScore ?? a.multiplier ?? 0;
      const scoreB = b.outlierScore ?? b.multiplier ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.views - a.views;
    });

    const top25 = sorted.slice(0, 25);
    setMasterGrid(top25);
    setShowGridModal(true);
  }

  function handleExportCsv() {
    const agencyName = localStorage.getItem("agencyName") || "Outlier Studio";

    const rows = [
      [`Report Generated by: ${agencyName}`],
      [],
      ["Handle", "Total Views", "Avg Views", "Outlier Score", "Engagement Rate", "Top Format"],
    ];

    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;

    newOutliers.forEach((o) => {
      const avgViews = o.averageViews || 0;
      const outlierScore = o.outlierScore ?? o.multiplier;
      const engagementRate = o.views > 0 ? ((o.likes / o.views) * 100).toFixed(2) + "%" : "0%";
      const topFormat = formatsMap[o.fromUsername]?.[0]?.format_name || "N/A";

      rows.push([
        escapeCsv(o.fromUsername || ""),
        escapeCsv(o.views || 0),
        escapeCsv(avgViews),
        escapeCsv(outlierScore || 0),
        escapeCsv(engagementRate),
        escapeCsv(topFormat),
      ]);
    });

    const csvContent = rows.map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Client_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex w-full min-h-screen text-[var(--text)] flex-col relative z-10">
      <div className="w-full flex-shrink-0 p-0">
        <div className="mx-auto w-full">
          {/* Header Section */}
          <header className="mb-[32px] flex items-end justify-between">
            <div>
              <div className="flex items-center gap-[8px] mb-[12px]">
                <div className="w-[16px] h-[1px] bg-[#FF3B57]"></div>
                <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#FF3B57]">
                  Intelligence Network
                </span>
              </div>
              <h1 className="font-['Syne'] font-[800] text-[clamp(28px,4vw,40px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7] mb-[10px]">
                Channels<br />
                <span className="text-[#FF3B57]">Command Center</span>
              </h1>
              <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65] mb-[28px]">
                Track creators, scan for viral outliers, and extract winning content formats.
              </p>
            </div>
            <div className="flex items-center gap-[16px]">
              <Link
                href="/channels/build"
                className="bg-transparent border border-[rgba(255,255,255,0.12)] rounded-[10px] p-[11px_20px] text-[#F0F2F7] font-['JetBrains_Mono'] text-[12px] uppercase tracking-[0.05em] transition hover:bg-[rgba(255,255,255,0.05)] flex items-center gap-[8px]"
              >
                ⬡ Build Watchlist
              </Link>
              <button
                type="button"
                disabled={isScanning}
                onClick={() => void handleScanTracked()}
                className="bg-pink-500/10 text-pink-400 border border-pink-500/40 rounded-[10px] p-[11px_20px] font-['JetBrains_Mono'] text-[12px] font-[600] uppercase tracking-[0.05em] shadow-[0_0_20px_rgba(236,72,153,0.25)] transition hover:bg-pink-500 hover:text-white hover:shadow-[0_0_30px_rgba(236,72,153,0.5)] hover:-translate-y-[1px] flex items-center gap-[8px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isScanning ? scanProgress || "Scanning…" : "↻ Scan All Watchlists"}
              </button>
              {newOutliers.length > 0 && (
                <button
                  type="button"
                  onClick={handleGenerateGrid}
                  className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/40 rounded-[10px] p-[11px_20px] font-['JetBrains_Mono'] text-[12px] font-[600] uppercase tracking-[0.05em] shadow-[0_0_20px_rgba(34,211,238,0.25)] transition hover:bg-cyan-500 hover:text-white hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] hover:-translate-y-[1px] flex items-center gap-[8px]"
                >
                  ✦ Strategy Grid
                </button>
              )}
            </div>
          </header>

          {/* INPUT ROW - replaced by builder flow */}

          {scanError ? (
            <p className="mb-[24px] text-[13px] text-[#FF3B57] font-['DM_Sans']">{scanError}</p>
          ) : null}

          {/* MASTER OUTLIER FEED */}
          {newOutliers.length > 0 ? (
            <div className="mb-[40px]">
              <div className="mb-[20px] flex items-center justify-between">
                <div className="flex items-center gap-[10px]">
                  <h2 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">🏆 Master Outlier Feed</h2>
                  <span className="font-['JetBrains_Mono'] text-[10px] bg-[rgba(255,59,87,0.1)] border border-[rgba(255,59,87,0.2)] text-[#FF3B57] px-[8px] py-[3px] rounded-[4px]">
                    {newOutliers.length} outliers • Sorted by Score
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="bg-transparent border border-[rgba(255,255,255,0.12)] rounded-[8px] p-[8px_14px] text-[#8892A4] font-['JetBrains_Mono'] text-[11px] uppercase tracking-[0.05em] transition hover:text-[#F0F2F7] hover:border-[rgba(255,255,255,0.25)] flex items-center gap-[6px]"
                >
                  📊 Export CSV
                </button>
              </div>
              <div className="grid gap-[16px] grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                {newOutliers.map((outlier) => (
                  <article key={`${outlier.fromUsername}-${outlier.id}`} className="relative group glass-surface rounded-[12px] overflow-hidden cursor-pointer transition-all duration-300 hover:border-pink-500/30 hover:shadow-[0_0_25px_rgba(236,72,153,0.12),0_16px_40px_rgba(0,0,0,0.4)] hover:-translate-y-[3px]">
                    {outlier.permalink ? (
                      <a
                        href={outlier.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-3 left-3 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 hover:scale-110 transition-all shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                        title="Open original post"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    ) : null}
                    {/* Thumbnail */}
                    <div className="relative aspect-[9/14] overflow-hidden bg-[#111620]">
                      {outlier.thumbnailUrl || outlier.displayUrl || outlier.coverUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={outlier.thumbnailUrl || outlier.displayUrl || outlier.coverUrl}
                            alt="Thumbnail"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              const fallbackVideo = e.currentTarget.parentElement?.querySelector('[data-thumbnail-fallback="true"]');
                              if (fallbackVideo) {
                                fallbackVideo.classList.remove('hidden');
                                return;
                              }
                              e.currentTarget.parentElement?.querySelector('.fallback-ui')?.classList.remove('hidden');
                            }}
                          />
                          {outlier.videoUrl ? (
                            <video
                              src={`${outlier.videoUrl}#t=0.1`}
                              preload="metadata"
                              playsInline
                              muted
                              data-thumbnail-fallback="true"
                              className="hidden absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 bg-[#0a0a0a]"
                            />
                          ) : (
                            <div className="fallback-ui hidden absolute inset-0 flex items-center justify-center bg-[#111620] text-[12px] font-['DM_Sans'] text-[#5A6478]">
                              No Thumbnail
                            </div>
                          )}
                        </>
                      ) : outlier.videoUrl ? (
                        <video
                          src={`${outlier.videoUrl}#t=0.1`}
                          preload="metadata"
                          playsInline
                          muted
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 bg-[#0a0a0a]"
                        />
                      ) : (
                        <div className="flex absolute inset-0 items-center justify-center bg-[#111620] text-[12px] font-['DM_Sans'] text-[#5A6478]">
                          No Thumbnail
                        </div>
                      )}

                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.85)] via-[rgba(0,0,0,0.2)] to-transparent pointer-events-none"></div>

                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 z-20">
                        {/* Views Badge - Bottom Left */}
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur-md border border-emerald-500/30 rounded-md">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-bold text-white">
                            {formatViews(outlier.views)}
                          </span>
                        </div>

                        {/* Outlier Badge - Bottom Right */}
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur-md border border-rose-500/30 rounded-md">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          <span className="text-[10px] font-bold text-white">
                            {(outlier.outlierScore ?? outlier.multiplier).toFixed(1)}x
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-[14px]">
                      <div className="flex items-center gap-[6px] mb-[8px]">
                        {instagramBadge()}
                        <p className="text-[11px] font-['JetBrains_Mono'] text-[#5A6478]">@{outlier.fromUsername}</p>
                      </div>
                      <p className="line-clamp-2 text-[12.5px] text-[#8892A4] font-['DM_Sans'] leading-[1.4] mb-[12px] transition-colors group-hover:text-[#F0F2F7]">
                        {outlier.caption || "No caption"}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleAnalyzeVideo(outlier)}
                        className="w-full flex items-center justify-center gap-[6px] p-[8px] rounded-[7px] font-['DM_Sans'] text-[12px] font-[500] bg-white/[0.02] border border-white/[0.1] text-[#8892A4] transition-all duration-200 hover:bg-[rgba(236,72,153,0.08)] hover:border-[rgba(236,72,153,0.35)] hover:text-[#ec4899] hover:shadow-[0_0_12px_rgba(236,72,153,0.18)]"
                      >
                        ✦ Analyze Video
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {/* WATCHLIST GRID */}
          <div className="mb-[40px]">
            <div className="flex items-center justify-between mb-[20px]">
              <div className="flex items-center gap-[10px]">
                <h2 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">📋 My Watchlists</h2>
                <span className="font-['JetBrains_Mono'] text-[10px] bg-[rgba(59,255,200,0.08)] border border-[rgba(59,255,200,0.2)] text-[#3BFFC8] px-[8px] py-[3px] rounded-[4px]">
                  {namedWatchlists.length} watchlist{namedWatchlists.length !== 1 ? "s" : ""}
                </span>
              </div>
              <Link
                href="/channels/build"
                className="bg-transparent border border-[rgba(255,255,255,0.12)] rounded-[8px] p-[8px_16px] text-[#8892A4] font-['JetBrains_Mono'] text-[11px] uppercase tracking-[0.05em] transition hover:text-[#F0F2F7] hover:border-[rgba(255,255,255,0.25)]"
              >
                + New Watchlist
              </Link>
            </div>

            {isLoadingWatchlists ? (
              <div className="rounded-[12px] border border-dashed border-[rgba(255,255,255,0.12)] bg-[#0D1017] p-[32px] text-center">
                <p className="text-[13.5px] font-['DM_Sans'] text-[#5A6478]">Loading watchlists…</p>
              </div>
            ) : namedWatchlists.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[rgba(255,255,255,0.12)] bg-[#0D1017] p-[40px] text-center">
                <p className="text-[14px] font-['DM_Sans'] text-[#8892A4] mb-[8px]">No watchlists yet.</p>
                <p className="text-[12px] font-['DM_Sans'] text-[#5A6478] mb-[20px]">Use the Builder to create your first named watchlist.</p>
                <Link
                  href="/channels/build"
                  className="inline-block bg-[#3BFFC8] text-[#080A0F] p-[10px_24px] rounded-[8px] font-['DM_Sans'] text-[13px] font-[700] shadow-[0_0_16px_rgba(59,255,200,0.3)] transition hover:shadow-[0_0_24px_rgba(59,255,200,0.5)]"
                >
                  ⬡ Build Watchlist
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[20px]">
                {namedWatchlists.map((wl) => (
                  <div
                    key={wl.id}
                    onClick={() => router.push(`/channels/build?id=${wl.id}`)}
                    className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-5 flex flex-col transition-all duration-300 hover:border-cyan-500/50 hover:shadow-[0_0_24px_rgba(59,255,200,0.07)] relative group cursor-pointer"
                  >
                    {/* Delete — top-right corner, visible on hover */}
                    <button
                      type="button"
                      title="Delete watchlist"
                      onClick={async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (!confirm(`Delete watchlist "${wl.name}"?`)) return;
                        try {
                          const res = await fetch("/api/watchlists", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: wl.id }),
                          });
                          const payload = (await res.json().catch(() => ({}))) as { watchlists?: NamedWatchlist[] };
                          if (res.ok && Array.isArray(payload.watchlists)) {
                            setNamedWatchlists(payload.watchlists);
                          }
                        } catch { /* ignore */ }
                      }}
                      className="absolute top-4 right-4 text-white/30 hover:text-red-400 transition-colors duration-200 opacity-0 group-hover:opacity-100 text-lg leading-none"
                    >
                      🗑
                    </button>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-white flex items-center gap-2 pr-8">
                      🎯 {wl.name}
                    </h3>

                    {/* Avatar Stack */}
                    <div className="mt-4 mb-2">
                      <div className="flex items-center">
                        {wl.profiles.slice(0, 4).map((profile, idx) => (
                          <div
                            key={profile.username}
                            className={`w-10 h-10 rounded-full border-2 border-[#0A0A0A] flex-shrink-0 overflow-hidden bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white${idx > 0 ? " -ml-3" : ""}`}
                            title={`@${profile.username}`}
                          >
                            {profile.profilePicUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={profile.profilePicUrl}
                                alt={profile.username}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  (e.currentTarget.nextElementSibling as HTMLElement | null)?.classList.remove("hidden");
                                }}
                              />
                            ) : null}
                            <span className={profile.profilePicUrl ? "hidden" : ""}>
                              {profile.username.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                        ))}
                        {wl.profiles.length > 4 && (
                          <div className="w-10 h-10 rounded-full border-2 border-[#0A0A0A] -ml-3 bg-white/10 flex items-center justify-center text-xs font-bold text-white/60 flex-shrink-0">
                            +{wl.profiles.length - 4}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-white/40 mt-2">
                        {wl.profiles.length} creator{wl.profiles.length !== 1 ? "s" : ""} tracked
                      </p>
                    </div>

                    {/* Scan Button */}
                    <div className="mt-auto pt-3">
                      <button
                        type="button"
                        disabled={isScanning || wl.profiles.length === 0}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); void handleScanProfiles(wl.profiles.map((p) => p.username)); }}
                        className="w-full py-3 rounded-xl border border-white/10 bg-white/5 text-white/80 font-semibold flex items-center justify-center gap-2 hover:bg-cyan-500/10 hover:border-cyan-500 hover:text-cyan-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ⚡️ Scan Watchlist
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {extractError ? <p className="mt-[12px] text-[12px] text-[#FF3B57] font-['DM_Sans']">{extractError}</p> : null}
          </div>
        </div>
      </div>
      {/* MASTER GRID MODAL */}
      {showGridModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-[90vw] max-h-[90vh] glass-surface border border-white/10 rounded-[32px] p-8 overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-cyan-400 uppercase tracking-widest font-bold">Strategy planning</span>
                </div>
                <h2 className="font-['Syne'] font-[800] text-3xl text-white tracking-tight">5x5 Master Consensus Grid</h2>
                <p className="font-['DM_Sans'] text-sm text-[#8892A4] mt-1">
                  The top 25 outliers across your entire intelligence network, ranked by viral magnitude.
                </p>
              </div>
              <button 
                onClick={() => setShowGridModal(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
              <div className="grid grid-cols-5 gap-4">
                {masterGrid.map((post, idx) => (
                  <div 
                    key={idx} 
                    className="relative aspect-[9/14] rounded-2xl overflow-hidden border border-white/5 group bg-black/40 hover:border-cyan-500/50 transition-all duration-300"
                  >
                    <img 
                      src={post.thumbnailUrl || post.displayUrl || post.coverUrl} 
                      className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500"
                      alt={post.fromUsername}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity"></div>
                    
                    {/* Metrics Overlay */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                       <span className="bg-cyan-500 text-black font-bold font-['JetBrains_Mono'] text-[9px] px-2 py-0.5 rounded-full shadow-lg">
                        #{idx + 1}
                      </span>
                      <span className="bg-pink-600 text-white font-bold font-['JetBrains_Mono'] text-[9px] px-2 py-0.5 rounded-full shadow-lg">
                        {post.multiplier?.toFixed(1) || post.outlierScore?.toFixed(1)}x
                      </span>
                    </div>

                    <div className="absolute bottom-3 left-3 right-3">
                      <p className="font-['JetBrains_Mono'] text-[10px] text-cyan-400 mb-1 truncate">@{post.fromUsername}</p>
                      <p className="font-['DM_Sans'] text-[11px] font-bold text-white line-clamp-2 leading-tight group-hover:text-cyan-100 transition-colors">
                        {post.caption?.slice(0, 60) || "No caption"}...
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                        <span>👁️ {formatViews(post.views)}</span>
                      </div>
                    </div>
                    
                    <a 
                      href={post.permalink}
                      target="_blank"
                      className="absolute inset-0 z-10"
                    ></a>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
              <p className="font-['JetBrains_Mono'] text-[11px] text-gray-500">
                LOCKED: 25 NODES • DATA SOURCE: INSTAGRAM ANALYTICS
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowGridModal(false)}
                  className="px-6 py-2 rounded-xl border border-white/10 text-[12px] font-bold text-gray-400 hover:text-white transition-colors"
                >
                  Dismiss
                </button>
                <button 
                  onClick={() => { window.print(); }}
                  className="px-6 py-2 rounded-xl bg-cyan-600 border border-cyan-400/50 text-white text-[12px] font-bold hover:shadow-[0_0_20px_rgba(8,145,178,0.4)] transition-all"
                >
                  Print Strategy Map
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
