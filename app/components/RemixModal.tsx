"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "./UI/Toast";

const ANALYZED_HISTORY_KEY = "analyzed_history";
const LEGACY_SAVED_VIDEOS_KEY = "savedVideos";
const POSTS_CACHE_KEY = "posts_cache";
const ANALYSIS_CACHE_KEY = "analysis_cache";
const REMIX_DATA_KEY = "remix_data";

interface SavedVideoData {
  savedAt?: string;
  post: any;
  analysis: any;
}

function readHistoryEntry(key: string, id: string): SavedVideoData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedVideoData[];
    if (!Array.isArray(parsed)) return null;
    return parsed.find((item) => item?.post?.id === id && item?.analysis?.analysis) ?? null;
  } catch {
    return null;
  }
}

export default function RemixModal({ videoId }: { videoId: string }) {
  const [showRemixModal, setShowRemixModal] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [remixAttribute, setRemixAttribute] = useState<string | null>(null);
  const [remixResult, setRemixResult] = useState<any>(null);
  const [onePercentFocus, setOnePercentFocus] = useState("Stronger Packaging (Title/Cover)");
  const { toast } = useToast();

  const [post, setPost] = useState<any>(null);
  const [analysisPayload, setAnalysisPayload] = useState<any>(null);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    if (!videoId || typeof window === "undefined") return;

    const fromAnalyzed = readHistoryEntry(ANALYZED_HISTORY_KEY, videoId);
    const fromSavedVideos = readHistoryEntry(LEGACY_SAVED_VIDEOS_KEY, videoId);

    if (fromAnalyzed || fromSavedVideos) {
      const entry = fromAnalyzed || fromSavedVideos;
      setPost(entry?.post ?? null);
      setAnalysisPayload(entry?.analysis?.analysis ?? null);
      setTranscript(entry?.analysis?.analysis?.breakdownBlocks?.problemAndSolution || "");
      return;
    }

    try {
      const postsRaw = localStorage.getItem(POSTS_CACHE_KEY);
      const analysesRaw = localStorage.getItem(ANALYSIS_CACHE_KEY);
      const cachedPosts = postsRaw ? JSON.parse(postsRaw) : {};
      const cachedAnalyses = analysesRaw ? JSON.parse(analysesRaw) : {};

      const cachedPost = cachedPosts[videoId];
      const cachedAnalysis = cachedAnalyses[videoId];

      if (cachedPost && cachedAnalysis) {
        setPost(cachedPost);
        setAnalysisPayload(cachedAnalysis.analysis);
        setTranscript(cachedAnalysis.analysis?.breakdownBlocks?.problemAndSolution || "");
      }
    } catch {
      // ignore
    }
  }, [videoId]);

  const handleRemixIdea = () => setShowRemixModal(true);

  async function executeRemix(selectedAttr: string) {
    if (!post || !analysisPayload || isRemixing) return;
    
    setRemixAttribute(selectedAttr);
    setIsRemixing(true);

    const geminiApiKey = localStorage.getItem("geminiApiKey");
    if (!geminiApiKey) {
      toast("error", "API Key Missing", "Please add your Gemini API key in Settings.");
      setIsRemixing(false);
      return;
    }

    try {
      const resp = await fetch("/api/remix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attribute: selectedAttr,
          analysis: analysisPayload,
          transcript,
          geminiApiKey,
          onePercentFocus,
        }),
      });

      if (!resp.ok) throw new Error("Remix generation failed");
      const { remix } = await resp.json();

      localStorage.setItem(
        REMIX_DATA_KEY,
        JSON.stringify({
          ...remix,
          sourcePostId: post.id,
          tweakedAttribute: selectedAttr,
          originalPost: post,
          originalAnalysis: analysisPayload,
          createdAt: new Date().toISOString(),
        })
      );

      setRemixResult(remix);
      toast("success", "Remix Engineered", `New ${selectedAttr} strategy generated.`);
    } catch (err) {
      toast("error", "Remix Error", "Failed to engineer remix strategy.");
    } finally {
      setIsRemixing(false);
    }
  }

  return (
    <>
      <button onClick={handleRemixIdea} className="w-full p-[10px_14px] rounded-[9px] font-['DM_Sans'] text-[12.5px] font-[500] cursor-pointer transition-all duration-150 flex items-center gap-[8px] bg-[rgba(167,139,250,0.08)] backdrop-blur-xl border border-[rgba(167,139,250,0.2)] text-[#A78BFA] hover:bg-[rgba(167,139,250,0.13)] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(167,139,250,0.15)]">
        <span>🔀</span> Remix Idea
      </button>

      {showRemixModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl glass-surface glow-cyan rounded-3xl p-10 border border-white/10 shadow-2xl relative flex flex-col md:flex-row gap-10">
            <button 
              onClick={() => !isRemixing && setShowRemixModal(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors z-[110]"
            >
              ✕
            </button>
            
            {/* LEFT: Attributes Selection */}
            <div className="flex-1">
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-cyan-400 uppercase tracking-widest">Engineering Mode</span>
                </div>
                <h2 className="font-['Syne'] font-[800] text-3xl text-white tracking-tight leading-tight">
                  Hold 4, Tweak 1 (Lego Bricks)
                </h2>
                <p className="font-['DM_Sans'] text-sm text-[#8892A4] mt-3 leading-relaxed">
                  We'll lock 4 of the 5 Lego Bricks and completely transform one. <br/>
                  <span className="text-cyan-400/80 font-medium">Select the brick you want to re-engineer:</span>
                </p>
              </div>

              {/* 1% Better Focus */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🎯</span>
                  <h3 className="font-['Syne'] font-[700] text-[#F0F2F7] text-[15px]">1% Better Focus (What are we improving?)</h3>
                </div>
                <select
                  value={onePercentFocus}
                  onChange={(e) => setOnePercentFocus(e.target.value)}
                  disabled={isRemixing}
                  className="w-full bg-[#111620]/80 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3.5 text-[#F0F2F7] text-[13.5px] appearance-none cursor-pointer focus:border-[#3BFFC8]/50 focus:ring-1 focus:ring-[#3BFFC8]/20 transition-all outline-none disabled:opacity-50"
                  style={{ backgroundImage: "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%238892A4' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E\")", backgroundPosition: "right 0.75rem center", backgroundRepeat: "no-repeat", backgroundSize: "1.5em 1.5em" }}
                >
                  <option value="Stronger Packaging (Title/Cover)">Stronger Packaging (Title/Cover)</option>
                  <option value="Tighter Storytelling (No Fluff)">Tighter Storytelling (No Fluff)</option>
                  <option value="More Emotional Trigger">More Emotional Trigger</option>
                  <option value="Better Curiosity Gap (Hook)">Better Curiosity Gap (Hook)</option>
                  <option value="Stronger CTA / Payoff">Stronger CTA / Payoff</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {([
                  { id: "Format", emoji: "🎬", desc: "Canvas style (breakdown, listicle, POV…)" },
                  { id: "Idea", emoji: "💡", desc: "Topic + seed + substance" },
                  { id: "Hook", emoji: "🪝", desc: "Text + visual + spoken hook" },
                  { id: "Script", emoji: "📝", desc: "Story structure + CTA + retention" },
                  { id: "Edit", emoji: "✂️", desc: "Visual layout + pacing + captions" },
                ] as const).map(({ id: attr, emoji, desc }) => (
                  <button
                    key={attr}
                    disabled={isRemixing}
                    onClick={() => executeRemix(attr)}
                    className={`w-full p-4 rounded-xl font-['DM_Sans'] text-sm font-bold tracking-wide transition-all duration-200 border flex items-center justify-between group
                      ${isRemixing && remixAttribute === attr 
                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-400" 
                        : "bg-white/[0.03] border-white/10 text-gray-300 hover:bg-white/[0.08] hover:border-cyan-500/30 hover:text-white"
                      }
                    `}
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-black/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        {emoji}
                      </span>
                      <span>
                        <span className="block">{attr}</span>
                        <span className="text-[10px] font-normal text-gray-500">{desc}</span>
                      </span>
                    </span>
                    
                    {isRemixing && remixAttribute === attr ? (
                      <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span className="text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">TWEAK ➔</span>
                    )}
                  </button>
                ))}
              </div>

              {isRemixing && (
                  <div className="mt-8 p-4 bg-cyan-500/5 rounded-2xl border border-cyan-500/20 text-center animate-pulse">
                      <p className="text-[12px] font-['JetBrains_Mono'] text-cyan-400 uppercase tracking-widest font-bold">Reshaping {remixAttribute} while locking constraints...</p>
                  </div>
              )}

              {remixResult ? (
                <div className="remix-result-container mt-8 pt-6 border-t border-white/10">
                  {/* Render the script text first */}
                  <p className="text-white whitespace-pre-wrap">{remixResult?.script}</p>

                  {/* Render the other attributes in a grid if needed */}
                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-white/40">
                    <div>Hook: {remixResult?.hook}</div>
                    <div>Idea: {remixResult?.idea}</div>
                    {remixResult?.format && <div>Format: {remixResult?.format}</div>}
                    {remixResult?.visual && <div>Visual: {remixResult?.visual}</div>}
                  </div>
                </div>
              ) : (
                <p className="text-white/50 text-sm mt-8 pt-6 border-t border-white/10">No remix generated yet</p>
              )}
            </div>

            {/* RIGHT: Checklist Visualization */}
            <div className="w-full md:w-72 bg-black/40 rounded-2xl p-6 border border-white/5 flex flex-col justify-between">
              <div>
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-6">Lego Bricks Status</h3>
                <div className="space-y-4">
                  {(["Format", "Idea", "Hook", "Script", "Edit"] as const).map((item) => (
                    <div key={item} className="flex items-center justify-between">
                      <span className={`text-[12px] font-medium font-['DM_Sans'] ${isRemixing && remixAttribute === item ? 'text-cyan-400 font-bold' : 'text-gray-400'}`}>
                        {item}
                      </span>
                      <span className="text-lg">
                        {isRemixing && remixAttribute === item ? '✨' : '🔒'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="pt-6 border-t border-white/5 mt-6">
                <p className="text-[9px] font-['JetBrains_Mono'] text-gray-600 leading-relaxed uppercase">
                  Lego Brick Rule:<br/>
                  Hold 4 bricks. Tweak 1. Repeat until you hit an outlier.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
