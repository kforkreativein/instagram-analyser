"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Folder,
  KeyRound,
  Layers,
  Loader2,
  Menu,
  MessageCircle,
  Mic,
  Play,
  Sparkles,
  Users,
  Video,
  View,
  X,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AIAnalysis, AnalyzeResponse, InstagramPost, RepurposeType } from "../../lib/types";
import { formatNumber, formatRelativeTime } from "../../lib/utils";
import type { TranscriptionEngine } from "../../lib/client-settings";
import Skeleton from "./UI/Skeleton";
import { useToast } from "./UI/Toast";

type DetailPost = InstagramPost & {
  avatarUrl?: string;
  thumbnailUrl?: string;
  url?: string;
  text?: string;
  followers?: number;
};

type TabKey = "actions" | "metrics" | "description" | "transcript" | "hook" | "structure" | "bricks";

interface VideoAnalysisDetailProps {
  post: DetailPost;
  analysis: AIAnalysis;
  initialTranscript?: string;
  transcriptionEngine?: TranscriptionEngine;
  openaiApiKey?: string;
  geminiApiKey?: string;
  onGenerateContent?: (type: RepurposeType, language: string) => void | Promise<void>;
  onDownloadReport?: () => void;
  className?: string;
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function fieldRow(label: string, value: string) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm leading-relaxed text-white">{value || "-"}</p>
    </div>
  );
}

function AnalysisCard({
  id,
  title,
  icon,
  children,
}: {
  id?: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-black/30">{icon}</span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function MetricBadge({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-white/5 p-3 ${tone}`}>
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-black/25">{icon}</span>
      <div>
        <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
        <p className="text-sm font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function buildPromptTemplate(post: DetailPost, analysis: AIAnalysis, description: string): string {
  const topicSummary = description || analysis.summary.coreIdea || "Topic unavailable";
  const takeaways = [...analysis.breakdownBlocks.keyTakeaways, ...analysis.summary.actionableImprovements]
    .filter(Boolean)
    .slice(0, 5);

  const takeawayList = (takeaways.length > 0 ? takeaways : ["No key takeaways available."])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return `<system_instructions>
<job>
You are a world-class script writer for short-form social media videos.
</job>
<goal>
To create the highest quality content that goes viral every single time.
</goal>
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
<target_audience>
- Your target audience is intelligent and curious, but has no background of your topic.
- They won't know any jargon, so you must use simple language that anyone will understand.
- The target audience is your friend, so you must speak to them naturally, not formally.
</target_audience>
</system_instructions>

<script_instructions>
<task>
Write a compelling, attention-grabbing script for a social media short-form video that'll go viral. The final output script should be between 90 and 120 words.
</task>

<topic>
${topicSummary}
</topic>

<hook>
Open the script with an attention-grabbing hook that draws in the viewer. Execute on the hook using the following instructions:
- Format: ${analysis.hookAnalysis.type}
- Explanation: ${analysis.hookAnalysis.description}
</hook>

<structure>
Write the script following a predefined structure that works best for this topic:
- Format: ${analysis.structureAnalysis.type}
- Explanation: ${analysis.structureAnalysis.description}
Ensure that each section flows smoothly into the next, using appropriate transitions without adding unnecessary filler.
</structure>

<style>
Embody the following writing style attributes when creating your script:
- Tone: ${analysis.styleAnalysis.tone}
- Voice: ${analysis.styleAnalysis.voice}
- Word Choice: ${analysis.styleAnalysis.wordChoice}
- Pacing: ${analysis.styleAnalysis.pacing}
</style>

<content>
Incorporate the following details in the body of the script. Use the facts to bolster the story in a way that's natural and informative:
${takeawayList}
</content>
</script_instructions>`;
}

export default function VideoAnalysisDetail({
  post,
  analysis,
  initialTranscript,
  transcriptionEngine = "openai_whisper",
  openaiApiKey,
  geminiApiKey,
  onGenerateContent,
  onDownloadReport,
  className,
}: VideoAnalysisDetailProps) {
  const router = useRouter();
  const [videoFailed, setVideoFailed] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [language, setLanguage] = useState("English");
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("actions");
  const [transcript, setTranscript] = useState<string | null>(null);

  // ── Lego Bricks Dissector state ───────────────────────────────────────────
  type BrickRating = "Strong" | "Weak" | "Untested";
  type Brick = { id: string; label: string; current: string; rating: BrickRating; reason: string; remixSuggestions: string[] };
  type RemixVariant = { holdBricks: string[]; tweakBricks: string[]; rationale: string; generatedIdea: string; suggestedHook?: string };
  type BricksResult = { bricks: Brick[]; remixVariants: RemixVariant[] };
  const [bricksResult, setBricksResult] = useState<BricksResult | null>(null);
  const [isDissecting, setIsDissecting] = useState(false);
  const [bricksError, setBricksError] = useState("");
  const [expandedBrick, setExpandedBrick] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptError, setTranscriptError] = useState("");
  const [showRemixModal, setShowRemixModal] = useState(false);
  const [remixStepIndex, setRemixStepIndex] = useState(0);
  const remixTimeoutsRef = useRef<number[]>([]);
  const { toast } = useToast();
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const remixStatusMessages = useMemo(
    () => ["Unpacking video...", "Extracting topic...", "Writing..."],
    [],
  );

  useEffect(() => {
    const value = (initialTranscript ?? "").trim();
    if (value) {
      setTranscript(value);
    }
  }, [initialTranscript]);

  useEffect(() => {
    return () => {
      remixTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      remixTimeoutsRef.current = [];
    };
  }, []);

  const description = (post.caption || post.text || "No caption available.").trim();
  const isLongDescription = description.length > 220;
  const captionHeading = description.split(/\r?\n/)[0] || "Untitled analysis";

  const mediaUrl = post.videoUrl;
  const activeTranscriptionEngine = transcriptionEngine;
  const fallbackImage = post.displayUrl || post.thumbnailUrl;
  const postUrl = post.url || post.permalink;

  const engagementRate = post.metrics.views > 0 ? (post.engagementCount / post.metrics.views) * 100 : 0;
  const followers = post.followers ?? 0;

  const transcriptText = (transcript ?? "").trim();
  const wordCount = transcriptText ? transcriptText.split(/\s+/).filter(Boolean).length : 0;

  const promptTemplate = useMemo(() => buildPromptTemplate(post, analysis, description), [analysis, description, post]);

  const tabs: Array<{ key: TabKey; label: string }> = useMemo(
    () => [
      { key: "actions", label: "Actions" },
      { key: "metrics", label: "Metrics" },
      { key: "description", label: "Description" },
      { key: "transcript", label: "Transcript" },
      { key: "hook", label: "Hook" },
      { key: "structure", label: "Structure" },
      { key: "bricks", label: "🧱 Bricks" },
    ],
    [],
  );

  async function generateTranscript() {
    if (!mediaUrl) {
      setTranscriptError("No video URL available for transcription.");
      return;
    }

    if (isTranscribing || transcriptText) {
      return;
    }

    const activeOpenAIKey = openaiApiKey?.trim() ?? "";
    const activeGeminiKey = geminiApiKey?.trim() ?? "";

    if (activeTranscriptionEngine === "openai_whisper" && !activeOpenAIKey) {
      setTranscriptError("Missing OpenAI API Key for Whisper transcription.");
      return;
    }

    if (activeTranscriptionEngine === "gemini_audio" && !activeGeminiKey) {
      setTranscriptError("Missing Gemini API Key for Gemini Audio transcription.");
      return;
    }

    setTranscriptError("");
    setIsTranscribing(true);

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeOpenAIKey ? { "x-openai-key": activeOpenAIKey } : {}),
          ...(activeGeminiKey ? { "x-gemini-key": activeGeminiKey } : {}),
        },
        body: JSON.stringify({
          engine: activeTranscriptionEngine,
          videoUrl: mediaUrl,
          openaiApiKey: activeOpenAIKey,
          geminiApiKey: activeGeminiKey,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to transcribe video audio");
      }

      const payload = (await response.json()) as { transcript?: string; text?: string };
      const text = (payload.transcript ?? payload.text ?? "").trim();
      if (!text) {
        throw new Error("Transcription completed but returned empty text");
      }

      setTranscript(text);
      toast("success", "Transcription Complete", "Full audio transcript is now available.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to transcribe video audio";
      setTranscriptError(msg);
      toast("error", "Transcription Failed", msg);
    } finally {
      setIsTranscribing(false);
    }
  }

  function clearRemixTimers() {
    remixTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    remixTimeoutsRef.current = [];
  }

  function handleRemixIdea() {
    clearRemixTimers();
    setShowRemixModal(true);
    setRemixStepIndex(0);

    remixTimeoutsRef.current.push(window.setTimeout(() => setRemixStepIndex(1), 1000));
    remixTimeoutsRef.current.push(window.setTimeout(() => setRemixStepIndex(2), 2000));
    remixTimeoutsRef.current.push(
      window.setTimeout(() => {
        setShowRemixModal(false);
        router.push(`/scripts/create?source=${encodeURIComponent(post.id)}`);
      }, 3000),
    );
  }

  function scrollToSection(id: TabKey) {
    setActiveTab(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function handleCopyTranscript() {
    if (!transcriptText) return;
    await navigator.clipboard.writeText(transcriptText);
    setCopiedTranscript(true);
    toast("success", "Copied to clipboard", "Transcript text has been copied.");
    setTimeout(() => setCopiedTranscript(false), 2000);
  }

  async function handleDissectBricks() {
    setIsDissecting(true);
    setBricksError("");
    try {
      const metrics = {
        views: post.metrics.views,
        likes: post.metrics.likes,
        comments: post.metrics.comments,
        shares: post.metrics.shares ?? 0,
        followers: post.followers ?? 0,
      };
      const res = await fetch("/api/video/dissect-bricks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "from-analysis",
          caption: post.caption || post.text || "",
          transcript: transcriptText || "",
          analysis,
          metrics,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dissection failed");
      setBricksResult(data);
    } catch (err: any) {
      setBricksError(err.message || "Brick dissection failed. Check your API key in Settings.");
    } finally {
      setIsDissecting(false);
    }
  }

  function handleSendBrickToEditor(variant: RemixVariant) {
    const params = new URLSearchParams({
      tweakBricks: variant.tweakBricks.join(","),
      generatedIdea: variant.generatedIdea,
      suggestedHook: variant.suggestedHook || "",
      rationale: variant.rationale,
    });
    router.push(`/scripts/editor?${params.toString()}`);
  }

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(promptTemplate);
    setCopiedPrompt(true);
    toast("success", "Copied to clipboard", "Prompt template is ready to use.");
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  function handleDownloadTranscript() {
    if (!transcriptText) return;
    const blob = new Blob([transcriptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${post.username}-${post.id}-transcript.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className={`rounded-3xl border border-[#2c2c2e] bg-[#0a0a0a] p-4 text-gray-200 sm:p-6 ${className ?? ""}`}>
        <header className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            {post.avatarUrl ? (
              <img src={post.avatarUrl} alt={post.username} className="h-10 w-10 rounded-full border border-[#2c2c2e] object-cover" />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-full border border-[#2c2c2e] bg-[#1c1c1e] text-xs font-semibold text-white">
                {(post.username || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-white">@{post.username}</p>
              <p className="text-xs text-gray-400">{formatRelativeTime(post.postedAt)}</p>
            </div>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{captionHeading}</h1>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(280px,35%)_minmax(0,65%)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-2xl border border-[#2c2c2e] bg-black shadow-2xl shadow-black/50">
              {mediaUrl && !videoFailed ? (
                  <video
                    src={`${mediaUrl}#t=0.001`}
                    preload="metadata"
                    muted
                    loop
                    playsInline
                    controls
                    controlsList="nodownload"
                    autoPlay
                    className="h-full w-full object-cover"
                    onError={() => setVideoFailed(true)}
                  />
              ) : fallbackImage ? (
                <div className="relative h-full w-full">
                  <img src={fallbackImage} alt={captionHeading} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <Play className="h-16 w-16 text-white/50" fill="rgba(255,255,255,0.25)" />
                  </div>
                </div>
              ) : (
                <div className="grid h-full w-full place-items-center text-gray-500">
                  <Video className="h-10 w-10" />
                </div>
              )}
            </div>

            <a
              href={postUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
            >
              <ExternalLink size={14} />
              Play in new tab
            </a>
          </aside>

          <div className="min-w-0 space-y-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
            <div className="sticky top-0 z-20 rounded-xl border border-[#2c2c2e] bg-[#0a0a0a]/95 px-2 py-2 backdrop-blur">
              <div className="flex flex-wrap gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => scrollToSection(tab.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${activeTab === tab.key
                      ? "bg-[#1c1c1e] text-white"
                      : "text-gray-400 hover:bg-[#1c1c1e] hover:text-white"
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <section id="actions" className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Actions</h2>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={handleRemixIdea}
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-700 bg-transparent py-3 text-sm text-gray-200 transition hover:bg-gray-800"
                >
                  <Zap size={16} className="text-yellow-400" />
                  Remix idea
                </button>
                <button className="flex flex-col items-center gap-2 rounded-xl border border-gray-700 bg-transparent py-3 text-sm text-gray-200 transition hover:bg-gray-800">
                  <Folder size={16} className="text-blue-400" />
                  Add to project
                </button>
                <button className="flex flex-col items-center gap-2 rounded-xl border border-gray-700 bg-transparent py-3 text-sm text-gray-200 transition hover:bg-gray-800">
                  <Layers size={16} className="text-purple-400" />
                  Save to vault
                </button>
                <button
                  type="button"
                  onClick={() => setShowPromptModal(true)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-700 bg-transparent py-3 text-sm text-gray-200 transition hover:bg-gray-800"
                >
                  <Menu size={16} className="text-emerald-400" />
                  Create prompt
                </button>
              </div>
            </section>

            <section id="metrics" className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Metrics</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MetricBadge
                  label="Outlier Score"
                  value={post.outlierScore.toFixed(2)}
                  icon={<Sparkles className="h-4 w-4" />}
                  tone="bg-emerald-900/20 text-emerald-400"
                />
                <MetricBadge
                  label="Views"
                  value={formatCompact(post.metrics.views)}
                  icon={<View className="h-4 w-4" />}
                  tone="bg-blue-900/20 text-blue-400"
                />
                <MetricBadge
                  label="Engagement Rate"
                  value={`${engagementRate.toFixed(2)}%`}
                  icon={<Zap className="h-4 w-4" />}
                  tone="bg-orange-900/20 text-orange-400"
                />
                <MetricBadge
                  label="Likes"
                  value={formatCompact(post.metrics.likes)}
                  icon={<KeyRound className="h-4 w-4" />}
                  tone="bg-purple-900/20 text-purple-400"
                />
                <MetricBadge
                  label="Comments"
                  value={formatCompact(post.metrics.comments)}
                  icon={<MessageCircle className="h-4 w-4" />}
                  tone="bg-yellow-900/20 text-yellow-400"
                />
                <MetricBadge
                  label="Followers"
                  value={followers > 0 ? formatCompact(followers) : "N/A"}
                  icon={<Users className="h-4 w-4" />}
                  tone="bg-gray-800/50 text-gray-300"
                />
              </div>
            </section>

            <section id="description" className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Description</h2>
              <div className="relative">
                <p
                  className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200"
                  style={
                    !expandedDescription && isLongDescription
                      ? {
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }
                      : undefined
                  }
                >
                  {description}
                </p>
                {!expandedDescription && isLongDescription ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#1c1c1e] to-transparent" />
                ) : null}
              </div>

              {isLongDescription ? (
                <button
                  type="button"
                  onClick={() => setExpandedDescription((prev) => !prev)}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-gray-400 transition hover:text-white"
                >
                  {expandedDescription ? (
                    <>
                      Show less <ChevronUp size={14} />
                    </>
                  ) : (
                    <>
                      Show more <ChevronDown size={14} />
                    </>
                  )}
                </button>
              ) : null}
            </section>

            <section id="transcript" className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mic size={16} className="text-cyan-400" />
                  <p className="text-sm font-medium text-white">Transcript</p>
                  <span className="rounded-full border border-[#2c2c2e] bg-black/30 px-2 py-0.5 text-xs text-gray-400">{wordCount} words</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopyTranscript}
                    disabled={!transcriptText}
                    className="rounded-lg p-2 text-gray-400 transition-all hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Copy transcript"
                  >
                    {copiedTranscript ? <Check size={14} className="text-[#3BFFC8]" /> : <Copy size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTranscript}
                    disabled={!transcriptText}
                    className="rounded-lg p-2 text-gray-400 transition hover:bg-black/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Download transcript"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-3">
                {isTranscribing ? (
                  <div className="space-y-2 py-1">
                    <Skeleton width="100%" height="14px" />
                    <Skeleton width="90%" height="14px" />
                    <Skeleton width="75%" height="14px" />
                  </div>
                ) : transcriptText ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{transcriptText}</p>
                ) : mediaUrl ? (
                  <button
                    type="button"
                    onClick={() => void generateTranscript()}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#2c2c2e] bg-[#1c1c1e] px-3 py-2 text-sm text-gray-200 transition hover:bg-gray-800"
                  >
                    <Mic className="h-4 w-4 text-cyan-400" />
                    Generate Audio Transcript
                  </button>
                ) : (
                  <p className="text-sm text-gray-400">Transcript unavailable for this post.</p>
                )}
              </div>

              {transcriptError ? <p className="mt-2 text-xs text-rose-300">{transcriptError}</p> : null}
            </section>

            <AnalysisCard id="hook" title="Hook Analysis" icon={<KeyRound className="h-4 w-4 text-blue-400" />}>
              {fieldRow("Type", analysis.hookAnalysis.type)}
              {fieldRow("Description", analysis.hookAnalysis.description)}
              {fieldRow("Frameworks", analysis.hookAnalysis.frameworks.join(", "))}
              {fieldRow("Justification", analysis.hookAnalysis.justification)}
            </AnalysisCard>

            <AnalysisCard id="structure" title="Structure Analysis" icon={<Layers className="h-4 w-4 text-fuchsia-400" />}>
              {fieldRow("Type", analysis.structureAnalysis.type)}
              {fieldRow("Description", analysis.structureAnalysis.description)}
              {fieldRow("Best For", analysis.structureAnalysis.bestFor)}
              {fieldRow("Justification", analysis.structureAnalysis.justification)}
            </AnalysisCard>

            <AnalysisCard title="Style Analysis" icon={<Sparkles className="h-4 w-4 text-cyan-400" />}>
              {fieldRow("Tone", analysis.styleAnalysis.tone)}
              {fieldRow("Voice", analysis.styleAnalysis.voice)}
              {fieldRow("Word Choice", analysis.styleAnalysis.wordChoice)}
              {fieldRow("Pacing", analysis.styleAnalysis.pacing)}
            </AnalysisCard>

            <section className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5">
              <h3 className="mb-4 text-base font-semibold text-white">Breakdown Blocks</h3>
              <div className="space-y-4">
                {fieldRow("The Hook", analysis.breakdownBlocks.hook)}
                {fieldRow("Call to Action (CTA)", analysis.breakdownBlocks.cta)}
                {fieldRow("Target Audience & Tone", analysis.breakdownBlocks.targetAudienceAndTone)}
                {fieldRow("Problem & Solution", analysis.breakdownBlocks.problemAndSolution)}
                {fieldRow("Audio & Atmosphere", analysis.breakdownBlocks.audioAndAtmosphere)}
                {fieldRow("Comprehensive Summary", `${analysis.summary.coreIdea} ${analysis.summary.outlierPotential}`.trim())}
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Key Takeaways</p>
                  <ul className="space-y-2 text-sm text-white">
                    {analysis.breakdownBlocks.keyTakeaways.map((item) => (
                      <li key={item} className="rounded-lg border border-[#2c2c2e] bg-black/20 px-3 py-2">
                        {item}
                      </li>
                    ))}
                    {analysis.summary.actionableImprovements.map((item) => (
                      <li key={item} className="rounded-lg border border-[#2c2c2e] bg-black/20 px-3 py-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section id="bricks" className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">🧱 Lego Brick Dissector</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Decompose this video into 5 bricks — rate each one and generate remix variants.</p>
                </div>
                {!bricksResult && (
                  <button
                    type="button"
                    onClick={() => void handleDissectBricks()}
                    disabled={isDissecting}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                  >
                    {isDissecting ? (
                      <><span className="animate-spin inline-block">⏳</span> Dissecting…</>
                    ) : "Dissect Bricks"}
                  </button>
                )}
                {bricksResult && (
                  <button
                    type="button"
                    onClick={() => void handleDissectBricks()}
                    disabled={isDissecting}
                    className="text-xs text-gray-500 hover:text-gray-300 underline"
                  >
                    Re-dissect
                  </button>
                )}
              </div>

              {bricksError && <p className="text-xs text-rose-400 mb-3">{bricksError}</p>}

              {isDissecting && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-amber-400 border-opacity-50" />
                  <span className="text-sm text-gray-400">Analyzing 5 bricks…</span>
                </div>
              )}

              {bricksResult && !isDissecting && (
                <div className="space-y-3">
                  {/* 5 brick cards */}
                  {bricksResult.bricks.map(brick => {
                    const isOpen = expandedBrick === brick.id;
                    const ratingColors = { Strong: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", Weak: "bg-red-500/20 text-red-400 border-red-500/30", Untested: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
                    const brickEmoji: Record<string, string> = { format: "🎬", idea: "💡", hook: "🎣", script: "📝", edit: "✂️" };
                    return (
                      <div key={brick.id} className="rounded-xl border border-[#2c2c2e] bg-[#0f0f10]">
                        <button
                          type="button"
                          onClick={() => setExpandedBrick(isOpen ? null : brick.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        >
                          <span className="text-lg shrink-0">{brickEmoji[brick.id] || "🧱"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white">{brick.label}</span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${ratingColors[brick.rating]}`}>{brick.rating}</span>
                            </div>
                            <p className="text-xs text-gray-400 truncate mt-0.5">{brick.current}</p>
                          </div>
                          <span className="text-xs text-gray-500 shrink-0">{isOpen ? "▲" : "▼"}</span>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 space-y-3 border-t border-[#2c2c2e] pt-3">
                            <p className="text-xs text-gray-300 leading-relaxed">{brick.current}</p>
                            <p className="text-xs text-gray-400 italic">{brick.reason}</p>
                            <div>
                              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">3 Remix Ideas</p>
                              <div className="space-y-1.5">
                                {brick.remixSuggestions.map((s, i) => (
                                  <div key={i} className="flex items-start gap-2 text-xs text-gray-300 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/5">
                                    <span className="shrink-0 text-amber-400 font-bold">{i + 1}.</span>
                                    <span>{s}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Remix variants */}
                  {bricksResult.remixVariants.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Hold X, Tweak Y — Remix Variants</p>
                      <div className="space-y-2">
                        {bricksResult.remixVariants.map((v, i) => (
                          <div key={i} className="rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {v.tweakBricks.map(b => (
                                    <span key={b} className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[9px] font-bold uppercase">Change {b}</span>
                                  ))}
                                  {v.holdBricks.map(b => (
                                    <span key={b} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-500 text-[9px] uppercase">Hold {b}</span>
                                  ))}
                                </div>
                                <p className="text-xs font-semibold text-white mb-1">{v.generatedIdea}</p>
                                {v.suggestedHook && (
                                  <p className="text-xs text-cyan-300/70 italic">Hook: "{v.suggestedHook}"</p>
                                )}
                                <p className="text-xs text-gray-500 mt-1">{v.rationale}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSendBrickToEditor(v)}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-xs font-bold hover:bg-cyan-500/25 transition-colors"
                              >
                                → Editor
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!bricksResult && !isDissecting && !bricksError && (
                <div className="py-8 flex flex-col items-center gap-3 text-center">
                  <p className="text-xs text-gray-500 max-w-xs">Click "Dissect Bricks" to decompose this video into Format, Idea, Hook, Script, and Edit — then get AI-generated remix variants.</p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#2c2c2e] border-t-2 border-t-purple-500 bg-[#1c1c1e] p-5">
              <p className="mb-4 text-base font-semibold text-white">
                ✨ Turn into Content: Instantly convert this video analysis into ready-to-post content.
              </p>

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="h-10 rounded-lg border border-gray-700 bg-[#0f0f10] px-3 text-sm text-gray-200 outline-none ring-purple-500 transition focus:ring-2"
                >
                  <option>English</option>
                  <option>Hinglish</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => onGenerateContent?.("youtube_script", language)}
                  className="rounded-xl border border-gray-700 bg-transparent px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800"
                >
                  YouTube Script
                </button>
                <button
                  type="button"
                  onClick={() => onGenerateContent?.("linkedin_post", language)}
                  className="rounded-xl border border-gray-700 bg-transparent px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800"
                >
                  LinkedIn Post
                </button>
                <button
                  type="button"
                  onClick={() => onGenerateContent?.("twitter_thread", language)}
                  className="rounded-xl border border-gray-700 bg-transparent px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800"
                >
                  Twitter Thread
                </button>
              </div>
            </section>

            <button
              type="button"
              onClick={() => onDownloadReport?.()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
            >
              <Download size={16} />
              Download Full Analysis Report (Inc. Content)
            </button>
          </div>
        </div>
      </section>

      {showRemixModal ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <p className="text-base font-semibold text-white">{remixStatusMessages[remixStepIndex] ?? remixStatusMessages[2]}</p>
            </div>
            <p className="mt-3 text-sm text-gray-400">Preparing your remix wizard and carrying analysis context into Scripts.</p>
          </div>
        </div>
      ) : null}

      {showPromptModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-[#2c2c2e] bg-[#121214] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">Get a writing prompt inspired by this video</h3>
              <button
                type="button"
                onClick={() => setShowPromptModal(false)}
                className="rounded-lg border border-[#2c2c2e] bg-[#1c1c1e] p-2 text-gray-300 transition hover:text-white"
                aria-label="Close prompt modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              readOnly
              value={promptTemplate}
              className="h-[460px] w-full rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-3 font-mono text-xs leading-relaxed text-gray-200 outline-none"
            />

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-black transition-all hover:bg-[#F0F2F7] hover:-translate-y-[1px] active:scale-[0.98] shadow-lg"
              >
                {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                {copiedPrompt ? "Copied!" : "Copy to Clipboard"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
