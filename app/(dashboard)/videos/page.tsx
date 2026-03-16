"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import type { AnalyzeResponse, InstagramPost } from "@/lib/types";
import { ANALYSIS_CACHE_KEY, POSTS_CACHE_KEY } from "@/lib/client-settings";
import { calculateOutlierScore, formatNumber, formatRelativeTime, getFirstValidOutlierScore } from "@/lib/utils";
import Skeleton from "@/app/components/UI/Skeleton";
import EmptyState from "@/app/components/UI/EmptyState";
import { useToast } from "@/app/components/UI/Toast";
import { Database, Search, Filter, ArrowUpDown } from "lucide-react";

type SavedVideoData = {
  savedAt: string;
  post: InstagramPost;
  analysis: AnalyzeResponse;
};

const ANALYZED_HISTORY_KEY = "analyzed_history";

export default function VideosPage() {
  const router = useRouter();
  const [savedVideos, setSavedVideos] = useState<SavedVideoData[]>([]);
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("All Types");
  const [filterDate, setFilterDate] = useState("All Time");
  const [sortBy, setSortBy] = useState("Newest First");
  const [displayLimit, setDisplayLimit] = useState(12);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch("/api/database");
        if (res.ok) {
          const json = (await res.json()) as { data?: unknown };
          if (Array.isArray(json.data) && json.data.length > 0) {
            // Filter out manual uploads — only show scraped Instagram/social videos
            const scraped = (json.data as SavedVideoData[]).filter(
              v => v?.post?.username !== "manual_upload"
            );
            setSavedVideos(scraped);
            return;
          }
        }
      } catch { }

      try {
        const raw = localStorage.getItem(ANALYZED_HISTORY_KEY);
        const parsed = raw ? (JSON.parse(raw) as SavedVideoData[]) : [];
        const scraped = Array.isArray(parsed)
          ? parsed.filter(v => v?.post?.username !== "manual_upload")
          : [];
        setSavedVideos(scraped);
      } catch {
        setSavedVideos([]);
      }
    };

    void loadHistory();
  }, []);

  const stats = useMemo(() => {
    const channels = new Set((Array.isArray(savedVideos) ? savedVideos : []).map(v => v.post.username));
    const views = (Array.isArray(savedVideos) ? savedVideos : []).reduce((acc, v) => acc + (v.post.metrics.views || 0), 0);
    return {
      videos: savedVideos.length,
      channels: channels.size,
      views
    };
  }, [savedVideos]);

  const filteredAndSortedVideos = useMemo(() => {
    let result = [...savedVideos];

    const resolveOutlierScore = (video: SavedVideoData) => {
      return getFirstValidOutlierScore(
        video.analysis?.analysis?.outlierScore,
        video.post.calculatedMetrics?.outlierScore,
        calculateOutlierScore(video.post.metrics.views, video.post.authorAverageViews),
      );
    };

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(v =>
        v.post.caption?.toLowerCase().includes(q) ||
        v.post.username?.toLowerCase().includes(q)
      );
    }

    if (filterType !== "All Types") {
      result = result.filter(v => {
        if (filterType === "Instagram") return ["REEL", "IMAGE", "CAROUSEL"].includes(v.post.mediaType);
        if (filterType === "Shorts") return v.post.mediaType === "SHORTS" || v.post.mediaType === "YOUTUBE";
        if (filterType === "TikToks") return v.post.mediaType === "TIKTOK";
        return true;
      });
    }

    const now = new Date().getTime();
    if (filterDate === "Today") {
      result = result.filter(v => now - new Date(v.savedAt).getTime() <= 24 * 60 * 60 * 1000);
    } else if (filterDate === "This Week") {
      result = result.filter(v => now - new Date(v.savedAt).getTime() <= 7 * 24 * 60 * 60 * 1000);
    } else if (filterDate === "This Month") {
      result = result.filter(v => now - new Date(v.savedAt).getTime() <= 30 * 24 * 60 * 60 * 1000);
    } else if (filterDate === "Past 3 Months") {
      result = result.filter(v => now - new Date(v.savedAt).getTime() <= 90 * 24 * 60 * 60 * 1000);
    }

    if (sortBy === "Newest First") {
      result.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    } else if (sortBy === "Oldest First") {
      result.sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());
    } else if (sortBy === "Most Views") {
      result.sort((a, b) => (b.post.metrics.views || 0) - (a.post.metrics.views || 0));
    } else if (sortBy === "Highest Outlier Score") {
      result.sort((a, b) => (resolveOutlierScore(b) ?? 0) - (resolveOutlierScore(a) ?? 0));
    }

    return result;
  }, [savedVideos, searchQuery, filterType, filterDate, sortBy]);

  const visibleVideos = filteredAndSortedVideos.slice(0, displayLimit);

  async function handleDeleteVideo(videoId: string) {
    if (!confirm("Are you sure you want to delete this video from history?")) return;

    const previousVideos = savedVideos;
    const nextVideos = (Array.isArray(savedVideos) ? savedVideos : []).filter((video) => video.post.id !== videoId);
    const previousHistoryRaw = localStorage.getItem(ANALYZED_HISTORY_KEY);
    const previousPostsRaw = localStorage.getItem(POSTS_CACHE_KEY);
    const previousLegacyPostsRaw = localStorage.getItem("instagram-posts-cache");
    const previousAnalysesRaw = localStorage.getItem(ANALYSIS_CACHE_KEY);

    setSavedVideos(nextVideos);

    try {
      localStorage.setItem(ANALYZED_HISTORY_KEY, JSON.stringify(nextVideos));

      const postsRaw = localStorage.getItem(POSTS_CACHE_KEY);
      if (postsRaw) {
        const cachedPosts = JSON.parse(postsRaw) as Record<string, unknown>;
        delete cachedPosts[videoId];
        localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(cachedPosts));
      }

      const legacyPostsRaw = localStorage.getItem("instagram-posts-cache");
      if (legacyPostsRaw) {
        const cachedPosts = JSON.parse(legacyPostsRaw) as Record<string, unknown>;
        delete cachedPosts[videoId];
        localStorage.setItem("instagram-posts-cache", JSON.stringify(cachedPosts));
      }

      const analysesRaw = localStorage.getItem(ANALYSIS_CACHE_KEY);
      if (analysesRaw) {
        const cachedAnalyses = JSON.parse(analysesRaw) as Record<string, unknown>;
        delete cachedAnalyses[videoId];
        localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(cachedAnalyses));
      }

      const response = await fetch("/api/history/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: videoId }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete video from history database");
      }

      toast("success", "Video Deleted", "The video has been removed from your history.");
    } catch {
      setSavedVideos(previousVideos);
      try {
        if (previousHistoryRaw === null) {
          localStorage.removeItem(ANALYZED_HISTORY_KEY);
        } else {
          localStorage.setItem(ANALYZED_HISTORY_KEY, previousHistoryRaw);
        }

        if (previousPostsRaw === null) {
          localStorage.removeItem(POSTS_CACHE_KEY);
        } else {
          localStorage.setItem(POSTS_CACHE_KEY, previousPostsRaw);
        }

        if (previousLegacyPostsRaw === null) {
          localStorage.removeItem("instagram-posts-cache");
        } else {
          localStorage.setItem("instagram-posts-cache", previousLegacyPostsRaw);
        }

        if (previousAnalysesRaw === null) {
          localStorage.removeItem(ANALYSIS_CACHE_KEY);
        } else {
          localStorage.setItem(ANALYSIS_CACHE_KEY, previousAnalysesRaw);
        }
      } catch {
        // Ignore rollback errors.
      }
      toast("error", "Deletion Failed", "Could not remove the video from storage.");
    }
  }

  return (
    <div className="flex w-full min-h-screen text-[var(--text)] flex-col relative z-10">
      <div className="w-full flex-shrink-0 p-0">
        <div className="mx-auto w-full">
          {/* Header Section */}
          <header className="mb-[24px]">
            <div className="flex items-center gap-[8px] mb-[12px]">
              <div className="w-[16px] h-[1px] bg-[#FF3B57]"></div>
              <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#FF3B57]">
                Knowledge Base
              </span>
            </div>
            <h1 className="font-['Syne'] font-[800] text-[clamp(28px,4vw,40px)] tracking-[-0.02em] leading-[1.05] mb-[10px]">
              <span className="text-[#F0F2F7] block">History</span>
              <span className="text-[#FF3B57] block">Vault</span>
            </h1>
            <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65] mb-[28px]">
              Permanent history vault for all analyzed content. Search and revisit your viral outliers.
            </p>

            {/* Stats Bar */}
            <div className="flex items-center gap-[20px] mb-[28px] pb-[20px] border-b border-[rgba(255,255,255,0.06)]">
              <div>
                <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#5A6478]">Videos Analyzed</span>
                <span className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7] ml-[6px]">{stats.videos}</span>
              </div>
              <div className="w-[1px] h-[16px] bg-[rgba(255,255,255,0.08)]"></div>
              <div>
                <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#5A6478]">Channels Tracked</span>
                <span className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7] ml-[6px]">{stats.channels}</span>
              </div>
              <div className="w-[1px] h-[16px] bg-[rgba(255,255,255,0.08)]"></div>
              <div>
                <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#5A6478]">Total Views</span>
                <span className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7] ml-[6px]">{formatNumber(stats.views)}</span>
              </div>
            </div>
          </header>

          {/* SEARCH + FILTER BAR */}
          <div className="flex flex-wrap gap-[12px] items-center mb-[24px]">
            <div className="relative flex-1 min-w-[200px]">
              <div className="absolute left-[14px] top-1/2 -translate-y-1/2 text-[#5A6478] pointer-events-none">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by caption, channel, or topic..."
                className="analyze-input w-full p-[10px_14px_10px_40px] font-['DM_Sans'] text-[13px] bg-white/[0.04] backdrop-blur-xl border-white/[0.06]"
              />
            </div>

            <div className="relative">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="appearance-none bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-[8px] p-[10px_32px_10px_14px] font-['DM_Sans'] text-[13px] text-[#F0F2F7] outline-none cursor-pointer transition focus:border-[rgba(255,59,87,0.45)] focus:shadow-[0_0_0_3px_rgba(255,59,87,0.08)]"
              >
                <option value="All Types">All Types</option>
                <option value="Reels">Reels</option>
                <option value="Shorts">Shorts</option>
                <option value="TikToks">TikToks</option>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-[10px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-[#5A6478] pointer-events-none"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>

            <div className="relative">
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="appearance-none bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-[8px] p-[10px_32px_10px_14px] font-['DM_Sans'] text-[13px] text-[#F0F2F7] outline-none cursor-pointer transition focus:border-[rgba(255,59,87,0.45)] focus:shadow-[0_0_0_3px_rgba(255,59,87,0.08)]"
              >
                <option value="All Time">All Time</option>
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
                <option value="Past 3 Months">Past 3 Months</option>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-[10px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-[#5A6478] pointer-events-none"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>

            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-[8px] p-[10px_32px_10px_14px] font-['DM_Sans'] text-[13px] text-[#F0F2F7] outline-none cursor-pointer transition focus:border-[rgba(255,59,87,0.45)] focus:shadow-[0_0_0_3px_rgba(255,59,87,0.08)]"
              >
                <option value="Newest First">Newest First</option>
                <option value="Oldest First">Oldest First</option>
                <option value="Most Views">Most Views</option>
                <option value="Highest Outlier Score">Highest Outlier Score</option>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-[10px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-[#5A6478] pointer-events-none"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </div>

          {savedVideos.length === 0 ? (
            <EmptyState
              icon={<Database size={48} />}
              title="History Vault is Empty"
              description="Analyze videos or upload files to start building your knowledge base."
              className="min-h-[400px]"
            />
          ) : visibleVideos.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[rgba(255,255,255,0.12)] bg-white/[0.04] backdrop-blur-xl p-[32px] text-center">
              <p className="text-[13.5px] font-['DM_Sans'] text-[#8892A4]">No videos match your filters.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-[32px]">
                {(Array.isArray(visibleVideos) ? visibleVideos : []).map((item) => {
                  const dateSaved = new Date(item.savedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                  });
                  const outlierScore = getFirstValidOutlierScore(
                    item.analysis?.analysis?.outlierScore,
                    item.post.calculatedMetrics?.outlierScore,
                    calculateOutlierScore(item.post.metrics.views, item.post.authorAverageViews),
                  );
                  return (
                    <article key={`${item.post.id}-${item.savedAt}`} className="relative group flex flex-col glass-surface rounded-[12px] overflow-hidden transition-all duration-200 hover:border-white/[0.12] hover:-translate-y-[4px] hover:shadow-[0_20px_48px_rgba(0,0,0,0.5)] cursor-pointer" onClick={() => router.push(`/videos/${encodeURIComponent(item.post.id)}`)}>
                      <button
                        type="button"
                        aria-label="Delete video"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteVideo(item.post.id);
                        }}
                        className="absolute top-3 left-3 z-20 p-2 bg-black/60 backdrop-blur-md border border-red-500/30 text-red-400 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all duration-200"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>

                      {/* Thumbnail Area - 9/16 Portrait */}
                      <div className="relative w-full aspect-[9/16] bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden">
                        {(item.post.displayUrl || item.post.thumbnailUrl || item.post.coverUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.post.displayUrl || item.post.thumbnailUrl || item.post.coverUrl}
                            alt="Video thumbnail"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105 group-hover:opacity-100"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              const vid = e.currentTarget.nextElementSibling as HTMLVideoElement | null;
                              vid?.classList.remove("hidden");
                            }}
                          />
                        ) : null}

                        {item.post.videoUrl ? (
                          <video
                            src={`${item.post.videoUrl}#t=0.1`}
                            preload="metadata"
                            muted
                            playsInline
                            referrerPolicy="no-referrer"
                            className={`w-full h-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105 group-hover:opacity-100 ${(item.post.displayUrl || item.post.thumbnailUrl || item.post.coverUrl) ? "hidden" : ""}`}
                          />
                        ) : (
                          !(item.post.displayUrl || item.post.thumbnailUrl || item.post.coverUrl) && (
                            <div className="flex items-center justify-center w-full h-full text-[#5A6478] text-[12px] font-['DM_Sans']">
                              No Media Found
                            </div>
                          )
                        )}

                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.8)] via-[rgba(0,0,0,0.1)] to-transparent opacity-90 pointer-events-none" />

                        {/* Saved Badge */}
                        <div className="absolute top-[10px] right-[10px] bg-[rgba(0,0,0,0.7)] backdrop-blur-[8px] rounded-[4px] px-[7px] py-[3px] font-['JetBrains_Mono'] text-[9px] text-[#8892A4] pointer-events-none">
                          Saved {dateSaved}
                        </div>
                      </div>

                      {/* Info Area */}
                      <div className="p-[14px] flex flex-col flex-1">
                        <div className="flex items-center gap-[6px] mb-[5px]">
                          <div className="w-[5px] h-[5px] bg-[#3BFFC8] rounded-full shadow-[0_0_5px_#3BFFC8]"></div>
                          <span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] tracking-[0.03em]">@{item.post.username}</span>
                        </div>

                        <p className="line-clamp-2 text-[12.5px] text-[#8892A4] font-['DM_Sans'] leading-[1.45] mb-[12px] transition-colors group-hover:text-[#F0F2F7] flex-1">
                          {item.post.caption || "No caption available."}
                        </p>

                        <div className="flex flex-wrap gap-[12px] mb-[12px]">
                          <div className="flex items-center gap-[4px]">
                            <svg className="w-[10px] h-[10px] text-[#5A6478]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span className="font-['JetBrains_Mono'] text-[10px] text-[#8892A4]">{formatNumber(item.post.metrics.views || 0)}</span>
                          </div>
                          {(item.post.engagementRate > 0 || item.post.calculatedMetrics?.engagementRate) ? (
                            <div className="flex items-center gap-[4px]">
                              <svg className="w-[10px] h-[10px] text-[#5A6478]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                              <span className="font-['JetBrains_Mono'] text-[10px] text-[#8892A4]">{((item.post.engagementRate || item.post.calculatedMetrics?.engagementRate || 0) * 100).toFixed(1)}%</span>
                            </div>
                          ) : null}
                          {outlierScore !== null ? (
                            <div className="flex items-center gap-[4px]">
                              <svg className="w-[10px] h-[10px] text-[#5A6478]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                              <span className="font-['JetBrains_Mono'] text-[10px] text-[#8892A4]">{outlierScore.toFixed(1)}x</span>
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/videos/${encodeURIComponent(item.post.id)}`);
                          }}
                          className="w-full flex items-center justify-center p-[8px] rounded-[8px] bg-transparent border border-[rgba(255,255,255,0.1)] text-[#8892A4] font-['DM_Sans'] text-[12px] font-[500] hover:bg-[rgba(59,255,200,0.07)] hover:border-[rgba(59,255,200,0.28)] hover:text-[#3BFFC8] transition-all duration-150"
                        >
                          ✦ Open Analysis
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {filteredAndSortedVideos.length > displayLimit && (
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => prev + 12)}
                  className="w-full p-[12px] rounded-[8px] bg-transparent border border-[rgba(255,255,255,0.1)] text-[#8892A4] font-['DM_Sans'] text-[13px] hover:bg-white/[0.06] hover:text-[#F0F2F7] transition-colors"
                >
                  Load More
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
