"use client";

import { useState, useMemo } from "react";
import { Trophy, TrendingUp, BarChart2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { ClientTrackedVideo } from "@/lib/types";
import { LOCAL_SETTINGS_KEY, parseLocalSettings } from "@/lib/client-settings";

interface SignalStackProps {
  trackedVideos: ClientTrackedVideo[];
  clientNiche: string;
  gameMode: string;
  clientId: string;
}

interface BreakdownResult {
  topic: string;
  packaging: string;
  contentStyle: string;
  emotionalTrigger: string;
  verdict: string;
}

function computeSignalScore(video: ClientTrackedVideo): number {
  const m = (video as any).metrics ?? {};
  const comments = Number(m.comments ?? 0);
  const shares = Number(m.shares ?? 0);
  const saves = Number(m.saves ?? 0);
  const likes = Number(m.likes ?? 0);
  const views = Number(m.views ?? 0);
  return (comments * 5) + (shares * 4) + (saves * 3) + (likes * 2) + (views * 0.1);
}

function fmtScore(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short" }).format(n);
}

export default function SignalStack({ trackedVideos, clientNiche, gameMode, clientId }: SignalStackProps) {
  const [signalView, setSignalView] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownResult | null>(null);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState("");

  const scored = useMemo(() => {
    return [...trackedVideos]
      .map(v => ({ ...v, signalScore: computeSignalScore(v) }))
      .sort((a, b) => signalView ? b.signalScore - a.signalScore : new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }, [trackedVideos, signalView]);

  const topThree = useMemo(() => {
    return [...trackedVideos]
      .map(v => ({ ...v, signalScore: computeSignalScore(v) }))
      .sort((a, b) => b.signalScore - a.signalScore)
      .slice(0, 3);
  }, [trackedVideos]);

  const hasAnyMetrics = trackedVideos.some(v => {
    const m = (v as any).metrics ?? {};
    return Number(m.views ?? 0) > 0 || Number(m.likes ?? 0) > 0;
  });

  if (!hasAnyMetrics) return null;

  async function handleBreakdown(video: ClientTrackedVideo & { signalScore: number }) {
    if (selectedWinnerId === video.id && breakdown) {
      setSelectedWinnerId(null);
      setBreakdown(null);
      return;
    }
    setSelectedWinnerId(video.id);
    setBreakdown(null);
    setBreakdownError("");
    setIsLoadingBreakdown(true);
    try {
      const ls = typeof window !== "undefined" ? parseLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY)) : null;
      const geminiApiKey = (typeof window !== "undefined" && localStorage.getItem("geminiApiKey")?.trim()) || ls?.geminiApiKey;
      const openaiApiKey = (typeof window !== "undefined" && localStorage.getItem("openAiApiKey")?.trim()) || ls?.openaiApiKey;
      const anthropicApiKey = (typeof window !== "undefined" && localStorage.getItem("anthropicApiKey")?.trim()) || ls?.anthropicApiKey;
      const activeProvider =
        (typeof window !== "undefined" && localStorage.getItem("activeProvider")?.trim()) || "Gemini";
      const res = await fetch("/api/client/signal-breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoAnalysis: (video as any).analysis ?? {},
          videoUrl: video.url,
          metrics: (video as any).metrics ?? {},
          clientNiche,
          gameMode,
          geminiApiKey: geminiApiKey || undefined,
          openaiApiKey: openaiApiKey || undefined,
          anthropicApiKey: anthropicApiKey || undefined,
          activeProvider,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as BreakdownResult;
      setBreakdown(data);
    } catch {
      setBreakdownError("Could not generate breakdown. Please try again.");
    } finally {
      setIsLoadingBreakdown(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Signal Stack Header */}
      <div className="glass-surface rounded-2xl p-5 border border-amber-500/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500/10 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Signal Stack</h3>
              <p className="text-[10px] text-[#5A6478]">Comments×5 + Shares×4 + Saves×3 + Likes×2 + Views×0.1</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#5A6478] font-['JetBrains_Mono']">Sort by</span>
            <button
              onClick={() => setSignalView(false)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${!signalView ? "bg-[#3BFFC8]/10 text-[#3BFFC8] border border-[#3BFFC8]/20" : "text-[#5A6478] hover:text-[#F0F2F7] border border-transparent"}`}
            >
              Date
            </button>
            <button
              onClick={() => setSignalView(true)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${signalView ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "text-[#5A6478] hover:text-[#F0F2F7] border border-transparent"}`}
            >
              Signal Score
            </button>
          </div>
        </div>

        {/* True Winners cards */}
        <div className="mb-4">
          <p className="text-[10px] text-[#5A6478] font-['JetBrains_Mono'] uppercase tracking-wider mb-3">
            True Winners — top 3 by signal score
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topThree.map((video, i) => {
              const m = (video as any).metrics ?? {};
              const thumb = (video.thumbnailUrl && video.thumbnailUrl !== "undefined") ? video.thumbnailUrl : (video as any).displayUrl;
              const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
              const isSelected = selectedWinnerId === video.id;
              return (
                <div key={video.id} className="rounded-xl border border-amber-500/15 bg-amber-500/5 overflow-hidden">
                  <div className="flex gap-3 p-3">
                    {thumb ? (
                      <img src={thumb} alt="" className="w-12 h-16 object-cover rounded-lg shrink-0" />
                    ) : (
                      <div className="w-12 h-16 bg-white/5 rounded-lg shrink-0 flex items-center justify-center text-xl">📱</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-base">{rank}</span>
                        <span className="text-[10px] font-bold text-amber-400 font-['JetBrains_Mono']">
                          {fmtScore(video.signalScore)} pts
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-[#5A6478]">
                        {Number(m.comments ?? 0) > 0 && <span>💬 {fmtNum(Number(m.comments))}</span>}
                        {Number(m.shares ?? 0) > 0 && <span>🔁 {fmtNum(Number(m.shares))}</span>}
                        {Number(m.saves ?? 0) > 0 && <span>🔖 {fmtNum(Number(m.saves))}</span>}
                        {Number(m.views ?? 0) > 0 && <span>👁 {fmtNum(Number(m.views))}</span>}
                      </div>
                      <button
                        onClick={() => void handleBreakdown(video)}
                        className="mt-2 text-[10px] text-amber-400 hover:text-amber-300 font-semibold transition-colors"
                      >
                        {isSelected ? "Hide breakdown" : "Content breakdown →"}
                      </button>
                    </div>
                  </div>

                  {/* Breakdown panel */}
                  {isSelected && (
                    <div className="border-t border-amber-500/10 p-3 bg-[#080A0F]">
                      {isLoadingBreakdown && (
                        <div className="flex items-center gap-2 text-[11px] text-[#8892A4]">
                          <Loader2 className="w-3 h-3 animate-spin" /> Analyzing winner…
                        </div>
                      )}
                      {breakdownError && <p className="text-[11px] text-red-400">{breakdownError}</p>}
                      {breakdown && !isLoadingBreakdown && (
                        <div className="space-y-2">
                          {[
                            { label: "Topic", value: breakdown.topic, color: "text-[#3BFFC8]" },
                            { label: "Packaging", value: breakdown.packaging, color: "text-[#A78BFA]" },
                            { label: "Content Style", value: breakdown.contentStyle, color: "text-[#60a5fa]" },
                            { label: "Emotional Trigger", value: breakdown.emotionalTrigger, color: "text-[#F59E0B]" },
                          ].map(({ label, value, color }) => (
                            <div key={label}>
                              <p className={`text-[9px] font-bold uppercase tracking-wider ${color} mb-0.5`}>{label}</p>
                              <p className="text-[11px] text-[#F0F2F7]">{value}</p>
                            </div>
                          ))}
                          {breakdown.verdict && (
                            <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
                              <p className="text-[10px] font-bold text-amber-400 uppercase mb-0.5">Actionable Verdict</p>
                              <p className="text-[11px] text-[#F0F2F7]">{breakdown.verdict}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Signal score table toggle */}
        {signalView && (
          <div>
            <button
              onClick={() => setExpanded(p => !p)}
              className="flex items-center gap-1.5 text-[11px] text-[#5A6478] hover:text-[#F0F2F7] transition-colors mb-2"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? "Hide" : "Show"} all {trackedVideos.length} videos ranked by Signal Score
            </button>
            {expanded && (
              <div className="space-y-1.5">
                {scored.map((video, i) => {
                  const m = (video as any).metrics ?? {};
                  return (
                    <div key={video.id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${i < 3 ? "border-amber-500/15 bg-amber-500/5" : "border-white/5 bg-white/[0.02]"}`}>
                      <span className="text-[10px] font-bold text-[#5A6478] font-['JetBrains_Mono'] w-4 shrink-0">#{i + 1}</span>
                      <a href={video.url} target="_blank" rel="noreferrer" className="flex-1 text-[11px] text-[#8892A4] hover:text-[#3BFFC8] truncate transition-colors">
                        {(video as any).analysis?.hooks?.hookTitle ?? video.url}
                      </a>
                      <div className="flex items-center gap-3 text-[10px] text-[#5A6478] shrink-0">
                        {Number(m.comments ?? 0) > 0 && <span>💬 {fmtNum(Number(m.comments))}</span>}
                        {Number(m.shares ?? 0) > 0 && <span>🔁 {fmtNum(Number(m.shares))}</span>}
                        {Number(m.saves ?? 0) > 0 && <span>🔖 {fmtNum(Number(m.saves))}</span>}
                        <span className={`font-bold font-['JetBrains_Mono'] ${i < 3 ? "text-amber-400" : "text-[#8892A4]"}`}>
                          {fmtScore(video.signalScore)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
