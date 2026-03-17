"use client";

import {
  ArrowLeft,
  Box,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  History,
  MessageCircle,
  Pencil,
  Plus,
  Scissors,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AnalyzeResponse, InstagramPost } from "@/lib/types";
import Skeleton from "@/app/components/UI/Skeleton";
import { useToast } from "@/app/components/UI/Toast";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { User, Users, Globe, Zap, CheckCircle2 } from "lucide-react";

type SectionId = "topic" | "research" | "hook" | "style" | "script";

type EditorSelection = {
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
  rect: DOMRect;
};

type HookCard = {
  id: string;
  title: string;
  tag: string;
  psychology: string;
  example: string;
  bestPairedWith: string;
};

type StyleCard = {
  id: string;
  title: string;
  views: string;
  description: string;
  flow: string[];
  bestFor: string;
  category: string;
  pairsWithHook: string;
};

type ViralHook = {
  type: string;
  text: string;
};



type RemixBlueprint = {
  transcript: string;
  subject: string;
  angle: string;
  payoff: string;
  executiveSummary: string;
  keyFacts: string[];
  preferredHookId?: string;
  preferredStyleId?: string;
  viralHooks?: ViralHook[];
};

type RemixData = {
  post: InstagramPost;
  analysis: AnalyzeResponse;
  blueprint?: RemixBlueprint;
  transcript?: string;
  hook?: any;
  structure?: any;
  style?: any;
  createdAt?: string;
  // New "Hold 4, Tweak 1" fields
  idea?: string;
  format?: string;
  script?: string;
  visual?: string;
  tweakReasoning?: string;
  tweakedAttribute?: string;
  sourcePostId?: string;
  originalPost?: InstagramPost;
  originalAnalysis?: any;
};

const REMIX_DATA_KEY = "remix_data";



function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function ensureSentence(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
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

function stripTerminalPunctuation(text: string): string {
  return normalizeWhitespace(text).replace(/[.!?]+$/, "");
}

function isGenericTranscriptCandidate(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();
  if (!normalized) return true;

  return (
    normalized.includes("transcript-led outlier potential") ||
    normalized.includes("outlier potential") ||
    normalized.includes("no transcript") ||
    normalized.includes("transcript is unavailable") ||
    normalized.includes("no content available")
  );
}

function transcriptFromRemix(data: RemixData): string {
  const d = data as any;
  const candidates = [
    data.script || "", // High priority for generated remix script
    data.transcript || "",
    data.blueprint?.transcript || "",
    d?.analysis?.analysis?.breakdownBlocks?.problemAndSolution || "",
    d?.post?.caption || "",
    d?.analysis?.analysis?.summary?.coreIdea || "",
  ].map((item) => normalizeWhitespace(item));

  const preferred = candidates.find((item) => item && !isGenericTranscriptCandidate(item));
  if (preferred) return preferred;

  return candidates.find(Boolean) || "";
}

function formatNumber(n?: number | null): string {
  if (n === undefined || n === null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function buildTranscriptSnippet(data: RemixData): string {
  const transcript = transcriptFromRemix(data).slice(0, 300);
  const firstTwoSentences = splitSentences(transcript).slice(0, 2).join(" ");
  return normalizeWhitespace(firstTwoSentences || transcript);
}

function buildFallbackRemixBlueprint(data: RemixData): RemixBlueprint {
  const transcript = transcriptFromRemix(data);
  const transcriptSentences = splitSentences(transcript).map((item) => ensureSentence(item));
  const analysis = data.analysis.analysis;

  const subject =
    ensureSentence(analysis.summary.coreIdea || "") ||
    transcriptSentences[0] ||
    "The core subject is the main transformation presented in the original video.";
  const angle =
    ensureSentence(analysis.hookAnalysis.description || analysis.hookAnalysis.type || "") ||
    "The approach uses a direct, attention-grabbing hook to frame the idea.";
  const payoff =
    ensureSentence(
      analysis.summary.outlierPotential ||
      analysis.summary.actionableImprovements[0] ||
      analysis.breakdownBlocks.targetAudienceAndTone ||
      "",
    ) || "The viewer leaves with practical value they can apply immediately.";

  const executiveSummary = dedupePreserveOrder([
    ...transcriptSentences.slice(0, 2),
    ensureSentence(analysis.summary.coreIdea || ""),
    ensureSentence(analysis.summary.outlierPotential || ""),
    ensureSentence(analysis.structureAnalysis.description || ""),
    ensureSentence(payoff),
  ])
    .map((item) => ensureSentence(item))
    .slice(0, 3)
    .join(" ");

  const keyFacts = dedupePreserveOrder([
    ...transcriptSentences,
    ...analysis.breakdownBlocks.keyTakeaways.map((item) => ensureSentence(item || "")),
    ...analysis.summary.actionableImprovements.map((item) => ensureSentence(item || "")),
  ]).slice(0, 5);

  while (keyFacts.length < 3) {
    keyFacts.push("Use one concrete point from the original transcript as supporting evidence.");
  }

  return {
    transcript,
    subject: ensureSentence(subject),
    angle: ensureSentence(angle),
    payoff: ensureSentence(payoff),
    executiveSummary,
    keyFacts,
    preferredHookId: "",
    preferredStyleId: "",
  };
}

function resolveRemixBlueprint(data: RemixData): RemixBlueprint {
  const fallback = buildFallbackRemixBlueprint(data);
  const input = data.blueprint;
  if (!input) return fallback;

  const summarySentences = splitSentences(input.executiveSummary || "").map((item) => ensureSentence(item)).slice(0, 3);
  const keyFacts = dedupePreserveOrder((input.keyFacts || []).map((item) => ensureSentence(item || ""))).slice(0, 5);

  return {
    transcript: normalizeWhitespace(input.transcript || fallback.transcript),
    subject: ensureSentence(input.subject || fallback.subject),
    angle: ensureSentence(input.angle || fallback.angle),
    payoff: ensureSentence(input.payoff || fallback.payoff),
    executiveSummary:
      summarySentences.length >= 2
        ? summarySentences.join(" ")
        : fallback.executiveSummary,
    keyFacts: keyFacts.length >= 3 ? keyFacts : fallback.keyFacts,
    preferredHookId: normalizeWhitespace(input.preferredHookId || fallback.preferredHookId || ""),
    preferredStyleId: normalizeWhitespace(input.preferredStyleId || fallback.preferredStyleId || ""),
  };
}

function buildTopicForRemix(data: RemixData): string {
  if (data.idea && data.tweakedAttribute === "Idea") {
    return `REMIX STRATEGY: ${data.idea}\n\nREASONING: ${data.tweakReasoning}`;
  }
  const transcript = transcriptFromRemix(data);
  const transcriptSnippet = normalizeWhitespace(transcript).substring(0, 400);

  if (!transcriptSnippet) {
    return "Create a short-form script that remixes this exact video premise.";
  }

  return `Create a short-form script that remixes this exact video premise.\n\nOriginal Transcript Context: ${transcriptSnippet}...`;
}

function buildExecutiveSummaryForRemix(data: RemixData): string {
  const hook = data.hook || data.analysis.analysis.hookAnalysis;
  const structure = data.structure || data.analysis.analysis.structureAnalysis;
  const hookLine = ensureSentence(
    normalizeWhitespace(
      `Hook breakdown: ${hook.type || "Unknown"}${hook.description ? ` - ${hook.description}` : ""}`,
    ),
  );
  const structureLine = ensureSentence(
    normalizeWhitespace(
      `Structure breakdown: ${structure.type || "Unknown"}${structure.description ? ` - ${structure.description}` : ""}`,
    ),
  );
  const supportingLine = ensureSentence(
    normalizeWhitespace((data as any)?.analysis?.analysis?.summary?.outlierPotential || (data as any)?.post?.caption || ""),
  );

  return [hookLine, structureLine, supportingLine].filter(Boolean).join(" ");
}

function buildResearchFacts(data: RemixData): string {
  const blueprint = resolveRemixBlueprint(data);
  const factCandidates = dedupePreserveOrder(blueprint.keyFacts.map((item) => ensureSentence(item || ""))).slice(0, 5);

  if (factCandidates.length === 0) return "";
  return factCandidates.map((fact) => `- ${fact}`).join("\n");
}

function inferHookIdFromRemix(data: RemixData): HookCard["id"] {
  if (data.hook && data.tweakedAttribute === "Hook") {
      const hookText = String(data.hook).toLowerCase();
      if (hookText.includes("question")) return "question-hook";
      if (hookText.includes("myth")) return "myth-bust-hook";
      if (hookText.includes("story")) return "educational-storytelling";
  }
  const preferred = normalizeWhitespace(resolveRemixBlueprint(data).preferredHookId || "");
  if (preferred) return preferred;

  const d = data as any;
  const hookType = normalizeWhitespace(d?.analysis?.analysis?.hookAnalysis?.type || "").toLowerCase();
  const hookDescription = normalizeWhitespace(d?.analysis?.analysis?.hookAnalysis?.description || "").toLowerCase();
  const caption = normalizeWhitespace(d?.post?.caption || "").toLowerCase();
  const haystack = `${hookType} ${hookDescription} ${caption}`;

  if (haystack.includes("question") || caption.includes("?")) return "question-hook";
  if (haystack.includes("myth") || haystack.includes("misconception")) return "myth-bust-hook";
  if (haystack.includes("controvers") || haystack.includes("unpopular opinion")) return "controversial-hook";
  return "education-hook";
}

function inferStyleIdFromRemix(data: RemixData): StyleCard["id"] {
  if (data.format && data.tweakedAttribute === "Format") {
      const formatText = String(data.format).toLowerCase();
      if (formatText.includes("case study")) return "case-study";
      if (formatText.includes("listicle")) return "listicle";
      if (formatText.includes("tutorial")) return "rapid-tutorial";
  }
  const preferred = normalizeWhitespace(resolveRemixBlueprint(data).preferredStyleId || "");
  if (preferred) return preferred;

  const d = data as any;
  const style = d?.analysis?.analysis?.styleAnalysis || {};
  const structure = d?.analysis?.analysis?.structureAnalysis || {};
  const haystack = normalizeWhitespace(
    `${style.tone} ${style.voice} ${style.wordChoice} ${style.pacing} ${structure.type} ${structure.description}`,
  ).toLowerCase();
  if (haystack.includes("day in")) return "day-in-life";
  if (haystack.includes("rapid") || haystack.includes("very fast") || haystack.includes("tutorial")) return "rapid-tutorial";
  if (haystack.includes("problem") || haystack.includes("solution")) return "problem-solution";
  if (haystack.includes("case")) return "case-study";
  if (haystack.includes("personal") || haystack.includes("first-person") || haystack.includes("story")) return "personal-update";
  if (haystack.includes("list")) return "listicle";
  return "listicle";
}

function buildHookCards(): HookCard[] {
  return [
    {
      id: "secret-reveal",
      title: "Secret Reveal",
      tag: "Intrigue",
      psychology: "Creates instant FOMO by implying hidden or exclusive knowledge they are missing out on.",
      example: "Nobody is talking about this hidden iOS feature...",
      bestPairedWith: "Breakdown, Listicle",
    },
    {
      id: "contrarian",
      title: "Contrarian",
      tag: "Disruption",
      psychology: "Challenges common beliefs. Forces attention by creating cognitive dissonance.",
      example: "Here is why your daily to-do list is actually destroying your productivity.",
      bestPairedWith: "Problem Solver, Case Study Explainer",
    },
    {
      id: "problem-hook",
      title: "Problem Hook",
      tag: "Relatability",
      psychology: "Agnitates a specific pain point the audience experiences daily, offering validation.",
      example: "Are you tired of staring at a blank screen when trying to create content?",
      bestPairedWith: "Problem Solver, Tutorial",
    },
    {
      id: "question-hook",
      title: "Question Hook",
      tag: "Curiosity",
      psychology: "Opens a curiosity loop with a highly relatable question. Forces the viewer to stay.",
      example: "What if I told you that you could double your reading speed in 5 minutes?",
      bestPairedWith: "Educational Storytelling",
    },
    {
      id: "case-study-hook",
      title: "Case Study",
      tag: "Authority",
      psychology: "Builds instant credibility by referencing a tangible, impressive result.",
      example: "How this 22-year-old built a $1M business using just his iPhone.",
      bestPairedWith: "Case Study Explainer, Breakdown",
    },
    {
      id: "education-hook",
      title: "Education Hook",
      tag: "Value",
      psychology: "Direct utility hook that promises a specific outcome in exchange for attention.",
      example: "Here are 3 mental models that will completely change how you make decisions.",
      bestPairedWith: "Tutorial, Listicle",
    },
    {
      id: "list-hook",
      title: "List Hook",
      tag: "Structure",
      psychology: "Promises a structured, easy-to-digest format that sets clear expectations.",
      example: "5 things you must do before you launch your next marketing campaign.",
      bestPairedWith: "Listicle",
    },
    {
      id: "comparison-hook",
      title: "Comparison Hook",
      tag: "Contrast",
      psychology: "Highlights the gap between 'old way' vs 'new way', triggering upgrade desire.",
      example: "Stop using ChatGPT like a beginner. Do this instead.",
      bestPairedWith: "Breakdown, Tutorial",
    },
    {
      id: "personal-experience",
      title: "Personal Experience",
      tag: "Connection",
      psychology: "Starts with emotional vulnerability. Highly relatable and humanizes the creator.",
      example: "I used to struggle with severe anxiety, until I discovered this simple breathing technique.",
      bestPairedWith: "Educational Storytelling",
    },
    {
      id: "viral-stack",
      title: "The Viral Stack",
      tag: "Viral",
      psychology: "Sequences Pattern Interrupt, Personal Stakes, and Curiosity Gap in 5 seconds.",
      example: "[Unexpected Statement] + [How it affects you] + [The Loop]",
      bestPairedWith: "Any high-retention structure",
    },
  ];
}

function buildStyleCards(): StyleCard[] {
  return [
    {
      id: "problem-solver",
      title: "Problem Solver",
      views: "2.1M views",
      description: "Agitates a painful issue, deeply relates to the viewer, then provides the exact framework to fix it.",
      flow: ["Hook", "Problem", "Agitation", "Solution", "CTA"],
      bestFor: "Coaching, Self-Help",
      category: "Framework",
      pairsWithHook: "Disruption Hook"
    },
    {
      id: "breakdown",
      title: "Breakdown",
      views: "1.9M views",
      description: "Deconstructs a complex concept or success story into an easy-to-understand playbook.",
      flow: ["Hook", "Subject Intro", "Key Insight 1", "Key Insight 2", "Takeaway", "CTA"],
      bestFor: "Product Launches, Tech, Analysis",
      category: "Analysis",
      pairsWithHook: "Curiosity Gap"
    },
    {
      id: "listicle",
      title: "Listicle",
      views: "2.5M views",
      description: "A fast-paced, highly structured list of tips or mistakes that keeps viewers waiting for the next item.",
      flow: ["Hook", "Item 1", "Item 2", "Item 3", "Bonus Tip", "CTA"],
      bestFor: "Atomic Tips, Multiple Parts",
      category: "List",
      pairsWithHook: "Number Hook"
    },
    {
      id: "case-study-explainer",
      title: "Case Study",
      views: "1.6M views",
      description: "Uses a specific person or brand as evidence to prove a broader, highly valuable point.",
      flow: ["Hook", "The Setup", "The Conflict", "The Reveal/Result", "The Lesson", "CTA"],
      bestFor: "Blueprints, Experiments",
      category: "Proof",
      pairsWithHook: "Social Proof Hook"
    },
    {
      id: "tutorial",
      title: "Tutorial",
      views: "1.8M views",
      description: "A direct, step-by-step walkthrough showing exactly how to achieve a desired outcome.",
      flow: ["Hook", "Prerequisites", "Step 1", "Step 2", "Step 3", "Result", "CTA"],
      bestFor: "Step-by-Step Education",
      category: "Education",
      pairsWithHook: "Direct Question"
    },
    {
      id: "educational-storytelling",
      title: "Educational Story",
      views: "2.2M views",
      description: "Weaves a personal or historical narrative that casually drops massive value bombs along the way.",
      flow: ["Hook", "Story Start", "The Turning Point", "The Core Lesson", "Application", "CTA"],
      bestFor: "1st Person POV, Motivation",
      category: "Narrative",
      pairsWithHook: "Story Hook"
    },
    {
      id: "newscaster",
      title: "Newscaster",
      views: "1.4M views",
      description: "Rapidly delivers timely updates or trends, positioning the creator as the ultimate industry insider.",
      flow: ["Hook", "The News/Update", "Why it Matters", "Your Prediction", "CTA"],
      bestFor: "Journalism, News, Facts",
      category: "News",
      pairsWithHook: "Contrarian Hook"
    }
  ];
}

function buildScriptDraft(params: {
  topic: string;
  hook: HookCard;
  style: StyleCard;
}): string {
  return [
    `${params.hook.title}: ${params.hook.psychology}`,
    "",
    `${params.topic}`,
    "",
    `Deliver this in a ${params.style.title} format.`,
    `Ensure you follow this exact flow: ${params.style.flow.join(' ➔ ')}`,
    "",
    "End with one clear CTA that asks viewers to save this and apply it this week.",
  ].join("\n");
}

function getOffsetWithinElement(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(container, offset);
  return range.toString().length;
}

function getEditorSelection(root: HTMLElement): EditorSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const text = range.toString();
  if (!text.trim()) return null;

  const start = getOffsetWithinElement(root, range.startContainer, range.startOffset);
  const end = getOffsetWithinElement(root, range.endContainer, range.endOffset);
  if (end <= start) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  return {
    start,
    end,
    text,
    x: Math.max(24, Math.min(window.innerWidth - 24, rect.left + rect.width / 2)),
    y: Math.max(24, rect.top - 8),
    rect,
  };
}

function setCaretAtOffset(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    remaining -= length;
    node = walker.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-[#202020] text-gray-300 transition hover:border-white/20 hover:text-white"
    >
      {children}
    </button>
  );
}

const STYLE_OPTIONS = [
  { title: "Conversational & Friendly" },
  { title: "Direct & Punchy" },
  { title: "Educational & Authoritative" },
  { title: "Storytelling / Narrative" },
  { title: "High Energy & Fast Paced" }
];

const HOOK_OPTIONS = [
  { title: "The Contrarian" },
  { title: "The Question" },
  { title: "The Statistic" },
  { title: "Educational" },
  { title: "Direct Value" }
];

function ScriptsPageContent() {
  const searchParams = useSearchParams();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const askInputRef = useRef<HTMLInputElement | null>(null);
  const bottomBarRef = useRef<HTMLDivElement | null>(null);
  const pendingCaretOffsetRef = useRef<number | null>(null);

  const [remixData, setRemixData] = useState<RemixData | null>(null);
  const [isRemixMode, setIsRemixMode] = useState(false);
  const [creationMode, setCreationMode] = useState<"scratch" | "remix">("scratch");
  const [onePercentFocus, setOnePercentFocus] = useState("Stronger Packaging (Title/Cover)");
  const [tweakAttribute, setTweakAttribute] = useState<string | null>(null);
  const [isRemixing, setIsRemixing] = useState(false);
  const [remixTranscript, setRemixTranscript] = useState("");
  const [topic, setTopic] = useState("");
  const [originalAnalysis, setOriginalAnalysis] = useState(null);

  useEffect(() => {
    // Check for explicit ?title= URL param (works for any entry point)
    const urlTitle = searchParams.get("title");
    if (urlTitle) {
      setScriptTitle(decodeURIComponent(urlTitle));
    }    if (searchParams.get("mode") === "remix" || searchParams.get("source") === "remix") {
      setCreationMode("remix");
      setIsRemixMode(true);
      setScriptType("REMIX");
      
      const savedPayload = sessionStorage.getItem("pendingRemix") || localStorage.getItem("remix_data");
      if (savedPayload) {
        try {
          const parsed = JSON.parse(savedPayload);
          const transcript = parsed.transcript || (parsed.post ? transcriptFromRemix(parsed) : "");
          const analysis = parsed.analysis || parsed.originalAnalysis;
          const suggestedName = parsed.suggestedName;

          if (transcript) setRemixTranscript(transcript);
          if (analysis) setOriginalAnalysis(analysis);
          setRemixData(parsed);

          // Priority: suggestedName > URL title param > transcript fallback
          if (suggestedName) {
            setScriptTitle(suggestedName);
          } else if (!urlTitle) {
            const transcriptSnippet = (transcript || "").slice(0, 300);
            const fallbackTitle = transcriptSnippet
              ? transcriptSnippet.split(" ").slice(0, 5).join(" ") + "... Remix"
              : "New Remix Script";
            setScriptTitle(fallbackTitle);
          }
        } catch(e) {}
        
        // session/local storage is handled by the component that redirected here
      }
    }
  }, [searchParams]);


  const [hookCards, setHookCards] = useState<HookCard[]>(() => buildHookCards());
  const [styleCards, setStyleCards] = useState<StyleCard[]>(() => buildStyleCards());
  const [selectedHookId, setSelectedHookId] = useState(buildHookCards()[0]?.id || "");
  const [selectedStyleId, setSelectedStyleId] = useState(buildStyleCards()[0]?.id || "");
  const [selectedHookPreviewId, setSelectedHookPreviewId] = useState("preview-a");
  const [hookSearchQuery, setHookSearchQuery] = useState("");
  const [hookTagFilter, setHookTagFilter] = useState<string>("All");
  const [script, setScript] = useState("");
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [showAskInput, setShowAskInput] = useState(false);
  const [aiCommand, setAiCommand] = useState("");
  const [isApplyingAiEdit, setIsApplyingAiEdit] = useState(false);
  const [aiEditError, setAiEditError] = useState("");
  const [activeStep, setActiveStep] = useState<number>(1);

  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [ttsError, setTtsError] = useState("");

  const [audioPlaylist, setAudioPlaylist] = useState<string[]>([]);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setAudioProgress(0);
  }, [currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlayingAudio) {
        audioRef.current.play().catch(e => console.error("Audio playback error:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlayingAudio, currentTrack, audioPlaylist]);

  const handleTrackEnded = () => {
    if (currentTrack < audioPlaylist.length - 1) {
      setCurrentTrack(prev => prev + 1);
    } else {
      setIsPlayingAudio(false);
      setCurrentTrack(0);
    }
  };

  // Triple-Threat Writing Mode state
  type WritingMode = "polisher" | "bullets" | "oneliner";
  const [writingMode, setWritingMode] = useState<WritingMode>("polisher");
  const [isImprovingScript, setIsImprovingScript] = useState(false);
  const [iterationFocus, setIterationFocus] = useState<string>("Spoken Hook");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedFocus = localStorage.getItem("iteration_focus");
      if (savedFocus) setIterationFocus(savedFocus);
    }
  }, []);

  const [improveError, setImproveError] = useState("");
  const [scriptLlm, setScriptLlm] = useState("");
  const [showTemplateDrawer, setShowTemplateDrawer] = useState(false);

  // Diff Checker state
  const [originalScript, setOriginalScript] = useState("");
  const [improvedScript, setImprovedScript] = useState("");
  const [isDiffMode, setIsDiffMode] = useState(false);

  const [improvedSingleHook, setImprovedSingleHook] = useState("");
  const [isGeneratingImprovedSingleHook, setIsGeneratingImprovedSingleHook] = useState(false);
  const [improvedSingleHookError, setImprovedSingleHookError] = useState("");

  // Localization Engine state
  const [localeLang, setLocaleLang] = useState("Hinglish (Default)");
  const [activeModel, setActiveModel] = useState("gemini-3-flash-preview");
  const [activeLanguage, setActiveLanguage] = useState("English");
  const [emotionFilter, setEmotionFilter] = useState("Shock & Curiosity");
  const [emotionIntensity, setEmotionIntensity] = useState(5);
  const [shockingFacts, setShockingFacts] = useState<Array<{statement: string, score: number}>>([]);
  const [selectedAngle, setSelectedAngle] = useState<{statement: string, score: number} | null>(null);
  const [scriptStyle, setScriptStyle] = useState("High Energy");
  const [hookType, setHookType] = useState("The Contrarian");
  const [isAdapting, setIsAdapting] = useState(false);
  const [adaptedScript, setAdaptedScript] = useState("");
  const [adaptError, setAdaptError] = useState("");

  // Dedicated Hooks Engine state
  const [hookEngineStyle, setHookEngineStyle] = useState("");
  const [isGeneratingHook, setIsGeneratingHook] = useState(false);
  const [hookGenEngineError, setHookGenEngineError] = useState("");

  const [scriptTitle, setScriptTitle] = useState("New Script");
  const [scriptId] = useState(() => crypto.randomUUID());
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Quick-select hook variation and story structure overrides for generation engine
  const [hookVariation, setHookVariation] = useState("Auto (from selection)");
  const [storyStructureOverride, setStoryStructureOverride] = useState("Auto (from selection)");

  // Post-Gen Evaluation Checklist
  const [evalInterestingness, setEvalInterestingness] = useState(false);
  const [evalCompression, setEvalCompression] = useState(false);
  const [evalHookGrip, setEvalHookGrip] = useState(false);
  const [evalEmotionMatch, setEvalEmotionMatch] = useState(false);

  // Director's Cut state
  const [directorsCutData, setDirectorsCutData] = useState<any>(null);
  const [isGeneratingDirector, setIsGeneratingDirector] = useState(false);
  const [packagingData, setPackagingData] = useState<{ titleText: string, coverVisual: string } | null>(null);
  const [videoLength, setVideoLength] = useState(60);
  const { toast } = useToast();
  const [copiedScript, setCopiedScript] = useState(false);
  const [scriptType, setScriptType] = useState<"ORIGINAL" | "REMIX">("ORIGINAL");
  const [researchData, setResearchData] = useState<any>(null);
  const [selectedText, setSelectedText] = useState("");
  const [inlineAICommand, setInlineAICommand] = useState("");
  const [isProcessingInlineAI, setIsProcessingInlineAI] = useState(false);


  const WRITING_MODES: { id: WritingMode; icon: string; label: string; placeholder: string }[] = [
    { id: "polisher", icon: "✍️", label: "The Polisher", placeholder: "Paste your clunky draft here..." },
    { id: "bullets", icon: "📝", label: "Bullet-to-Script", placeholder: "Paste 3-4 bullet points of research..." },
    { id: "oneliner", icon: "⚡", label: "1-Line Expander", placeholder: "Type one raw idea (e.g., 'Why morning routines are a scam')..." },
  ];

  const SCRIPT_TEMPLATES = [
    {
      name: "The \"X is Dead\" Framework",
      content: "Hook: [Insert controversial opinion here — e.g., \"Hustle culture is dead.\"]\
\nBut here's the thing nobody talks about...\
\n[Insert contrarian insight that challenges the mainstream view.]\
\nI tested this for 90 days. Here's what actually happened:\
\n1. [Result 1]\
2. [Result 2]\
3. [Result 3]\
\nSo next time someone tells you [mainstream belief], remember this.\
\nSave this. You'll need it.",
    },
    {
      name: "The 3-Step Listicle",
      content: "Stop doing [common mistake]. Do this instead.\
\nStep 1: [Actionable tip with one concrete example.]\
\nStep 2: [Build on step 1 — make it feel like momentum.]\
\nStep 3: [The payoff move. This is the one that changes everything.]\
\nWhich step are you starting with? Comment below.",
    },
    {
      name: "The Contrarian Take",
      content: "Everyone says [popular opinion].\
\nBut after [time period / experience], I realized the opposite is true.\
\n[Insert personal story or data point that surprises the viewer.]\
\nThe real truth? [Reframe the narrative with a punchy one-liner.]\
\nIf this changed how you think, share it with someone who needs to hear it.",
    },
  ];

  // Retention predictor state
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [retentionScore, setRetentionScore] = useState(100);
  const [longSentences, setLongSentences] = useState<string[]>([]);

  // Viral Script Generator state
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [scriptGenError, setScriptGenError] = useState("");
  const [isShortening, setIsShortening] = useState(false);
  // Whether the server-side Settings DB has at least one API key configured
  const [settingsHasKeys, setSettingsHasKeys] = useState(true); // optimistic default

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: { hasKeys?: boolean }) => { setSettingsHasKeys(!!data.hasKeys); })
      .catch(() => {}); // silently fail — don't block anything
  }, []);

  // A/B Hook Generator state
  const [abHooks, setAbHooks] = useState<Array<{ type: string; spoken?: string; visual?: string; text?: string }>>([]); 
  const [scriptJob, setScriptJob] = useState("Views (Broad Appeal)");
  const [selectedAbHookIndex, setSelectedAbHookIndex] = useState<number | null>(null);
  const [appliedHookIndex, setAppliedHookIndex] = useState<number | null>(null);
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false);
  const [hookGenError, setHookGenError] = useState("");

  // Repurposing Engine state
  const [repurposedText, setRepurposedText] = useState("");
  const [repurposePlatform, setRepurposePlatform] = useState("");
  const [isRepurposing, setIsRepurposing] = useState(false);
  const [repurposeError, setRepurposeError] = useState("");

  // Visual Prompt Generator state
  type VisualPrompts = { character_sheet: string; shots: { spoken_line: string; nano_banana_image_prompt: string; kling_video_prompt: string }[] };
  const [visualPrompts, setVisualPrompts] = useState<VisualPrompts | null>(null);
  const [isGeneratingVisual, setIsGeneratingVisual] = useState(false);

  const [isExpandingTAM, setIsExpandingTAM] = useState(false);
  const [isAnalyzingPacing, setIsAnalyzingPacing] = useState(false);
  const [isAutoMatchingStructure, setIsAutoMatchingStructure] = useState(false);
  const [fluffHighlights, setFluffHighlights] = useState<string[]>([]);
  const [showHookGate, setShowHookGate] = useState(false);
  const [hookGateData, setHookGateData] = useState<{ score: number, suggestions: string[] } | null>(null);

  // AI Prompt Director state
  type PromptDirectorData = { character_identity: string; prompts: { spoken_line: string; image_prompt: string; video_prompt: string }[] };
  const [promptDirectorData, setPromptDirectorData] = useState<PromptDirectorData | null>(null);
  const [isGeneratingPromptDirector, setIsGeneratingPromptDirector] = useState(false);
  const [promptDirectorError, setPromptDirectorError] = useState("");
  const [visualGenError, setVisualGenError] = useState("");

  // Caption Generator state
  const [generatedCaption, setGeneratedCaption] = useState<string | null>(null);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  type BrainstormSuggestion = { title: string; suggestion: string; impact: string };
  type PacingSegment = { lineStart: number; lineEnd: number; status: 'Good' | 'Slow' | 'Critical'; note: string };
  type PacingData = { segments: PacingSegment[]; summary: string };
  const [brainstormSuggestions, setBrainstormSuggestions] = useState<BrainstormSuggestion[] | null>(null);
  const [pacingData, setPacingData] = useState<PacingData | null>(null);
  const [improvementLog, setImprovementLog] = useState<string[]>([]);
  const [visualCues, setVisualCues] = useState<string | null>(null);
  const [imagePrompts, setImagePrompts] = useState<any[] | null>(null);

  // Notion Sync state
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [notionStatus, setNotionStatus] = useState("");

  // Client Profile state
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isClientsLoading, setIsClientsLoading] = useState(false);

  const selectedClient = useMemo(() => 
    (Array.isArray(clients) ? clients : []).find(c => c.id === selectedClientId) || null
  , [clients, selectedClientId]);

  useEffect(() => {
    const fetchClients = async () => {
      setIsClientsLoading(true);
      try {
        const res = await fetch("/api/clients");
        if (!res.ok) {
          setClients([]);
          console.error("API Error: Fetching clients failed", res.status);
          return;
        }
        const data = await res.json();
        setClients(Array.isArray(data) ? data : []);
        
        // Check for client in query param
        const clientIdParam = searchParams.get("client");
        if (clientIdParam) {
          setSelectedClientId(clientIdParam);
          const client = (Array.isArray(data) ? data : []).find((c: any) => c.id === clientIdParam);
          if (client) {
            if (client.language) setActiveLanguage(client.language);
            if (client.duration) {
              const dur = parseInt(client.duration);
              if (!isNaN(dur)) setVideoLength(dur);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch clients", error);
      } finally {
        setIsClientsLoading(false);
      }
    };
    fetchClients();
  }, []);

  // Sync settings when client changes
  useEffect(() => {
    if (selectedClient) {
      if (selectedClient.language && activeLanguage !== selectedClient.language) {
        setActiveLanguage(selectedClient.language);
      }
      if (selectedClient.duration) {
        const dur = parseInt(selectedClient.duration);
        if (!isNaN(dur) && videoLength !== dur) {
          setVideoLength(dur);
        }
      }
    }
  }, [selectedClientId, selectedClient]);

  const selectedHook = useMemo(
    () => hookCards.find((card) => card.id === selectedHookId) ?? hookCards[0] ?? null,
    [hookCards, selectedHookId],
  );
  const selectedStyle = useMemo(
    () => styleCards.find((card) => card.id === selectedStyleId) ?? styleCards[0] ?? null,
    [selectedStyleId, styleCards],
  );

  const wordCount = useMemo(
    () => (Array.isArray(script.split(/\s+/)) ? script.split(/\s+/) : []).map((word) => word.trim()).filter(Boolean).length,
    [script],
  );

  // Phase 3: Real-time audience retention predictor
  useEffect(() => {
    const words = script.trim().split(/\s+/).filter(Boolean);
    const wc = words.length;
    setEstimatedDuration(Math.round((wc / 150) * 60));

    const sentences = script
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const tooLong = sentences.filter((s) => s.split(/\s+/).filter(Boolean).length > 20);
    setLongSentences(tooLong);
    const deduction = tooLong.length * 10;
    setRetentionScore(Math.max(0, 100 - deduction));
  }, [script]);

  const sourceMeta = useMemo(() => {
    if (!remixData) return "Manual mode";

    const data = remixData as any;
    const username = data?.post?.username || data?.channel?.name || "Unknown Creator";
    const views = data?.post?.metrics?.views || data?.views || 0;

    return `@${username} • ${Number(views).toLocaleString()} views`;
  }, [remixData]);

  const sourcePills = useMemo(
    () => ["www.indy100.com", "www.voguebusiness.com", "www.fastcompany.com"],
    [],
  );



  const hookTagOptions = useMemo(() => {
    const tags = new Set((Array.isArray(hookCards) ? hookCards : []).map((card) => card.tag));
    return ["All", ...Array.from(tags)];
  }, [hookCards]);

  const filteredHookCards = useMemo(() => {
    return (Array.isArray(hookCards) ? hookCards : []).filter((card) => {
      const matchesTag = hookTagFilter === "All" || card.tag === hookTagFilter;
      const query = hookSearchQuery.trim().toLowerCase();
      const matchesQuery =
        query.length === 0 ||
        card.title.toLowerCase().includes(query) ||
        card.psychology.toLowerCase().includes(query) ||
        card.tag.toLowerCase().includes(query);
      return matchesTag && matchesQuery;
    });
  }, [hookCards, hookSearchQuery, hookTagFilter]);

  const hookPreviews = useMemo(() => {
    if (!selectedHook) return [];

    const topicLine = normalizeWhitespace(topic || "your topic");
    return [
      {
        id: "preview-a",
        text: `${selectedHook.title} Most creators overcomplicate ${topicLine.toLowerCase()}, but one small change can improve outcomes immediately.`,
      },
      {
        id: "preview-b",
        text: `${selectedHook.title} If you are trying to improve ${topicLine.toLowerCase()}, this is the one framework that prevents wasted effort.`,
      },
    ];
  }, [selectedHook, topic]);

  const estimatedSeconds = useMemo(() => {
    if (!script.trim()) return 0;
    const words = script.split(/\s+/).filter(w => w.length > 0).length;
    return Math.ceil(words / 2.5);
  }, [script]);

  useEffect(() => {
    const editId = searchParams?.get("id");
    if (!editId) return;

    (async () => {
      try {
        const res = await fetch("/api/scripts/load");
        if (!res.ok) {
          console.error("API Error: Loading scripts failed");
          return;
        }
        const { data } = await res.json();
        const scripts: any[] = Array.isArray(data?.scripts) ? data.scripts : [];
        const found = scripts.find((s: any) => s.id === editId);
        if (!found) return;

        const nextHookCards = buildHookCards();
        const nextStyleCards = buildStyleCards();
        setHookCards(nextHookCards);
        setStyleCards(nextStyleCards);

        setTopic(found.topic || "");
        setScript(found.content || "");
        if (found.hooks && Array.isArray(found.hooks)) setAbHooks(found.hooks);
        if (found.caption) setGeneratedCaption(found.caption);
        if (found.repurposed) setRepurposedText(found.repurposed);
        if (found.scriptJob) setScriptJob(found.scriptJob);
        if (found.directorsCut) setDirectorsCutData(found.directorsCut);
        if (found.prompts) setPromptDirectorData(found.prompts);
        if (found.packaging) setPackagingData(found.packaging); // Load packaging data
        setScriptTitle(found.title || "New Script");

        const matchedHook = nextHookCards.find((c: any) => c.title === found.hook);
        if (matchedHook) setSelectedHookId(matchedHook.id);

        const matchedStyle = nextStyleCards.find((c: any) => c.title === found.style);
        if (matchedStyle) setSelectedStyleId(matchedStyle.id);

        setIsRemixMode(false);
        setRemixData(null);
      } catch (err) {
        console.error("Failed to load script for editing:", err);
      }
    })();
  }, [searchParams]);

  // Debounced autosave — saves all script fields to DB, no localStorage
  useEffect(() => {
    const effectiveId = searchParams?.get("id") || scriptId;
    if (!script && !scriptTitle) return;

    setSaveStatus("saving");
    const saveTimer = setTimeout(async () => {
      try {
        await fetch("/api/scripts/save", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: effectiveId,
            title: scriptTitle || "Untitled Script",
            content: script,
            clientId: selectedClientId,
            type: scriptType,
            hooks: abHooks.length > 0 ? abHooks : undefined,
            caption: generatedCaption || undefined,
            scriptJob: scriptJob || undefined,
            directorsCut: directorsCutData || undefined,
            prompts: promptDirectorData || undefined,
            packaging: packagingData || undefined,
            updatedAt: new Date().toISOString(),
          }),
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("idle");
      }
    }, 3000);

    return () => clearTimeout(saveTimer);
  }, [scriptTitle, script, selectedClientId, scriptId, searchParams, abHooks, generatedCaption, scriptJob, directorsCutData, promptDirectorData, packagingData]);

  useEffect(() => {
    const nextHookCards = buildHookCards();
    const nextStyleCards = buildStyleCards();
    setHookCards(nextHookCards);
    setStyleCards(nextStyleCards);
    setHookTagFilter("All");
    setHookSearchQuery("");
    setSelectedHookPreviewId("preview-a");

    try {
      const raw = localStorage.getItem(REMIX_DATA_KEY);
      if (!raw) {
        setRemixData(null);
        setIsRemixMode(false);
        setTopic("");
        setScript("");
        setSelectedHookId(nextHookCards[0]?.id || "");
        setSelectedStyleId(nextStyleCards[0]?.id || "");
        return;
      }

      const parsed = JSON.parse(raw) as RemixData;
      
      // Adapt for new Remix structure if needed
      const effectivePost = parsed.post || parsed.originalPost;
      const effectiveAnalysis = parsed.analysis || parsed.originalAnalysis;

      if (!effectivePost?.id || !effectiveAnalysis?.analysis) {
        throw new Error("Invalid remix data");
      }
      
      // Sync names if they are slightly different
      if (!parsed.post) parsed.post = effectivePost;
      if (!parsed.analysis) parsed.analysis = effectiveAnalysis;

      const hookId = inferHookIdFromRemix(parsed);
      const styleId = inferStyleIdFromRemix(parsed);
      const selectedHookCard = nextHookCards.find((item) => item.id === hookId) ?? nextHookCards[0];
      const selectedStyleCard = nextStyleCards.find((item) => item.id === styleId) ?? nextStyleCards[0];
      const remixBlueprint = resolveRemixBlueprint(parsed);
      const topicText = buildTopicForRemix(parsed);

      setRemixData(parsed);
      setIsRemixMode(true);
      setSelectedHookId(selectedHookCard?.id || "");
      setSelectedStyleId(selectedStyleCard?.id || "");
      setTopic(topicText);
      const initCreatorName = (parsed as any)?.post?.username || (parsed as any)?.channel?.name || "Creator";
      setScriptTitle(`Remix: ${initCreatorName} Strategy`);
      if (selectedHookCard && selectedStyleCard) {
        setScript(""); // Ensure textarea is blank, waiting for generation
      }
    } catch {
      setRemixData(null);
      setIsRemixMode(false);
      setTopic("");
      setScript("");
      setSelectedHookId(nextHookCards[0]?.id || "");
      setSelectedStyleId(nextStyleCards[0]?.id || "");
    }
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (editor.textContent !== script) {
      editor.textContent = script;
    }

    if (pendingCaretOffsetRef.current !== null) {
      setCaretAtOffset(editor, pendingCaretOffsetRef.current);
      pendingCaretOffsetRef.current = null;
    }
  }, [script]);

  useEffect(() => {
    if (showAskInput) {
      askInputRef.current?.focus();
    }
  }, [showAskInput]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        editorRef.current?.contains(target) ||
        toolbarRef.current?.contains(target) ||
        bottomBarRef.current?.contains(target)
      ) {
        return;
      }

      setSelection(null);
      setShowAskInput(false);
      setAiCommand("");
      setAiEditError("");
    }

    function handleScroll() {
      setSelection(null);
      setShowAskInput(false);
      setAiCommand("");
      setAiEditError("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  function scrollToSection(section: SectionId) {
    document.getElementById(`${section}-section`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function nextSection(section: SectionId) {
    const order: SectionId[] = ["topic", "hook", "style", "script"];
    const index = order.indexOf(section);
    const next = order[index + 1];
    if (!next) return;
    scrollToSection(next);
  }

  function updateSelectionFromEditor() {
    const editor = editorRef.current;
    if (!editor) return;
    const nextSelection = getEditorSelection(editor);
    setSelection(nextSelection);
    setShowAskInput(false);
    setAiEditError("");
  }

  async function applyInlineEdit() {
    if (!selection) {
      setAiEditError("Highlight text in the script first.");
      return;
    }
    if (!aiCommand.trim()) {
      setAiEditError("Enter an instruction for Ask AI.");
      return;
    }

    setIsApplyingAiEdit(true);
    setAiEditError("");

    try {
      const response = await fetch("/api/edit-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: selection.text,
          promptCommand: aiCommand.trim(),
          fullScript: script,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Inline edit failed");
      }

      const payload = await response.json();
      const replacement = (payload.replacement || "").trim();
      if (!replacement) throw new Error("AI returned an empty replacement");

      const nextScriptText = script.slice(0, selection.start) + replacement + script.slice(selection.end);
      setScript(nextScriptText);
      
      setSelection(null);
      setAiCommand("");
      setShowAskInput(false);
      toast("success", "Script Updated", "AI edit applied successfully.");
    } catch (error: any) {
      setAiEditError(error.message);
      toast("error", "Edit Failed", error.message);
    } finally {
      setIsApplyingAiEdit(false);
    }
  }

  async function handleInlineAIEdit(command: string) {
    if (!command.trim() || isProcessingInlineAI) return;
    setIsProcessingInlineAI(true);
    try {
      const response = await fetch("/api/edit-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullScript: script,
          selectedText: selectedText,
          promptCommand: command
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "AI Edit Failed");
      }

      const { replacement } = await response.json();
      
      if (selectedText) {
        // Replace selection in the script
        setScript(p => p.replace(selectedText, replacement));
        setSelectedText("");
      } else {
        // Replace entire script
        setScript(replacement);
      }
      toast("success", "Script Updated", "AI changes applied.");
      setInlineAICommand("");
    } catch (err: any) {
      toast("error", "AI Error", err.message);
    } finally {
      setIsProcessingInlineAI(false);
    }
  }


  function insertCommandTemplate(template: string) {
    setAiCommand(template);
    setShowAskInput(true);
    setTimeout(() => {
      askInputRef.current?.focus();
    }, 0);
  }

  async function handleDirectorsCut() {
    if (!script.trim()) {
      toast("error", "Script Required", "Generate a script first.");
      return;
    }
    setIsGeneratingDirector(true);
    setDirectorsCutData(null);
    setPackagingData(null); // Clear packaging data on new generation
    try {
      const getStoredKey = (k: string) => {
        const v = localStorage.getItem(k);
        return v && v !== "undefined" && v !== "null" ? v.trim() : "";
      };
      const provider = getStoredKey("activeProvider") || "Gemini";
      let apiKey = "";
      if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
      else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
      else apiKey = getStoredKey("geminiApiKey");

      const res = await fetch("/api/directors-cut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, provider, apiKey, model: activeModel })
      });
      const payload = await res.json();
      if (payload.data) {
        setDirectorsCutData(payload.data);
        if (payload.data.packaging) {
          setPackagingData(payload.data.packaging);
        }
        toast("success", "Visual Cues Ready", "Director's Cut has been generated.");
      }
    } catch (err) {
      toast("error", "Director's Cut Failed", "Could not generate Director's Cut.");
    } finally {
      setIsGeneratingDirector(false);
    }
  }

  async function handleExpandTAM() {
    if (!topic.trim()) {
      toast("error", "Topic Required", "Please enter a topic first.");
      return;
    }
    setIsExpandingTAM(true);
    try {
      const getStoredKey = (k: string) => {
        const v = localStorage.getItem(k);
        return v && v !== "undefined" && v !== "null" ? v.trim() : "";
      };
      const provider = getStoredKey("activeProvider") || "Gemini";
      let apiKey = "";
      if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
      else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
      else apiKey = getStoredKey("geminiApiKey");

      const res = await fetch("/api/expand-tam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, provider, apiKey, model: activeModel })
      });
      const data = await res.json();
      if (data.expandedTopic) {
        setTopic(data.expandedTopic);
        toast("success", "TAM Expanded", "Topic rewritten for maximum audience appeal.");
      }
    } catch (err) {
      toast("error", "Expansion Failed", "Could not broaden this topic.");
    } finally {
      setIsExpandingTAM(false);
    }
  }

  async function handleAnalyzePacing() {
    if (!script.trim()) {
      toast("error", "Script Required", "Generate a script first.");
      return;
    }
    setIsAnalyzingPacing(true);
    setFluffHighlights([]);
    try {
      const getStoredKey = (k: string) => {
        const v = localStorage.getItem(k);
        return v && v !== "undefined" && v !== "null" ? v.trim() : "";
      };
      const provider = getStoredKey("activeProvider") || "Gemini";
      let apiKey = "";
      if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
      else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
      else apiKey = getStoredKey("geminiApiKey");

      const res = await fetch("/api/analyze-pacing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, provider, apiKey, model: activeModel })
      });
      const data = await res.json();
      if (data.highlights) {
        setFluffHighlights(data.highlights);
        toast("success", "Pacing Analyzed", "Potential fluff has been highlighted in red.");
      }
    } catch (err) {
      toast("error", "Analysis Failed", "Could not analyze script pacing.");
    } finally {
      setIsAnalyzingPacing(false);
    }
  }

  const handleAutoMatchStructure = async () => {
    if (!topic.trim()) {
      toast("warning", "Topic Missing", "Please enter a topic first.");
      return;
    }

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const key = getStoredKey("geminiApiKey");
    if (!key && !settingsHasKeys) {
      toast("error", "API Key Missing", "Gemini API key is required for auto-matching.");
      return;
    }

    setIsAutoMatchingStructure(true);
    try {
      const prompt = `Based on this video topic, which of these 7 storytelling structures is the mathematically best fit?
      
      TOPIC: ${topic}
      
      STRUCTURES:
      1. Problem Solver: Best for Coaching, Self-Help
      2. Breakdown: Best for Product Launches, Tech, Analysis
      3. Listicle: Best for Atomic Tips, Multiple Parts
      4. Case Study Explainer: Best for Blueprints, Experiments
      5. Tutorial: Best for Step-by-Step Education
      6. Educational Storytelling: Best for 1st Person POV, Motivation
      7. Newscaster: Best for Journalism, News, Facts
      
      STRICT INSTRUCTION: Return ONLY the exact ID of the best structure from this list: problem-solver, breakdown, listicle, case-study-explainer, tutorial, educational-storytelling, newscaster.`;

      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
      const result = await model.generateContent(prompt);
      const suggestedId = result.response.text().trim().toLowerCase();

      // Clean up in case model returns markdown
      const cleanId = suggestedId.replace(/[^a-z-]/g, "");

      const matched = styleCards.find(c => c.id === cleanId);
      if (matched) {
        setSelectedStyleId(matched.id);
        toast("success", "✨ Structure Auto-Matched!", `Selected "${matched.title}" as the best fit.`);
      } else {
        toast("warning", "Match Uncertain", "The AI suggested a structure but it didn't match our exact list. Try picking manually.");
      }
    } catch (error) {
      console.error("Auto-match error:", error);
      toast("error", "Auto-Match Failed", "Could not determine the best structure automatically.");
    } finally {
      setIsAutoMatchingStructure(false);
    }
  };

  async function handleGenerateScript() {
    console.log("1. BUTTON CLICKED! Current Mode:", creationMode);
    setIsGeneratingScript(true);
    setScriptGenError("");

    try {
      if (creationMode === "remix") {
        console.log("2. Remix Mode Detected. Preparing payload...");
        if (!remixTranscript || !tweakAttribute) {
          setScriptGenError("Missing transcript or tweak attribute for remix.");
          setIsGeneratingScript(false);
          return;
        }

        const hookData = hookCards.find((c) => c.id === selectedHookId) || { title: "Curiosity Gap" };
        const styleData: { title: string; flow: string[] } = (styleCards.find((c) => c.id === selectedStyleId) as any) || { title: "Problem Solver", flow: ["Hook", "Problem", "Agitation", "Solution", "CTA"] };

        const remixPayload = {
          engine: activeModel,
          topic: topic || "Remix Strategy",
          transcript: remixTranscript,
          remixAttribute: tweakAttribute,
          language: activeLanguage,
          targetAudience: selectedClient?.targetAudience || (originalAnalysis as any)?.breakdownBlocks?.targetAudienceAndTone || "a general viral audience",
          videoGoal: scriptJob,
          emotion: emotionFilter,
          emotionIntensity: emotionIntensity,
          videoLength: videoLength,
          hookStyle: hookData.title,
          structureName: styleData.title,
          structureSteps: styleData.flow.join(" -> "),
          openaiApiKey: localStorage.getItem("openAiApiKey") || undefined,
          geminiApiKey: localStorage.getItem("geminiApiKey") || undefined,
          anthropicApiKey: localStorage.getItem("anthropicApiKey") || undefined,
        };

        console.log("3. Payload ready:", remixPayload);

        const response = await fetch("/api/generate-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(remixPayload)
        });

        console.log("4. Fetch completed. Status:", response.status);

        const data = await response.json();
        console.log("5. Data received from API:", data);

        if (data.script) {
          setScript(data.script);
          console.log("6. SUCCESS! Script set in UI.");
          toast("success", "Remix Engineered", `New ${tweakAttribute} strategy generated.`);
        } else {
          const errMsg = data.error || "Remix generation failed";
          setScriptGenError(errMsg);
          console.error("ERROR: No script returned. Data:", data);
        }
      } else {
        console.log("Scratch mode logic running...");
        // SCRATCH MODE LOGIC
        const userIdea = topic || remixData?.transcript || "A viral video concept.";
        if (!userIdea) {
          setScriptGenError("Provide a topic or transcript to generate.");
          setIsGeneratingScript(false);
          return;
        }
        const getStoredKey = (k: string) => {
          const v = localStorage.getItem(k);
          return v && v !== "undefined" && v !== "null" ? v.trim() : "";
        };
        const provider = getStoredKey("activeProvider") || "Gemini";
        let analysisApiKey = "";
        if (provider === "OpenAI") analysisApiKey = getStoredKey("openAiApiKey");
        else if (provider === "Anthropic") analysisApiKey = getStoredKey("anthropicApiKey");
        else analysisApiKey = getStoredKey("geminiApiKey");

        if (!analysisApiKey && !settingsHasKeys) {
          setScriptGenError(`${provider} API key missing. Add it in Settings.`);
          setIsGeneratingScript(false);
          return;
        }

        const model = activeModel || "gemini-3-flash-preview";
        const hookData = hookCards.find((c) => c.id === selectedHookId) || { title: "General Viral" };

        const rateRes = await fetch("/api/rate-hook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: userIdea,
            angle: selectedAngle,
            hookType: hookData.title,
            provider,
            apiKey: analysisApiKey,
            model
          })
        });

        const rateData = await rateRes.json();
        if (rateData.score < 8) {
          setHookGateData({ score: rateData.score, suggestions: rateData.suggestions });
          setShowHookGate(true);
          setIsGeneratingScript(false);
        } else {
          await finalizeScriptGeneration();
        }
      }
    } catch (error: any) {
      console.error("CRASH IN GENERATION:", error);
      setScriptGenError(error.message || "An unexpected error occurred during generation.");
    } finally {
      setIsGeneratingScript(false);
    }
  }

  async function finalizeScriptGeneration(overrideHook?: string) {
    const userIdea = topic || remixData?.transcript || "A viral video concept.";
    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };
    const provider = getStoredKey("activeProvider") || "Gemini";
    const hookData = hookCards.find((c) => c.id === selectedHookId) || { title: "General Viral" };
    const styleData = styleCards.find((c) => c.id === selectedStyleId) || { title: "Conversational" };

    setScriptGenError("");
    setIsGeneratingScript(true);
    setScript("");
    setShowHookGate(false);

    try {
      const scratchPayload = {
        engine: activeModel,
        topic: userIdea,
        executiveSummary: (remixData as any)?.blueprint?.executiveSummary || script,
        selectedAngle: selectedAngle?.statement || "",
        hookType: overrideHook || hookData.title,
        storyStructure: storyStructureOverride !== "Auto (from selection)" ? storyStructureOverride : styleData.title,
        hookStyle: overrideHook || hookData.title,
        structureName: styleData.title,
        structureSteps: (styleData as any).flow?.join(" -> ") || "",
        videoGoal: scriptJob,
        emotion: emotionFilter,
        intensity: emotionIntensity,
        emotionIntensity: emotionIntensity,
        videoLength,
        language: activeLanguage,
        targetAudience: selectedClient?.targetAudience || "a general viral audience",
        openaiApiKey: localStorage.getItem("openAiApiKey") || undefined,
        geminiApiKey: localStorage.getItem("geminiApiKey") || undefined,
        anthropicApiKey: localStorage.getItem("anthropicApiKey") || undefined,
      };

      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scratchPayload),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(errorData.message || (typeof errorData.error === 'string' ? errorData.error : null) || "Script generation failed");
      }

      const responseData = (await response.json()) as { script?: string };
      const generatedText = (responseData.script || "").trim();
      setScript(generatedText);
      toast("success", "Script Generated", "Your viral script is ready.");

      let generatedTitle = "New Script";
      if (remixData) {
        const creatorName = (remixData as any)?.post?.username || (remixData as any)?.channel?.name || "Creator";
        generatedTitle = `Remix: ${creatorName} Strategy`;
      } else if (topic) {
        generatedTitle = topic.length > 40 ? `${topic.substring(0, 40)}...` : topic;
      }
      const finalTitle = scriptTitle !== "New Script" ? scriptTitle : generatedTitle;
      setScriptTitle(finalTitle);

      const newScript = {
        id: (remixData as any)?.post?.id || `scr-${Date.now()}`,
        title: finalTitle,
        topic: topic,
        type: scriptType,
        content: generatedText,
        caption: generatedCaption || null,
        repurposed: repurposedText || null,
        scriptJob,
        directorsCut: directorsCutData || null,
        prompts: promptDirectorData || null,
        packaging: packagingData || null, // Save packaging data
        createdAt: new Date().toISOString(),
        videoUrl: (remixData as any)?.post?.videoUrl || ""
      };

      void saveScript(newScript);
    } catch (err) {
      setScriptGenError(err instanceof Error ? err.message : "Script generation failed");
      toast("error", "Generation Failed", err instanceof Error ? err.message : "Script generation failed");
    } finally {
      setIsGeneratingScript(false);
    }
  }

  async function saveScript(newScript: any) {
    try {
      // 1. Load existing scripts from API
      const loadRes = await fetch("/api/scripts/load");
      if (!loadRes.ok) {
        console.error("API Error: Loading scripts failed");
        return;
      }
      const { data } = await loadRes.json();
      const existingScripts = Array.isArray(data?.scripts) ? data.scripts : [];

      // 2. Append new script (or update if ID exists)
      const existingIndex = existingScripts.findIndex((s: any) => s.id === newScript.id);
      let updatedScripts;
      if (existingIndex > -1) {
        updatedScripts = [...existingScripts];
        updatedScripts[existingIndex] = { ...updatedScripts[existingIndex], ...newScript };
      } else {
        updatedScripts = [newScript, ...existingScripts];
      }

      // 3. Save to API
      await fetch("/api/scripts/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scripts: updatedScripts }),
      });

      // 4. Update legacy localStorage for compatibility
      localStorage.setItem("scripts_history", JSON.stringify(updatedScripts));
    } catch (err) {
      console.error("Failed to persist script:", err);
    }
  }

  async function handleImproveLogic() {
    const text = script.trim();
    if (!text || isImprovingScript) return;

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    const model = activeModel;
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    if (!apiKey && !settingsHasKeys) {
      setImproveError(`${provider} API key missing. Add it in Settings.`);
      toast("error", "API Key Missing", `${provider} API key missing. Add it in Settings.`);
      return;
    }

    const logicPrompt = `Rewrite this script to sound 100% natural and human. Remove AI-typical phrases (e.g., 'In a world...', 'Let's dive in'). Use 'um/ah' pauses if needed for realism, use slang appropriate for the target language, and ensure the logic flow is undeniable. Return ONLY the script. Write the final script strictly in this language: ${activeLanguage}.\n\n${text}`;

    setImproveError("");
    setIsImprovingScript(true);

    try {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: logicPrompt,
          provider,
          apiKey,
          model,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(payload.message || (typeof payload.error === 'string' ? payload.error : null) || "Improve script failed");
      }

      const payload = (await response.json()) as { text?: string };
      const newText = (payload.text || "").trim();
      setScript(newText);
      toast("success", "Script Improved", "Your script has been refined.");
    } catch (err) {
      setImproveError(err instanceof Error ? err.message : "Improve script failed");
      toast("error", "Improvement Failed", err instanceof Error ? err.message : "Improve script failed");
    } finally {
      setIsImprovingScript(false);
    }
  }

  async function handlePostGenAction(action: 'improve' | 'pacing' | 'visuals' | 'prompts' | 'caption' | 'brainstorm' | 'shorten') {
    if (!script.trim() || activeAction) return;

    setActiveAction(action);

    try {
      const endpoint = action === 'prompts' ? '/api/generate-prompts' : 
                      action === 'brainstorm' ? '/api/suggest-improvements' : 
                      '/api/script-actions';

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          action,
          pacingAnalysis: (action === 'improve' || action === 'shorten') ? pacingData : undefined,
          videoLength,
          clientProfile: selectedClient || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action failed");

      if (action === 'improve') {
        setScript(data.result);
        setPacingData(null);
        setImprovementLog(prev => ["Script rewritten for +10% retention", ...prev]);
        toast("success", "Script Improved", "Retention-focused rewrite applied.");
      } else if (action === 'shorten') {
        setScript(data.result);
        setPacingData(null);
        setImprovementLog(prev => ["Script shortened (15-20% word reduction)", ...prev]);
        toast("success", "Script Shortened", "Fluff cut. Retention speed increased.");
      } else if (action === 'caption') {
        setGeneratedCaption(data.result);
        toast("success", "Caption Generated", "Viral caption ready.");
      } else if (action === 'brainstorm') {
        setBrainstormSuggestions(data.suggestions);
        toast("success", "Brainstorm Ready", "3 tactical suggestions generated.");
      } else if (action === 'visuals') {
        setVisualCues(data.result);
        toast("success", "Visual Storyboard Ready", "Visual cues generated for your script.");
      } else if (action === 'prompts') {
        setImagePrompts(data.prompts || data.result);
        toast("success", "Image Prompts Ready", "Structured scene prompts generated.");
      } else if (action === 'pacing') {
        try {
          const raw = data.result;
          const firstBrace = raw.indexOf('{');
          const lastBrace = raw.lastIndexOf('}');
          const parsed: { segments: any[]; summary: string } = JSON.parse(raw.substring(firstBrace, lastBrace + 1));
          setPacingData(parsed as any);
          const slowCount = parsed.segments?.filter(s => s.status === 'Slow' || s.status === 'Critical').length ?? 0;
          toast(slowCount > 0 ? "info" : "success", "Pacing Analyzed", parsed.summary || `${slowCount} slow segment(s) found`);
        } catch {
          toast("info", "Pacing Analyzed", data.result.slice(0, 120));
        }
      } else {
        toast("success", "Action Complete", data.result.slice(0, 120) + "...");
        console.log(`Action [${action}] result:`, data.result);
      }
    } catch (error: any) {
      console.error(`Script Action [${action}] Error:`, error);
      toast("error", "Action Failed", error.message);
    } finally {
      setActiveAction(null);
    }
  }

  async function applyImprovement(suggestionObj: { title: string; suggestion: string; impact: string }) {
    setActiveAction('improving');
    try {
      const res = await fetch('/api/apply-improvement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, instruction: suggestionObj.suggestion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apply failed");
      setScript(data.newScript);
      setImprovementLog(prev => [suggestionObj.title, ...prev]);
      setBrainstormSuggestions(prev => prev ? prev.filter(s => s.title !== suggestionObj.title) : null);
      toast("success", "Improvement Applied", suggestionObj.title);
    } catch (error: any) {
      toast("error", "Apply Failed", error.message);
    } finally {
      setActiveAction(null);
    }
  }


  async function handleFinishStep1() {
    if (!topic.trim()) {
      toast("error", "Topic Required", "Please describe your topic first.");
      return;
    }

    if (scriptTitle === "New Script" && topic.trim() !== "") {
      setScriptTitle(topic.trim().substring(0, 50));
    }

    setActiveStep(2);
    setTimeout(() => scrollToSection("research"), 100);

    // If it's manual mode, we should generate research
    // If it's remix mode, we might already have it, but let's refresh/generate anyway for "Latest Advanced Research"
    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    const model = getStoredKey("activeModel") || "gemini-3-flash-preview";
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    if (!apiKey) return;

    const researchPrompt = `You are an expert investigative researcher. Topic: ${topic}. Provide a concise, high-impact "Executive Summary" of the latest advanced research, data points, and context for this topic. Output ONLY the summary text, no fluff.`;
    const clientProfile = selectedClient ? `${selectedClient.name} (${selectedClient.niche})` : "General Creator";

    try {
      const resp = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, provider, apiKey, model, clientProfile }),
      });

      if (!resp.ok) return;

      const data = await resp.json();
      setResearchData(data);

      if (data.facts && Array.isArray(data.facts)) {
        setShockingFacts(data.facts.sort((a: any, b: any) => b.score - a.score));
      }

      // Apply AI-generated title
      if (data.title) {
        setScriptTitle(data.title);
      }

      const summaryText = data.executiveSummary || "";
      
      if (isRemixMode && remixData) {
        setRemixData({
          ...remixData,
          blueprint: {
            ...(remixData.blueprint || {}),
            executiveSummary: summaryText,
            transcript: remixData.blueprint?.transcript || "",
            keyFacts: data.keyFacts || [],
          } as RemixBlueprint
        });
      } else {
        setRemixData({
          post: { id: "manual", caption: topic, videoUrl: "" } as any,
          analysis: { analysis: {} } as any,
          transcript: "",
          blueprint: {
            executiveSummary: summaryText,
            viralHooks: [],
            transcript: "",
            subject: topic,
            angle: "",
            payoff: "",
            keyFacts: data.keyFacts || [],
            preferredHookId: "",
            preferredStyleId: ""
          }
        });
        setIsRemixMode(true);
      }

      // Persist research immediately
      const draftId = (remixData as any)?.post?.id || `scr-${Date.now()}`;
      const draftTitle = scriptTitle !== "New Script" ? scriptTitle : (topic.length > 40 ? `${topic.substring(0, 40)}...` : topic);
      
      void saveScript({
        id: draftId,
        title: draftTitle,
        topic,
        hook: "",
        style: "",
        content: "",
        research: summaryText,
        hooks: [],
        caption: null,
        repurposed: null,
        scriptJob: "",
        directorsCut: null,
        prompts: null,
        packaging: null,
        createdAt: new Date().toISOString(),
        videoUrl: (remixData as any)?.post?.videoUrl || "",
      });
    } catch (err) {
      console.error("Research generation failed:", err);
    }
  }

  async function handleShortenScript() {
    const text = script.trim();
    if (!text || isShortening) return;

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    const model = activeModel;
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    if (!apiKey && !settingsHasKeys) {
      setImproveError(`${provider} API key missing. Add it in Settings.`);
      toast("error", "API Key Missing", `${provider} API key missing. Add it in Settings.`);
      return;
    }

    const shortenPrompt = `You are an expert editor for short-form video. Read this script: [${text}]. Your goal is to trim approximately 5 seconds of speaking time (about 12-15 words) while keeping the core meaning, hook, and CTA 100% intact. Remove filler words, redundant adjectives, or slightly long phrases. Keep the tone natural. Output ONLY the shortened script text. Language: ${activeLanguage}`;

    setImproveError("");
    setIsShortening(true);

    try {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: shortenPrompt,
          provider,
          apiKey,
          model,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(payload.message || (typeof payload.error === 'string' ? payload.error : null) || "Shorten script failed");
      }

      const payload = (await response.json()) as { text?: string };
      setScript((payload.text || "").trim());
      setPacingData(null);
      toast("success", "Script Shortened", "Your script is now more concise.");
    } catch (err) {
      setImproveError(err instanceof Error ? err.message : "Shorten script failed");
      toast("error", "Shorten Failed", err instanceof Error ? err.message : "Shorten script failed");
    } finally {
      setIsShortening(false);
    }
  }

  async function copyText(text: string, message = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      toast("success", message, "");
    } catch {
      toast("error", "Copy Failed", "Failed to copy text to clipboard.");
    }
  }

  const handleListen = async () => {
    if (!script) return;
    setIsPlayingTTS(true);
    setTtsError("");
    try {
      const apiKey = localStorage.getItem('sarvamApiKey');
      if (!apiKey) {
        alert('Please add your Sarvam API Key in Settings first.');
        setIsPlayingTTS(false);
        return;
      }

      // Strip [HOOK], [BODY], [CTA] style headers before sending to TTS
      const spokenText = script.replace(/\[.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: spokenText,
          language: activeLanguage,
          sarvamApiKey: apiKey
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.message || "Failed to generate audio");
        setIsPlayingTTS(false);
        return;
      }

      const data = await response.json();
      if (data.audioChunks && data.audioChunks.length > 0) {
        setAudioPlaylist(data.audioChunks);
        setCurrentTrack(0);
        setIsPlayingAudio(true);
      } else {
        alert("No audio generated.");
      }
    } catch (error) {
      console.error("TTS Error:", error);
      alert("Failed to generate audio. Check console.");
    } finally {
      setIsPlayingTTS(false);
    }
  };

  async function handleGenerateHooks() {
    const text = script.trim();
    if (isGeneratingHooks) return;

    if (!text) {
      toast("error", "Script Missing", "Please generate or write a script first.");
      return;
    }

    setHookGenError("");
    setIsGeneratingHooks(true);
    setAbHooks([]);
    setSelectedAbHookIndex(null);

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };
    const apiKey = getStoredKey("geminiApiKey");

    if (!apiKey && !settingsHasKeys) {
      toast("error", "API Key Missing", "Gemini API key is required for hook generation. Please add it in Settings.");
      setIsGeneratingHooks(false);
      return;
    }

    try {
      const response = await fetch("/api/generate-hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptBody: text, apiKey }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Hook generation failed");
      }

      const hooks = (await response.json()) as Array<{ type: string; text: string }>;
      setAbHooks(hooks);
      toast("success", "Hooks Generated", "4 context-aware variations are ready.");
    } catch (err) {
      setHookGenError(err instanceof Error ? err.message : "Hook generation failed");
      toast("error", "Hooks Failed", err instanceof Error ? err.message : "Failed to generate hook variations.");
    } finally {
      setIsGeneratingHooks(false);
    }
  }

  async function handleGenerateVisualPrompts() {
    const text = script.trim();
    if (!text || isGeneratingVisual) return;

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    const model = getStoredKey("activeModel") || "gemini-3-flash-preview";
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    if (!apiKey && !settingsHasKeys) {
      setVisualGenError(`${provider} API key missing. Add it in Settings.`);
      toast("error", "API Key Missing", `${provider} API key missing. Add it in Settings.`);
      return;
    }

    const directorPrompt = `You are an elite Hollywood DP and AI Prompt Engineer. Break this script down line-by-line. Output a STRICT JSON array of objects. Format: { "character_sheet": "Hyper-detailed physical description and wardrobe of the main subject", "shots": [ { "spoken_line": "...", "nano_banana_image_prompt": "Cinematic 35mm photography, RAW, 8k resolution, [SUBJECT], [ACTION], [LIGHTING], [BACKGROUND].", "kling_video_prompt": "Camera motion: [Pan/Zoom/Tracking]. Subject action: [Specific movement]. Lighting: [Dynamic/Cinematic]. Hyperrealistic physics." } ] }

Here is the script:
${text}`;

    setVisualGenError("");
    setIsGeneratingVisual(true);
    setVisualPrompts(null);

    try {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: directorPrompt,
          provider,
          apiKey,
          model,
          responseFormat: "json",
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(payload.message || (typeof payload.error === 'string' ? payload.error : null) || "Visual prompt generation failed");
      }

      const payload = (await response.json()) as { json?: VisualPrompts; text?: string };
      if (payload.json && payload.json.character_sheet && Array.isArray(payload.json.shots)) {
        setVisualPrompts(payload.json);
        toast("success", "Visual Prompts Generated", "Your visual prompts are ready.");
      } else if (payload.text) {
        // Try to parse text fallback
        try {
          const parsed = JSON.parse(payload.text) as VisualPrompts;
          setVisualPrompts(parsed);
          toast("success", "Visual Prompts Generated", "Your visual prompts are ready.");
        } catch {
          throw new Error("AI returned invalid JSON. Try again.");
        }
      } else {
        throw new Error("Empty response from AI.");
      }
    } catch (err) {
      setVisualGenError(err instanceof Error ? err.message : "Visual prompt generation failed");
      toast("error", "Visual Prompts Failed", err instanceof Error ? err.message : "Visual prompt generation failed");
    } finally {
      setIsGeneratingVisual(false);
    }
  }

  async function syncToNotion() {
    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const notionApiKey = getStoredKey("notionApiKey");
    const databaseId = getStoredKey("notionDatabaseId");

    if (!notionApiKey || !databaseId) {
      alert("Please add your Notion API Key and Database ID in Settings.");
      toast("error", "Notion Sync Failed", "Please add your Notion API Key and Database ID in Settings.");
      return;
    }

    const text = script.trim();
    if (!text) return;

    const hookType = selectedHook?.title || "Standard";

    setIsSyncingNotion(true);
    setNotionStatus("");

    try {
      const response = await fetch("/api/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Viral Video Script - ${new Date().toLocaleDateString()}`,
          script: text,
          hookType,
          notionApiKey,
          databaseId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(payload.message || (typeof payload.error === 'string' ? payload.error : null) || "Notion sync failed");
      }

      setNotionStatus("✅ Synced to Notion!");
      toast("success", "Synced to Notion!", "Your script has been successfully synced.");
      setTimeout(() => setNotionStatus(""), 4000);
    } catch (err) {
      setNotionStatus(err instanceof Error ? `❌ ${err.message}` : "❌ Notion sync failed");
      toast("error", "Notion Sync Failed", err instanceof Error ? err.message : "Notion sync failed");
      setTimeout(() => setNotionStatus(""), 5000);
    } finally {
      setIsSyncingNotion(false);
    }
  }

  async function handleAdaptScript() {
    const text = script.trim();
    if (!text || isAdapting) return;

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    const model = scriptLlm || getStoredKey("activeModel") || "gemini-3-flash-preview";
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    if (!apiKey && !settingsHasKeys) {
      setAdaptError(`${provider} API key missing. Add it in Settings.`);
      toast("error", "API Key Missing", `${provider} API key missing. Add it in Settings.`);
      return;
    }

    const lang = localeLang.replace(" (Default)", "");
    const adaptPrompt = `You are an expert cultural copywriter. Translate and adapt this short-form script into strictly ${lang}. CRITICAL INSTRUCTION: Do not just literally translate the words. You must adapt the slang, cultural references, and pacing so it sounds perfectly natural, native, and viral for a Gen-Z/Millennial audience speaking that specific language. ${lang === "Hinglish" ? "(Mix Hindi and English naturally in Roman script as used on Instagram Reels)." : ""} Return ONLY the final spoken script, no conversational fluff.\n\n${text}`;

    setAdaptError("");
    setIsAdapting(true);
    setAdaptedScript("");

    try {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: adaptPrompt, provider, apiKey, model }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(payload.message || (typeof payload.error === 'string' ? payload.error : null) || "Localization failed");
      }

      const payload = (await response.json()) as { text?: string };
      setAdaptedScript((payload.text || "").trim());
      toast("success", "Script Adapted", `Script adapted to ${lang}.`);
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : "Localization failed");
      toast("error", "Adaptation Failed", err instanceof Error ? err.message : "Localization failed");
    } finally {
      setIsAdapting(false);
    }
  }

  async function generateNewHook(style: string) {
    const text = script.trim();
    if (!text || isGeneratingHook) return;

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    const model = scriptLlm || getStoredKey("activeModel") || "gemini-3-flash-preview";
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    if (!apiKey && !settingsHasKeys) {
      setHookGenEngineError(`${provider} API key missing. Add it in Settings.`);
      toast("error", "API Key Missing", `${provider} API key missing. Add it in Settings.`);
      return;
    }

    const hookPrompt = `You are an expert viral copywriter. Read this script: ${text}. Write ONE single, punchy opening sentence to replace the current hook. The style of this hook MUST be: ${style}. Return ONLY the single sentence. Do not include quotes or conversational fluff.`;

    setHookEngineStyle(style);
    setHookGenEngineError("");
    setIsGeneratingHook(true);

    try {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: hookPrompt, provider, apiKey, model }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(payload.message || (typeof payload.error === 'string' ? payload.error : null) || "Hook generation failed");
      }

      const payload = (await response.json()) as { text?: string };
      const newHook = (payload.text || "").trim();
      if (!newHook) throw new Error("AI returned empty hook.");

      // Replace first sentence/line of the script
      const firstBreak = text.search(/[.!?]\s|\n/);
      if (firstBreak > 0) {
        // Find end of the sentence delimiter
        const delimEnd = text[firstBreak] === "\n" ? firstBreak + 1 : firstBreak + 2;
        setScript(newHook + " " + text.slice(delimEnd));
      } else {
        // Script is a single sentence — replace entirely
        setScript(newHook);
      }
      toast("success", "New Hook Generated", `Hook generated with style: ${style}.`);
    } catch (err) {
      setHookGenEngineError(err instanceof Error ? err.message : "Hook generation failed");
      toast("error", "Hook Generation Failed", err instanceof Error ? err.message : "Hook generation failed");
    } finally {
      setIsGeneratingHook(false);
      setHookEngineStyle("");
    }
  }

  async function handleGenerateImprovedHook() {
    if (isGeneratingImprovedSingleHook) return;
    const text = remixData?.transcript || script.trim();
    if (!text) return;

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    const model = scriptLlm || getStoredKey("activeModel") || "gemini-3-flash-preview";
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    if (!apiKey && !settingsHasKeys) {
      setImprovedSingleHookError(`${provider} API key missing.`);
      toast("error", "API Key Missing", `${provider} API key missing. Add it in Settings.`);
      return;
    }

    const style = selectedHook?.title || "Engaging";
    const hookPrompt = `You are an expert viral copywriter. Read this video content: ${text}. Write ONE single, punchy opening sentence to replace the current hook. The style of this hook MUST be: ${style}. Return ONLY the single sentence. Do not include quotes or conversational fluff.`;

    setImprovedSingleHookError("");
    setIsGeneratingImprovedSingleHook(true);

    try {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: hookPrompt, provider, apiKey, model }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(payload.message || (typeof payload.error === 'string' ? payload.error : null) || "Hook generation failed");
      }
      const payload = await response.json();
      const newHook = (payload.text || "").trim();
      if (!newHook) throw new Error("AI returned empty hook.");
      setImprovedSingleHook(newHook);
      toast("success", "Improved Hook Generated", "A new improved hook is ready.");
    } catch (err) {
      setImprovedSingleHookError(err instanceof Error ? err.message : "Generation failed");
      toast("error", "Hook Generation Failed", err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGeneratingImprovedSingleHook(false);
    }
  }

  function applyHookToScript(newHookText: string, index: number) {
    const text = script.trim();
    if (!text) {
      setScript(newHookText);
    } else {
      const firstBreak = text.search(/[.!?]\s|\n/);
      if (firstBreak > 0) {
        const delimEnd = text[firstBreak] === "\n" ? firstBreak + 1 : firstBreak + 2;
        setScript(newHookText.trim() + " " + text.slice(delimEnd));
      } else {
        setScript(newHookText.trim());
      }
    }

    // Visual feedback
    setAppliedHookIndex(index);
    toast("info", "Hook Applied", "The new hook has been applied to your script.");
    setTimeout(() => setAppliedHookIndex(null), 2000);
  }

  async function handleGenerateCaption() {
    const text = script.trim();
    if (!text || isGeneratingCaption) return;

    setIsGeneratingCaption(true);
    setGeneratedCaption(null);

    try {
      const response = await fetch("/api/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptBody: text }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Caption generation failed");
      }

      const payload = (await response.json()) as { caption?: string };
    } finally {
      setIsGeneratingCaption(false);
    }
  }

  async function handleGeneratePromptDirector() {
    const text = script.trim();
    if (!text || isGeneratingPromptDirector) return;

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    const model = activeModel || "gemini-3-flash-preview";
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    if (!apiKey && !settingsHasKeys) {
      setPromptDirectorError(`${provider} API key missing. Add it in Settings.`);
      toast("error", "API Key Missing", `${provider} API key missing. Add it in Settings.`);
      return;
    }

    const elitePrompt = `You are a world-class Cinematic Director and Prompt Engineer for AI video generators (Kling, Luma, Runway).
Read this script carefully: [${text}]

Your mission is to generate a character identity and a sequence of HIGH-DETAIL cinematic prompts.

CRITICAL RULES:
1. ANALYZE every line of the script. 
2. If a line is just the speaker talking (e.g., introductions, transitions, or verbal fillers), or if it doesn't represent a strong visual moment, you MUST set "image_prompt" and "video_prompt" strictly to "IGNORE".
3. For visual moments:
   - IMAGE PROMPT: [Subject], [Action], [Environment/Setting], [Cinematic Lighting: e.g., volumetric, teal and orange, moody shadows], [Camera Specs: e.g., 35mm lens, f/1.8], [Style: Cinematic, 8k, photorealistic].
   - VIDEO PROMPT: [Camera Movement: e.g., slow drone sweep, tracking shot], [Subject Motion: e.g., hair blowing, dust particles], [High-end CGI physics].
4. Output ONLY a valid JSON object. No markdown preamble or post-amble.
5. Format:
{
  "character_identity": "Physical description of the protagonist (age, outfit, hair style, vibe) to maintain consistency.",
  "prompts": [
    {
      "spoken_line": "The exact line from the script",
      "image_prompt": "IGNORE or detailed prompt",
      "video_prompt": "IGNORE or detailed prompt"
    }
  ]
}

LANGUAGE: ${activeLanguage}`;

    setPromptDirectorError("");
    setIsGeneratingPromptDirector(true);
    setPromptDirectorData(null);

    try {
      const response = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: elitePrompt, provider, apiKey, model, responseFormat: "json" }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(payload.message || (typeof payload.error === 'string' ? payload.error : null) || "Prompt generation failed");
      }

      const payload = (await response.json()) as { json?: PromptDirectorData; text?: string };
      let parsedData: PromptDirectorData | null = null;

      if (payload.json && payload.json.character_identity && Array.isArray(payload.json.prompts)) {
        parsedData = payload.json;
      } else if (payload.text) {
        let cleaned = payload.text;
        // Strip markdown code blocks
        cleaned = cleaned.replace(/```json/g, "").replace(/```/g, "").trim();

        // Find JSON boundaries
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");

        if (firstBrace >= 0 && lastBrace > firstBrace) {
          try {
            const data = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as PromptDirectorData;
            if (data.character_identity && Array.isArray(data.prompts)) {
              parsedData = data;
            }
          } catch (e) {
            console.error("JSON parse error:", e);
          }
        }
      }

      if (parsedData) {
        setPromptDirectorData(parsedData);
        toast("success", "Prompt Director Generated", "Detailed prompts for AI video are ready.");
      } else {
        throw new Error("AI failed to return valid production data. Please try again.");
      }
    } catch (err) {
      setPromptDirectorError(err instanceof Error ? err.message : "Prompt generation failed");
      toast("error", "Prompt Director Failed", err instanceof Error ? err.message : "Prompt generation failed");
    } finally {
      setIsGeneratingPromptDirector(false);
    }
  }

  async function handleRepurpose(platform: string) {
    const text = script.trim();
    if (!text || isRepurposing) return;

    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };

    const provider = getStoredKey("activeProvider") || "Gemini";
    let analysisApiKey = "";
    if (provider === "OpenAI") analysisApiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") analysisApiKey = getStoredKey("anthropicApiKey");
    else analysisApiKey = getStoredKey("geminiApiKey");

    if (!analysisApiKey && !settingsHasKeys) {
      setRepurposeError(`${provider} API key missing. Add it in Settings.`);
      toast("error", "API Key Missing", `${provider} API key missing. Add it in Settings.`);
      return;
    }

    const model = activeModel;

    let strictPrompt = `Based on this script: ${text}\n\nRewrite it as a ${platform}. CRITICAL INSTRUCTION: Return ONLY the final requested content. Do not include any conversational filler, pleasantries, or introductions like 'Here is your thread' or 'Sure!'. Start immediately with the first word of the content. Do not use markdown code blocks. Write the final script strictly in this language: ${activeLanguage}.`;
    if (platform === "Twitter/X Thread") {
      strictPrompt = `Convert this video script into a viral X/Twitter thread. RULES: Post 1 must be a high-impact hook with a bold claim. Posts 2-5 must deliver tactical value with aggressive line breaks. Post 6 is the conclusion. Do not use cringe emojis. Output ONLY the thread text. Write the final thread strictly in this language: ${activeLanguage}.\n\nScript: ${text}`;
    } else if (platform === "LinkedIn Post") {
      strictPrompt = `Convert this script into a premium LinkedIn post. RULES: Use the 'Broetry' format (short sentences, heavy line breaks). Start with a contrarian hook. Use 3-4 bullet points for value. End with a thought-provoking question for the comments. Output ONLY the post text. Write the final post strictly in this language: ${activeLanguage}.\n\nScript: ${text}`;
    }

    setRepurposeError("");
    setRepurposePlatform(platform);
    setRepurposedText("");
    setIsRepurposing(true);

    try {
      const response = await fetch("/api/repurpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: text,
          platform,
          language: activeLanguage,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string | boolean; message?: string };
        throw new Error(payload.message || (typeof payload.error === 'string' ? payload.error : null) || "Repurposing failed");
      }

      const payload = (await response.json()) as { repurposedContent?: string };
      setRepurposedText((payload.repurposedContent || "").trim());
      toast("success", "Content Repurposed", `Script repurposed for ${platform}.`);
    } catch (err) {
      setRepurposeError(err instanceof Error ? err.message : "Repurposing failed");
      toast("error", "Repurposing Failed", err instanceof Error ? err.message : "Repurposing failed");
    } finally {
      setIsRepurposing(false);
    }
  }

  function downloadScript() {
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(remixData as any)?.post?.id || "script"}-draft.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("success", "Script Downloaded", "Your script has been downloaded.");
  }

  return (
    <div className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10 pb-[100px]">
      <div className="max-w-[1000px] mx-auto w-full">

        {/* HEADER */}
        <header className="mb-[24px] flex flex-col gap-[8px] mt-[10px]">
          <Link
            href="/scripts"
            className="w-fit inline-flex items-center gap-[6px] rounded-[8px] bg-transparent pb-[4px] pt-[2px] pr-[12px] text-[12px] font-['DM_Sans'] font-[500] text-[#8892A4] hover:text-[#F0F2F7] transition cursor-pointer"
          >
            ← Back to Dashboard
          </Link>
          <div className="mt-[12px] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-[12px] flex-wrap">
              <h1 className="font-['Syne'] font-[800] text-[22px] text-[#F0F2F7]">
                Script Studio
              </h1>
              {/* Glass Title Pill */}
              <div className="glass-surface glow-cyan px-5 py-2 rounded-2xl inline-flex items-center gap-2">
                <span className="text-cyan-400 font-bold tracking-widest uppercase text-[9px] whitespace-nowrap font-['JetBrains_Mono']">Script Name:</span>
                <input
                  type="text"
                  value={scriptTitle}
                  onChange={(e) => setScriptTitle(e.target.value)}
                  className="bg-transparent border-none text-white text-sm font-extrabold focus:outline-none focus:ring-0 placeholder-white/30 min-w-[160px]"
                  placeholder="Name your script..."
                />
                {saveStatus === "saving" && <span className="text-[9px] text-white/40 font-['JetBrains_Mono'] whitespace-nowrap">Saving...</span>}
                {saveStatus === "saved" && <span className="text-[9px] text-emerald-400 font-['JetBrains_Mono'] whitespace-nowrap">✓ Saved</span>}
              </div>
              <span className={`font-['JetBrains_Mono'] text-[10px] px-[10px] py-[2px] rounded-[4px] border ${creationMode === "remix" ? "bg-cyan-400/10 border-cyan-400/30 text-cyan-400" : "bg-emerald-400/10 border-emerald-400/30 text-emerald-400"}`}>
                {creationMode === "remix" ? "Remix Mode" : "Manual Mode"}
              </span>
            </div>
          </div>
        </header>

        <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 w-fit mb-8">
          <button 
            onClick={() => setCreationMode("scratch")}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${creationMode === "scratch" ? "bg-white/10 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]" : "text-white/50 hover:text-white"}`}
          >
            ✍️ Create from Scratch
          </button>
          <button 
            onClick={() => setCreationMode("remix")}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${creationMode === "remix" ? "bg-white/10 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]" : "text-white/50 hover:text-white"}`}
          >
            🔄 Engineering Remix
          </button>
        </div>

        {creationMode === "scratch" && (
          <>
        {/* STEP 1: TOPIC */}
        <section className="glass-surface rounded-2xl overflow-hidden mb-[14px] transition-all duration-300">
          <div
            onClick={() => setActiveStep(activeStep === 1 ? 0 : 1)}
            className="flex items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
          >
            <div className="flex items-center gap-[12px]">
              <div className={`font-['JetBrains_Mono'] text-[10px] w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center ${activeStep >= 1 ? "bg-[rgba(59,255,200,0.1)] border-[rgba(59,255,200,0.3)] text-[#3BFFC8]" : "border-[rgba(255,255,255,0.15)] text-[#5A6478]"}`}>
                1
              </div>
              <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Describe your Topic</h2>
            </div>
            <div className="flex items-center gap-[12px]">
              {activeStep === 1 && (
                <div className="flex items-center gap-[6px] mr-[12px]" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setTopic("")} className="w-[28px] h-[28px] flex items-center justify-center rounded-full border border-transparent hover:bg-[rgba(255,255,255,0.08)] transition group cursor-pointer"><span className="text-[#8892A4] group-hover:text-[#F0F2F7] text-[12px]">✕</span></button>
                  <button onClick={() => void navigator.clipboard.writeText(topic)} className="w-[28px] h-[28px] flex items-center justify-center rounded-full border border-transparent hover:bg-[rgba(255,255,255,0.08)] transition group cursor-pointer"><span className="text-[#8892A4] group-hover:text-[#F0F2F7] text-[12px]">⧉</span></button>
                </div>
              )}
              <span className={`text-[#5A6478] transition-transform duration-300 ${activeStep === 1 ? "rotate-180" : ""}`}>▼</span>
            </div>
          </div>

          {activeStep === 1 && (
            <div className="p-[18px] space-y-6">
              {/* CLIENT SELECTOR */}
              <div className="space-y-3 pb-2">
                <div className="flex items-center justify-between">
                  <label className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.15em] text-[#5A6478] flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    Select Client Profile
                  </label>
                  {selectedClient && (
                    <div className="flex items-center gap-1.5 text-[10px] text-[#3BFFC8] bg-[#3BFFC8]/10 px-2 py-0.5 rounded-full border border-[#3BFFC8]/20 animate-pulse">
                      <CheckCircle2 className="w-3 h-3" />
                      Profile Loaded
                    </div>
                  )}
                </div>
                
                <div className="relative group">
                  <select 
                    value={selectedClientId || ""}
                    onChange={(e) => setSelectedClientId(e.target.value || null)}
                    className="w-full bg-[#111620]/60 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3.5 text-[#F0F2F7] text-[13.5px] appearance-none cursor-pointer focus:border-[#3BFFC8]/50 focus:ring-1 focus:ring-[#3BFFC8]/20 transition-all outline-none"
                  >
                    <option value="" className="bg-[#111620]">Personal Account / Default</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id} className="bg-[#111620]">{c.name} ({c.niche})</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#5A6478] group-hover:text-[#F0F2F7] transition-colors">
                    ▼
                  </div>
                </div>

                {selectedClient && (
                  <div className="flex items-center flex-wrap gap-4 pt-1 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8892A4]">
                      <Globe className="w-3.5 h-3.5 text-[#5A6478]" />
                      <span>{selectedClient.language}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8892A4]">
                       <Zap className="w-3.5 h-3.5 text-[#5A6478]" />
                       <span>{selectedClient.duration} Target</span>
                    </div>
                    {selectedClient.styleDNA && Object.keys(selectedClient.styleDNA).length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#A78BFA]">
                        <User className="w-3.5 h-3.5 opacity-70" />
                        <span>Style DNA Active</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.15em] text-[#5A6478]">Script Topic</label>
                <textarea
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Describe the exact topic or transformation you want this script to cover..."
                  className="min-h-[120px] w-full resize-y bg-[#080A0F]/40 backdrop-blur-md border border-white/5 rounded-xl p-4 text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all font-['DM_Sans'] text-[13.5px] leading-[1.6] placeholder:text-[#5A6478]"
                />
              </div>
              <div className="flex items-center justify-between mt-[6px]">
                <div className="font-['JetBrains_Mono'] text-[10px] text-[#5A6478]">{topic.length} chars</div>
                <div className="flex gap-[12px] mt-[12px]">
                  <button
                    onClick={handleExpandTAM}
                    disabled={isExpandingTAM || !topic.trim()}
                    className="px-4 py-2 glass-surface border-cyan-500/50 text-cyan-400 rounded-lg hover:glow-cyan text-[11px] font-bold transition-all disabled:opacity-50"
                  >
                    {isExpandingTAM ? "Expanding..." : "Expand TAM ➔"}
                  </button>
                  <button
                    onClick={handleFinishStep1}
                    className="bg-[#3BFFC8] text-[#080A0F] p-[8px_16px] rounded-[8px] font-['DM_Sans'] text-[12.5px] font-[600] hover:opacity-90 cursor-pointer transition-colors shadow-[0_4px_12px_rgba(59,255,200,0.2)]"
                  >
                    Save & Generate Research
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* STEP 2: RESEARCH */}
        <section className="glass-surface rounded-2xl overflow-hidden mb-[14px] transition-all duration-300">
          <div
            onClick={() => setActiveStep(activeStep === 2 ? 0 : 2)}
            className="flex items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
          >
            <div className="flex items-center gap-[12px]">
              <div className={`font-['JetBrains_Mono'] text-[10px] w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center ${activeStep >= 2 ? "bg-[rgba(59,255,200,0.1)] border-[rgba(59,255,200,0.3)] text-[#3BFFC8]" : "border-[rgba(255,255,255,0.15)] text-[#5A6478]"}`}>
                2
              </div>
              <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Review the Research</h2>
            </div>
            <span className={`text-[#5A6478] transition-transform duration-300 ${activeStep === 2 ? "rotate-180" : ""}`}>▼</span>
          </div>

          {activeStep === 2 && (
            <div className="p-[18px]">
              {researchData ? (
                <div className="flex flex-col gap-6 bg-[#111620] border border-[rgba(255,255,255,0.05)] rounded-lg p-6">
                  
                  {/* Executive Summary */}
                  <div>
                    <h4 className="text-[13px] font-bold text-white mb-2 font-['DM_Sans']">Executive Summary</h4>
                    <p className="text-[#8892A4] text-[13px] leading-relaxed font-['DM_Sans']">{researchData.executiveSummary}</p>
                  </div>

                  {/* How To Engage Viewers */}
                  {(researchData.engagementAngles || researchData.engagementLines) && (
                    <div>
                      <h4 className="text-[13px] font-bold text-white mb-2 font-['DM_Sans']">How To Engage Viewers</h4>
                      <ul className="list-disc pl-5 flex flex-col gap-2">
                        {(researchData.engagementAngles || researchData.engagementLines || []).map((angle: string, i: number) => (
                          <li key={i} className="text-[#8892A4] text-[13px] leading-relaxed font-['DM_Sans']">{angle}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Surprising Facts (Keeps your scoring system!) */}
                  <div>
                    <h4 className="text-[13px] font-bold text-white mb-2 font-['DM_Sans'] flex items-center gap-2">
                      Surprising Facts <span className="text-[9px] bg-[#3BFFC8]/10 text-[#3BFFC8] px-2 py-0.5 rounded tracking-widest uppercase">VIRAL SCORED</span>
                    </h4>
                    <ul className="flex flex-col gap-3">
                      {(researchData.facts || []).map((fact: any, i: number) => (
                        <li key={i} className="flex gap-3 items-start bg-[rgba(255,255,255,0.02)] p-3 rounded-md border border-[rgba(255,255,255,0.03)]">
                          <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded text-[11px] font-bold ${fact.score >= 90 ? 'bg-[#FF3B57]/20 text-[#FF3B57]' : fact.score >= 80 ? 'bg-[#3BFFC8]/20 text-[#3BFFC8]' : 'bg-white/10 text-white'}`}>
                            {fact.score}
                          </div>
                          <p className="text-[#8892A4] text-[13px] leading-relaxed font-['DM_Sans']">{fact.statement}</p>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Contrast Moments */}
                  {researchData.contrastMoments && (
                    <div>
                      <h4 className="text-[13px] font-bold text-white mb-2 font-['DM_Sans']">Contrast Moments</h4>
                      <ul className="list-disc pl-5 flex flex-col gap-2">
                        {researchData.contrastMoments.map((moment: string, i: number) => (
                          <li key={i} className="text-[#8892A4] text-[13px] leading-relaxed font-['DM_Sans']">{moment}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-emerald-500/50 border border-dashed border-emerald-500/20 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
                  <span className="text-sm font-medium">Research will appear here after you save your topic.</span>
                </div>
              )}
              <div className="flex justify-end mt-[16px]">
                <button onClick={() => setActiveStep(3)} className="bg-[#3BFFC8] text-[#080A0F] p-[8px_16px] rounded-[8px] font-['DM_Sans'] text-[12.5px] cursor-pointer font-[600] border border-[rgba(59,255,200,0.2)] hover:opacity-90 transition-colors">
                  Continue
                </button>
              </div>
            </div>
          )}
        </section>
        </>
        )}

        {creationMode === "remix" && (
          <div className="space-y-6 mb-[16px]">
            {/* Client Profile Selector */}
            <div className="mb-6 bg-[#0A0A0A] border border-white/5 rounded-xl p-6">
              <p className="text-[10px] uppercase tracking-widest text-white/50 mb-3">Select Client Profile</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.15em] text-[#5A6478] flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    Client Profile
                  </label>
                  {selectedClient && (
                    <div className="flex items-center gap-1.5 text-[10px] text-[#3BFFC8] bg-[#3BFFC8]/10 px-2 py-0.5 rounded-full border border-[#3BFFC8]/20 animate-pulse">
                      <CheckCircle2 className="w-3 h-3" />
                      Profile Loaded
                    </div>
                  )}
                </div>
                <div className="relative group">
                  <select
                    value={selectedClientId || ""}
                    onChange={(e) => setSelectedClientId(e.target.value || null)}
                    className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-cyan-500/50 transition-colors cursor-pointer"
                  >
                    <option value="" className="bg-[#111620]">Personal Account / Default</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id} className="bg-[#111620]">{c.name} ({c.niche})</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#5A6478] group-hover:text-[#F0F2F7] transition-colors">
                    ▼
                  </div>
                </div>
                {selectedClient && (
                  <div className="flex items-center flex-wrap gap-4 pt-1 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8892A4]">
                      <Globe className="w-3.5 h-3.5 text-[#5A6478]" />
                      <span>{selectedClient.language}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8892A4]">
                      <Zap className="w-3.5 h-3.5 text-[#5A6478]" />
                      <span>{selectedClient.duration} Target</span>
                    </div>
                    {selectedClient.styleDNA && Object.keys(selectedClient.styleDNA).length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#A78BFA]">
                        <User className="w-3.5 h-3.5 opacity-70" />
                        <span>Style DNA Active</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Step 1: Paste Winning Script */}
            <section className="glass-surface rounded-2xl overflow-hidden">
              <div className="p-[16px_20px] border-b border-[rgba(255,255,255,0.06)]">
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Step 1: Paste Winning Script or URL</h2>
              </div>
              <div className="p-[18px]">
                <textarea
                  value={remixTranscript}
                  onChange={(e) => setRemixTranscript(e.target.value)}
                  placeholder="Paste outlier transcript here..."
                  className="w-full bg-[#111620]/60 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3.5 text-[#F0F2F7] text-[13.5px] focus:border-[#3BFFC8]/50 focus:ring-1 focus:ring-[#3BFFC8]/20 transition-all outline-none min-h-[120px] resize-y"
                />
              </div>
            </section>
            
            {/* Step 2: Hold 4, Tweak 1 */}
            <section className="glass-surface rounded-2xl overflow-hidden">
              <div className="p-[16px_20px] border-b border-[rgba(255,255,255,0.06)]">
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Step 2: Hold 4, Tweak 1</h2>
              </div>
              <div className="p-[18px] space-y-6">
                <div>
                  <h3 className="font-['Syne'] font-[700] text-[#F0F2F7] text-[13px] mb-3">Select the attribute to re-engineer (locking the rest)</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {["Idea", "Format", "Hook", "Script", "Visual"].map((attr) => (
                      <button
                        key={attr}
                        onClick={() => setTweakAttribute(attr)}
                        className={`p-3 rounded-xl font-['DM_Sans'] text-xs font-bold transition-all border
                          ${tweakAttribute === attr 
                            ? "bg-cyan-500/20 border-cyan-400 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)]" 
                            : "bg-white/[0.03] border-white/10 text-gray-400 hover:bg-white/[0.08] hover:text-white"
                          }
                        `}
                      >
                        {attr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* STEP 3: HOOKS */}
        <section className="glass-surface rounded-2xl overflow-hidden mb-[14px] transition-all duration-300">
          <div
            onClick={() => setActiveStep(activeStep === 3 ? 0 : 3)}
            className="flex items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
          >
            <div className="flex items-center gap-[12px]">
              <div className={`font-['JetBrains_Mono'] text-[10px] w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center ${activeStep >= 3 ? "bg-[rgba(59,255,200,0.1)] border-[rgba(59,255,200,0.3)] text-[#3BFFC8]" : "border-[rgba(255,255,255,0.15)] text-[#5A6478]"}`}>
                3
              </div>
              <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Choose a Hook</h2>
            </div>
            <span className={`text-[#5A6478] transition-transform duration-300 ${activeStep === 3 ? "rotate-180" : ""}`}>▼</span>
          </div>

          {activeStep === 3 && (
            <div className="p-[18px]">
              <div className="mb-[20px] p-[16px] rounded-[12px] glass-surface border border-[rgba(59,255,200,0.15)] bg-gradient-to-r from-[rgba(59,255,200,0.05)] to-[rgba(167,139,250,0.05)] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-[#3BFFC8] opacity-10 rounded-full blur-[50px] transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                <h3 className="font-['Syne'] font-[700] text-[12px] text-[#3BFFC8] uppercase tracking-[0.1em] mb-[12px]">The 4 Hook Commandments</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-[12px]">
                  {[ 
                    { title: "ALIGNMENT", desc: "Hook matches payoff" }, 
                    { title: "SPEED TO VALUE", desc: "No fluff intros" }, 
                    { title: "CLARITY", desc: "Don't be clever, be clear" }, 
                    { title: "CURIOSITY GAP", desc: "Withhold the punchline" } 
                  ].map(cmd => (
                    <div key={cmd.title} className="flex flex-col">
                      <span className="font-['JetBrains_Mono'] font-[700] text-[11px] text-[#F0F2F7] mb-[2px]">{cmd.title}</span>
                      <span className="font-['DM_Sans'] text-[10px] text-[#8892A4]">{cmd.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-[8px] mb-[16px]">
                {hookTagOptions.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setHookTagFilter(tag)}
                    className={`px-[12px] py-[6px] rounded-[8px] font-['DM_Sans'] text-[12px] transition-all ${hookTagFilter === tag ? "bg-[#3BFFC8] text-[#080A0F]" : "bg-[#111620] text-[#8892A4] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.2)]"}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-[10px] mb-[16px]">
                {(filteredHookCards.length > 0 ? filteredHookCards : hookCards).map((card) => {
                  const active = card.id === selectedHookId;
                  
                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        setSelectedHookId(card.id);
                        setActiveStep(4);
                        setTimeout(() => scrollToSection("style"), 100);
                      }}
                      className={`rounded-[10px] p-[14px] cursor-pointer transition-all duration-150 border flex flex-col justify-between ${active ? "border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.04)] shadow-[0_0_0_2px_rgba(16,185,129,0.15)]" : "border-[rgba(255,255,255,0.06)] bg-[#111620] hover:border-[rgba(255,255,255,0.14)] hover:bg-[rgba(255,255,255,0.01)]"}`}
                    >
                      <div>
                        <div className="flex items-start justify-between mb-[8px]">
                          <span className={`rounded-full px-[8px] py-[3px] font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.05em] text-[#3BFFC8] bg-[rgba(59,255,200,0.08)] border border-[rgba(59,255,200,0.2)]`}>
                            {card.tag}
                          </span>
                          <span className="font-['JetBrains_Mono'] text-[9px] text-[#A78BFA] bg-[rgba(167,139,250,0.1)] px-[6px] py-[2px] rounded-full border border-[rgba(167,139,250,0.22)]">
                            Pairs w/ {card.bestPairedWith.split(',')[0]}
                          </span>
                        </div>
                        <p className="font-['Syne'] text-[13.5px] font-[700] text-[#F0F2F7] mb-[6px]">{card.title}</p>
                        <p className="font-['DM_Sans'] text-[12px] text-[#8892A4] leading-[1.4] mb-[12px]">{card.psychology}</p>
                      </div>
                      <p className="font-['Georgia'] italic text-[11.5px] text-[#F0F2F7] opacity-80 border-l-2 border-[rgba(255,255,255,0.15)] pl-[8px]">"{card.example}"</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* STEP 4: STORY STRUCTURE */}
        <section className="glass-surface rounded-2xl overflow-hidden mb-[14px] transition-all duration-300">
          <div
            onClick={() => setActiveStep(activeStep === 4 ? 0 : 4)}
            className="flex items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
          >
            <div className="flex items-center gap-[12px]">
              <div className={`font-['JetBrains_Mono'] text-[10px] w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center ${activeStep >= 4 ? "bg-[rgba(59,255,200,0.1)] border-[rgba(59,255,200,0.3)] text-[#3BFFC8]" : "border-[rgba(255,255,255,0.15)] text-[#5A6478]"}`}>
                4
              </div>
              <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Choose a Story Structure</h2>
            </div>
            <span className={`text-[#5A6478] transition-transform duration-300 ${activeStep === 4 ? "rotate-180" : ""}`}>▼</span>
          </div>

          {activeStep === 4 && (
            <div className="p-[18px]">
              <div className="flex justify-end mb-[12px]">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleAutoMatchStructure(); }}
                  disabled={isAutoMatchingStructure || !topic}
                  className="flex items-center gap-[6px] p-[6px_12px] bg-[rgba(59,255,200,0.1)] border border-[rgba(59,255,200,0.3)] rounded-[6px] text-[#3BFFC8] font-['JetBrains_Mono'] text-[11px] font-[600] transition-all hover:bg-[rgba(59,255,200,0.2)] hover:shadow-[0_0_15px_rgba(59,255,200,0.2)] disabled:opacity-50"
                >
                  {isAutoMatchingStructure ? "Matching..." : "✨ Auto-Match Structure"}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-[16px]">
                {styleCards.map((card) => {
                  const active = card.id === selectedStyleId;
                  
                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        setSelectedStyleId(card.id);
                        setActiveStep(5);
                        setTimeout(() => scrollToSection("script"), 100);
                      }}
                      className={`rounded-[10px] p-[14px] cursor-pointer transition-all duration-150 border flex flex-col justify-between ${active ? "border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.04)] shadow-[0_0_0_2px_rgba(16,185,129,0.15)]" : "border-[rgba(255,255,255,0.06)] bg-[#111620] hover:border-[rgba(255,255,255,0.14)] hover:bg-[rgba(255,255,255,0.01)]"}`}
                    >
                      <div>
                        <div className="flex items-start justify-between mb-[8px]">
                          <span className="rounded-full px-[8px] py-[3px] font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.05em] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20">
                            {card.category}
                          </span>
                          <span className="font-['JetBrains_Mono'] text-[9px] text-[#A78BFA] bg-[rgba(167,139,250,0.1)] px-[6px] py-[2px] rounded-full border border-[rgba(167,139,250,0.22)]">
                            Pairs w/ {card.pairsWithHook}
                          </span>
                        </div>
                        <p className="font-['Syne'] text-[13.5px] font-[700] text-[#F0F2F7] mb-[6px]">{card.title}</p>
                        <p className="font-['DM_Sans'] text-[12px] text-[#8892A4] leading-[1.4]">{card.description}</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-white/5 text-[11.5px] text-white/50 italic font-['Georgia']">
                        "{card.flow.join(' → ')}"
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* STEP 5: GENERATION ENGINE */}
        <section className={`glass-surface glow-cyan rounded-[14px] overflow-hidden mb-[16px] transition-all duration-300 ${activeStep === 5 ? "opacity-100 shadow-[0_0_30px_rgba(59,255,200,0.03)]" : "opacity-80"}`}>
          <div
            onClick={() => setActiveStep(5)}
            className="flex flex-col md:flex-row items-start md:items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.08)] gap-[12px] cursor-pointer relative"
          >
            <div className="flex items-center gap-[8px]">
              <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">🤖 Generation Engine</h2>
            </div>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void handleGenerateScript(); }}
              className="relative z-[999] pointer-events-auto bg-[#3BFFC8] text-[#080A0F] p-[9px_18px] rounded-[8px] font-['DM_Sans'] text-[12.5px] font-[700] shadow-[0_0_16px_rgba(59,255,200,0.25)] cursor-pointer hover:shadow-[0_0_24px_rgba(59,255,200,0.4)] transition"
            >
              {isGeneratingScript ? "Generating..." : "✦ Generate Viral Script"}
            </button>
          </div>

          <div className="p-[14px_20px] border-b border-[rgba(255,255,255,0.08)] flex items-center gap-[10px] flex-wrap bg-[rgba(17,22,32,0.4)]">
            <select
              value={activeModel}
              onChange={(e) => setActiveModel(e.target.value)}
              className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-[7px] p-[6px_28px_6px_10px] font-['DM_Sans'] text-[11.5px] text-[#8892A4] outline-none cursor-pointer"
            >
              <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
              <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
              <option value="gpt-5-mini-2025-08-07">GPT-5 Mini</option>
              <option value="gpt-5.4">GPT-5.4</option>
              <option value="claude-4.5-haiku">Claude 4.5 Haiku</option>
              <option value="claude-4.6-sonnet">Claude 4.6 Sonnet</option>
            </select>
            <select
              value={activeLanguage}
              onChange={(e) => setActiveLanguage(e.target.value)}
              className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-[7px] p-[6px_28px_6px_10px] font-['DM_Sans'] text-[11.5px] text-[#8892A4] outline-none cursor-pointer"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Hinglish">Hinglish</option>
            </select>
            <select
              value={scriptJob}
              onChange={(e) => setScriptJob(e.target.value)}
              className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-[7px] p-[6px_28px_6px_10px] font-['DM_Sans'] text-[11.5px] text-[#8892A4] outline-none cursor-pointer"
            >
              <option value="Views (Broad Appeal)">🎯 Views (Broad Appeal)</option>
              <option value="Followers (Nurturing Trust)">💛 Followers (Nurturing Trust)</option>
              <option value="Leads (Solving Problems)">🔍 Leads (Solving Problems)</option>
              <option value="Sales (Conversion)">💰 Sales (Conversion)</option>
            </select>
            <select
              value={emotionFilter}
              onChange={(e) => setEmotionFilter(e.target.value)}
              className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-[7px] p-[6px_28px_6px_10px] font-['DM_Sans'] text-[11.5px] text-[#8892A4] outline-none cursor-pointer"
            >
              <option value="Shock & Curiosity">Shock & Curiosity</option>
              <option value="Fear & Urgency">Fear & Urgency</option>
              <option value="Inspiration & Hope">Inspiration & Hope</option>
              <option value="Anger & Injustice">Anger & Injustice</option>
              <option value="Humor & Entertainment">Humor & Entertainment</option>
              <option value="Empathy & Connection">Empathy & Connection</option>
            </select>
          </div>

          <div className="p-[14px_20px] bg-[rgba(17,22,32,0.4)] border-b border-[rgba(255,255,255,0.06)]">
            <div className="flex flex-col gap-[8px]">
              <div className="flex justify-between items-center mb-[4px]">
                <span className="font-['JetBrains_Mono'] text-[10px] uppercase text-[#A78BFA]">Emotion Intensity</span>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#A78BFA]">{emotionIntensity}/10</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={emotionIntensity}
                onChange={(e) => setEmotionIntensity(parseInt(e.target.value))}
                className="w-full accent-[#A78BFA] h-[4px] cursor-pointer appearance-none bg-[rgba(255,255,255,0.1)] rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:bg-[#A78BFA] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(167,139,250,0.6)]"
              />
              <div className="flex justify-between font-['DM_Sans'] text-[9px] text-[#5A6478] uppercase mt-[2px]">
                <span>Subtle (1)</span>
                <span>Moderate (5)</span>
                <span>Maximum (10)</span>
              </div>
            </div>
          </div>

          <div className="p-[10px_20px] flex items-center gap-[12px] bg-[rgba(17,22,32,0.4)] border-b border-[rgba(255,255,255,0.06)]">
            <span className="font-['JetBrains_Mono'] text-[9px] uppercase text-[#5A6478] whitespace-nowrap">Video Length</span>
            <span className="font-['DM_Sans'] text-[11px] text-[#5A6478] whitespace-nowrap">(30s - 120s)</span>
            <div className="flex-1 relative flex items-center ml-[8px]">
              <div className="w-full h-[3px] bg-[rgba(255,255,255,0.08)] rounded-[2px] absolute"></div>
              <div className="h-[3px] rounded-[2px] absolute bg-[#3BFFC8]" style={{ width: `${((videoLength - 30) / (120 - 30)) * 100}%` }}></div>
              <input
                type="range"
                min="30"
                max="120"
                value={videoLength}
                onChange={(e) => setVideoLength(Number(e.target.value))}
                className="w-full h-[3px] appearance-none bg-transparent cursor-pointer z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F0F2F7] [&::-webkit-slider-thumb]:border-[2px] [&::-webkit-slider-thumb]:border-[#3BFFC8] [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(59,255,200,0.4)]"
              />
            </div>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] bg-[rgba(59,255,200,0.08)] border border-[rgba(59,255,200,0.2)] p-[2px_8px] rounded-[4px] ml-[8px]">{videoLength}s</span>
          </div>

          {/* Error Banner */}
          {scriptGenError && (
            <div className="m-[18px] mb-0 rounded-[8px] border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.06)] p-[12px] font-['DM_Sans'] text-[12px] text-[#10b981] leading-[1.5]">
              ⚠ {scriptGenError}
            </div>
          )}

          <div className="p-[18px_20px] relative">
            <div className="flex justify-between items-center mb-[12px]">
              <span className="font-['Syne'] font-[700] text-[10px] text-[#5A6478] uppercase tracking-[0.1em]">Script Output</span>
              {script.trim() && (
                <div className="flex items-center gap-2">
                  <div className={`text-[10px] font-bold px-2 py-1 rounded transition-all ${estimatedSeconds > videoLength * 1.15 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                    Pacing: {estimatedSeconds}s
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(script);
                      toast("success", "Copied", "Script copied to clipboard");
                    }} 
                    className="p-1.5 hover:bg-white/10 rounded text-[#8892A4] hover:text-white transition" 
                    title="Copy Script"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => {
                      const blob = new Blob([script], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${scriptTitle || 'script'}.txt`;
                      a.click();
                      toast("success", "Downloaded", "Script downloaded as .txt");
                    }} 
                    className="p-1.5 hover:bg-white/10 rounded text-[#8892A4] hover:text-white transition" 
                    title="Download .txt"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {/* SCRIPT EDITOR CONTAINER */}
            <div className="relative group bg-[#13131A] border border-white/5 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 hover:border-white/10">
              {/* Selection Toolbar (Inline Ask AI) */}
              {selection && (
                <div
                  style={{
                    position: "fixed",
                    left: `${selection.x}px`,
                    top: `${selection.y}px`,
                    transform: "translate(-50%, -100%) translateY(-12px)",
                  }}
                  className={`z-[100] flex items-center bg-[#1C1C26] border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1 animate-in fade-in zoom-in duration-200 pointer-events-auto ${showAskInput ? 'w-[320px] flex-col p-3' : ''}`}
                >
                  {!showAskInput ? (
                    <>
                      <button
                        onClick={() => setShowAskInput(true)}
                        className="flex items-center gap-[6px] bg-[#3BFFC8] text-[#080A0F] px-[12px] py-[6px] rounded-[6px] font-['DM_Sans'] text-[11.5px] font-[700] hover:bg-[#2fe6b4] transition-colors cursor-pointer"
                      >
                        ✨ Ask AI
                      </button>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(selection.text);
                          setSelection(null);
                          toast("success", "Copied", "Text copied to clipboard");
                        }}
                        className="p-[6px] text-[#8892A4] hover:text-[#F0F2F7] transition-colors cursor-pointer ml-1"
                      >
                        ⧉
                      </button>
                    </>
                  ) : (
                    <div className="w-full flex flex-col gap-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-[#3BFFC8] font-mono bg-[#3BFFC8]/10 px-1.5 py-0.5 rounded">Selected: "{selection.text.substring(0, 20)}{selection.text.length > 20 ? '...' : ''}"</span>
                      </div>
                      <textarea
                        autoFocus
                        value={aiCommand}
                        onChange={(e) => setAiCommand(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void applyInlineEdit();
                          }
                          if (e.key === "Escape") {
                            setShowAskInput(false);
                            setSelection(null);
                          }
                        }}
                        placeholder="E.g., 'Make it punchier'..."
                        className="w-full bg-[#111620] border border-[rgba(255,255,255,0.1)] rounded-[8px] p-[10px] font-['DM_Sans'] text-[12.5px] text-[#F0F2F7] outline-none min-h-[70px] focus:border-[#3BFFC8]/40 resize-none"
                      />
                      {aiEditError && <p className="text-[#FF3B57] text-[10px] font-['DM_Sans']">{aiEditError}</p>}
                      <div className="flex justify-between items-center mt-1">
                        <button onClick={() => { setShowAskInput(false); setSelection(null); }} className="text-[#5A6478] text-[11px] hover:text-[#F0F2F7]">Cancel</button>
                        <button
                          onClick={() => void applyInlineEdit()}
                          disabled={isApplyingAiEdit}
                          className="bg-[#3BFFC8] text-[#080A0F] px-[14px] py-[6px] rounded-[6px] font-['DM_Sans'] text-[11.5px] font-[700] flex items-center gap-1 hover:shadow-[0_0_12px_rgba(59,255,200,0.3)] disabled:opacity-50"
                        >
                          {isApplyingAiEdit ? "Editing..." : "✨ Rewrite"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                onMouseUp={(e) => {
                  const target = e.currentTarget;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  // Handle selection for floating toolbar
                  if (start !== end) {
                    const text = script.substring(start, end);
                    setSelection({
                      start,
                      end,
                      text,
                      x: e.clientX,
                      y: e.clientY,
                      rect: target.getBoundingClientRect()
                    });
                    setSelectedText(text); // Track for sticky command bar
                  } else {
                    if (!showAskInput) setSelection(null);
                    setSelectedText(""); // Clear if click away
                  }
                }}
                placeholder="Your viral script will appear here..."
                className="min-h-[500px] w-full bg-transparent p-8 pb-20 font-['DM_Sans'] text-[15px] leading-[1.7] text-gray-200 outline-none focus:outline-none whitespace-pre-wrap resize-none scrollbar-hide"
                spellCheck={false}
              />

              {/* Sticky AI Command Bar */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-[#111620] border-t border-[rgba(255,255,255,0.05)] rounded-b-[14px] z-10">
                {selectedText && (
                  <div className="mb-2 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
                    <p className="text-[11px] text-[#A78BFA] font-['DM_Sans'] line-clamp-1 border-l-2 border-[#A78BFA] pl-2">
                      <span className="font-bold opacity-70 mr-1">Editing:</span> "{selectedText}"
                    </p>
                    <button onClick={() => setSelectedText("")} className="text-[#8892A4] hover:text-white text-[10px]">✕ Clear</button>
                  </div>
                )}
                <div className="flex gap-2 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8892A4]">
                    {isProcessingInlineAI ? (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-[#3BFFC8] border-opacity-50"></div>
                    ) : (
                      "✨"
                    )}
                  </div>
                  <input 
                    type="text" 
                    value={inlineAICommand}
                    onChange={(e) => setInlineAICommand(e.target.value)}
                    placeholder={selectedText ? "What changes would you like to make to this selection?" : "Ask AI to rewrite the entire script..."}
                    className="w-full bg-[#0D1017] border border-[rgba(255,255,255,0.08)] rounded-md py-2 pl-9 pr-4 text-[13px] text-white focus:outline-none focus:border-[#3BFFC8]/50 font-['DM_Sans'] transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInlineAIEdit(inlineAICommand);
                    }}
                  />
                  <button 
                    onClick={() => handleInlineAIEdit(inlineAICommand)}
                    disabled={isProcessingInlineAI || !inlineAICommand.trim()}
                    className="bg-[#3BFFC8]/10 text-[#3BFFC8] px-3 py-1.5 rounded-md text-[12px] font-bold hover:bg-[#3BFFC8]/20 transition-colors disabled:opacity-50"
                  >
                    ↵
                  </button>
                </div>
              </div>
            </div>


          <div className="flex gap-[8px] mt-[10px] flex-wrap items-center">
            <button onClick={() => void handlePostGenAction('pacing')} disabled={!!activeAction || !script.trim()} className="relative z-[99] pointer-events-auto px-4 py-2 rounded-full border border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/60 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'pacing' ? '⏳ Analyzing...' : '⚖ Analyze Pacing'}
            </button>
            <button onClick={() => {
              if (!pacingData) { toast("error", "Pacing Required", "Please analyze pacing first so the AI knows what to cut."); return; }
              void handlePostGenAction('shorten');
            }} disabled={!!activeAction || !script.trim()} className="relative z-[99] pointer-events-auto px-4 py-2 rounded-full border border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/60 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'shorten' ? '⏳ Shortening...' : '✂️ Shorten Script'}
            </button>
            <button onClick={() => void handlePostGenAction('improve')} disabled={!!activeAction || !script.trim()} className="relative z-[99] pointer-events-auto px-4 py-2 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 hover:border-emerald-500/60 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'improve' ? '⏳ Improving...' : pacingData ? '✦ Fix Pacing Issues' : '✦ Improve Script'}
            </button>
            <button onClick={() => {
              setActiveAction('sharpen-hook');
              const text = script.trim();
              const hookMatch = text.match(/\[HOOK\]([\s\S]*?)(?=\[|$)/i);
              const originalHook = (hookMatch && hookMatch[1].trim()) || text.split('\n').filter(l => l.trim()).slice(0, 2).join('\n');
              
              fetch("/api/sharpen-hook", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify({ script, originalHook }) 
              })
                .then(r => r.json())
                .then(d => {
                  if (d.error) throw new Error(d.error);
                  if (!d || !d.updatedScript) throw new Error("Invalid response from AI");
                  const newHook = d.updatedScript;
                  // Replace only the hook part if possible
                  if (hookMatch) {
                    setScript(text.replace(hookMatch[1].trim(), newHook));
                  } else {
                    const lines = text.split('\n');
                    const hookLinesCount = originalHook.split('\n').length;
                    const rest = lines.slice(hookLinesCount).join('\n');
                    setScript(newHook + '\n\n' + rest);
                  }
                  setImprovementLog(p => ["Hook sharpened with viral framework", ...p]); 
                  toast("success", "Hook Sharpened", "Viral hook applied."); 
                })
                .catch(e => toast("error", "Failed", e.message))
                .finally(() => setActiveAction(null));
            }} disabled={!!activeAction || !script.trim()} className="relative z-[99] pointer-events-auto px-4 py-2 rounded-full border border-sky-500/30 text-sky-400 bg-sky-500/5 hover:bg-sky-500/15 hover:border-sky-500/60 font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'sharpen-hook' ? '⏳ Sharpening...' : '🎣 Sharpen Hook'}
            </button>
            <button onClick={() => {
              setActiveAction('fix-structure');
              fetch("/api/fix-structure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script }) })
                .then(r => r.json()).then(d => {
                  if (!d || (!d.updatedScript && !d.result)) throw new Error("Invalid response from AI");
                  setScript(d.updatedScript || d.result);
                  setImprovementLog(p => ["Story structure improved", ...p]);
                  toast("success", "Structure Improved", "");
                }).catch(e => toast("error", "Failed", e.message)).finally(() => setActiveAction(null));
            }} disabled={!!activeAction || !script.trim()} className="relative z-[99] pointer-events-auto px-4 py-2 rounded-full border border-orange-500/30 text-orange-400 bg-orange-500/5 hover:bg-orange-500/15 hover:border-orange-500/60 font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'fix-structure' ? '⏳ Restructuring...' : '🏗 Fix Structure'}
            </button>
            <button onClick={() => void handlePostGenAction('visuals')} disabled={!!activeAction || !script.trim()} className="relative z-[99] pointer-events-auto px-4 py-2 rounded-full border border-purple-500/30 text-purple-400 bg-purple-500/5 hover:bg-purple-500/15 hover:border-purple-500/60 hover:shadow-[0_0_15px_rgba(168,85,247,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'visuals' ? '⏳ Generating Visuals...' : '◎ Generate Visual Cues'}
            </button>
            <button onClick={() => void handlePostGenAction('prompts')} disabled={!!activeAction || !script.trim()} className="relative z-[99] pointer-events-auto px-4 py-2 rounded-full border border-cyan-500/30 text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/15 hover:border-cyan-500/60 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'prompts' ? '⏳ Generating Prompts...' : 'Image/Video Prompts List'}
            </button>
            <button onClick={() => void handlePostGenAction('caption')} disabled={!!activeAction || !script.trim()} className="relative z-[99] pointer-events-auto px-4 py-2 rounded-full border border-amber-500/30 text-amber-400 bg-amber-500/5 hover:bg-amber-500/15 hover:border-amber-500/60 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'caption' ? '⏳ Generating Caption...' : '📝 Generate Caption'}
            </button>
            <button onClick={() => void handlePostGenAction('brainstorm')} disabled={!!activeAction || !script.trim()} className="relative z-[99] pointer-events-auto px-4 py-2 rounded-full border border-violet-400/40 text-violet-300 bg-violet-500/5 hover:bg-violet-500/15 hover:border-violet-400/70 hover:shadow-[0_0_15px_rgba(167,139,250,0.2)] font-['DM_Sans'] text-[11px] font-[700] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'brainstorm' ? '⏳ Brainstorming...' : '✦ Suggest 1% Improvement'}
            </button>
          </div>

          {/* Pacing Analysis Panel */}
          {pacingData && (
            <div className="mt-[14px] p-[16px] glass-surface rounded-[12px] border border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-['Syne'] font-[700] text-[12px] text-red-400 uppercase tracking-[0.1em]">⚖ Pacing Analysis</h3>
                <button onClick={() => setPacingData(null)} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">✕ Clear</button>
              </div>
              <p className="font-['DM_Sans'] text-[11.5px] text-white/60 mb-3">{pacingData.summary}</p>
              <div className="space-y-2">
                {pacingData.segments?.map((seg, i) => (
                  <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border text-[11px] font-['DM_Sans'] ${seg.status === 'Critical' ? 'bg-red-500/10 border-red-500/30 text-red-300' : seg.status === 'Slow' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
                    <span className="shrink-0 font-bold">Lines {seg.lineStart}–{seg.lineEnd}</span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${seg.status === 'Critical' ? 'bg-red-500/20' : seg.status === 'Slow' ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}>{seg.status}</span>
                    <span className="text-white/60">{seg.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Brainstorm Suggestions Panel */}
          {brainstormSuggestions && brainstormSuggestions.length > 0 && (
            <div className="mt-[14px] p-[16px] glass-surface rounded-[12px] border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-['Syne'] font-[700] text-[12px] text-violet-300 uppercase tracking-[0.1em]">✦ 1% Improvement Suggestions</h3>
                <button onClick={() => setBrainstormSuggestions(null)} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">✕ Clear</button>
              </div>
              <div className="space-y-3">
                {brainstormSuggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-white/[0.03] rounded-xl border border-white/5">
                    <span className={`mt-0.5 px-2 py-0.5 rounded text-[9px] font-bold shrink-0 ${s.impact === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {s.impact}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-['Syne'] font-[700] text-[12px] text-white mb-1">{s.title}</p>
                      <p className="text-[12px] text-[#8892A4] font-['DM_Sans'] mt-1.5 leading-relaxed">{s.suggestion || (s as any).description || (s as any).reasoning}</p>
                    </div>
                    <button
                      onClick={() => void applyImprovement(s)}
                      disabled={!!activeAction}
                      className="shrink-0 px-3 py-1 rounded-lg bg-violet-500/15 border border-violet-400/30 text-violet-300 text-[10px] font-bold hover:bg-violet-500/25 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {activeAction === 'improving' ? '⏳' : 'Apply'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {script.trim() && (
            <div className="mt-[14px] p-[16px] glass-surface rounded-[12px] border border-[rgba(59,255,200,0.15)] bg-gradient-to-r from-[rgba(59,255,200,0.03)] to-[rgba(167,139,250,0.03)] opacity-90 transition-opacity hover:opacity-100">
              <h3 className="font-['Syne'] font-[700] text-[12px] text-[#3BFFC8] uppercase tracking-[0.1em] mb-[16px]">Post-Generation Quality Check</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
                <label className="flex items-start gap-[10px] cursor-pointer group">
                  <input type="checkbox" checked={evalInterestingness} onChange={() => setEvalInterestingness(!evalInterestingness)} className="w-[16px] h-[16px] mt-[2px] accent-[#3BFFC8] cursor-pointer rounded bg-[#111620]" />
                  <span className="font-['DM_Sans'] text-[12.5px] text-[#8892A4] group-hover:text-[#F0F2F7] transition-colors"><strong className="text-[#F0F2F7]">Interestingness:</strong> Does it hold attention?</span>
                </label>
                <label className="flex items-start gap-[10px] cursor-pointer group">
                  <input type="checkbox" checked={evalCompression} onChange={() => setEvalCompression(!evalCompression)} className="w-[16px] h-[16px] mt-[2px] accent-[#3BFFC8] cursor-pointer rounded bg-[#111620]" />
                  <span className="font-['DM_Sans'] text-[12.5px] text-[#8892A4] group-hover:text-[#F0F2F7] transition-colors"><strong className="text-[#F0F2F7]">Compression:</strong> Are there zero wasted words?</span>
                </label>
                <label className="flex items-start gap-[10px] cursor-pointer group">
                  <input type="checkbox" checked={evalHookGrip} onChange={() => setEvalHookGrip(!evalHookGrip)} className="w-[16px] h-[16px] mt-[2px] accent-[#3BFFC8] cursor-pointer rounded bg-[#111620]" />
                  <span className="font-['DM_Sans'] text-[12.5px] text-[#8892A4] group-hover:text-[#F0F2F7] transition-colors"><strong className="text-[#F0F2F7]">Hook Grip:</strong> Does the first 3s lock them in?</span>
                </label>
                <label className="flex items-start gap-[10px] cursor-pointer group">
                  <input type="checkbox" checked={evalEmotionMatch} onChange={() => setEvalEmotionMatch(!evalEmotionMatch)} className="w-[16px] h-[16px] mt-[2px] accent-[#3BFFC8] cursor-pointer rounded bg-[#111620]" />
                  <span className="font-['DM_Sans'] text-[12.5px] text-[#8892A4] group-hover:text-[#F0F2F7] transition-colors"><strong className="text-[#F0F2F7]">Emotion Match:</strong> Evokes selected emotion?</span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" className="mt-1 w-4 h-4 rounded border-white/20 bg-black/50 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-0" />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">Dopamine Gap</span>
                    <span className="text-xs text-white/50">Does the actual value beat the expectation set by the hook?</span>
                  </div>
                </label>
              </div>

            </div>
          )}
        </div>
      </section>


          {audioPlaylist.length > 0 ? (
            <div className="flex items-center justify-between bg-[rgba(59,255,200,0.08)] border border-[rgba(59,255,200,0.25)] p-4 rounded-xl w-full mt-[16px]">
              <div className="flex items-center gap-4 w-full">
                <button
                  onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-[#3BFFC8] text-[#111620] hover:scale-105 transition-transform"
                >
                  {isPlayingAudio ? "⏸" : "▶"}
                </button>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioProgress || 0}
                  onChange={(e) => {
                    if (audioRef.current && audioRef.current.duration) {
                      const seekTime = (Number(e.target.value) / 100) * audioRef.current.duration;
                      audioRef.current.currentTime = seekTime;
                      setAudioProgress(Number(e.target.value));
                    }
                  }}
                  className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#3BFFC8]"
                />

                <div className="text-sm font-medium text-[#3BFFC8] whitespace-nowrap">
                  Playing Audio ({currentTrack + 1} / {audioPlaylist.length})
                </div>
              </div>
              <button
                onClick={() => {
                  setAudioPlaylist([]);
                  setIsPlayingAudio(false);
                }}
                className="ml-4 text-xs text-gray-500 hover:text-white transition-colors"
              >
                Close
              </button>

              <audio
                ref={audioRef}
                src={`data:audio/mp3;base64,${audioPlaylist[currentTrack]}`}
                onEnded={handleTrackEnded}
                autoPlay={isPlayingAudio}
                onTimeUpdate={() => {
                  if (audioRef.current && audioRef.current.duration) {
                    setAudioProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              disabled={isPlayingTTS || !script.trim()}
              onClick={() => void handleListen()}
              className="w-full mt-[16px] flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-500/30 text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 hover:border-rose-500/60 transition-all hover:shadow-[0_0_15px_rgba(244,63,94,0.15)] font-['DM_Sans'] text-[13px] font-[500] cursor-pointer disabled:opacity-50"
            >
              🔊 {isPlayingTTS ? "Generating Audio..." : "Listen to Script"}
            </button>
          )}
        
        {/* Caption Output */}
        {generatedCaption && (
          <div className="mt-4 bg-white/5 border border-white/10 backdrop-blur-md rounded-xl p-6 relative max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-[rgba(255,255,255,0.1)] scrollbar-track-transparent pr-2">
            <h3 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-4">📝 Caption</h3>
            <p className="text-white/90 whitespace-pre-wrap text-[13.5px] leading-relaxed font-['DM_Sans'] pr-8">{generatedCaption}</p>
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <button onClick={() => { if (generatedCaption) { void navigator.clipboard.writeText(generatedCaption); toast("success", "Copied", "Caption copied"); } }} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg text-white/50 hover:text-white transition-all text-sm">⎘</button>
              <button onClick={() => setGeneratedCaption(null)} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-lg text-white/30 hover:text-red-400 transition-all text-xs">✕</button>
            </div>
          </div>
        )}

        {/* Visual Storyboard Output */}
        {visualCues && (
          <div className="mt-4 bg-white/5 border border-white/10 backdrop-blur-md rounded-xl p-6 relative max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-[rgba(255,255,255,0.1)] scrollbar-track-transparent pr-2">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">◎ Visual Storyboard</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { if (visualCues) { void navigator.clipboard.writeText(visualCues); toast("success", "Copied", "Storyboard copied"); } }} className="text-[10px] px-3 py-1 bg-white/5 hover:bg-white/10 text-gray-400 rounded transition-colors">Copy</button>
                <button onClick={() => setVisualCues(null)} className="text-gray-500 hover:text-white transition-colors text-xs">✕</button>
              </div>
            </div>
            <div className="ml-2 space-y-0">
              {visualCues?.split('\n').filter(l => l.trim()).map((line, i) => {
                const cleanLine = line.replace(/\*\*/g, '').trim();
                const tsMatch = cleanLine.match(/^(\[?\d+[s:]?\d*\]?|\d+-\d+s?)/);
                const timestamp = tsMatch ? tsMatch[0] : null;
                const rest = timestamp ? cleanLine.slice(timestamp.length).replace(/^[-:\s]+/, '').trim() : cleanLine;
                return (
                  <div key={i} className="flex gap-4 items-start border-l border-white/10 ml-2 pl-4 pb-6">
                    <div className="shrink-0 w-16 text-right">
                      {timestamp ? (
                        <span className="text-[10px] font-bold text-cyan-400 font-['JetBrains_Mono']">{timestamp}</span>
                      ) : (
                        <span className="text-[10px] text-white/20 font-['JetBrains_Mono']">{String(i + 1).padStart(2, '0')}</span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-white/80 leading-relaxed font-['DM_Sans']">{rest}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Generation Prompts UI */}
        {imagePrompts && Array.isArray(imagePrompts) && imagePrompts.length > 0 && (
          <div className="mt-6 bg-[#0D1017] border border-[rgba(255,255,255,0.08)] rounded-[14px] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[0.15em] text-[#3BFFC8]">
                ✦ AI Generation Prompts
              </h3>
              <button onClick={() => setImagePrompts(null)} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">✕ Clear</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
              {imagePrompts.flatMap((item: any, i: number) => [
                <div key={`img-${i}`} className="bg-[#111620] border border-[rgba(255,255,255,0.05)] rounded-lg p-4 relative group hover:border-[#3BFFC8]/30 transition-colors">
                  <span className="absolute top-3 right-3 text-[10px] font-['JetBrains_Mono'] text-[#8892A4] bg-black/50 px-2 py-1 rounded">IMAGE</span>
                  <p className="text-[10px] text-[#8892A4] font-['JetBrains_Mono'] mb-2 leading-relaxed pr-16">"{item.scriptLine}"</p>
                  <p className="text-[13px] text-white font-['DM_Sans'] leading-relaxed">{item.imagePrompt}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(item.imagePrompt)}
                    className="mt-3 text-[11px] text-[#3BFFC8] opacity-0 group-hover:opacity-100 transition-opacity font-medium"
                  >Copy Prompt ⎘</button>
                </div>,
                <div key={`vid-${i}`} className="bg-[#111620] border border-[rgba(255,255,255,0.05)] rounded-lg p-4 relative group hover:border-[#3BFFC8]/30 transition-colors">
                  <span className="absolute top-3 right-3 text-[10px] font-['JetBrains_Mono'] text-[#8892A4] bg-black/50 px-2 py-1 rounded">VIDEO</span>
                  <p className="text-[10px] text-[#8892A4] font-['JetBrains_Mono'] mb-2 leading-relaxed pr-16">"{item.scriptLine}"</p>
                  <p className="text-[13px] text-white font-['DM_Sans'] leading-relaxed">{item.videoPrompt}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(item.videoPrompt)}
                    className="mt-3 text-[11px] text-[#3BFFC8] opacity-0 group-hover:opacity-100 transition-opacity font-medium"
                  >Copy Prompt ⎘</button>
                </div>,
              ])}
            </div>
          </div>
        )}

        {/* Director's Cut & Prompts Render Area */}
        {(directorsCutData || promptDirectorData || packagingData) && (
          <div className="mt-8 flex flex-col gap-6">

            {/* PACKAGING BOX */}
            {packagingData && (
              <div className="bg-[#0a0a0a] border border-cyan-500/20 rounded-xl overflow-hidden relative group">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-40"></div>
                <div className="bg-cyan-500/10 border-b border-cyan-500/20 px-4 py-3 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles size={14} />
                    PACKAGING (Cover & Title)
                  </h3>
                  <button
                    onClick={() => setPackagingData(null)}
                    className="text-cyan-500/50 hover:text-cyan-400 transition-colors text-xs"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-cyan-500/70 uppercase tracking-widest">Viral Title Idea</span>
                    <p className="text-[15px] text-white font-['Syne'] font-bold leading-tight">
                      {packagingData?.titleText}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-cyan-500/70 uppercase tracking-widest">Cover Visual Concept</span>
                    <p className="text-[13px] text-gray-300 leading-relaxed italic">
                      {packagingData?.coverVisual}
                    </p>
                  </div>
                </div>
                <div className="px-5 pb-4">
                  <button
                    onClick={() => {
                      if (packagingData) {
                        void navigator.clipboard.writeText(`Title: ${packagingData.titleText}\nCover: ${packagingData.coverVisual}`);
                        toast("success", "Copied", "Packaging info copied to clipboard.");
                      }
                    }}
                    className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-3 py-1.5 rounded-lg hover:bg-cyan-400/20 transition-all uppercase tracking-wider"
                  >
                    Copy Packaging Plan
                  </button>
                </div>
              </div>
            )}

            {/* Director Style Output */}
            {/* Director Style Output */}
            {directorsCutData && (
              <div className="bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden shadow-2xl">
                <div className="sticky top-0 bg-[#111620]/95 backdrop-blur-md border-b border-white/10 px-6 py-4 z-10 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Visual Cues Breakdown</h3>
                  <button
                    onClick={() => setDirectorsCutData(null)}
                    className="text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    Close
                  </button>
                </div>
                
                <div className="p-6 max-h-[600px] overflow-y-auto text-sm text-gray-300 space-y-8 scrollbar-hide">
                  
                  {/* Phase 3: 3-Pillar Hooks Matrix */}
                  {directorsCutData.matrix && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Hook Alignment Matrix (First 3s)</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                          <span className="text-[9px] uppercase text-gray-600 font-bold block mb-2">Spoken Hook</span>
                          <p className="text-white text-[12px] leading-relaxed font-['DM_Sans']">"{directorsCutData.matrix.spokenHook}"</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                          <span className="text-[9px] uppercase text-gray-600 font-bold block mb-2">Visual Action</span>
                          <p className="text-gray-400 text-[12px] leading-relaxed font-['DM_Sans'] italic">{directorsCutData.matrix.visualAction}</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                          <span className="text-[9px] uppercase text-gray-600 font-bold block mb-2">On-Screen Text</span>
                          <p className="text-cyan-400 font-bold text-[12px]">{directorsCutData.matrix.onScreenText}</p>
                        </div>
                      </div>
                      {(() => {
                         const hook = directorsCutData.matrix.spokenHook || "";
                         const text = directorsCutData.matrix.onScreenText || "";
                         const hookWords = new Set(hook.toLowerCase().split(/\s+/));
                         const textWords = text.toLowerCase().split(/\s+/);
                         const intersection = textWords.filter((w: string) => hookWords.has(w));
                         const overlap = intersection.length / Math.max(hookWords.size, textWords.length || 1);
                         if (overlap >= 0.7) {
                           return (
                             <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-3">
                               <span className="text-red-400 text-sm">⚠️</span>
                               <p className="text-[11px] text-red-400 font-medium font-['DM_Sans']">
                                 Alignment Error: On-screen text is just repeating the spoken audio ({Math.round(overlap*100)}% match). Make it complementary.
                               </p>
                             </div>
                           );
                         }
                         return null;
                      })()}
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    {(directorsCutData.cues || (Array.isArray(directorsCutData) ? directorsCutData : [])).map((item: any, i: number) => (
                      <div key={i} className="bg-white/5 p-4 rounded-lg border border-white/10 hover:border-emerald-500/30 transition-colors">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-['JetBrains_Mono'] text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">{item.timestamp}</span>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <span className="text-[10px] uppercase text-gray-600 font-bold block mb-0.5">Line</span>
                            <p className="text-gray-300 leading-relaxed font-['DM_Sans']">"{item.line}"</p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-gray-600 font-bold block mb-0.5">Visual Action</span>
                            <p className="text-gray-400 leading-relaxed font-['DM_Sans'] italic">{item.action}</p>
                          </div>
                          {item.text && (
                            <div className="bg-emerald-400/5 p-2 rounded border border-emerald-400/10">
                              <span className="text-[9px] uppercase text-emerald-500/60 font-bold block mb-0.5">On-Screen Text</span>
                              <p className="text-emerald-400/80 font-bold text-xs">{item.text}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Phase 4: Editor Instructions Blueprint */}
                  {directorsCutData.editorInstructions && (
                    <div className="mt-12 pt-8 border-t border-white/5">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[11px] font-bold text-white uppercase tracking-[0.05em]">Editor Blueprint ({emotionFilter})</h4>
                        <button
                          onClick={() => {
                            if (directorsCutData) {
                              const text = `Editor Instructions:\n${directorsCutData.editorInstructions?.join('\n') || ''}\n\nVisual Cues:\n${JSON.stringify(directorsCutData.cues, null, 2)}`;
                              void navigator.clipboard.writeText(text);
                              toast("success", "Copied", "Instructions copied for editor.");
                            }
                          }}
                          className="bg-white/5 border border-white/10 p-[6px_12px] rounded-lg text-cyan-400 text-[10px] font-bold hover:bg-white/10 transition-all font-['DM_Sans']"
                        >
                          Copy for Editor
                        </button>
                      </div>
                      <div className="bg-black/40 border border-white/10 p-5 rounded-xl space-y-3">
                        {directorsCutData.editorInstructions.map((rule: string, i: number) => (
                          <div key={i} className="flex items-start gap-4">
                            <span className="text-cyan-400 mt-1">•</span>
                            <p className="text-[12.5px] text-[#8892A4] font-['DM_Sans'] leading-relaxed">{rule}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Shot List & AI Prompts Output */}
            {promptDirectorData && (
              <div className="bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden shadow-2xl">
                <div className="sticky top-0 bg-[#111620]/95 backdrop-blur-md border-b border-white/10 px-6 py-4 z-10 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Prompt Director & Shot List</h3>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        if (promptDirectorData) {
                          const textToCopy = JSON.stringify(promptDirectorData, null, 2);
                          void navigator.clipboard.writeText(textToCopy);
                          toast("success", "Copied", "All prompts copied to clipboard");
                        }
                      }}
                      className="text-[11px] font-bold px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/20 transition-all"
                    >
                      Copy All Prompts
                    </button>
                    <button
                      onClick={() => setPromptDirectorData(null)}
                      className="text-xs text-gray-500 hover:text-white transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="p-6 max-h-[500px] overflow-y-auto text-sm text-gray-300 space-y-6 scrollbar-hide">
                  {promptDirectorData?.character_identity && (
                    <div className="bg-emerald-400/5 p-5 rounded-xl border border-emerald-400/10">
                      <h4 className="text-[10px] uppercase text-emerald-500 font-bold mb-2 tracking-widest">Character Identity</h4>
                      <p className="text-gray-300 font-['DM_Sans'] leading-relaxed">{promptDirectorData.character_identity}</p>
                    </div>
                  )}
                  <div className="flex flex-col gap-4">
                    {promptDirectorData.prompts
                      .filter(p => p.image_prompt !== 'IGNORE' && p.video_prompt !== 'IGNORE')
                      .map((p, i) => (
                        <div key={i} className="bg-[#111620]/50 p-5 rounded-xl border border-white/5 hover:border-emerald-500/20 transition-all group">
                          <div className="flex items-start gap-4 mb-4">
                            <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-gray-500 group-hover:bg-emerald-500/10 group-hover:text-emerald-400 transition-colors">
                              {i + 1}
                            </div>
                            <p className="flex-1 font-['DM_Sans'] text-white font-medium italic underline decoration-emerald-400/20 underline-offset-8 decoration-2">
                              "{p.spoken_line}"
                            </p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-10">
                            <div className="space-y-1.5">
                              <span className="text-[9px] uppercase text-gray-600 font-bold tracking-tight">Image Prompt</span>
                              <p className={`text-[12px] leading-relaxed ${p.image_prompt === "IGNORE" ? "text-gray-700 italic" : "text-gray-400 font-['JetBrains_Mono']"}`}>
                                {p.image_prompt}
                              </p>
                            </div>
                            <div className="space-y-1.5">
                              <span className="text-[9px] uppercase text-gray-600 font-bold tracking-tight">Video Motion</span>
                              <p className={`text-[12px] leading-relaxed ${p.video_prompt === "IGNORE" ? "text-gray-700 italic" : "text-gray-400 font-['JetBrains_Mono']"}`}>
                                {p.video_prompt}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start mt-[16px]">
          {/* A/B HOOK TESTING */}
          <div className="glass-surface rounded-[14px] overflow-hidden flex flex-col w-full min-h-[250px] max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-[rgba(255,255,255,0.1)] scrollbar-track-transparent pr-2">
            <div className="p-[14px_18px] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between bg-[rgba(255,255,255,0.02)]">
              <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#8892A4]">✦ Hook Variation Lab</span>
            </div>
            <div className="p-[16px] flex flex-col flex-1 overflow-hidden">
              <button
                type="button"
                onClick={() => void handleGenerateHooks()}
                disabled={isGeneratingHooks}
                className="w-full bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)] text-[#10b981] p-[10px] rounded-[8px] font-['DM_Sans'] text-[12.5px] font-[500] cursor-pointer hover:bg-[rgba(16,185,129,0.15)] outline-none transition-colors disabled:opacity-50 shrink-0"
              >
                {isGeneratingHooks ? "Generating..." : "✦ Generate Alternate Hooks"}
              </button>
              <div className="flex flex-col gap-3 mt-4 flex-1 overflow-y-auto pr-1 custom-scrollbar scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {abHooks.map((h, i) => (
                  <div
                    key={i}
                    className={`p-4 bg-white/5 border rounded-xl transition-all ${selectedAbHookIndex === i ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:bg-white/10 hover:border-cyan-500/30'}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-3 block">{h.type}</span>
                    {h.spoken || h.visual ? (
                      <div className="space-y-3 text-sm text-gray-300">
                        <p><strong className="text-white text-xs uppercase">🗣 Spoken:</strong> {h.spoken}</p>
                        <p><strong className="text-white text-xs uppercase">👁 Visual:</strong> {h.visual}</p>
                        <p><strong className="text-white text-xs uppercase">🔤 Text:</strong> {h.text}</p>
                      </div>
                    ) : (
                      <p className="text-[13.5px] text-[#F0F2F7] leading-relaxed font-['DM_Sans']">{h.text}</p>
                    )}
                    <button
                      onClick={() => applyHookToScript(h.spoken || h.text || "", i)}
                      className="mt-3 text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-md hover:bg-emerald-500/20 transition-colors cursor-pointer"
                    >
                      Apply Spoken Hook
                    </button>
                  </div>
                ))}
                {abHooks.length === 0 && !isGeneratingHooks && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
                      <span className="text-gray-600">✦</span>
                    </div>
                    <p className="text-[11px] text-gray-500 font-['DM_Sans'] max-w-[180px]">Generate hooks to see viral variations for your script.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* REPURPOSE CONTENT */}
          <div className="glass-surface rounded-[14px] overflow-hidden flex flex-col h-full max-h-[500px]">
            <div className="p-[14px_18px] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
              <span className="font-['JetBrains_Mono'] text-[9px] uppercase text-[#5A6478]">REPURPOSE CONTENT</span>
            </div>
            <div className="p-[16px] flex flex-col flex-1 overflow-hidden">
              <div className="flex flex-wrap gap-[6px] mb-[14px] shrink-0">
                {["Twitter/X Thread", "LinkedIn Post", "YouTube Script"].map((p) => {
                  let hoverClasses = "";
                  if (p === "Twitter/X Thread") {
                    hoverClasses = "hover:text-white hover:border-white/40 hover:bg-white/5 hover:shadow-[0_0_15px_rgba(255,255,255,0.15)]";
                  } else if (p === "LinkedIn Post") {
                    hoverClasses = "hover:text-[#0a66c2] hover:border-[#0a66c2]/50 hover:bg-[#0a66c2]/10 hover:shadow-[0_0_15px_rgba(10,102,194,0.2)]";
                  } else {
                    hoverClasses = "hover:text-[#ff0000] hover:border-[#ff0000]/50 hover:bg-[#ff0000]/10 hover:shadow-[0_0_15px_rgba(255,0,0,0.2)]";
                  }

                  return (
                    <button
                      key={p}
                      onClick={() => void handleRepurpose(p)}
                      disabled={isRepurposing || !script.trim()}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-white/10 rounded-lg text-sm font-medium text-gray-400 transition-all duration-300 ${hoverClasses} disabled:opacity-50`}
                    >
                      {p === "Twitter/X Thread" ? "𝕏 Tweet" : p === "LinkedIn Post" ? "in LinkedIn" : "▷ YouTube"}
                    </button>
                  );
                })}
              </div>
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-[12px] flex-1 overflow-y-auto custom-scrollbar scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {repurposedText ? (
                  <div className="font-['DM_Sans'] text-[12.5px] leading-[1.65] text-[#8892A4] whitespace-pre-wrap">{repurposedText}</div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-center mt-[40px] font-['DM_Sans'] text-[12px] text-[#5A6478]">
                    {isRepurposing ? "Repurposing..." : "Select a platform to generate"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScriptsPageFallback() {
  return (
    <div className="min-h-screen bg-[#161616] text-white w-full max-w-[1200px] mx-auto pb-32">
      <div className="px-6 py-8">
        <div className="bg-[#1c1c1c] border border-white/10 rounded-xl p-6 mb-6">
          <p className="text-sm text-gray-400">Loading scripts workflow...</p>
        </div>
      </div>
    </div>
  );
}

export default function ScriptsPage() {
  return (
    <Suspense fallback={<ScriptsPageFallback />}>
      <ScriptsPageContent />
    </Suspense>
  );
}
