"use client";

import {
  Copy,
  Download,
  ExternalLink,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  ANALYSIS_CACHE_KEY,
  POSTS_CACHE_KEY,
} from "@/lib/client-settings";
import type { AnalyzeResponse, InstagramPost } from "@/lib/types";
import { calculateOutlierScore, formatNumber, formatRelativeTime } from "@/lib/utils";
import Skeleton from "@/app/components/UI/Skeleton";
import { useToast } from "@/app/components/UI/Toast";

type SavedVideoData = {
  savedAt?: string;
  post: InstagramPost;
  analysis: AnalyzeResponse;
};

const ANALYZED_HISTORY_KEY = "analyzed_history";
const LEGACY_SAVED_VIDEOS_KEY = "savedVideos";

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Removed local formatViews

function formatEngagement(n: number): string {
  if (n < 1) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

function formatOutlier(n: number): string {
  return `${n.toFixed(1)}×`;
}

function outlierColor(n: number): string {
  if (n >= 4) return "#FF3B57";
  if (n >= 2) return "#FF8C42";
  return "#8892A4";
}

function outlierLabel(n: number): string {
  if (n >= 4) return "Viral outlier 🔥";
  if (n >= 2) return "Outlier ↑";
  return "Average performer";
}

const generateXMLPrompt = (analysis: any, transcript: string) => {
  return `<system_instructions>
<job>You are a world-class script writer for short-form social media videos.</job>
<goal>To create the highest quality content that goes viral every single time.</goal>
<style_guide>
- Write in a conversational, informal, and friendly tone.
- Use short, punchy sentences to create a fast-paced cadence.
- Use simple language that anyone can understand.
- Avoid jargon and technical terms.
- Sound like human-written content. You must not sound like AI-generated content.
- Use a first-person tone, as if you are speaking to a friend.
- No fluff or wasted words. Be concise and to the point. Get the most value out of every sentence.
- Imbue a high degree of excitement and energy into the script.
- Don't sound corny or cheesy. Avoid cliches and overused phrases. Sound genuine and authentic.
- Output one sentence per line. There should be a blank line between each sentence.
</style_guide>
<target_audience>Intelligent and curious, but no background in the topic. Speak naturally to a friend.</target_audience>
</system_instructions>

<script_instructions>
<task>Write a compelling, attention-grabbing script for a social media short-form video that'll go viral. The final output script should be between 90 and 120 words.</task>
<topic>${analysis?.summary?.coreIdea || "Viral Outlier"}</topic>
<content>${transcript}</content>
</script_instructions>`;
};

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Removed local formatRelativeTime
function readHistoryEntry(key: string, id: string): SavedVideoData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = (Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []) as SavedVideoData[];
    return parsed.find((item) => item?.post?.id === id && item?.analysis?.analysis) ?? null;
  } catch {
    return null;
  }
}

function writeAnalysisCache(postId: string, analysis: AnalyzeResponse) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(ANALYSIS_CACHE_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, AnalyzeResponse>) : {};
    localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify({ ...existing, [postId]: analysis }));
  } catch { }
}

function writeHistoryAnalysis(post: InstagramPost, analysis: AnalyzeResponse) {
  if (typeof window === "undefined") return;
  const keys = [ANALYZED_HISTORY_KEY, LEGACY_SAVED_VIDEOS_KEY];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = (Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []) as SavedVideoData[];
      let matched = false;
      const next = parsed.map((item) => {
        if (item?.post?.id !== post.id) return item;
        matched = true;
        return { ...item, post, analysis };
      });
      if (!matched && key === ANALYZED_HISTORY_KEY) {
        next.unshift({ savedAt: new Date().toISOString(), post, analysis });
      }
      localStorage.setItem(key, JSON.stringify(next));
    } catch { }
  }
}

export default function VideoAnalysisPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const id = useMemo(() => {
    const raw = params?.id;
    return safeDecodeURIComponent(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
  }, [params]);

  const [post, setPost] = useState<InstagramPost | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [srtData, setSrtData] = useState("");
  const [showPromptBox, setShowPromptBox] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function togglePlay() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }

  function toggleMute() {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }

  function handleVideoProgress(e: React.MouseEvent<HTMLDivElement>) {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    videoRef.current.currentTime = percentage * duration;
  }

  useEffect(() => {
    if (!id) return;

    const loadData = async () => {
      // 1. Try localStorage first (history + cache)
      if (typeof window !== "undefined") {
        const fromAnalyzed = readHistoryEntry(ANALYZED_HISTORY_KEY, id);
        const fromSavedVideos = readHistoryEntry(LEGACY_SAVED_VIDEOS_KEY, id);

        if (fromAnalyzed || fromSavedVideos) {
          const entry = fromAnalyzed || fromSavedVideos;
          setPost(entry?.post ?? null);
          setAnalysis(entry?.analysis ?? null);
          setError("");
          return;
        }

        try {
          const postsRaw = localStorage.getItem(POSTS_CACHE_KEY);
          const analysesRaw = localStorage.getItem(ANALYSIS_CACHE_KEY);
          const cachedPosts = postsRaw && !Array.isArray(JSON.parse(postsRaw)) ? (JSON.parse(postsRaw) as Record<string, InstagramPost>) : {};
          const cachedAnalyses = analysesRaw && !Array.isArray(JSON.parse(analysesRaw)) ? (JSON.parse(analysesRaw) as Record<string, AnalyzeResponse>) : {};

          const cachedPost = cachedPosts[id];
          const cachedAnalysis = cachedAnalyses[id];

          if (cachedPost && cachedAnalysis) {
            setPost(cachedPost);
            setAnalysis(cachedAnalysis);
            setError("");
            return;
          }
        } catch { /* fall through to DB */ }
      }

      // 2. Fallback: fetch from database (uploaded videos)
      try {
        const res = await fetch(`/api/uploads/${encodeURIComponent(id)}`);
        if (res.ok) {
          const { upload } = await res.json();
          setAnalysis({ analysis: upload.analysis } as AnalyzeResponse);
          setPost(null);
          setError("");
          return;
        }
      } catch (error) {
        console.error("Failed to fetch from DB", error);
      }

      setPost(null);
      setAnalysis(null);
      setError("Analysis not found.");
    };

    void loadData();
  }, [id]);

  const analysisPayload = analysis?.analysis ?? null;

  const transcript = analysisPayload?.breakdownBlocks?.problemAndSolution || "";
  const hasGeneratedTranscript = Boolean(transcript.trim());
  const transcriptWordCount = hasGeneratedTranscript
    ? transcript.trim().split(/\s+/).filter(Boolean).length
    : 0;




  const handleRemixJump = () => {
    const suggestedName = post?.caption
      ? post.caption.trim().split(/\s+/).slice(0, 5).join(" ") + " Remix"
      : "Video Remix";
    const remixPayload = {
      transcript: transcript || post?.caption || "",
      analysis: analysis?.analysis || {},
      originalId: id,
      suggestedName,
    };

    sessionStorage.setItem("pendingRemix", JSON.stringify(remixPayload));
    router.push('/scripts/editor?mode=remix');
  };

  async function handleCreatePrompt() {
    if (!transcript) {
      toast("error", "No transcript available", "Analyze the video first to generate a transcript.");
      return;
    }
    try {
      const finalPrompt = generateXMLPrompt(analysisPayload, transcript);
      await navigator.clipboard.writeText(finalPrompt);
      setShowPromptBox(true);
      toast("success", "Master Prompt Copied", "The XML prompt is now in your clipboard.");
    } catch (err) {
      toast("error", "Failed to Copy", "Could not write to clipboard.");
    }
  }

  function handleDownloadSrt() {
    if (!srtData) return;
    const blob = new Blob([srtData], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${post?.id || "video"}-captions.srt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }


  async function handleCopyTranscript() {
    if (!hasGeneratedTranscript) return;
    try {
      await navigator.clipboard.writeText(transcript);
    } catch { }
  }

  function handleDownloadTranscript() {
    if (!hasGeneratedTranscript) return;
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${post?.id || "video"}-transcript.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleTranscribe() {
    if (!post || !analysis || !post.videoUrl || isTranscribing) return;
    setTranscriptionError("");
    setIsTranscribing(true);
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: post.videoUrl }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to transcribe video audio");
      }
      const payload = (await response.json()) as { transcript?: string; srt?: string };
      const nextTranscript = (payload.transcript || "").trim();
      if (!nextTranscript) throw new Error("Transcription completed but returned empty text.");
      if (payload.srt) setSrtData(payload.srt);
      const updatedAnalysis: AnalyzeResponse = {
        ...analysis,
        analysis: {
          ...analysis.analysis,
          breakdownBlocks: {
            ...analysis.analysis.breakdownBlocks,
            problemAndSolution: nextTranscript,
          },
        },
      };
      setAnalysis(updatedAnalysis);
      writeAnalysisCache(post.id, updatedAnalysis);
      writeHistoryAnalysis(post, updatedAnalysis);
    } catch (transcribeError) {
      setTranscriptionError(transcribeError instanceof Error ? transcribeError.message : "Failed to transcribe");
    } finally {
      setIsTranscribing(false);
    }
  }

  const handleDownloadTxt = () => {
    if (!analysisPayload) return;

    const outlierValue =
      post && post.outlierScore !== undefined && post.outlierScore !== null && post.outlierScore > 0
        ? post.outlierScore
        : typeof analysisPayload?.outlierScore === "number"
        ? analysisPayload.outlierScore
        : null;
    const engagementValue =
      post?.calculatedMetrics?.engagementRate ??
      (post?.metrics as any)?.engagementRate ??
      (post ? (post.metrics.likes + (post.metrics.comments || 0)) / Math.max(post.metrics.views, 1) : null);

    let txt = `=========================================\n`;
    txt += ` OUTLIER STUDIO: DEEP VIDEO ANALYSIS\n`;
    txt += `=========================================\n\n`;

    txt += `[ VIDEO ]\n`;
    txt += `- Account: ${post?.username ? `@${post.username}` : "N/A"}\n`;
    txt += `- Link: ${post?.permalink || "N/A"}\n`;
    txt += `- Posted: ${post?.postedAt ? new Date(post.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "N/A"}\n`;
    if (post?.caption) txt += `- Caption: ${post.caption.slice(0, 200)}${post.caption.length > 200 ? "…" : ""}\n`;
    txt += `\n`;

    txt += `[ METRICS ]\n`;
    txt += `- Views: ${post ? formatNumber(post.metrics.views || 0) : "N/A"}\n`;
    txt += `- Outlier Score: ${outlierValue !== null ? `${outlierValue.toFixed(1)}x` : "N/A"}\n`;
    txt += `- Engagement: ${engagementValue !== null ? formatEngagement(engagementValue) : "N/A"}\n\n`;

    // Deep analysis path (new schema)
    const deep = analysisPayload.deepAnalysis as any;
    if (deep?.hooks) {
      txt += `[ HOOK ANALYSIS ]\n`;
      txt += `Hook Type: ${deep.hooks.hookType || "N/A"}\n`;
      txt += `Formula: ${deep.hooks.formula || "N/A"}\n`;
      txt += `Spoken Hook: ${deep.hooks.spokenHook || "N/A"}\n`;
      txt += `Visual Hook: ${deep.hooks.visualHook || "N/A"}\n`;
      txt += `Text Hook: ${deep.hooks.textHook || "N/A"}\n\n`;
    } else if ((analysisPayload as any).hookAnalysis) {
      // Legacy schema fallback
      const h = (analysisPayload as any).hookAnalysis;
      txt += `[ HOOK ANALYSIS ]\n`;
      txt += `Type: ${h.type || "N/A"}\n`;
      txt += `Formula: ${h.formula || "N/A"}\n`;
      txt += `Description: ${h.description || "N/A"}\n\n`;
    }

    if (deep?.narrative) {
      txt += `[ NARRATIVE SUBSTANCE ]\n`;
      txt += `Topic: ${deep.narrative.topic || "N/A"}\n`;
      txt += `Story Structure: ${deep.narrative.storyStructure || "N/A"}\n`;
      txt += `Core Idea (Seed): ${deep.narrative.seed || "N/A"}\n`;
      txt += `Substance: ${deep.narrative.substance || "N/A"}\n`;
      if (deep.narrative.uniqueAngle) txt += `Unique Angle: ${deep.narrative.uniqueAngle}\n`;
      if (deep.narrative.commonBelief) txt += `Common Belief Challenged: ${deep.narrative.commonBelief}\n`;
      if (Array.isArray(deep.narrative.supportingEvidence) && deep.narrative.supportingEvidence.length > 0) {
        txt += `Supporting Evidence:\n`;
        deep.narrative.supportingEvidence.forEach((ev: string, i: number) => {
          txt += `  ${i + 1}. ${ev}\n`;
        });
      }
      txt += `\n`;
    }

    if (deep?.architecture) {
      txt += `[ VISUAL ARCHITECTURE ]\n`;
      txt += `Layout: ${deep.architecture.visualLayout || "N/A"}\n`;
      txt += `Visual Elements: ${deep.architecture.visualElements || "N/A"}\n`;
      txt += `Key Visuals: ${deep.architecture.keyVisuals || "N/A"}\n`;
      txt += `Audio: ${deep.architecture.audio || "N/A"}\n\n`;
    }

    if (deep?.conversion?.cta) {
      txt += `[ CALL TO ACTION ]\n`;
      txt += `${deep.conversion.cta}\n\n`;
    }

    if (transcript) {
      txt += `[ FULL TRANSCRIPT ]\n`;
      txt += `${transcript}\n\n`;
    }

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Outlier-Analysis-${post?.id || id || "export"}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex w-full min-h-screen text-[var(--text)] flex-col relative z-10 pb-[60px]">

      <div className="w-full">
        {/* BACK + NAVIGATION ROW */}
        <div className="flex items-center gap-[12px] mb-[24px]">
          <button onClick={() => router.back()} className="bg-transparent border border-[rgba(255,255,255,0.08)] rounded-[7px] p-[7px_14px] font-['DM_Sans'] text-[12px] font-[500] text-[#F0F2F7] transition hover:bg-[#111620] cursor-pointer">
            ← Back
          </button>
          <span className="font-['JetBrains_Mono'] text-[10px] text-[#5A6478] tracking-[0.1em] uppercase">
            Video Analysis
          </span>
          <div className="ml-auto">
            <button
              onClick={handleDownloadTxt}
              disabled={!analysisPayload}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-all bg-white/[0.03] border border-white/[0.08] rounded-lg backdrop-blur-md hover:bg-white/[0.08] hover:border-white/[0.15] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4 text-[#A78BFA]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
              Export Text
            </button>
          </div>
        </div>

        {error && (
          <section className="mb-[24px] rounded-[10px] border border-[rgba(255,59,87,0.3)] bg-[rgba(255,59,87,0.05)] p-[20px] text-[13px] text-[#FF3B57]">{error}</section>
        )}

        {!post || !analysisPayload ? (
          <section className="mt-[24px] rounded-[10px] glass-surface p-[24px] text-[13px] text-[#5A6478]">
            {error ? "Failed to load" : "Loading video analysis..."}
          </section>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[450px,1fr] gap-8 pb-12 items-start">

            {/* LEFT COLUMN (STICKY/SCROLLABLE) */}
            <aside className="flex flex-col w-full shrink-0 pr-2 pb-8">
              {/* VIDEO PLAYER CARD */}
              <div className="w-full max-w-[420px] aspect-[9/16] bg-black rounded-3xl border border-white/10 overflow-hidden shadow-2xl mx-auto mb-[14px] flex flex-col relative shrink-0">
                <div className="flex-1 relative w-full h-full flex items-center justify-center">
                  {(post.videoUrl || post.displayUrl || post.thumbnailUrl) ? (
                    <>
                      {post.videoUrl ? (
                        <video
                          ref={videoRef}
                          src={`${post.videoUrl}#t=0.001`}
                          preload="metadata"
                          poster={post.displayUrl || post.thumbnailUrl}
                          className="absolute inset-0 w-full h-full object-cover"
                          playsInline
                          loop
                          muted={isMuted}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
                          onClick={togglePlay}
                        />
                      ) : (
                        <img src={post.displayUrl || post.thumbnailUrl} alt="Preview" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      )}

                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.7)] via-transparent to-transparent pointer-events-none"></div>

                      {/* Play Overlay if paused or no video */}
                      {(!isPlaying || !post.videoUrl) && (
                        <div onClick={togglePlay} className="absolute inset-0 flex items-center justify-center cursor-pointer group z-10">
                          <div className="w-[50px] h-[50px] rounded-full bg-[rgba(255,255,255,0.15)] backdrop-blur-md border border-[rgba(255,255,255,0.2)] flex items-center justify-center text-white shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-transform group-hover:scale-105">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="ml-1"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                          </div>
                        </div>
                      )}

                      {/* CUSTOM CONTROLS */}
                      {post.videoUrl && (
                        <div className="absolute bottom-0 left-0 right-0 p-[10px_12px] flex items-center gap-[8px] z-20">

                          <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-[32px] h-[32px] rounded-full bg-[rgba(255,255,255,0.12)] backdrop-blur-[12px] border border-[rgba(255,255,255,0.18)] text-white text-[11px] flex items-center justify-center cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.2)] hover:border-[rgba(255,255,255,0.3)]">
                            {isPlaying ? "⏸" : "▷"}
                          </button>

                          <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="w-[32px] h-[32px] rounded-full bg-[rgba(255,255,255,0.12)] backdrop-blur-[12px] border border-[rgba(255,255,255,0.18)] text-white text-[14px] flex items-center justify-center cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.2)] hover:border-[rgba(255,255,255,0.3)]">
                            {isMuted ? "🔇" : "🔊"}
                          </button>

                          <div className="flex-1 h-[6px] py-[1.5px] cursor-pointer relative group flex items-center" onClick={(e) => { e.stopPropagation(); handleVideoProgress(e); }}>
                            <div className="w-full h-[3px] bg-[rgba(255,255,255,0.15)] rounded-[2px] relative overflow-hidden group-hover:h-[4px] transition-all">
                              <div className="absolute left-0 top-0 h-full bg-[#FF3B57] rounded-[2px]" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}></div>
                            </div>
                          </div>

                          <span className="font-['JetBrains_Mono'] text-[10px] text-[rgba(255,255,255,0.6)] min-w-[54px] text-right text-shadow-sm">
                            {formatTime(currentTime)} <span className="opacity-50">/</span> {formatTime(duration)}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[#5A6478] font-['DM_Sans'] text-[12px]">No media</div>
                  )}
                </div>

                {/* Original Post Link - Moved inside player or below it, let's put it as absolute or below */}
                {post.permalink && (
                  <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="absolute top-4 right-4 bg-black/50 backdrop-blur-md rounded-full p-[8px_14px] flex items-center gap-[6px] border border-white/10 font-['DM_Sans'] text-[11.5px] text-white transition-colors hover:text-[#FF3B57] hover:bg-black/70 z-30 shadow-lg">
                    <ExternalLink size={12} /> Open Post
                  </a>
                )}

                {/* Download Button */}
                <button
                  onClick={() => post.videoUrl && window.open(post.videoUrl, '_blank')}
                  className="absolute bottom-16 left-4 right-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest text-white transition-all z-30 backdrop-blur-md"
                >
                  Download Video
                </button>
              </div>

              {/* ACTION BUTTONS */}
              <div id="sec-actions" className="flex flex-col gap-[7px]">
                <button 
                  onClick={handleRemixJump}
                  className="w-full flex items-center justify-center gap-2 bg-black/40 border border-white/10 hover:border-cyan-500/50 hover:bg-white/5 text-sm font-semibold py-3 rounded-xl transition-all duration-200 text-indigo-400"
                >
                  <span className="text-[14px]">🔄</span> Remix Idea
                </button>
                <button 
                  onClick={handleCreatePrompt} 
                  className="w-full flex items-center justify-center gap-2 bg-black/40 border border-white/10 hover:border-cyan-500/50 hover:bg-white/5 text-sm font-semibold py-3 rounded-xl transition-all duration-200 text-[#10b981]"
                >
                  <span>✦</span> Create Prompt
                </button>
              </div>
              {transcriptionError && <p className="mt-[8px] font-['DM_Sans'] text-[12px] text-[#FF3B57]">{transcriptionError}</p>}

            </aside>

            {/* RIGHT COLUMN (STICKY) */}
            <div className="lg:sticky lg:top-8 flex flex-col min-w-0 pb-[40px] w-full lg:flex-1 gap-6">



              {/* METRICS GRID */}
              <section id="sec-metrics" className="glass-surface rounded-[14px] overflow-hidden mb-[24px]">
                <div className="p-[14px_18px] border-b border-[rgba(255,255,255,0.06)]">
                  <h3 className="font-['Syne'] font-[700] text-[13px] text-[#F0F2F7]">📊 Metrics</h3>
                </div>
                <div className="p-[18px]">
                  <div className="grid grid-cols-2 gap-[10px]">
                    {(() => {
                      const outlierValue = post.outlierScore !== undefined && post.outlierScore !== null && post.outlierScore > 0
                        ? post.outlierScore
                        : (typeof analysisPayload?.outlierScore === "number" ? analysisPayload.outlierScore : null);
                      const engagementValue = post.calculatedMetrics?.engagementRate ?? ((post.metrics as any)?.engagementRate || ((post.metrics.likes + (post.metrics.comments || 0)) / Math.max(post.metrics.views, 1)));
                      const cOutlierColor = outlierValue !== null ? outlierColor(outlierValue) : "#8892A4";
                      const cOutlierLabel = outlierValue !== null ? outlierLabel(outlierValue) : "No outlier data available";

                      return (
                        <>
                          {/* Outlier Score Tile */}
                          <div className="glass-surface rounded-[10px] p-[16px] relative overflow-hidden group">
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#FF3B57] to-transparent opacity-80 group-hover:opacity-100 transition-opacity"></div>
                            <div className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-[#5A6478] mb-[8px]">Outlier Score</div>
                            <div className="font-['Syne'] font-[800] text-[clamp(18px,2.5vw,24px)] tracking-[-0.02em] mb-[3px]" style={{ color: cOutlierColor }}>
                              {outlierValue !== null ? formatOutlier(outlierValue) : "—x"}
                            </div>
                            <div className="font-['DM_Sans'] text-[11px] text-[#5A6478]">{cOutlierLabel}</div>
                          </div>

                          {/* Total Views Tile */}
                          <div className="glass-surface rounded-[10px] p-[16px] relative overflow-hidden group">
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#FF3B57] to-transparent opacity-80 group-hover:opacity-100 transition-opacity"></div>
                            <div className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-[#5A6478] mb-[8px]">Total Views</div>
                            <div className="font-['Syne'] font-[800] text-[clamp(18px,2.5vw,24px)] tracking-[-0.02em] text-[#F0F2F7] mb-[3px]">
                              {formatNumber(post.metrics.views || 0)}
                            </div>
                            <div className="text-[9px] font-['JetBrains_Mono'] text-[#5A6478] uppercase tracking-[0.05em]">Total Views</div>
                          </div>

                          {/* Engagement Rate Tile */}
                          <div className="glass-surface rounded-[10px] p-[16px] relative overflow-hidden group">
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#FF8C42] to-transparent opacity-80 group-hover:opacity-100 transition-opacity"></div>
                            <div className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-[#5A6478] mb-[8px]">Engagement Rate</div>
                            <div className="font-['Syne'] font-[800] text-[clamp(18px,2.5vw,24px)] tracking-[-0.02em] text-[#F0F2F7] mb-[3px]">
                              {formatEngagement(engagementValue || 0)}
                            </div>
                            <div className="font-['DM_Sans'] text-[11px] text-[#5A6478]">Likes & Comments / Views</div>
                          </div>

                          {/* Likes Tile */}
                          <div className="glass-surface rounded-[10px] p-[16px] relative overflow-hidden group">
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#A78BFA] to-transparent opacity-80 group-hover:opacity-100 transition-opacity"></div>
                            <div className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-[#5A6478] mb-[8px]">Likes</div>
                            <div className="font-['Syne'] font-[800] text-[clamp(18px,2.5vw,24px)] tracking-[-0.02em] text-[#F0F2F7] mb-[3px]">
                              {formatNumber(post.metrics.likes || 0)}
                            </div>
                            <div className="font-['DM_Sans'] text-[11px] text-[#5A6478]">Total favorites</div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              </section>

              {/* VISION PATTERN RECOGNITION */}
              {analysisPayload?.vision_patterns && Object.keys(analysisPayload.vision_patterns).length > 0 && (
                <section className="bg-transparent mb-[24px]">
                  <h3 className="font-['Syne'] font-[700] text-[13px] text-[#F0F2F7] mb-[12px] flex items-center gap-[6px]">
                    <span className="text-[#8892A4]">👁</span> Vision Pattern Recognition
                  </h3>
                  <div className="flex flex-nowrap overflow-x-auto scrollbar-hide gap-[8px] pb-2">
                    {(analysisPayload.vision_patterns && typeof analysisPayload.vision_patterns === 'object' ? Object.entries(analysisPayload.vision_patterns) : []).map(([key, val]) => {
                      if (!val) return null;
                      const strVal = Array.isArray(val) ? val.join(", ") : String(val);
                      return (
                        <div key={key} className="flex-shrink-0 glass-surface rounded-[8px] p-[9px_14px] flex flex-col">
                          <span className="font-['JetBrains_Mono'] text-[8px] uppercase tracking-[0.1em] text-[#5A6478] mb-[3px]">{key}</span>
                          <span className="font-['DM_Sans'] text-[12.5px] font-[500] text-[#F0F2F7]">{strVal}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* XML PROMPT OVERLAY */}
              {showPromptBox && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-5 rounded-2xl mb-6 relative animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-['Syne'] font-[700] text-[13px] text-emerald-400 flex items-center gap-[6px]">
                      <span className="text-emerald-500">✦</span> Master XML Prompt
                    </h3>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          const prompt = generateXMLPrompt(analysisPayload, transcript);
                          navigator.clipboard.writeText(prompt);
                          toast("success", "Copied", "Prompt rewritten to clipboard.");
                        }}
                        className="text-[10px] font-['JetBrains_Mono'] text-emerald-500 hover:text-emerald-400 transition-colors bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20"
                      >
                        COPY AGAIN
                      </button>
                      <button
                        onClick={() => setShowPromptBox(false)}
                        className="text-[#5A6478] hover:text-[#F0F2F7] transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar-emerald pr-2">
                    <pre className="font-['JetBrains_Mono'] text-[11px] leading-[1.6] text-emerald-50/70 whitespace-pre-wrap">
                      {generateXMLPrompt(analysisPayload, transcript)}
                    </pre>
                  </div>
                </div>
              )}

              {/* DESCRIPTION SECTION */}
              <section id="sec-description" className="">
                <h3 className="font-['Syne'] font-[700] text-[13px] text-[#F0F2F7] mb-[12px] flex items-center gap-[6px]">
                  <span className="text-[#8892A4]">📋</span> Description
                </h3>
                <div className="min-h-[220px] max-h-[350px] overflow-y-auto p-5 bg-white/[0.03] border border-white/10 rounded-2xl text-sm leading-relaxed text-gray-300 scrollbar-hide">
                  <div className="whitespace-pre-wrap">
                    {post.caption || "No caption available."}
                  </div>
                </div>
              </section>

              {/* TRANSCRIPT SECTION */}
              <section id="sec-transcript" className="">
                <div className="flex items-center justify-between mb-[12px]">
                  <h3 className="font-['Syne'] font-[700] text-[13px] text-[#F0F2F7] flex items-center gap-[6px]">
                    <span className="text-[#8892A4]">🎙</span> Transcript
                  </h3>
                  <div className="flex items-center gap-[12px]">
                    {hasGeneratedTranscript && <span className="font-['JetBrains_Mono'] text-[10px] text-[#5A6478] tracking-[0.05em] uppercase">{transcriptWordCount} words</span>}
                    <button onClick={handleCopyTranscript} className="text-[#5A6478] hover:text-[#F0F2F7] transition cursor-pointer bg-transparent border-none p-0 inline-flex items-center gap-1" title="Copy Transcript">
                      <Copy size={16} /> <span className="text-[10px]">COPY</span>
                    </button>
                    {hasGeneratedTranscript && (
                      <button onClick={handleDownloadTranscript} className="text-[#5A6478] hover:text-[#F0F2F7] transition cursor-pointer bg-transparent border-none p-0 inline-flex" title="Download">
                        <Download size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded-[10px] p-[16px]">
                  <div className={`font-['DM_Sans'] text-[12.5px] leading-[1.8] max-h-[380px] overflow-y-auto whitespace-pre-wrap custom-scrollbar pr-[8px] ${hasGeneratedTranscript ? "text-[#E0E2E7]" : "text-[#5A6478] italic"}`}>
                    {hasGeneratedTranscript ? transcript : "Use the 'Transcribe' action button to generate a transcript."}
                  </div>
                </div>
              </section>

              {/* DEEP VIDEO ANALYSIS — GROUPED CARDS */}
              {analysisPayload?.deepAnalysis ? (
                <section id="sec-hook">
                  <h3 className="font-['Syne'] font-[700] text-[13px] text-[#F0F2F7] mb-[16px] flex items-center gap-[6px]">
                    <span className="text-[#8892A4]">🔑</span> Deep Video Analysis
                  </h3>
                  <div className="flex flex-col gap-6">

                    {/* Group 1: Hook Matrix - NEON RED/PINK */}
                    <div className="bg-[#0D1017]/80 backdrop-blur-md border border-[#FF3B57]/30 rounded-2xl p-6 shadow-[0_0_20px_rgba(255,59,87,0.05)] relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#FF3B57] to-transparent"></div>
                      <div className="flex items-center justify-between mb-4 border-b border-[#FF3B57]/20 pb-2">
                        <h4 className="text-sm font-bold text-[#FF3B57] uppercase tracking-widest">Hook Analysis</h4>
                        <span className="px-3 py-1 bg-[#FF3B57]/20 text-[#FF3B57] font-bold rounded-full border border-[#FF3B57]/50 shadow-[0_0_15px_rgba(255,59,87,0.5)] text-[11px] uppercase tracking-wider">{analysisPayload.deepAnalysis.hooks.hookType || "Analyzing..."}</span>
                      </div>
                      <div className="space-y-4">
                        {analysisPayload.deepAnalysis.hooks.formula && (
                          <div className="flex items-start gap-3 mb-4 bg-[#A78BFA]/5 border border-[#A78BFA]/20 p-3 rounded-md">
                            <span className="bg-[#FF3B57]/10 text-[#FF3B57] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#FF3B57]/20 uppercase shrink-0">
                              FORMULA
                            </span>
                            <p className="text-[#A78BFA] text-[13px] font-['DM_Sans'] leading-relaxed italic">
                              {analysisPayload.deepAnalysis.hooks.formula}
                            </p>
                          </div>
                        )}
                        <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                          <span className="bg-[#FF3B57]/10 text-[#FF3B57] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#FF3B57]/20 mr-2 uppercase">Spoken</span>
                          {analysisPayload.deepAnalysis.hooks.spokenHook}
                        </div>
                        <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                          <span className="bg-[#FF3B57]/10 text-[#FF3B57] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#FF3B57]/20 mr-2 uppercase">Visual</span>
                          {analysisPayload.deepAnalysis.hooks.visualHook}
                        </div>
                        <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                          <span className="bg-[#FF3B57]/10 text-[#FF3B57] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#FF3B57]/20 mr-2 uppercase">Text</span>
                          {analysisPayload.deepAnalysis.hooks.textHook}
                        </div>
                      </div>
                    </div>

                    {/* Group 2: Core Narrative & Substance - NEON BLUE/CYAN */}
                    <div className="bg-[#0D1017]/80 backdrop-blur-md border border-[#3B82F6]/30 rounded-2xl p-6 shadow-[0_0_20px_rgba(59,130,246,0.05)] relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#3B82F6] to-transparent"></div>
                      <div className="flex items-center justify-between mb-4 border-b border-[#3B82F6]/20 pb-2">
                        <h4 className="text-sm font-bold text-[#3B82F6] uppercase tracking-widest">Narrative Substance</h4>
                        <span className="px-3 py-1 bg-cyan-500/20 text-cyan-300 font-bold rounded-full border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.5)] text-[11px] uppercase tracking-wider">{analysisPayload.deepAnalysis.narrative.storyStructure || "Analyzing..."}</span>
                      </div>
                      <div className="space-y-4">
                        <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                          <span className="bg-[#3B82F6]/10 text-[#3B82F6] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#3B82F6]/20 mr-2 uppercase">Topic</span>
                          {analysisPayload.deepAnalysis.narrative.topic}
                        </div>
                        <div className="font-['DM_Sans'] text-[13.5px] leading-[1.65] text-white p-4 bg-yellow-400/5 border border-yellow-400/20 rounded-xl shadow-[0_0_15px_rgba(250,204,21,0.1)] group">
                          <span className="bg-yellow-400/10 text-yellow-400 text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-yellow-400/20 mr-3 uppercase">Seed</span>
                          <span className="text-yellow-50/90 font-medium italic">"{analysisPayload.deepAnalysis.narrative.seed}"</span>
                        </div>
                        <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                          <span className="bg-[#3B82F6]/10 text-[#3B82F6] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#3B82F6]/20 mr-2 uppercase">Substance</span>
                          {analysisPayload.deepAnalysis.narrative.substance}
                        </div>

                        {/* Unique Angle */}
                        {analysisPayload.deepAnalysis.narrative.uniqueAngle && (
                          <div className="mt-5 pt-5 border-t border-white/[0.05]">
                            <div className="flex items-start gap-3">
                              <span className="bg-[#A855F7]/10 text-[#A855F7] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#A855F7]/20 uppercase shrink-0">
                                UNIQUE ANGLE
                              </span>
                              <p className="text-[#8892A4] text-[13px] font-['DM_Sans'] leading-relaxed">
                                {analysisPayload.deepAnalysis.narrative.uniqueAngle}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Common Belief to Challenge */}
                        {analysisPayload.deepAnalysis.narrative.commonBelief && (
                          <div className="mt-4">
                            <div className="flex items-start gap-3">
                              <span className="bg-orange-500/10 text-orange-400 text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-orange-500/20 uppercase shrink-0">
                                COMMON BELIEF
                              </span>
                              <p className="text-[#8892A4] text-[13px] font-['DM_Sans'] leading-relaxed">
                                {analysisPayload.deepAnalysis.narrative.commonBelief}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Supporting Evidence */}
                        {analysisPayload.deepAnalysis.narrative.supportingEvidence && analysisPayload.deepAnalysis.narrative.supportingEvidence.length > 0 && (
                          <div className="mt-4">
                            <div className="flex items-start gap-3">
                              <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-emerald-500/20 uppercase shrink-0">
                                EVIDENCE
                              </span>
                              <ul className="flex flex-col gap-2 w-full">
                                {analysisPayload.deepAnalysis.narrative.supportingEvidence.map((point: string, idx: number) => (
                                  <li key={idx} className="text-[#8892A4] text-[13px] font-['DM_Sans'] leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-emerald-500">
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Group 3: Visual Architecture - NEON PURPLE */}
                    <div className="bg-[#0D1017]/80 backdrop-blur-md border border-[#A855F7]/30 rounded-2xl p-6 shadow-[0_0_20px_rgba(168,85,247,0.05)] relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#A855F7] to-transparent"></div>
                      <h4 className="text-sm font-bold text-[#A855F7] mb-4 uppercase tracking-widest border-b border-[#A855F7]/20 pb-2">Visual Architecture</h4>
                      <div className="space-y-4">
                        <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                          <span className="bg-[#A855F7]/10 text-[#A855F7] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#A855F7]/20 mr-2 uppercase">Layout</span>
                          {analysisPayload.deepAnalysis.architecture.visualLayout}
                        </div>
                        <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                          <span className="bg-[#A855F7]/10 text-[#A855F7] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#A855F7]/20 mr-2 uppercase">Elements</span>
                          {analysisPayload.deepAnalysis.architecture.visualElements}
                        </div>
                        <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                          <span className="bg-[#A855F7]/10 text-[#A855F7] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#A855F7]/20 mr-2 uppercase">Key Visuals</span>
                          {analysisPayload.deepAnalysis.architecture.keyVisuals}
                        </div>
                        <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                          <span className="bg-[#A855F7]/10 text-[#A855F7] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#A855F7]/20 mr-2 uppercase">Audio Vibe</span>
                          {analysisPayload.deepAnalysis.architecture.audio}
                        </div>
                      </div>
                    </div>

                    {/* Group 4: Conversion - NEON EMERALD */}
                    <div className="bg-[#0D1017]/80 backdrop-blur-md border border-[#10B981]/30 rounded-2xl p-6 shadow-[0_0_20px_rgba(16,185,129,0.05)] relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#10B981] to-transparent"></div>
                      <h4 className="text-sm font-bold text-[#10B981] mb-4 uppercase tracking-widest border-b border-[#10B981]/20 pb-2">Conversion</h4>
                      <div className="font-['DM_Sans'] text-[13px] leading-[1.65] text-gray-300">
                        <span className="bg-[#10B981]/10 text-[#10B981] text-[10px] font-bold tracking-wider px-2 py-1 rounded border border-[#10B981]/20 mr-2 uppercase">CTA</span>
                        {analysisPayload.deepAnalysis.conversion.cta}
                      </div>
                    </div>

                  </div>
                </section>
              ) : analysisPayload?.hookAnalysis && (
                <section id="sec-hook" className="sticky top-8 self-start">
                  <h3 className="font-['Syne'] font-[700] text-[13px] text-[#F0F2F7] mb-[12px] flex items-center gap-[6px]">
                    <span className="text-[#8892A4]">🔑</span> Deep Video Analysis
                  </h3>
                  <div className="glass-surface rounded-[14px] p-[18px] flex flex-col gap-[10px]">
                    {analysisPayload.hookAnalysis?.formula && (
                      <div className="flex items-start gap-3 mb-4 bg-[#A78BFA]/5 border border-[#A78BFA]/20 p-3 rounded-md">
                        <span className="mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded bg-[#A78BFA]/20 text-[#A78BFA] tracking-wider uppercase shrink-0">
                          FORMULA
                        </span>
                        <p className="text-[#A78BFA] text-[13px] font-['DM_Sans'] leading-relaxed italic">
                          {analysisPayload.hookAnalysis.formula}
                        </p>
                      </div>
                    )}
                    <div className="glass-surface rounded-[10px] p-[16px] border-l-[3px] border-l-[#FF3B57]">
                      <div className="mb-[8px]">
                        <span className="font-['JetBrains_Mono'] text-[9px] text-[#FF3B57] bg-[rgba(255,59,87,0.1)] p-[3px_8px] rounded-[4px] inline-block tracking-[0.05em]">TEXT HOOK</span>
                      </div>
                      <h4 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7] mb-[8px]">
                        {analysisPayload.hookAnalysis?.type || "Standard Hook"}
                      </h4>
                      <p className="font-['DM_Sans'] text-[12.5px] leading-[1.65] text-[#8892A4]">
                        {analysisPayload.hookAnalysis?.description || "No specific details identified in this content."}
                      </p>
                    </div>
                    {analysisPayload.structureAnalysis && (
                      <div className="glass-surface rounded-[10px] p-[16px] border-l-[3px] border-l-[#FF8C42]">
                        <div className="mb-[8px]">
                          <span className="font-['JetBrains_Mono'] text-[9px] text-[#FF8C42] bg-[rgba(255,140,66,0.1)] p-[3px_8px] rounded-[4px] inline-block tracking-[0.05em]">STRUCTURE ANALYSIS</span>
                        </div>
                        <h4 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7] mb-[8px]">{analysisPayload.structureAnalysis?.type || "Linear flow"}</h4>
                        <p className="font-['DM_Sans'] text-[12.5px] leading-[1.65] text-[#8892A4]">{analysisPayload.structureAnalysis?.description || "A foundational structure built without overt segmentation."}</p>
                      </div>
                    )}
                    {analysisPayload.styleAnalysis && (
                      <div className="glass-surface rounded-[10px] p-[16px] border-l-[3px] border-l-[#A78BFA]">
                        <div className="mb-[8px]">
                          <span className="font-['JetBrains_Mono'] text-[9px] text-[#A78BFA] bg-[rgba(167,139,250,0.1)] p-[3px_8px] rounded-[4px] inline-block tracking-[0.05em]">STYLE ANALYSIS</span>
                        </div>
                        <h4 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7] mb-[8px]">{Array.isArray(analysisPayload.styleAnalysis?.tone) ? analysisPayload.styleAnalysis.tone.join(", ") : (analysisPayload.styleAnalysis?.tone || "Standard delivery")}</h4>
                        <p className="font-['DM_Sans'] text-[12.5px] leading-[1.65] text-[#8892A4]">{analysisPayload.styleAnalysis?.voice ? `${analysisPayload.styleAnalysis.voice} voice with ${analysisPayload.styleAnalysis.wordChoice} word choice.` : "Standard conversational tone with balanced pacing."}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

            </div>
          </div>
        )}
      </div>

    </div>
  );
}
