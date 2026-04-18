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
  Info,
  MessageCircle,
  Pencil,
  Plus,
  Scissors,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { AnalyzeResponse, InstagramPost } from "@/lib/types";
import Skeleton from "@/app/components/UI/Skeleton";
import RecyclingQueueModal from "@/app/components/RecyclingQueueModal";
import HookBuilder from "@/app/components/HookBuilder";
import { useToast } from "@/app/components/UI/Toast";
import { User, Users, Globe, Zap, CheckCircle2 } from "lucide-react";
import { REMIX_CONTENT_BUCKETS, type RemixBucketId } from "@/lib/remix-hold-twist-framework";
import { SCRATCH_SCRIPT_ANATOMY_BLOCK } from "@/lib/script-anatomy-scratch";
import {
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_SETTINGS_KEY,
  parseLocalSettings,
  type LocalSettings,
} from "@/lib/client-settings";

/** Display order for Engineering Remix bucket picker (matches common “idea first” mental model). */
const REMIX_UI_ORDER: RemixBucketId[] = ["Idea", "Format", "Hook", "Script", "Visual"];

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
  tag: string;          // format: drives the tab filter (Fortune Teller, Experimenter, etc.)
  angle: string;        // one of 7 angles (Negative Spin, Social Proof, etc.)
  strategy: string;     // "standard" | "blueball" | "desire" | "tofu" | "mofu" | "bofu"
  trigger: string;      // curiosity | contrarian | desire | tension | fomo | social-proof
  psychology: string;   // WHY this hook works
  example: string;      // example hook text
  verbalLayer: string;  // what to SAY (spoken hook guidance)
  writtenLayer: string; // what to put ON SCREEN (text overlay)
  visualLayer: string;  // what to SHOW (visual hook)
  bestPairedWith: string;
  curiosityScore: number;   // predicted curiosity loop strength 0-100
  conversionFit: string;    // "virality" | "leads" | "both"
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
  psychologicalCore?: string;
  mistakesToAvoid?: string;
  emotionTarget?: string;
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
  return normalized.includes("transcript-led outlier potential") ||
    normalized.includes("outlier potential") ||
    normalized.includes("no transcript") ||
    normalized.includes("transcript is unavailable") ||
    normalized.includes("no content available");
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
    // ════════════════════════════════════════
    // FORTUNE TELLER — predict the future
    // ════════════════════════════════════════
    {
      id: "ft-negative",
      title: "Fortune Teller — Negative Spin",
      tag: "Fortune Teller", angle: "Negative Spin", strategy: "standard", trigger: "contrarian",
      psychology: "Predicting a painful future outcome triggers loss aversion — the brain is 2× more motivated to avoid pain than chase reward. The contrast between their current path and the bad outcome creates an urgent curiosity loop.",
      example: "If you keep posting like this, you'll STILL have 0 followers in 12 months. Here's what has to change.",
      verbalLayer: "State the negative prediction confidently — no hedging. 'If you [current behavior], you will [bad outcome].' Then immediately pause.",
      writtenLayer: "Bold text on screen: '[Bad Outcome]' — make the downside impossible to miss. Place in the safe zone (top of screen, above UI).",
      visualLayer: "Show a flatlined analytics graph, a ghost town comment section, or the viewer's 'before' state. The visual should make them wince.",
      bestPairedWith: "Transformation Snapshot, Man in a Hole",
      curiosityScore: 82, conversionFit: "virality",
    },
    {
      id: "ft-positive",
      title: "Fortune Teller — Positive Spin",
      tag: "Fortune Teller", angle: "Positive Spin", strategy: "standard", trigger: "desire",
      psychology: "Painting a desirable future state activates the viewer's imagination. They self-insert into the outcome and watch to claim it for themselves. The gap between present reality and future state IS the curiosity loop.",
      example: "One shift in how you write captions → 10× more profile visits this month. Here's exactly what it is.",
      verbalLayer: "Lead with the dream outcome, not the method. 'One [small action] → [massive result].' Then hold back the method for 2-3 seconds.",
      writtenLayer: "Show the numerical outcome big on screen — '10×' or '50K in 90 days'. Numbers create specificity that vague claims can't match.",
      visualLayer: "Show the 'after' state first — the packed DMs, the growing analytics, the lifestyle. The brain will naturally ask 'how do I get that?'",
      bestPairedWith: "One Decision Story, Challenge to Victory",
      curiosityScore: 78, conversionFit: "leads",
    },
    {
      id: "ft-howto",
      title: "Fortune Teller — How-To Process",
      tag: "Fortune Teller", angle: "How-To Process", strategy: "standard", trigger: "fomo",
      psychology: "Combines future prediction with an actionable promise — FOMO + utility in one hit. The viewer fears missing a trend AND wants the shortcut. Highest click-through format for educational niches.",
      example: "In 6 months, creators who use this one system will dominate their niche. I'll show you exactly how to be one of them.",
      verbalLayer: "Establish the future trend, then anchor yourself as the guide: 'I'll show you exactly how.' This positions you as the expert who already knows.",
      writtenLayer: "'[Future trend] is coming. Here's how to win.' Keep it punchy — two lines maximum, each under 6 words.",
      visualLayer: "Show a 'before the wave hits' visual — an empty beach vs a wave coming in. Or show competitor accounts vs yours with the trend applied.",
      bestPairedWith: "Hero's Journey, 5-Part Story Arc",
      curiosityScore: 75, conversionFit: "both",
    },

    // ════════════════════════════════════════
    // EXPERIMENTER — show the test results
    // ════════════════════════════════════════
    {
      id: "exp-social-proof",
      title: "Experimenter — Social Proof",
      tag: "Experimenter", angle: "Social Proof", strategy: "standard", trigger: "social-proof",
      psychology: "Results-first hook. The experiment outcome serves as irrefutable proof before explanation. The brain trusts evidence over claims. Showing the proof before the explanation forces the viewer to watch backwards to understand why.",
      example: "I posted the exact same reel 4 different ways. One got 2.3M views. Here's the data — and why it matters.",
      verbalLayer: "State the result first, then the experiment: 'I [did X]. The results surprised even me.' Never explain the method until you've shown the outcome.",
      writtenLayer: "Show the winning metric on screen in real time — screenshot of analytics, view count, or engagement data as text overlay.",
      visualLayer: "Show split-screen of the 4 test videos side by side, or show the analytics graph with the spike visible before you explain what caused it.",
      bestPairedWith: "Case Study, X to Y Journey, Big Reveal",
      curiosityScore: 88, conversionFit: "both",
    },
    {
      id: "exp-personal",
      title: "Experimenter — Personal Experience",
      tag: "Experimenter", angle: "Personal Experience", strategy: "standard", trigger: "curiosity",
      psychology: "First-person experiment creates intimacy and credibility through lived proof. The viewer sees themselves in you — if you tested this and got results, they can too. Relatability is the bridge to trust.",
      example: "I used AI to write every caption for 30 days. The results genuinely shocked me — and changed how I create forever.",
      verbalLayer: "Open with 'I [did the experiment]' and immediately drop the time frame or scale to establish stakes. Then tease the outcome without revealing it.",
      writtenLayer: "'30 days of [X] — what I found.' The time frame adds credibility and sets up the payoff. The viewer is committed to the journey.",
      visualLayer: "Show day 1 vs day 30 side by side, or show yourself in the middle of the experiment (filming yourself actively doing the test).",
      bestPairedWith: "X to Y Journey, Failure/Restart, Man in a Hole",
      curiosityScore: 80, conversionFit: "virality",
    },
    {
      id: "exp-targeted",
      title: "Experimenter — Targeted Question",
      tag: "Experimenter", angle: "Targeted Question", strategy: "standard", trigger: "curiosity",
      psychology: "Opens with a question tied to a painful test result, forcing the viewer to self-identify with the problem. The question makes them the subject of the experiment — suddenly their attention is self-motivated.",
      example: "Ever wonder why your 'perfect' reel flopped the moment you posted it? I ran 40 tests to find out exactly why — so you don't have to.",
      verbalLayer: "Ask the question directly to 'you' — never 'people' or 'creators'. Then immediately say 'I found out' or 'I ran the test' to establish that the answer is coming.",
      writtenLayer: "'Why does [painful thing] happen to you?' Bold the pain point. Make the question impossible to scroll past because it names their exact struggle.",
      visualLayer: "Show the test setup — the notebook, the recording setup, the comparison sheets. The visual signals 'this is scientific, not random opinion.'",
      bestPairedWith: "Mistake & Fix, Breakdown",
      curiosityScore: 77, conversionFit: "virality",
    },

    // ════════════════════════════════════════
    // TEACHER — lessons from your journey
    // ════════════════════════════════════════
    {
      id: "teacher-callout",
      title: "Teacher — Call-Out",
      tag: "Teacher", angle: "Call-Out", strategy: "standard", trigger: "contrarian",
      psychology: "Directly addresses a specific audience with their specific mistake. Hyper-targeted attention — the viewer feels the video was made specifically for them. Specificity of the call-out creates immediate relevance.",
      example: "If you're a coach posting tips on Instagram and still wondering why nobody's booking calls — this single post is the reason.",
      verbalLayer: "Name the person: 'If you're a [specific person] who [does specific thing]...' The more specific the identity tag, the stronger the self-selection. A targeted 100 is worth 10,000 untargeted.",
      writtenLayer: "'[Specific person]: here's why [painful thing] is happening to you.' The colon after the identity creates a dramatic pause effect on screen.",
      visualLayer: "Point at the camera or look directly into it. No b-roll — pure direct address. The 1-on-1 connection stops the scroll because the viewer feels personally seen.",
      bestPairedWith: "One Thing I Wish I Knew, Lesson From Others",
      curiosityScore: 85, conversionFit: "leads",
    },
    {
      id: "teacher-howto",
      title: "Teacher — How-To Process",
      tag: "Teacher", angle: "How-To Process", strategy: "standard", trigger: "fomo",
      psychology: "Step-by-step promise wrapped in credibility. The viewer knows exactly what they're getting (a system) and believes you've already done it (teacher framing). Clear value exchange before they commit a single second.",
      example: "Here's the exact 3-step framework I used to go from 800 to 50K followers in 90 days — and why most people miss step 2.",
      verbalLayer: "'Here's the exact [X]-step framework I used to [specific outcome].' The word 'exact' signals you're not winging it — you have a repeatable system.",
      writtenLayer: "'[X]-step [system name] → [specific outcome].' The numbered framework on screen tells the brain there's structure coming, which reduces commitment anxiety.",
      visualLayer: "Show yourself actively teaching — whiteboard, slides, or overlaid numbered steps appearing as you speak. Visual structure reinforces the credibility.",
      bestPairedWith: "5-Part Story Arc, Hero's Journey, ARC Formula",
      curiosityScore: 72, conversionFit: "leads",
    },
    {
      id: "teacher-negative",
      title: "Teacher — Negative Spin",
      tag: "Teacher", angle: "Negative Spin", strategy: "standard", trigger: "contrarian",
      psychology: "Lead with what you did wrong to create vulnerability and relatability before delivering the real lesson. The admission of failure is disarming — the viewer thinks 'if they made that mistake, I probably am too.'",
      example: "I wasted 2 years making content the wrong way. Here's what nobody told me — and the one thing that changed everything.",
      verbalLayer: "'I [wasted/lost/failed] doing [thing] for [time period].' Specificity of the time frame creates credibility. Then hard pause before 'here's what I wish I knew.'",
      writtenLayer: "'[X] years of [mistake] — here's the fix.' The time frame quantifies the cost of the mistake, making the lesson feel valuable because the price was real.",
      visualLayer: "Show 'old me' content — bad lighting, bad framing, or flat analytics from your early days. The contrast between then and now is the curiosity gap.",
      bestPairedWith: "Mistake & Fix, Failure/Restart, One Thing I Wish I Knew",
      curiosityScore: 83, conversionFit: "virality",
    },

    // ════════════════════════════════════════
    // MAGICIAN — visual pattern interrupt
    // ════════════════════════════════════════
    {
      id: "magician-pattern",
      title: "Magician — Visual Pattern Interrupt",
      tag: "Magician", angle: "Negative Spin", strategy: "standard", trigger: "curiosity",
      psychology: "The most powerful scroll-stopper in short-form content — no context required. The visual stuns the brain's autopilot reflex before the verbal hook even registers. Often stacked with another format underneath.",
      example: "[Open with something visually shocking — a dramatic transformation, an unexpected reveal, or an absurd but relevant prop] 'I didn't believe this would work either.'",
      verbalLayer: "Say nothing for the first 0.5–1 second. Let the visual stun them. Then drop a single sentence of context. The silence + visual combo is the hook — not your words.",
      writtenLayer: "Minimal or no text in the opening second. Let the visual breathe. Add context text only AFTER the stun — to anchor what they just saw.",
      visualLayer: "Use: rapid match cuts of contrasting images, a dramatic physical action (throwing, breaking, revealing), a split-second result reveal, or a clone effect. Movement must start in frame 1.",
      bestPairedWith: "Big Reveal, ARC Formula, Dopamine Ladder",
      curiosityScore: 91, conversionFit: "virality",
    },
    {
      id: "magician-proof",
      title: "Magician — Social Proof Flash",
      tag: "Magician", angle: "Social Proof", strategy: "standard", trigger: "social-proof",
      psychology: "Flash an impressive metric or outcome before saying anything. The brain registers the number first — credibility is established before skepticism can form. Especially powerful for monetization niches.",
      example: "[Flash screenshot: 4.7M views] 'This reel broke every rule I thought I knew. Here's exactly what made it explode.'",
      verbalLayer: "Don't explain the screenshot — just reference it: 'This happened.' Then ask the implied question: 'Here's why.' The viewer fills in the curiosity gap themselves.",
      writtenLayer: "Show the metric — big, bold, unmissable. '4.7M views' or '$47K in 30 days.' The number IS the hook. The rest of the text is just direction to stay.",
      visualLayer: "Flash a real screenshot of the metric, then cut back to you. The authenticity of the real screenshot creates trust that a graphic can't.",
      bestPairedWith: "Case Study, X to Y Journey",
      curiosityScore: 86, conversionFit: "leads",
    },
    {
      id: "magician-pain",
      title: "Magician — Pain Point Visual",
      tag: "Magician", angle: "Targeted Question", strategy: "standard", trigger: "contrarian",
      psychology: "Visually show the viewer their own pain point before they expect it. Creates instant recognition — the viewer sees themselves on screen. 'That's me' recognition is one of the strongest scroll-stops available.",
      example: "[Show a flat, dying analytics graph] 'Sound familiar? The fix starts at second 15.' [Cut to solution reveal]",
      verbalLayer: "'Sound familiar?' or 'Is this yours?' Then silence for 1 second. Then: 'Here's what's causing it — and how to fix it in 48 hours.'",
      writtenLayer: "'This is your account right now.' or 'Every creator who posts without [X] looks like this.' The second-person accusation stops the scroll instantly.",
      visualLayer: "Show a flatlined graph, empty comments section, or a frustrating 'posting into the void' scenario. The viewer's pain visualized externally is devastating and magnetic.",
      bestPairedWith: "Transformation Snapshot, Mistake & Fix",
      curiosityScore: 89, conversionFit: "both",
    },

    // ════════════════════════════════════════
    // INVESTIGATOR — expose the hidden secret
    // ════════════════════════════════════════
    {
      id: "inv-curiosity",
      title: "Investigator — Curiosity Loop",
      tag: "Investigator", angle: "Negative Spin", strategy: "standard", trigger: "curiosity",
      psychology: "Opens a knowledge gap immediately. The contrast is simple: 'Today you don't know the thing → I show you the thing → now you know the thing.' The gap between not-knowing and knowing is irresistible to the human brain.",
      example: "There's a hidden Instagram feature that 99% of creators don't know about — and the ones who do are quietly doubling their reach every week.",
      verbalLayer: "'There's a [hidden/secret/unknown] [thing] that [almost nobody] knows about.' The exclusivity framing — '99%' don't know — makes the viewer feel they're being let into a private circle.",
      writtenLayer: "'Hidden: [secret]' — the word 'hidden' in the text layer creates instant exclusivity. The viewer feels they're about to get access to something restricted.",
      visualLayer: "Show a magnifying glass, a locked door being opened, or a redacted document being revealed. The visual metaphor of uncovering a secret reinforces the investigator frame.",
      bestPairedWith: "Dopamine Ladder, Big Reveal",
      curiosityScore: 90, conversionFit: "virality",
    },
    {
      id: "inv-callout",
      title: "Investigator — Call-Out",
      tag: "Investigator", angle: "Call-Out", strategy: "standard", trigger: "fomo",
      psychology: "Expose a finding that directly threatens or affects a specific group. Urgency + identity + secret knowledge in one hit. The viewer can't afford to not know this because it specifically applies to them.",
      example: "If you're a small creator with under 10K followers, the algorithm is intentionally suppressing your content. Here's the proof — and the escape.",
      verbalLayer: "'If you're a [specific person], [specific thing] is happening to you right now — and you don't know it.' The implication of hidden harm drives immediate attention.",
      writtenLayer: "'[Specific group]: The algorithm is [doing thing to you].' The direct accusation toward a group makes every member of that group feel personally addressed.",
      visualLayer: "Show data, screenshots, or a side-by-side comparison that visually proves the claim. The proof-as-visual is far more powerful than just saying 'trust me.'",
      bestPairedWith: "Breakdown, The Breakthrough",
      curiosityScore: 84, conversionFit: "virality",
    },
    {
      id: "inv-blueball",
      title: "Investigator — Tension Hold",
      tag: "Investigator", angle: "Positive Spin", strategy: "blueball", trigger: "tension",
      psychology: "Withhold the key finding until the final moments. Every sentence is a breadcrumb that deepens the curiosity loop. Tension = Retention — the withholding of the payoff is what physically keeps the viewer watching.",
      example: "I found the exact pattern behind every viral reel in the last 90 days. The answer is not what anyone expects — I'll show you at the end.",
      verbalLayer: "'I found [big thing]. But before I show you — here's what makes this so important.' Use transitional cliffhangers: 'But let me break it down. It's not what you think.'",
      writtenLayer: "'The answer is coming. Stay till the end.' This direct instruction works better than people expect — the brain responds to explicit payoff promises.",
      visualLayer: "Show a teaser visual of the answer (blurred, cropped, or partially revealed) and then cut away. The glimpse creates psychological urgency stronger than the promise alone.",
      bestPairedWith: "Dopamine Ladder, One Thing I Wish I Knew, Big Reveal",
      curiosityScore: 93, conversionFit: "virality",
    },

    // ════════════════════════════════════════
    // CONTRARIAN — challenge mainstream belief
    // ════════════════════════════════════════
    {
      id: "con-bold",
      title: "Contrarian — Bold Statement",
      tag: "Contrarian", angle: "Negative Spin", strategy: "standard", trigger: "contrarian",
      psychology: "Directly challenging a widely-held belief creates cognitive dissonance — the brain cannot resolve the conflict without watching the video. The bigger the belief challenged, the larger the curiosity gap, the stronger the hook.",
      example: "Posting every day is actually killing your Instagram growth. And the advice to 'stay consistent' is the reason you're stuck.",
      verbalLayer: "'[Common belief] is [wrong / a trap / killing your results].' State it flat. No hedging. The confidence of the delivery signals you have proof — the viewer stays to see if you can back it up.",
      writtenLayer: "'[Popular advice]: Wrong.' or '[Mainstream belief] ≠ [real result].' The visual contradiction between what they thought was true and your claim IS the hook.",
      visualLayer: "Show the 'wrong' thing prominently — the daily posting calendar, the tips everyone shares — and then put an X through it. The visual contradiction matches the verbal one.",
      bestPairedWith: "Man in a Hole, The Breakthrough, ARC Formula",
      curiosityScore: 87, conversionFit: "virality",
    },
    {
      id: "con-negative",
      title: "Contrarian — Negative Spin (Trap Reveal)",
      tag: "Contrarian", angle: "Negative Spin", strategy: "standard", trigger: "tension",
      psychology: "Frame a popular tactic as a hidden trap. The viewer has been following the advice — now they discover it might be hurting them. Loss aversion plus urgency plus authority creates one of the highest-retention openings possible.",
      example: "The 'post consistently' advice is a trap. Most creators following it are slowly teaching the algorithm to suppress their content — without knowing it.",
      verbalLayer: "'The [popular advice] is a trap.' Pause. Let the alarm land. Then: 'Here's why — and what to do instead.' The word 'trap' is one of the highest-attention words in content psychology.",
      writtenLayer: "'[Popular advice] = Trap.' The equation format on screen creates a simple, scannable, shareable graphic. Viewers screenshot this and show others — driving shares.",
      visualLayer: "Show someone happily following the 'wrong' advice and then cut to a visual trap snapping shut. Cartoon, metaphor, or literal — the visual trap activates loss aversion instantly.",
      bestPairedWith: "Mistake & Fix, Failure/Restart",
      curiosityScore: 88, conversionFit: "virality",
    },
    {
      id: "con-question",
      title: "Contrarian — Targeted Question",
      tag: "Contrarian", angle: "Targeted Question", strategy: "standard", trigger: "curiosity",
      psychology: "Agitate a specific belief with a direct question. Disarms defensiveness before the reveal — the question frame makes the viewer engage mentally rather than resist. They answer the question in their head, which locks them in.",
      example: "What if the reason your content keeps flopping has nothing to do with your hook, your editing, or your consistency?",
      verbalLayer: "'What if [thing they believe is the problem] isn't actually the problem?' The reversal opens a loop — they need to know what the REAL problem is.",
      writtenLayer: "'What if everything you've been told about [topic] is wrong?' The universal 'everything' creates maximum contrast with minimum words.",
      visualLayer: "Raise your hands, tilt your head, or use a questioning physical gesture that mirrors the confusion the viewer is feeling. Body language that matches the hook text amplifies the message.",
      bestPairedWith: "ARC Formula, The Breakthrough, Man in a Hole",
      curiosityScore: 81, conversionFit: "virality",
    },

    // ════════════════════════════════════════
    // FORTUNE TELLER — remaining angles
    // ════════════════════════════════════════
    {
      id: "ft-targeted",
      title: "Fortune Teller — Targeted Question",
      tag: "Fortune Teller", angle: "Targeted Question", strategy: "standard", trigger: "curiosity",
      psychology: "A forward-looking question aimed at a specific viewer identity. The prediction feels personal — the viewer must answer it to know if the bad future applies to them. Hyper-targeted curiosity gap.",
      example: "Are you a coach who still relies on referrals? Here's what your business looks like in 12 months if that doesn't change.",
      verbalLayer: "'Are you a [specific person who does X]? Here's what happens if you don't [change Y].' The question forces self-identification before the hook even completes.",
      writtenLayer: "'[Identity]: Are you prepared for [future outcome]?' Bold the identity. The self-selection in text happens faster than verbally.",
      visualLayer: "Speak directly into camera, slight lean forward. The direct eye contact reinforces that this prediction is specifically for them.",
      bestPairedWith: "One Decision Story, Challenge to Victory",
      curiosityScore: 79, conversionFit: "leads",
    },
    {
      id: "ft-personal",
      title: "Fortune Teller — Personal Experience",
      tag: "Fortune Teller", angle: "Personal Experience", strategy: "standard", trigger: "desire",
      psychology: "First-person prediction carries unique authority — you lived it. The creator becomes the proof that the predicted future is real. Creates a bridge: 'I already live the future you want.'",
      example: "3 years ago I predicted my account would hit 100K. I was right — and here's exactly why I knew it before it happened.",
      verbalLayer: "'[X years] ago I predicted [your current situation] would lead to [specific outcome]. I was right. Here's why I knew.' Your lived prediction validates the framework.",
      writtenLayer: "'I predicted [outcome] — it happened. Here's how.' The personal stake makes the prediction impossible to dismiss as guesswork.",
      visualLayer: "Show an old post, old screenshot, or 'throwback' visual that proves the prediction was made in advance. Evidence of foresight creates unshakeable credibility.",
      bestPairedWith: "Hero's Journey, X to Y Journey",
      curiosityScore: 76, conversionFit: "both",
    },
    {
      id: "ft-callout",
      title: "Fortune Teller — Call-Out",
      tag: "Fortune Teller", angle: "Call-Out", strategy: "standard", trigger: "fomo",
      psychology: "Directly names a specific audience group and delivers a tailored prediction. The precision of the call-out creates a 'this is about me' moment — FOMO + identity lock-in simultaneously.",
      example: "Every creator under 5K followers who doesn't change this one thing will still be under 5K in a year. Watch to the end if you want to be the exception.",
      verbalLayer: "'Every [specific group] who [keeps doing X] will [negative outcome]. I'm going to show you the exception.' Urgency + exclusion creates immediate attention.",
      writtenLayer: "'[Group]: [Prediction].  Want to be the exception?' The word 'exception' makes every member of the group want to prove themselves different.",
      visualLayer: "Point directly at the camera or hold up a 'you' gesture. Direct address reinforces the personal delivery of the prediction.",
      bestPairedWith: "Transformation Snapshot, Failure/Restart",
      curiosityScore: 81, conversionFit: "leads",
    },
    {
      id: "ft-social",
      title: "Fortune Teller — Social Proof",
      tag: "Fortune Teller", angle: "Social Proof", strategy: "standard", trigger: "social-proof",
      psychology: "A track record of accurate past predictions makes the current prediction credible. Proof of past success becomes the hook — the viewer stays to see if the pattern repeats and if they're next.",
      example: "My last 3 predictions about Instagram all came true. Here's what I'm predicting will happen to creators in the next 90 days — and how to be on the right side of it.",
      verbalLayer: "'My last [X] predictions about [topic] all came true.' Then immediately state the new prediction. The track record removes skepticism before it can form.",
      writtenLayer: "Show the previous predictions as a list — checked off. '✓ [prediction 1] ✓ [prediction 2] → [new prediction].' The visual proof of accuracy is irresistible.",
      visualLayer: "Show a 'prediction scorecard' — past predictions with checkmarks next to each. Then tease the new prediction. Evidence of accuracy drives engagement.",
      bestPairedWith: "Lesson From Others, Case Study Explainer",
      curiosityScore: 77, conversionFit: "both",
    },

    // ════════════════════════════════════════
    // EXPERIMENTER — remaining angles
    // ════════════════════════════════════════
    {
      id: "exp-negative",
      title: "Experimenter — Negative Spin",
      tag: "Experimenter", angle: "Negative Spin", strategy: "standard", trigger: "contrarian",
      psychology: "An experiment that confirms a painful reality is more viral than one that validates hope. Loss aversion kicks in — the viewer needs to know what's hurting them before they can fix it.",
      example: "I tested posting at every 'recommended' time for 30 days. Every single one was wrong for my account. Here's what the data actually showed.",
      verbalLayer: "'I tested [popular advice] and the results were worse than doing nothing. Here's the proof.' The validation of the viewer's own frustration creates immediate shared experience.",
      writtenLayer: "'[Popular advice] = Myth. My data proved it.' Bold the word 'Myth'. Disconfirming expected results is the highest-shock hook format.",
      visualLayer: "Show the flatlined or negative data graph clearly. The visual evidence of the 'failed' experiment is more credible than any claim about results.",
      bestPairedWith: "Mistake & Fix, The Breakthrough",
      curiosityScore: 84, conversionFit: "virality",
    },
    {
      id: "exp-positive",
      title: "Experimenter — Positive Spin",
      tag: "Experimenter", angle: "Positive Spin", strategy: "standard", trigger: "desire",
      psychology: "Leads with the extraordinary positive outcome of the experiment. The result IS the hook — viewers stay to understand the system that produced it. Results-first framing bypasses disbelief.",
      example: "I ran one experiment last month and it tripled my profile visits overnight. I'm showing you every step of what I changed.",
      verbalLayer: "'I ran [one experiment] and [extraordinary positive result] happened. I'm going to break down every step of it.' The specificity of 'one experiment' makes it feel replicable.",
      writtenLayer: "'[Result] from 1 experiment.' The minimalism creates maximum curiosity — how does 1 thing produce that?",
      visualLayer: "Show the positive analytics spike, the DM flood, or the engagement screenshot. The evidence of extraordinary results is the scroll-stopper.",
      bestPairedWith: "X to Y Journey, Challenge to Victory",
      curiosityScore: 78, conversionFit: "both",
    },
    {
      id: "exp-callout",
      title: "Experimenter — Call-Out",
      tag: "Experimenter", angle: "Call-Out", strategy: "standard", trigger: "fomo",
      psychology: "Calls out a specific group and presents experimental data that directly affects them. Creates urgency through group identity — the data is specifically about their situation, not a general finding.",
      example: "I tested 6 different content approaches on accounts with under 1,000 followers. The results are specifically for you if you're in that category — and they're not what any guru told you.",
      verbalLayer: "'I ran this test specifically for [group]. If you're [in that group], this data is about your exact situation.' The specificity of the test population makes the findings feel personal.",
      writtenLayer: "'[Data] for [specific group]. If you're in this category — watch this.' The explicit call-out in text forces self-identification.",
      visualLayer: "Show an A/B test setup or data split screen that visually distinguishes the test groups. The methodical visual signals 'this is science, not opinion.'",
      bestPairedWith: "Transformation Snapshot, Breakdown",
      curiosityScore: 80, conversionFit: "leads",
    },
    {
      id: "exp-howto",
      title: "Experimenter — How-To Process",
      tag: "Experimenter", angle: "How-To Process", strategy: "standard", trigger: "fomo",
      psychology: "Frames a data-backed how-to as an experiment anyone can replicate. The 'I tested it so you don't have to' positioning makes the process feel validated before the viewer even tries it.",
      example: "I tested 12 different posting systems and found the exact 3-step process that consistently outperformed everything else. Here's the system with the data behind it.",
      verbalLayer: "'I tested [X number] approaches. Here's the exact [step-number] process that won.' The testing background makes the how-to irrefutably credible.",
      writtenLayer: "'Tested [number] methods → [winning system].' The testing process displayed as a filter makes the resulting system feel like a proven, refined output.",
      visualLayer: "Show a 'testing board' or process diagram with many options being eliminated one by one until the winning system is left. The elimination visual validates the process.",
      bestPairedWith: "Tutorial, ARC Formula",
      curiosityScore: 73, conversionFit: "leads",
    },

    // ════════════════════════════════════════
    // TEACHER — remaining angles
    // ════════════════════════════════════════
    {
      id: "teacher-positive",
      title: "Teacher — Positive Spin",
      tag: "Teacher", angle: "Positive Spin", strategy: "standard", trigger: "desire",
      psychology: "Lead with the best possible student outcome, then position yourself as the teacher who delivers it. Aspirational desire drives the view — they want the result and need the teacher who can give it.",
      example: "The creators who really understand this one concept are consistently hitting 50K-100K views per Reel. I'm going to teach you the exact principle right now.",
      verbalLayer: "'The [people who understand this] are achieving [extraordinary result]. I'm going to teach you [the exact principle].' Position the lesson as the key that unlocks the desirable group.",
      writtenLayer: "'[Dream result] = [knowing this principle].' Simple equation format shows the viewer that the payoff is in the lesson. Stakes are clear before the teaching begins.",
      visualLayer: "Show examples of the successful outcome — analytics screenshots, viral videos, successful accounts. The visual aspiration creates the desire before the lesson starts.",
      bestPairedWith: "Hero's Journey, X to Y Journey, ARC Formula",
      curiosityScore: 74, conversionFit: "leads",
    },
    {
      id: "teacher-targeted",
      title: "Teacher — Targeted Question",
      tag: "Teacher", angle: "Targeted Question", strategy: "standard", trigger: "curiosity",
      psychology: "The teacher format applied to a diagnostic question. Instead of teaching at the viewer, the question puts them in the role of student who needs to discover if they know the answer or not.",
      example: "Do you know why your Instagram account isn't growing even though you're doing everything right? Most coaches get this wrong too — here's what's actually happening.",
      verbalLayer: "'Do you know why [painful specific thing] keeps happening even when you [do the right things]?' The 'even when you're doing it right' phrase captures creators who feel they've tried everything.",
      writtenLayer: "'Why [good effort] isn't producing [expected result] — here's the real reason.' The question format on screen triggers self-diagnosis in the reader.",
      visualLayer: "Use a whiteboard or visual breakdown to set up the question. The visual of teaching-in-progress signals that the answer is coming and is worth watching.",
      bestPairedWith: "Mistake & Fix, The Breakthrough",
      curiosityScore: 76, conversionFit: "leads",
    },
    {
      id: "teacher-personal-exp",
      title: "Teacher — Personal Experience",
      tag: "Teacher", angle: "Personal Experience", strategy: "standard", trigger: "desire",
      psychology: "The teacher draws the lesson from lived experience, not theory. Firsthand credibility — the lesson is earned through real struggle, not textbooks. The viewer trusts the teacher more because they've been through the exact same thing.",
      example: "I spent 4 years figuring this out the hard way so you don't have to. Here's what I know now that I wish I'd known on day one.",
      verbalLayer: "'I spent [time period] figuring this out the hard way. Here's what I know now.' The time investment is your credibility — it signals the lesson has real value.",
      writtenLayer: "'[X years] of learning → [lesson] in [90 seconds].' You give them the compressed version of your lived experience. The time arbitrage is the hook.",
      visualLayer: "Show your 'before' state — the humble beginning, the mistakes, the learning curve. The contrast between where you started and where you teach from builds respect.",
      bestPairedWith: "One Thing I Wish I Knew, Failure/Restart",
      curiosityScore: 78, conversionFit: "both",
    },
    {
      id: "teacher-social",
      title: "Teacher — Social Proof",
      tag: "Teacher", angle: "Social Proof", strategy: "standard", trigger: "social-proof",
      psychology: "Student results validate the teacher's method more powerfully than the teacher's own claims. The student's transformation IS the proof. Viewers think: 'If a student can do that, so can I.'",
      example: "One of my students went from 800 to 47K followers in 11 weeks using this exact framework. I'm sharing the full system with you today.",
      verbalLayer: "'One of my [students/clients] achieved [specific extraordinary result] using [specific method]. I'm going to teach you the same system.' Real results from real people is irrefutable proof.",
      writtenLayer: "'Student result: [specific outcome] in [timeframe]. Here's the system.' The student framing removes the 'easy for you' objection — if a student got it, anyone can.",
      visualLayer: "Show the student's result (with permission) — their analytics, their testimonial, their before/after. Authentic third-party results are more credible than any graphic.",
      bestPairedWith: "Case Study Explainer, X to Y Journey",
      curiosityScore: 82, conversionFit: "leads",
    },

    // ════════════════════════════════════════
    // MAGICIAN — remaining angles
    // ════════════════════════════════════════
    {
      id: "magician-positive",
      title: "Magician — Positive Reveal",
      tag: "Magician", angle: "Positive Spin", strategy: "standard", trigger: "desire",
      psychology: "Visual reveal of a positive transformation or achievement. The 'reveal' format uses the Magician's visual power to show a desirable outcome before any explanation — desire is triggered before skepticism can form.",
      example: "[Open on hand scrolling through phone showing engagement numbers exploding] 'One change. Two weeks. This is what changed.'",
      verbalLayer: "Delay verbal explanation until after the visual lands. Let the positive outcome be shown first, then say 'Here's what created this.' The visual proof precedes the verbal claim.",
      writtenLayer: "Minimal text on the reveal frame — let the visual breathe. Only add context text AFTER the reveal: 'This happened in 14 days.' Text anchors the stunning visual.",
      visualLayer: "Open directly on the positive outcome: exploding analytics, packed DMs, viral view count. The reveal should be immediate — frame 1 shows the desirable result.",
      bestPairedWith: "Transformation Snapshot, One Decision Story",
      curiosityScore: 84, conversionFit: "both",
    },
    {
      id: "magician-personal",
      title: "Magician — Personal Visual Experience",
      tag: "Magician", angle: "Personal Experience", strategy: "standard", trigger: "curiosity",
      psychology: "The creator's own visual transformation is the pattern interrupt. First-person reveal of a personal result through visual storytelling — the viewer is pulled into the creator's journey through what they see, not what they're told.",
      example: "[Open on old 'before' clip, then rapid cut to current 'after' state] 'This is what [X years] of learning the hard truth about content looks like.'",
      verbalLayer: "Narrate the visual journey in real time. 'This was me [X time ago]... and this is me now.' The contrast between past and present self is the story.",
      writtenLayer: "'[Before] → [After]. This is [X years] in [Y seconds].' The time compression in text makes the transformation feel dramatic and achievable.",
      visualLayer: "Open on your 'before' — old low-quality content, old analytics, old setup. Then hard cut to 'after.' The visual contrast IS the hook — no explanation needed.",
      bestPairedWith: "X to Y Journey, Hero's Journey",
      curiosityScore: 86, conversionFit: "virality",
    },
    {
      id: "magician-callout",
      title: "Magician — Call-Out Visual",
      tag: "Magician", angle: "Call-Out", strategy: "standard", trigger: "fomo",
      psychology: "Show the visual reality of a specific group before calling them out. When a person sees their own situation visually represented, the personal recognition is stronger than any verbal call-out.",
      example: "[Show a generic, forgettable Instagram feed] 'If your feed looks like this, you're invisible. Here's the one visual change that fixes it instantly.'",
      verbalLayer: "'If you're [specific person] and your [thing] looks like [what they just showed], here's what's happening — and the fix.' Name the group after showing their visual reality.",
      writtenLayer: "'Does your [thing] look like this? → [Visual] → Here's the fix.' The visual evidence of the problem makes the call-out irrefutable.",
      visualLayer: "Show the 'problem' visual first — the generic feed, the flat design, the boring thumbnail. Then cut to the 'fixed' version. The before/after visual contrast is the entire hook.",
      bestPairedWith: "Transformation Snapshot, Mistake & Fix",
      curiosityScore: 85, conversionFit: "leads",
    },
    {
      id: "magician-howto",
      title: "Magician — How-To Visual",
      tag: "Magician", angle: "How-To Process", strategy: "standard", trigger: "fomo",
      psychology: "Show the final result of the how-to before explaining the steps. The desired output creates the motivation to watch the process. 'This is what you'll be able to do' creates immediate desire.",
      example: "[Open on the finished, viral-ready visual product being completed] 'I'm going to show you how I built this in under 5 minutes — and why it gets 10× the engagement.'",
      verbalLayer: "Show the finished product first, verbally say 'I made this in [short timeframe]. Here's the exact process.' The time investment revelation makes the how-to feel achievable.",
      writtenLayer: "'Result first: [show it]. Process: [step count] steps, [time needed].' Front-loading the outcome and the ease of the process removes commitment anxiety.",
      visualLayer: "Open on the polished end result — the designed graphic, the edited clip, the completed system. The viewer immediately wants what they see before you've said a word.",
      bestPairedWith: "Tutorial, ARC Formula",
      curiosityScore: 74, conversionFit: "leads",
    },

    // ════════════════════════════════════════
    // INVESTIGATOR — remaining angles
    // ════════════════════════════════════════
    {
      id: "inv-targeted",
      title: "Investigator — Targeted Question",
      tag: "Investigator", angle: "Targeted Question", strategy: "standard", trigger: "curiosity",
      psychology: "Ask the question the viewer has been afraid to ask themselves. The investigator framing positions the answer as research-backed, not opinion. Credibility + urgency + personal stake in one frame.",
      example: "Have you ever wondered why some accounts with worse content than yours consistently get 10× your views? I investigated 200 accounts to find the exact pattern — and it's not what you think.",
      verbalLayer: "'Have you ever wondered why [painful mystery]? I [investigated/researched/studied] [specific scope] to find the exact [answer].' The investigation scale creates credibility.",
      writtenLayer: "'The question: [mystery]. The investigation: [scope]. The answer: →' The structured question-to-answer progression makes the viewer commit to staying for the reveal.",
      visualLayer: "Show a 'case file' aesthetic — data tables, highlighted accounts, annotated screenshots. The visual of rigorous research makes the answer feel empirically proven.",
      bestPairedWith: "Breakdown, Big Reveal",
      curiosityScore: 82, conversionFit: "virality",
    },
    {
      id: "inv-personal",
      title: "Investigator — Personal Experience",
      tag: "Investigator", angle: "Personal Experience", strategy: "standard", trigger: "curiosity",
      psychology: "First-person investigation creates both credibility AND relatability. You're not a detached researcher — you had a personal reason to investigate. The personal stake in the investigation makes the findings feel urgent.",
      example: "My account started getting suppressed 3 months ago and I had no idea why. I spent 6 weeks investigating the exact cause — and what I found shocked me.",
      verbalLayer: "'[Something happened to me]. I spent [time] investigating why. What I found will [change how you think about X].' The personal investigation is more compelling than a theoretical study.",
      writtenLayer: "'I investigated my own [problem]. Here's what I found.' First-person investigation builds instant trust — you have personal skin in the game.",
      visualLayer: "Show your personal 'case file' — screenshots, notes, tracking spreadsheets from your own investigation. The personal evidence is more compelling than generic data.",
      bestPairedWith: "Man in a Hole, Mistake & Fix",
      curiosityScore: 83, conversionFit: "virality",
    },
    {
      id: "inv-howto",
      title: "Investigator — How-To Process",
      tag: "Investigator", angle: "How-To Process", strategy: "standard", trigger: "fomo",
      psychology: "Frames a how-to as the output of investigation — not opinion, but evidence-backed process. The investigative foundation makes the steps feel tested and validated, not just recommended.",
      example: "After analyzing 500 viral reels, I found the exact 4-step process they all follow — even though none of these creators know each other. Here's the pattern.",
      verbalLayer: "'After [analyzing/studying] [large scale], I identified the exact [step number] steps that [specific result]. Here's the process.' Research-backed how-to is irrefutable.",
      writtenLayer: "'[Scale of research] → [number]-step proven process.' The research scale displayed before the process validates every step that follows.",
      visualLayer: "Show the research setup — the spreadsheet with hundreds of accounts, the analysis framework. Then transition to the clean step-by-step visual. Research-to-process narrative.",
      bestPairedWith: "Tutorial, Case Study Explainer",
      curiosityScore: 76, conversionFit: "leads",
    },
    {
      id: "inv-social",
      title: "Investigator — Social Proof",
      tag: "Investigator", angle: "Social Proof", strategy: "standard", trigger: "social-proof",
      psychology: "Present the pattern found across many successful people or accounts. Collective social proof is stronger than a single case study — if this many people achieved it this way, the evidence is overwhelming.",
      example: "I studied 50 creators who grew to 100K this year. Every single one of them did this one specific thing in their first 90 days. Here's what they all have in common.",
      verbalLayer: "'I studied [number] [successful people/accounts]. Every single one [did specific thing]. Here's the universal pattern.' The universality across many people makes the finding feel like law, not luck.",
      writtenLayer: "'[Number] creators studied. [Number] had this in common: [pattern].' The research numbers as visual evidence is more compelling than any claim.",
      visualLayer: "Show a collage or montage of the studied accounts/people — their logos, their profile pictures, their results side by side. The collective proof is visual and overwhelming.",
      bestPairedWith: "Lesson From Others, Breakdown",
      curiosityScore: 80, conversionFit: "both",
    },

    // ════════════════════════════════════════
    // CONTRARIAN — remaining angles
    // ════════════════════════════════════════
    {
      id: "con-positive",
      title: "Contrarian — Positive Spin",
      tag: "Contrarian", angle: "Positive Spin", strategy: "standard", trigger: "contrarian",
      psychology: "Contrarian positive is underused — most contrarians predict doom. Predicting that a dismissed idea actually works is equally disruptive. 'Everyone says this won't work — here's why they're wrong.'",
      example: "Everyone says you need a big audience before you can make money on Instagram. I had 600 followers and hit $5K in one month. Here's the exact system that makes audience size irrelevant.",
      verbalLayer: "'Everyone says [widely-held limiting belief]. Here's proof that it's wrong — and what's actually possible.' Lead with the positive result that disproves the negative belief.",
      writtenLayer: "'[Limiting belief everyone believes]: Wrong. Proof: [positive outcome].' The direct contradiction of a limiting belief with real evidence is maximum hook power.",
      visualLayer: "Show the evidence that breaks the rule — the small account with big revenue, the 'ugly' video with millions of views. The visual proof is more powerful than the verbal claim.",
      bestPairedWith: "Man in a Hole, The Breakthrough",
      curiosityScore: 83, conversionFit: "virality",
    },
    {
      id: "con-personal-exp",
      title: "Contrarian — Personal Experience",
      tag: "Contrarian", angle: "Personal Experience", strategy: "standard", trigger: "contrarian",
      psychology: "The creator's own life contradicts the mainstream advice. Personal lived experience as contrarian evidence — you didn't just think the advice was wrong, you proved it by living the opposite.",
      example: "I stopped following every content creation rule I was taught — no niche, no schedule, no hooks — and my account grew 3× faster. Here's what I learned by going against everything.",
      verbalLayer: "'I [did the opposite of popular advice] and [better result happened]. Here's why breaking the rules worked.' Personal rule-breaking with better results is the most viral contrarian frame.",
      writtenLayer: "'I broke every rule. Results: [better outcome].' The personal defiance followed by superior results creates instant interest.",
      visualLayer: "Show yourself actively doing the 'wrong' thing — posting without a schedule, breaking a rule visually. Then cut to the positive results. The lived rule-breaking is the proof.",
      bestPairedWith: "Failure/Restart, One Decision Story",
      curiosityScore: 85, conversionFit: "virality",
    },
    {
      id: "con-callout",
      title: "Contrarian — Call-Out",
      tag: "Contrarian", angle: "Call-Out", strategy: "standard", trigger: "contrarian",
      psychology: "Call out a specific group who is following mainstream advice and directly challenge what they believe. The precision of the call-out amplifies the cognitive dissonance — they know exactly which advice they're being told is wrong.",
      example: "If you're a business coach telling clients to 'post every day', I need you to hear this — you are actively hurting their growth. Here's the data.",
      verbalLayer: "'If you are [specific person following specific advice], I need you to hear this directly: [specific advice] is [wrong/harmful/outdated]. Here's why.' The directness of the call-out is the hook.",
      writtenLayer: "'[Specific person]: [Specific advice] = [Specific harm].' The equation format makes the contrarian point scannable and shareable.",
      visualLayer: "Look directly into the camera with authority. No b-roll — pure direct eye contact for the call-out. The gravity of the delivery matches the gravity of the message.",
      bestPairedWith: "Mistake & Fix, The Breakthrough",
      curiosityScore: 87, conversionFit: "virality",
    },
    {
      id: "con-howto",
      title: "Contrarian — How-To Process",
      tag: "Contrarian", angle: "How-To Process", strategy: "standard", trigger: "contrarian",
      psychology: "A how-to that directly contradicts the standard approach. The contrarian process is more memorable because it challenges what the viewer already knows — they must watch to understand why the 'wrong' way works.",
      example: "Here's how I grew to 50K followers by doing the exact opposite of what every growth course teaches: no posting schedule, no niche, and zero engagement pods.",
      verbalLayer: "'Here's the [step-number] step process I used to [result] — and every single step is the OPPOSITE of what you've been taught.' Frame each step as a rule broken.",
      writtenLayer: "'The [anti-method]: [step 1 contradiction] → [step 2 contradiction] → [step 3 contradiction] → [result].' The anti-process visual makes every step a micro-hook.",
      visualLayer: "Show the 'standard' process being crossed out or discarded as you introduce each contrarian step. The visual rejection of the mainstream makes each step memorable.",
      bestPairedWith: "ARC Formula, The Breakthrough",
      curiosityScore: 80, conversionFit: "virality",
    },
    {
      id: "con-social",
      title: "Contrarian — Social Proof",
      tag: "Contrarian", angle: "Social Proof", strategy: "standard", trigger: "contrarian",
      psychology: "Uses evidence from others to support the contrarian claim — not just personal opinion. When multiple credible people or accounts defy the mainstream advice, the contrarian case becomes empirical.",
      example: "The 10 fastest-growing accounts in my niche all have one thing in common: they completely ignore the #1 piece of advice every expert gives. I studied them all to understand why.",
      verbalLayer: "'The [most successful people in X] all [do the contrarian thing]. Not one of them follows [mainstream advice]. Here's what they know that everyone else doesn't.'",
      writtenLayer: "'[Best performers in niche]: ALL break [popular rule]. Here's what they do instead.' The collective example makes the contrarian stance evidence-based.",
      visualLayer: "Show logos or profile pictures of the 'proof' accounts/people. Then show the mainstream advice being ignored by all of them. Collective visual defiance of the norm.",
      bestPairedWith: "Lesson From Others, Case Study Explainer",
      curiosityScore: 86, conversionFit: "virality",
    },

    // ════════════════════════════════════════
    // BLUEBALL STRATEGY — tension = retention
    // ════════════════════════════════════════
    {
      id: "blueball-belief",
      title: "Blueball — Trigger the Belief",
      tag: "Blueball", angle: "Personal Experience", strategy: "blueball", trigger: "tension",
      psychology: "The Blueball strategy is pure tension engineering: get the viewer emotionally invested, hint at the answer, then actively delay the payoff. The longer the tension holds, the deeper the engagement. Do NOT reveal the solution in the first 5-10 seconds.",
      example: "You don't need discipline to lose weight. Let me explain. [Pause — then build context for 20+ seconds before the reveal]",
      verbalLayer: "Step 1: Say something that either validates their belief OR completely challenges it. Step 2: Insert cliffhanger — 'But let me break it down. It's not what you think.' Step 3: HOLD the payoff through storytelling, analogy, or context-building.",
      writtenLayer: "Show only the provocative opening statement — don't tease the answer in text. The text hook creates the open loop. The payoff comes through speaking, making them watch rather than just read.",
      visualLayer: "Show a scenario mid-action — not the start, not the end. Catching the viewer in the middle of something they need context to understand forces them to watch backwards.",
      bestPairedWith: "Dopamine Ladder, Big Reveal, 5-Step Retention",
      curiosityScore: 94, conversionFit: "virality",
    },
    {
      id: "blueball-withhold",
      title: "Blueball — Withhold the Payoff",
      tag: "Blueball", angle: "Call-Out", strategy: "blueball", trigger: "tension",
      psychology: "Explicitly tell the viewer the payoff is coming, but build through 3 layers of tension before delivering it. Each layer of setup compounds the desire for the resolution. Used by the highest-retention creators worldwide.",
      example: "I'm going to show you the one thing that's quietly destroying your Instagram reach — but first you need to understand why this matters more than your hook.",
      verbalLayer: "Promise the payoff explicitly: 'I'll show you X — but first, [essential context].' The explicit promise creates a committed viewer. The 'but first' delays the payout ethically while maintaining trust.",
      writtenLayer: "'[Payoff] coming — but read this first.' or '[Answer] in 30 seconds — here's why it matters.' On-screen countdown or promise increases commitment.",
      visualLayer: "Build a sequence of visuals that set up context BEFORE the reveal. The reveal visual should feel earned by the setup — like the last piece of a puzzle clicking into place.",
      bestPairedWith: "Dopamine Ladder, Investigator Hooks",
      curiosityScore: 91, conversionFit: "both",
    },

    // ── Blueball: remaining angles ──
    {
      id: "blueball-negative",
      title: "Blueball — Negative Tension Build",
      tag: "Blueball", angle: "Negative Spin", strategy: "blueball", trigger: "tension",
      psychology: "Open with a alarming negative statement, then deliberately hold the resolution. The viewer is trapped between the pain of the problem and the need for the fix — tension at its highest.",
      example: "Your engagement isn't dropping because of the algorithm. The real reason is much worse — and I'll show you at the end of this video.",
      verbalLayer: "'[Alarming negative statement]. But it's not what you think — and the real reason is [more alarming implication]. Let me build up to it.' Delay the answer through layered context.",
      writtenLayer: "'[The negative truth] → coming at the end.' Show the tension on screen: the problem, then the promise of the reveal. Text hook creates the open loop.",
      visualLayer: "Open on the visual of the problem — the flatlined graph, the empty comments — then blur or cut away before the explanation. The deliberately incomplete visual forces continued watching.",
      bestPairedWith: "Man in a Hole, Big Reveal",
      curiosityScore: 90, conversionFit: "virality",
    },
    {
      id: "blueball-positive",
      title: "Blueball — Positive Tension Build",
      tag: "Blueball", angle: "Positive Spin", strategy: "blueball", trigger: "tension",
      psychology: "Tease an extraordinary positive outcome, then delay the method. The viewer desperately wants the result — and the longer you hold the method, the more they want it. Desire + delay = maximum retention.",
      example: "I found the exact formula that can 10× your reach in under 30 days. But before I share it — you need to understand something that changes everything about how it works.",
      verbalLayer: "'I found [extraordinary positive outcome method]. But before I show you, there's something critical you need to understand first.' The 'but first' delays ethically while building anticipation.",
      writtenLayer: "'[Extraordinary result]: possible. Here's how — [answer coming].' The explicit promise of the payoff creates a committed viewer who waits.",
      visualLayer: "Flash the positive result visual (the metric, the growth, the outcome) for 1-2 seconds, then cut away to build context. The glimpse of the prize is more compelling than a full reveal.",
      bestPairedWith: "Dopamine Ladder, X to Y Journey",
      curiosityScore: 92, conversionFit: "both",
    },
    {
      id: "blueball-targeted",
      title: "Blueball — Targeted Question Tension",
      tag: "Blueball", angle: "Targeted Question", strategy: "blueball", trigger: "tension",
      psychology: "Ask a question with a non-obvious answer, then build tension by promising to answer while actually layering context first. The viewer needs to know the answer — withholding it temporarily creates maximum suspense.",
      example: "What's the single biggest reason your content isn't going viral? I know the exact answer — and you won't guess it. I'll tell you in a moment, but first you need to see this.",
      verbalLayer: "'What [question]? I know the exact answer — and it's not what you're thinking. But before I tell you, [essential context].' Promise + delay is the Blueball core mechanic.",
      writtenLayer: "'The answer to [question]: → coming. But first, this.' The text sets up the promise while verbally delivering the context — two-layer retention system.",
      visualLayer: "Show a teaser of the answer (blurred, obscured, or partially revealed) while delivering the context. The visual tease reinforces the verbal promise.",
      bestPairedWith: "Big Reveal, Dopamine Ladder",
      curiosityScore: 89, conversionFit: "virality",
    },
    {
      id: "blueball-howto",
      title: "Blueball — How-To Delayed Reveal",
      tag: "Blueball", angle: "How-To Process", strategy: "blueball", trigger: "tension",
      psychology: "Promise a specific how-to process, then deliberately delay the actual steps. Build the 'why it works' and 'what's at stake' before revealing the 'how.' Context before method maximizes perceived value.",
      example: "I'm about to show you the exact 4-step process that grows any account in any niche — but before I do, you need to understand why most people fail at step 1.",
      verbalLayer: "'I'm going to show you the exact [step-number] process for [result]. But first, you need to understand [why most people fail / what makes this work].' The 'but first' with a genuine reason is the ethical delay.",
      writtenLayer: "'The [step-number]-step process for [result] — step 1 revealed at [timestamp/after context].' The explicit delay with a reason creates an impatient, engaged viewer.",
      visualLayer: "Show a preview of the process steps (numbered but blurred or partially blocked). The viewer can see the structure is coming — just not the content yet. Structural preview drives anticipation.",
      bestPairedWith: "Tutorial, Problem Solver",
      curiosityScore: 88, conversionFit: "leads",
    },
    {
      id: "blueball-social",
      title: "Blueball — Social Proof Tension",
      tag: "Blueball", angle: "Social Proof", strategy: "blueball", trigger: "tension",
      psychology: "Show a jaw-dropping social proof result upfront, then withhold the explanation. The viewer has already seen the evidence — now they need the method. Result + delay = irresistible tension.",
      example: "[Flash: 4.8M views screenshot] 'This broke every metric I track. I'll explain exactly why it worked — but the answer will genuinely surprise you. Give me 90 seconds to set it up properly.'",
      verbalLayer: "Show the result immediately, then say 'The reason this happened is NOT what you think — give me [short time] to set up the context properly.' The explicit time ask creates a committed viewer.",
      writtenLayer: "'[Extraordinary result] — reason revealed in [timeframe].' The countdown or promise in text makes the viewer consciously commit to staying.",
      visualLayer: "Flash the proof (screenshot, metric, result) — hold it for 2 seconds — then cut to you starting the context. The proof is the hook; the cut is the tension.",
      bestPairedWith: "Dopamine Ladder, Case Study Explainer",
      curiosityScore: 93, conversionFit: "both",
    },

    // ════════════════════════════════════════
    // DESIRE-BASED HOOKS — for conversions/leads
    // (Formula: Dream Outcome + Relatable Character + Minimal Constraints)
    // ════════════════════════════════════════
    {
      id: "desire-about-me",
      title: "Desire-Based — About Me (Creator as Character)",
      tag: "Desire-Based", angle: "Personal Experience", strategy: "desire", trigger: "desire",
      psychology: "The creator achieved the dream outcome WITH minimal conditions — removing the excuse that 'that wouldn't work for me'. When the viewer sees someone relatable achieving the desired outcome, they self-insert and become 1000% hooked on the HOW.",
      example: "I took a full month off from posting and still grew by 11,000 followers — and this is exactly why it happened.",
      verbalLayer: "'I just [achieved dream outcome] by [doing minimal/unusual thing].' The minimal conditions are the key: 'without posting', 'in just 3 weeks', 'spending $0'. Remove every excuse before they form it.",
      writtenLayer: "'[Dream outcome] + [Zero constraint]' — 'Grew 11K followers without posting a single video.' The paradox format is inherently shareable because it seems impossible.",
      visualLayer: "Show yourself in the 'after' state — relaxed, not stressed, not grinding. The visual of effortless achievement combined with the result is the desire trigger.",
      bestPairedWith: "X to Y Journey, One Decision Story",
      curiosityScore: 88, conversionFit: "leads",
    },
    {
      id: "desire-if-i",
      title: "Desire-Based — If I (Forward-Looking)",
      tag: "Desire-Based", angle: "How-To Process", strategy: "desire", trigger: "desire",
      psychology: "Hypothetical forward framing — the creator positions themselves as the guide for a fresh start. 'If I were starting from scratch' removes the 'you already have an advantage' objection. The viewer believes the method is accessible to them right now.",
      example: "If I were starting my Instagram from zero today, here's the exact 3-step system I would use to make my first $10K from content — in under 60 days.",
      verbalLayer: "'If I [hypothetical starting condition], here's exactly what I would do to [dream outcome] in [specific time frame].' The specificity of the time frame creates urgency and credibility.",
      writtenLayer: "'Starting from zero: [X]-step system → [dream outcome].' The 'from zero' phrase eliminates the 'easy for you but not for me' objection before it forms.",
      visualLayer: "Show a blank slate — empty phone, fresh profile, day 1 setup. The 'from scratch' visual confirms the starting condition and makes the journey feel achievable.",
      bestPairedWith: "Hero's Journey, 5-Part Story Arc",
      curiosityScore: 85, conversionFit: "leads",
    },
    {
      id: "desire-to-you",
      title: "Desire-Based — To You (Viewer as Character)",
      tag: "Desire-Based", angle: "Targeted Question", strategy: "desire", trigger: "desire",
      psychology: "Shifts the character from creator to viewer — the viewer is now the protagonist. No relatability test required because they ARE the character. Direct address using 'you' bypasses the self-comparison step and delivers the dream outcome straight.",
      example: "If you want to turn your Instagram content into your main source of income this year, this one strategy will get you there faster than anything else you've tried.",
      verbalLayer: "'If you want [dream outcome], [specific method] will get you there.' Lead with THEIR desire, not your achievement. The viewer should nod before you finish the first sentence.",
      writtenLayer: "'You + [Dream Outcome] + [Method].' Second-person address on screen creates the feeling of a personal DM, not a broadcast. It stops the scroll because it feels targeted.",
      visualLayer: "Point at the camera or gesture toward the viewer's side of the screen. The physical gesture toward 'you' reinforces the second-person frame.",
      bestPairedWith: "Tutorial Angle, 5-Line Method",
      curiosityScore: 82, conversionFit: "leads",
    },
    {
      id: "desire-heshejust",
      title: "Desire-Based — He/She Just Did (Third Party)",
      tag: "Desire-Based", angle: "Social Proof", strategy: "desire", trigger: "social-proof",
      psychology: "A relatable third party achieved the dream outcome — not a guru, not someone with unfair advantages. If THAT person can do it, anyone can. The relatability of the character amplifies the aspirational power of the outcome.",
      example: "This 23-year-old creator just sold $200K worth of digital products using only his iPhone — no big budget, no team, no prior audience.",
      verbalLayer: "'[Specific relatable person] just [achieved dream outcome] using only [minimal resource/condition].' The 'only' is critical — it strips away every constraint the viewer was about to use as an excuse.",
      writtenLayer: "'[Relatable person] + [Dream outcome] + [Impossible condition].' The contrast between the person (ordinary) and the result (extraordinary) is the scroll-stopper.",
      visualLayer: "Show the third party in action — the iPhone recording setup, the Canva design, the simple tool. The accessible visual confirms the 'anyone can do this' promise.",
      bestPairedWith: "Case Study, Lesson From Others, X to Y Journey",
      curiosityScore: 90, conversionFit: "leads",
    },

    // ── Desire-Based: remaining angles ──
    {
      id: "desire-negative",
      title: "Desire-Based — Negative to Dream (Pain to Desire)",
      tag: "Desire-Based", angle: "Negative Spin", strategy: "desire", trigger: "desire",
      psychology: "Lead with the pain the viewer is currently experiencing, then pivot to the dream outcome as the escape. The desire is made stronger by contrast — the worse the current pain, the more desirable the dream.",
      example: "Tired of posting every day and seeing zero growth? There's a way out of that cycle — and it doesn't involve posting more. Here's what I did instead.",
      verbalLayer: "'Tired of [painful current state]? [Dream outcome] is possible — and it doesn't require [the thing they dread most].' The removal of the hardest constraint makes the desire accessible.",
      writtenLayer: "'[Pain] → [Dream outcome] without [biggest obstacle].' The equation format shows the escape route at a glance.",
      visualLayer: "Open on the visual of the pain (tired face, flatlined stats, overflowing to-do list), then cut to the visual of the dream (relaxed, numbers climbing). The contrast makes the desire visceral.",
      bestPairedWith: "Man in a Hole, Transformation Snapshot",
      curiosityScore: 82, conversionFit: "leads",
    },
    {
      id: "desire-positive",
      title: "Desire-Based — Pure Dream State",
      tag: "Desire-Based", angle: "Positive Spin", strategy: "desire", trigger: "desire",
      psychology: "Open entirely in the dream outcome — no pain, no backstory. Let the viewer imagine themselves in the desirable state first. The positive desire is the hook; the method is what keeps them.",
      example: "Imagine waking up to $3,000 in sales from a single Instagram post you scheduled 3 days ago. That's a real possibility — and I'll show you the exact setup that makes it happen.",
      verbalLayer: "'Imagine [vivid dream scenario]. That's not fantasy — that's [possible through specific method]. Here's how.' The 'not fantasy' reframe is critical — grounds the aspiration in reality.",
      writtenLayer: "'[Dream scenario]: possible. Here's the exact setup.' The 'possible' word is key — it converts a wish into a goal.",
      visualLayer: "Open on the visual of the dream state — the passive income notification, the full DMs, the sold-out offer. Pure aspiration before any explanation.",
      bestPairedWith: "One Decision Story, X to Y Journey",
      curiosityScore: 79, conversionFit: "leads",
    },
    {
      id: "desire-callout",
      title: "Desire-Based — Call-Out to Dream",
      tag: "Desire-Based", angle: "Call-Out", strategy: "desire", trigger: "desire",
      psychology: "Call out a specific person who has a specific dream. The combination of identity recognition ('that's me') and dream outcome ('that's what I want') creates the strongest desire hook possible.",
      example: "This is for the coach who wants to hit $10K months from Instagram without spending a single dollar on ads. Here's the exact path — step by step.",
      verbalLayer: "'This is specifically for [identity] who wants [specific dream outcome] without [biggest constraint]. Here's the exact path.' Maximum specificity creates maximum resonance.",
      writtenLayer: "'[Identity] → [Dream outcome] → [zero constraint]. Here's how.' The identity-first format ensures the right person immediately self-selects and commits to watching.",
      visualLayer: "Point at the camera or place text directly addressing the viewer. The 'this is for YOU specifically' visual reinforces the personal delivery of the dream.",
      bestPairedWith: "Tutorial, 5-Line Story Method",
      curiosityScore: 84, conversionFit: "leads",
    },

    // ════════════════════════════════════════
    // $450M FUNNEL-STAGE HOOKS
    // ════════════════════════════════════════
    {
      id: "tofu-swap",
      title: "TOFU Cold — The Swap Hook",
      tag: "Funnel-Stage", angle: "Negative Spin", strategy: "tofu", trigger: "curiosity",
      psychology: "Cold traffic has never heard of you. Your only job is to stop the scroll and spark curiosity. The Swap Hook leverages brand recognition of a known inferior product to position yours as the upgrade — zero context required.",
      example: "[Show popular competitor/old product — then throw it out of frame and roll in your solution] 'I swapped this for this. Never going back.'",
      verbalLayer: "'I swapped [familiar inferior thing] for [your solution].' The simplicity is the genius — no explanation needed. The viewer's brain fills in the 'why' and stays to confirm their guess.",
      writtenLayer: "'[Old thing] → [New thing]. Here's why.' The arrow format is one of the most-shared visual structures in short-form content.",
      visualLayer: "Physically throw the competitor/old product out of frame and roll in your solution. The dramatic physical action IS the hook — movement, contrast, and resolution in 3 seconds.",
      bestPairedWith: "Transformation Snapshot, The Breakthrough",
      curiosityScore: 79, conversionFit: "virality",
    },
    {
      id: "mofu-separation",
      title: "MOFU Warm — The Separation Hook",
      tag: "Funnel-Stage", angle: "Contrarian", strategy: "mofu", trigger: "contrarian",
      psychology: "Warm traffic knows the problem exists and is evaluating solutions. The Separation Hook directly positions you against the generic market — 'this is different' — targeting people already looking to buy and giving them a clear reason to choose you.",
      example: "This is not your regular [content/product/strategy]. This is the system that the top 1% actually use — and it's nothing like what everyone else is teaching.",
      verbalLayer: "'This is not your regular [thing].' Pause. 'Here's what makes it different.' The 'not regular' frame triggers the warm audience who is tired of generic options.",
      writtenLayer: "'Not [generic thing]. [Your specific differentiator].' The negation format creates instant contrast on screen — the viewer immediately understands this is a new category.",
      visualLayer: "Show the 'generic' version first (blurred, generic-looking), then reveal yours. The contrast makes the differentiation visual rather than just verbal.",
      bestPairedWith: "The Breakthrough, Big Reveal",
      curiosityScore: 74, conversionFit: "leads",
    },
    {
      id: "bofu-objection",
      title: "BOFU Hot — The Objection Slayer",
      tag: "Funnel-Stage", angle: "Personal Experience", strategy: "bofu", trigger: "desire",
      psychology: "Hot traffic is ready to buy but held back by a specific objection — price, time, fear of failure, or past disappointment. Naming and addressing the objection directly removes the last psychological barrier between them and the purchase.",
      example: "I've been using this system for 60 days straight, so you don't have to guess if it works. Here's what actually happened — the good, the bad, and the ROI.",
      verbalLayer: "'I've been [doing X] for [specific time], so you don't have to [fear the uncertainty].' You absorb the risk for them. The time invested is the proof of seriousness.",
      writtenLayer: "'[Time] of testing → honest results.' The 'honest results' framing addresses the trust objection before it's voiced. Hot traffic wants proof, not promises.",
      visualLayer: "Show a journal, a tracking sheet, or a progress log — evidence of the sustained effort. The physical proof of consistency is more convincing than any claim.",
      bestPairedWith: "Case Study, Lesson From Others",
      curiosityScore: 71, conversionFit: "leads",
    },
    // ── Funnel-Stage: remaining angles ──
    {
      id: "tofu-positive",
      title: "TOFU Cold — Positive Aspiration Hook",
      tag: "Funnel-Stage", angle: "Positive Spin", strategy: "tofu", trigger: "desire",
      psychology: "Cold traffic is aspirational — they want to discover something exciting they didn't know was possible. Lead with a dazzling positive outcome that makes the scroll stop mid-motion. No context needed.",
      example: "[Show a creator's laptop on a beach] 'This person made $47K last month — working 12 hours a week. They only have 8,200 followers. Here's the system.'",
      verbalLayer: "'[Extraordinary positive result] — achieved with [surprisingly minimal resource/effort]. Here's the system.' Cold traffic needs a reason to stop — make the result undeniable.",
      writtenLayer: "'[Dream outcome] + [Minimal conditions]. Possible for anyone.' TOFU hooks must be broad enough to stop any scroller — lead with the universal aspiration.",
      visualLayer: "Show the lifestyle or result that ANY person would find appealing — the freedom, the income, the growth. Cold traffic has no preconceptions — pure aspiration is the best visual hook.",
      bestPairedWith: "X to Y Journey, Transformation Snapshot",
      curiosityScore: 77, conversionFit: "virality",
    },
    {
      id: "mofu-targeted",
      title: "MOFU Warm — Targeted Question Hook",
      tag: "Funnel-Stage", angle: "Targeted Question", strategy: "mofu", trigger: "curiosity",
      psychology: "Warm traffic knows the problem but hasn't committed to a solution. A targeted question that directly addresses their specific stage of awareness — 'you know you have this problem, but do you know THIS about it?' — creates the urgency to choose now.",
      example: "Do you know which type of content is responsible for 80% of your profile visits — and which type is actually repelling your ideal client? Most coaches get this completely backwards.",
      verbalLayer: "'Do you know [specific thing about their problem they probably don't]? Most [their identity] get this backwards.' Warm traffic knows the surface problem — the question reveals a deeper layer.",
      writtenLayer: "'The [question] your competitors can't answer — can you?' Warm traffic is in comparison mode — make the question a differentiator.",
      visualLayer: "Show a comparison visual — two paths, two options, two outcomes. Warm traffic is evaluating; give them something concrete to compare against.",
      bestPairedWith: "Breakdown, Listicle",
      curiosityScore: 75, conversionFit: "leads",
    },
    {
      id: "tofu-callout",
      title: "TOFU Cold — Call-Out Hook",
      tag: "Funnel-Stage", angle: "Call-Out", strategy: "tofu", trigger: "fomo",
      psychology: "Cold traffic responds to unexpected specificity. A hyper-specific call-out in a cold environment creates the 'did they just describe me exactly?' moment — FOMO is triggered because the viewer suddenly feels they're missing something designed specifically for them.",
      example: "[Camera directly] 'This is for anyone who's tried posting consistently for 6+ months and still hasn't grown past 2,000 followers. Stop. Because you're probably making the same 3 mistakes I'm about to show you.'",
      verbalLayer: "'This is for [highly specific person with highly specific situation].' The more specific the call-out to cold traffic, the more it stops the scroll — specificity feels like personalization.",
      writtenLayer: "'Are you [specific description]? This was made for you.' TOFU call-outs work because the specificity of 'this was made for you' creates exclusivity in an environment of generic content.",
      visualLayer: "Point directly at camera — no b-roll, no graphics. Pure direct address. In the noise of a content feed, direct eye contact + direct pointing is one of the most effective pattern interrupts available.",
      bestPairedWith: "Transformation Snapshot, Problem Solver",
      curiosityScore: 80, conversionFit: "leads",
    },
    {
      id: "mofu-howto",
      title: "MOFU Warm — How-To Authority Hook",
      tag: "Funnel-Stage", angle: "How-To Process", strategy: "mofu", trigger: "fomo",
      psychology: "Warm traffic knows the 'what' — they want the 'how.' A how-to hook that signals a superior or proprietary process is the ideal MOFU hook. They're comparison shopping — give them a process that sounds more specific and proven than anything else they've seen.",
      example: "Most Instagram coaches teach the same 3 generic tips. Here's the proprietary 5-step framework I built specifically for service businesses — and why it outperforms every 'post more content' advice.",
      verbalLayer: "'Most [their current options] teach [generic approach]. Here's [proprietary specific method] I built for [their specific situation].' The contrast of generic vs. specific makes warm traffic choose your process.",
      writtenLayer: "'Generic: [what everyone else teaches]. Specific: [your proprietary [X]-step system].' The side-by-side comparison in text is powerful for warm traffic making an evaluation.",
      visualLayer: "Show your framework visually — a diagram, a flowchart, a step-by-step visual. Warm traffic responds to visible systems. A proprietary visual framework signals 'this is different.'",
      bestPairedWith: "Tutorial, Case Study Explainer",
      curiosityScore: 73, conversionFit: "leads",
    },
    {
      id: "bofu-social",
      title: "BOFU Hot — Social Proof Close Hook",
      tag: "Funnel-Stage", angle: "Social Proof", strategy: "bofu", trigger: "social-proof",
      psychology: "Hot traffic is ready to buy but needs social proof to overcome the last objection — 'does this work for people like me?' Show results from someone who had the same doubts, same starting point, and same constraints.",
      example: "Three months ago, Sarah was exactly where you are — skeptical, burnt out, and had tried 4 other courses. Here's what happened when she applied this system for 30 days.",
      verbalLayer: "'[Person who was exactly where the viewer is now] was [skeptical/doubtful/similar situation]. Here's what happened in [specific timeframe].' The mirror match removes the last objection.",
      writtenLayer: "'[Relatable person] + [Shared starting point] → [Specific result in timeframe].' The shared starting point is more important than the result for hot traffic — they need to see themselves.",
      visualLayer: "Show a real testimonial or case study with before/after evidence — screenshots, video clip, or quote card. Authenticity is critical — hot traffic can detect stock footage or generic proof instantly.",
      bestPairedWith: "Case Study Explainer, Lesson From Others",
      curiosityScore: 72, conversionFit: "leads",
    },
  ];
}

function buildStyleCards(): StyleCard[] {
  return [
    // ── HERO'S JOURNEY ──
    {
      id: "heros-journey",
      title: "Hero's Journey",
      views: "2.4M avg",
      description: "Ordinary world → a call to challenge → struggle → breakthrough → transformed creator sharing the lesson.",
      flow: ["Hook", "Ordinary World", "The Call / Inciting Moment", "Struggle & Resistance", "Breakthrough", "New World + Lesson", "CTA"],
      bestFor: "Founder Stories, Personal Brand, Motivation",
      category: "Story Arc",
      pairsWithHook: "Fortune Teller / Personal Experience",
    },
    // ── MAN IN A HOLE ──
    {
      id: "man-in-a-hole",
      title: "Man in a Hole",
      views: "2.1M avg",
      description: "Start stable → fall into a hole (problem) → climb back out. Tension peaks in the middle.",
      flow: ["Hook", "The Good State", "The Fall (Problem)", "The Struggle", "The Climb Back", "Resolution + Lesson", "CTA"],
      bestFor: "Relatable Comebacks, Recovery Stories",
      category: "Story Arc",
      pairsWithHook: "Contrarian / Negative Spin",
    },
    // ── THE BREAKTHROUGH ──
    {
      id: "the-breakthrough",
      title: "The Breakthrough",
      views: "1.9M avg",
      description: "One single moment of insight that changed everything. Simple, punchy, high-retention.",
      flow: ["Hook", "Before State", "The Moment of Discovery", "The Insight / Reframe", "After State", "CTA"],
      bestFor: "Mindset Shifts, Aha-Moments, Coaching",
      category: "Reveal & Shift",
      pairsWithHook: "Contrarian / Investigator",
    },
    // ── CHALLENGE TO VICTORY ──
    {
      id: "challenge-to-victory",
      title: "Challenge to Victory",
      views: "2.2M avg",
      description: "A declared challenge, the grind, the obstacles, and the earned win with clear takeaways.",
      flow: ["Hook", "The Challenge Declared", "The Obstacles Faced", "The Turning Point", "The Victory", "What You Learned", "CTA"],
      bestFor: "30-Day Challenges, Fitness, Business Goals",
      category: "Story Arc",
      pairsWithHook: "Experimenter / Fortune Teller",
    },
    // ── TRANSFORMATION SNAPSHOT ──
    {
      id: "transformation-snapshot",
      title: "Transformation Snapshot",
      views: "2.6M avg",
      description: "Before vs After framing. Show the gap first, then the mechanism that bridged it.",
      flow: ["Hook (Show the After)", "The Before State", "The Gap", "The Mechanism / Method", "The After State", "CTA"],
      bestFor: "Before/After, Makeovers, Skill Levelling",
      category: "Reveal & Shift",
      pairsWithHook: "Magician / Fortune Teller",
    },
    // ── ONE DECISION STORY ──
    {
      id: "one-decision-story",
      title: "One Decision Story",
      views: "1.8M avg",
      description: "Everything changed from a single choice. Laser-focused narrative with one clear message.",
      flow: ["Hook", "Life Before the Decision", "The Crossroads Moment", "The Decision Made", "The Ripple Effect", "The Lesson for You", "CTA"],
      bestFor: "Pivots, Mindset, Career Choices",
      category: "Story Arc",
      pairsWithHook: "Teacher / Personal Experience",
    },
    // ── MISTAKE & FIX ──
    {
      id: "mistake-and-fix",
      title: "Mistake & Fix",
      views: "2.3M avg",
      description: "Own a mistake publicly, diagnose the root cause, and deliver the fix. Highly relatable and shareable.",
      flow: ["Hook (Name the Mistake)", "The Mistake in Detail", "Why It Happens", "The Diagnosis", "The Fix", "Quick Win for Viewer", "CTA"],
      bestFor: "Educational, Coaching, Self-Improvement",
      category: "Educational",
      pairsWithHook: "Teacher / Contrarian",
    },
    // ── FAILURE / RESTART ──
    {
      id: "failure-restart",
      title: "Failure / Restart",
      views: "2.0M avg",
      description: "Raw, honest failure story followed by a methodical restart. Vulnerability drives watch-time.",
      flow: ["Hook", "The Failure (No Sugar-Coating)", "What Went Wrong", "The Rock Bottom", "The Restart Decision", "What's Different Now", "CTA"],
      bestFor: "Authenticity, Business Pivots, Vulnerability Content",
      category: "Story Arc",
      pairsWithHook: "Teacher / Experimenter",
    },
    // ── X TO Y JOURNEY ──
    {
      id: "x-to-y-journey",
      title: "X to Y Journey",
      views: "2.5M avg",
      description: "Quantified progress story. Start number → end number → the exact path in between.",
      flow: ["Hook (State the Y Result)", "The X Starting Point", "Step 1 / Phase 1", "Step 2 / Phase 2", "Step 3 / Phase 3", "The Y Result + Key Insight", "CTA"],
      bestFor: "Growth Stories, Metrics, Case Studies",
      category: "Proof",
      pairsWithHook: "Experimenter / Social Proof",
    },
    // ── BIG REVEAL ──
    {
      id: "big-reveal",
      title: "Big Reveal",
      views: "2.7M avg",
      description: "Build suspense by withholding the punchline until the final seconds. Curiosity loop at maximum.",
      flow: ["Hook (Tease the Reveal)", "Build Context", "Layer Clue 1", "Layer Clue 2", "The Big Reveal", "So What / Implication", "CTA"],
      bestFor: "Curiosity-Driven Content, Announcements, Investigations",
      category: "Reveal & Shift",
      pairsWithHook: "Investigator / Magician",
    },
    // ── LESSON FROM OTHERS ──
    {
      id: "lesson-from-others",
      title: "Lesson From Others",
      views: "1.7M avg",
      description: "Use someone else's story (success or failure) as the vehicle to deliver your insight.",
      flow: ["Hook", "The Other Person / Brand Intro", "Their Situation", "The Key Action They Took", "The Outcome", "What You Can Steal From It", "CTA"],
      bestFor: "Case Studies, Thought Leadership, Breakdowns",
      category: "Proof",
      pairsWithHook: "Investigator / Teacher",
    },
    // ── ONE THING I WISH I KNEW ──
    {
      id: "one-thing-i-wish",
      title: "One Thing I Wish I Knew",
      views: "2.1M avg",
      description: "Regret-framed wisdom delivery. Instantly relatable and saves the viewer time/pain.",
      flow: ["Hook (The Regret Frame)", "The Situation Where You Needed It", "What You Did Instead (The Wrong Path)", "The Lesson", "How to Apply It Now", "CTA"],
      bestFor: "Wisdom, Coaching, Personal Brand",
      category: "Educational",
      pairsWithHook: "Teacher / Contrarian",
    },
    // ── ARC FORMULA (Attention-Retention-Connect) ──
    {
      id: "arc-formula",
      title: "ARC Formula",
      views: "2.0M avg",
      description: "Attention → Retention → Connect. Grab in 5s, structure with lists/steps, then bridge each point with re-hooks using contrast words ('but then', 'however') to prevent drop-off.",
      flow: ["A — Attention (Hook, compelling question or bold action)", "R — Retention (Clear structure: lists, steps, continuous value)", "C — Connect (Transition words + Re-Hooks between every point)", "CTA"],
      bestFor: "Short-Form, Quick Lessons, Tight Scripts",
      category: "Framework",
      pairsWithHook: "Any — especially Contrarian",
      psychologicalCore: "Re-Hook mechanic: every closed loop must open a new one. Use 'but then' / 'however' between points to reset attention.",
      emotionTarget: "curiosity",
    },
    // ── 5-LINE STORY METHOD ──
    {
      id: "five-line-method",
      title: "5-Line Story Method",
      views: "1.8M avg",
      description: "Build the emotional core before touching the camera. Five lines define the heart of any story: Situation → Desire → Conflict → Change → Result. Expand each line to build the full script.",
      flow: ["Hook", "Situation (Where does the story begin?)", "Desire (What does the character want?)", "Conflict (What gets in the way?)", "Change (What shifts — the turning point?)", "Result (New reality — how is it different now?)", "CTA"],
      bestFor: "Micro-Content, Reels under 60s, Emotional Storytelling",
      category: "Framework",
      pairsWithHook: "Fortune Teller / Teacher / Personal Experience",
      psychologicalCore: "Emotional core first. If you can't write these 5 lines, the idea isn't ready.",
      emotionTarget: "empathy",
    },
    // ── 5-PART STORY ARC ──
    {
      id: "five-part-arc",
      title: "5-Part Story Arc",
      views: "2.2M avg",
      description: "Hook under 12 words → minimal backstory → friction introduced with 'BUT' → pivot moment → payoff that closes the curiosity loop opened in the hook.",
      flow: ["Hook (< 12 words, open loop)", "Context (1–2 sentences, just enough)", "Conflict / Twist (starts with 'But…' — introduce friction)", "Turning Point (the decision/realization that shifts direction)", "Resolution + Lesson (close the loop, prove it was worth watching)", "CTA"],
      bestFor: "Storytelling Reels, Brand Narratives, Longer-Form",
      category: "Story Arc",
      pairsWithHook: "Fortune Teller / Magician",
      psychologicalCore: "Curiosity gap + conflict = retention. The 'BUT' word is your secret weapon.",
      emotionTarget: "awe",
    },
    // ── POV FORMULA ──
    {
      id: "pov-formula",
      title: "POV Formula",
      views: "2.4M avg",
      description: "Shift focal point from you to the viewer. 'POV: You…' locks the reader in as an active character. Mix aspirational highs with relatable lows to avoid braggy tone. Rhythm = entertainment.",
      flow: ["Hook (POV: You [dream state]…)", "Aspirational High (the achievement)", "Relatable Low (where you started — 'Not long ago I was just…')", "The Bridge (minimal details + emotional reciprocity)", "Platitude Ending (a 'Pinterest quote' that makes them feel good)", "CTA"],
      bestFor: "Relatable Slices of Life, Written Carousels, LinkedIn/IG Text Posts",
      category: "Narrative",
      pairsWithHook: "Teacher / Personal Experience",
      psychologicalCore: "F-shape scanning: first words of each line are critical. Keep hooks short, < 8 words.",
      emotionTarget: "inspiration",
    },
    // ── DOPAMINE LADDER ──
    {
      id: "dopamine-ladder",
      title: "Dopamine Ladder",
      views: "2.8M avg",
      description: "6 levels of dopamine release: Stimulation (visual stun gun) → Captivation (curiosity loop) → Anticipation (active guessing) → Validation (loop closed) → Affection (personality connect) → Revelation (Pavlovian loyalty).",
      flow: ["Hook (Stimulation — visual pattern interrupt)", "Rung 1 — Captivation (open curiosity loop, compelling question)", "Rung 2 — Anticipation (keep viewer guessing, 'head fake' zigzag)", "Rung 3 — Validation (close the loop with non-obvious answer)", "Rung 4 — Affection (show personality, be authentically you)", "Revelation CTA (deliver non-obvious value — the Pavlovian hit)"],
      bestFor: "Educational Lists, Value-Dense Content, High-Retention Scripts",
      category: "Retention",
      pairsWithHook: "Investigator / Magician",
      psychologicalCore: "Close loops for dopamine surge. Head fakes reset anticipation. Affection requires real personality.",
      emotionTarget: "curiosity",
    },
    // ── BREAKDOWN ──
    {
      id: "breakdown",
      title: "Breakdown",
      views: "1.9M avg",
      description: "Explain a complex concept in building blocks. Start with an initial context shock, then unpack layer by layer. Great for analytical, deep-dive content.",
      flow: ["Hook (Initial Shock — surprising fact)", "Context (what is this and why does it matter?)", "Building Block 1 (first layer of explanation)", "Building Block 2 (deeper layer)", "Building Block 3 (final layer / most surprising point)", "Why It Matters (implications)", "CTA"],
      bestFor: "Deep Dives, Analytical Content, Concept Explainers",
      category: "Educational",
      pairsWithHook: "Investigator / Teacher",
      psychologicalCore: "Each building block is a mini dopamine hit. Stack shock facts from your 1-100 research process.",
      emotionTarget: "curiosity",
    },
    // ── NEWSCASTER ──
    {
      id: "newscaster",
      title: "Newscaster",
      views: "1.7M avg",
      description: "Factual, journalistic recounting of an event. Full context → short-take analysis → your unique perspective. Borrows authority from journalism while building your own POV.",
      flow: ["Hook (the news/event in one line)", "Full Context (who, what, when, where)", "The Analysis (your take — why this matters)", "The Implication (what happens next?)", "Your Opinion / Angle", "CTA"],
      bestFor: "Trending Topics, Industry News, Thought Leadership",
      category: "Educational",
      pairsWithHook: "Investigator / Contrarian",
      psychologicalCore: "Authority via journalism framing. 'Short-take' opinion at the end is what viewers share.",
      emotionTarget: "outrage",
    },
    // ── CASE STUDY EXPLAINER ──
    {
      id: "case-study-explainer",
      title: "Case Study Explainer",
      views: "2.1M avg",
      description: "Borrow the credibility of a brand, person, or result to educate on a framework. '5x Rule': use outlier examples (5x avg views vs followers) for maximum impact.",
      flow: ["Hook (Introduce the outlier result)", "Who is this / Brand Intro", "The Situation They Were In", "The Framework / Strategy They Used", "The Result", "How to Apply This Yourself", "CTA"],
      bestFor: "Case Studies, Thought Leadership, Strategy Breakdowns",
      category: "Proof",
      pairsWithHook: "Investigator / Teacher",
      psychologicalCore: "Social proof + curiosity. Viewers want to steal what works. Give them the framework, not just the story.",
      emotionTarget: "inspiration",
    },
    // ── LISTICLE ──
    {
      id: "listicle",
      title: "Listicle",
      views: "2.3M avg",
      description: "Ordered set of items that solve a pain point or achieve an outcome. Use the curiosity gap on the 'last item' to hold retention all the way through.",
      flow: ["Hook (tease the #1 or most unexpected item)", "Context (why this list matters to the viewer)", "Item 1 (easiest / most relatable)", "Item 2", "Item 3 (the unexpected/contrarian one)", "Item 4 (if needed)", "The #1 Pick + Why", "CTA"],
      bestFor: "Tips Content, Educational Reels, Easy Broad-Reach Virality",
      category: "Educational",
      pairsWithHook: "Teacher / Contrarian",
      psychologicalCore: "Curiosity gap: 'The 5th one will surprise you.' Viewers stay for the final item.",
      emotionTarget: "curiosity",
    },
    // ── PROBLEM SOLVER ──
    {
      id: "problem-solver",
      title: "Problem Solver",
      views: "2.0M avg",
      description: "Agitate a painful problem until the viewer feels it viscerally — then deliver the exact solution. The more you make them feel the problem, the more satisfying the solution lands.",
      flow: ["Hook (Name the painful problem)", "Problem Story (show the pain in vivid detail)", "Agitation (deepen the pain — make it personal)", "The Turning Point ('But here's what I found...')", "Solution Frame (step-by-step fix)", "Quick Win for Viewer", "CTA"],
      bestFor: "Coaching, Services, Any Pain-Point-Driven Niche",
      category: "Educational",
      pairsWithHook: "Teacher / Contrarian / How-To Process",
      psychologicalCore: "Personal stakes trigger. The longer you agitate, the more relief the solution provides.",
      emotionTarget: "empathy",
    },
    // ── TUTORIAL ──
    {
      id: "tutorial",
      title: "Tutorial",
      views: "1.8M avg",
      description: "Step-by-step walkthrough leading to one specific, concrete outcome. Clarity is king — use CVF: Context → Visual Cues → Framing. Never signal the ending.",
      flow: ["Hook (Show the finished result / desired outcome)", "Context (why this skill matters, what you'll learn)", "Step 1 (show + explain + visual cue)", "Step 2", "Step 3 (most critical step)", "Quick Recap (3-line summary)", "CTA (soft prompt to try it)"],
      bestFor: "Skills, Tutorials, How-To Content, Software Demos",
      category: "Educational",
      pairsWithHook: "Teacher / Experimenter / How-To Process",
      psychologicalCore: "CVF Method: every step needs Context (why), Visual Cues (show it), Framing (why it matters to the overall goal). Never say 'In conclusion' — bounce rate spikes immediately.",
      emotionTarget: "excitement",
    },
    // ── MODERN PEAK-RELEASE ARC ──
    {
      id: "modern-peak-release",
      title: "Modern Peak-Release Arc",
      views: "2.5M avg",
      description: "Start at 70/100 intensity — not slow build. Spike to 90/100 within the first minute via conflict or contrast. Then release slowly, build again. Repeat on 2-5 min cadence. Never use the traditional school arc.",
      flow: ["Hook (Start at 70/100 intensity — high, not zero)", "First Conflict / Contrast Spike (spike to 90/100 within 60s)", "Slow Release (tension eases, viewer breathes)", "Build #2 — New Stakes Introduced", "Peak #2 — Second Climax", "Resolution (close all loops)", "CTA"],
      bestFor: "Longer Reels (60-90s), Documentary Style, High-Drama Content",
      category: "Retention",
      pairsWithHook: "Contrarian / Investigator",
      psychologicalCore: "Modern viewers have a 5-30s timer. Start at peak tension — not setup. Traditional rising action = 80% bounce rate.",
      emotionTarget: "excitement",
    },
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

function Spinner() {
  return (
    <svg className="animate-spin w-3 h-3 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

type AnalysisResult = Record<string, unknown>;

function AnalysisPanel({ result: r }: { result: AnalysisResult }) {
  const isHook = r.type === "hook_analysis";
  const score = isHook ? (r.overall_score as number) : (r.final_score as number);
  const readiness = r.readiness as string;
  const readinessColor = readiness === "Viral-Ready" ? "#3BFFC8" : readiness === "Strong" ? "#60a5fa" : readiness === "Good" ? "#A78BFA" : readiness === "Decent" ? "#f5a623" : "#f87171";

  return (
    <div className="p-[14px] space-y-[12px]">
      <div className="flex items-center gap-[10px]">
        <div className="text-[28px] font-['Syne'] font-[800]" style={{ color: readinessColor }}>{score}/10</div>
        <div>
          <p className="font-['JetBrains_Mono'] text-[10px] font-[700]" style={{ color: readinessColor }}>{readiness}</p>
          <p className="font-['DM_Sans'] text-[9px] text-[#5A6478]">{isHook ? "Hook Score" : "Weighted Script Score"}</p>
        </div>
      </div>

      {Boolean(r.scores) && (
        <div className="space-y-[5px]">
          {Object.entries(r.scores as Record<string, number>).map(([key, val]) => {
            const pct = (val / 10) * 100;
            const barColor = val >= 8 ? "#3BFFC8" : val >= 6 ? "#A78BFA" : val >= 4 ? "#f5a623" : "#f87171";
            return (
              <div key={key} className="flex items-center gap-[8px]">
                <span className="font-['JetBrains_Mono'] text-[8.5px] text-[#8892A4] w-[130px] shrink-0 capitalize">{key.replace(/_/g, " ")}</span>
                <div className="flex-1 h-[4px] rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
                <span className="font-['JetBrains_Mono'] text-[9px] w-[20px] text-right" style={{ color: barColor }}>{val}</span>
              </div>
            );
          })}
        </div>
      )}

      {Boolean(r.strength || r.key_strength) && (
        <div className="rounded-[8px] bg-[rgba(59,255,200,0.05)] border border-[rgba(59,255,200,0.15)] p-[10px]">
          <p className="font-['JetBrains_Mono'] text-[9px] text-[#3BFFC8] uppercase mb-[4px]">✅ Strength</p>
          <p className="font-['DM_Sans'] text-[11px] text-[#F0F2F7] leading-[1.5]">{String(r.strength || r.key_strength)}</p>
        </div>
      )}

      {Boolean(r.improvement) && (
        <div className="rounded-[8px] bg-[rgba(245,166,35,0.05)] border border-[rgba(245,166,35,0.15)] p-[10px]">
          <p className="font-['JetBrains_Mono'] text-[9px] text-[#f5a623] uppercase mb-[4px]">⚠️ Fix</p>
          <p className="font-['DM_Sans'] text-[11px] text-[#F0F2F7] leading-[1.5]">{String(r.improvement)}</p>
        </div>
      )}

      {Array.isArray(r.top_3_fixes) && (r.top_3_fixes as Array<{pillar: string; issue: string; fix: string}>).map((fix, i) => (
        <div key={i} className="rounded-[8px] bg-[rgba(245,166,35,0.05)] border border-[rgba(245,166,35,0.15)] p-[10px]">
          <p className="font-['JetBrains_Mono'] text-[9px] text-[#f5a623] uppercase mb-[2px]">#{i+1} {fix.pillar}</p>
          <p className="font-['DM_Sans'] text-[10px] text-[#8892A4]">Issue: {fix.issue}</p>
          <p className="font-['DM_Sans'] text-[10px] text-[#F0F2F7] mt-[2px]">Fix: {fix.fix}</p>
        </div>
      ))}

      {Boolean(r.rewritten_hook) && (
        <div className="rounded-[8px] bg-[rgba(96,165,250,0.05)] border border-[rgba(96,165,250,0.15)] p-[10px]">
          <p className="font-['JetBrains_Mono'] text-[9px] text-[#60a5fa] uppercase mb-[4px]">✨ Improved Hook</p>
          <p className="font-['DM_Sans'] text-[11px] text-[#F0F2F7] leading-[1.5] italic">&ldquo;{String(r.rewritten_hook)}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

function ScriptsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const askInputRef = useRef<HTMLInputElement | null>(null);
  const bottomBarRef = useRef<HTMLDivElement | null>(null);
  const pendingCaretOffsetRef = useRef<number | null>(null);
  /** Keeps textarea selection range when focus moves to the sticky Ask-AI bar (mousedown would clear React `selection`). */
  const pinnedScriptSelectionRef = useRef<{ start: number; end: number; text: string } | null>(null);

  const [showRecyclingQueue, setShowRecyclingQueue] = useState(false);
  const [remixData, setRemixData] = useState<RemixData | null>(null);
  const [isRemixMode, setIsRemixMode] = useState(false);
  const [creationMode, setCreationMode] = useState<"scratch" | "remix">("scratch");
  const [onePercentFocus, setOnePercentFocus] = useState("Stronger Packaging (Title/Cover)");
  const [tweakAttribute, setTweakAttribute] = useState<string | null>(null);
  const [isRemixing, setIsRemixing] = useState(false);
  const [remixTranscript, setRemixTranscript] = useState("");
  const [topic, setTopic] = useState("");
  const [originalAnalysis, setOriginalAnalysis] = useState(null);

  // Redirect to wizard if no script ID is present (editor is edit-only)
  useEffect(() => {
    const hasId = searchParams.get("id");
    const hasRemix = searchParams.get("mode") === "remix" || searchParams.get("source") === "remix";
    const hasTitle = searchParams.get("title");
    if (!hasId && !hasRemix && !hasTitle) {
      router.replace("/scripts/create");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Close scratch accordions — in remix mode steps 1–2 are replaced by the remix panel below
        setActiveStep(0);
      }
    }
  }, [searchParams]);


  const [hookCards, setHookCards] = useState<HookCard[]>(() => buildHookCards());
  const [styleCards, setStyleCards] = useState<StyleCard[]>(() => buildStyleCards());
  const [selectedHookId, setSelectedHookId] = useState(buildHookCards()[0]?.id || "");
  const [selectedStyleId, setSelectedStyleId] = useState(buildStyleCards()[0]?.id || "");
  const [selectedHookPreviewId, setSelectedHookPreviewId] = useState("preview-a");
  const [hookSearchQuery, setHookSearchQuery] = useState("");
  const [hookTagFilter, setHookTagFilter] = useState<string>("All");       // format filter (Fortune Teller, etc.)
  const [hookAngleFilter, setHookAngleFilter] = useState<string>("All");   // angle filter (Negative Spin, etc.)
  const [hookStrategyFilter, setHookStrategyFilter] = useState<string>("All"); // strategy filter
  const [showHookFramework, setShowHookFramework] = useState(false);       // learn-the-framework panel
  const [showScratchAnatomy, setShowScratchAnatomy] = useState(false);
  const [showHookChecklist, setShowHookChecklist] = useState(false);       // 7-step writing checklist
  const [showStoryScience, setShowStoryScience] = useState(false);         // story science panel
  const [showStoryMistakes, setShowStoryMistakes] = useState(false);       // 7 mistakes panel
  const [storyCategoryFilter, setStoryCategoryFilter] = useState<string>("All"); // structure category filter
  const [storyEmotionTarget, setStoryEmotionTarget] = useState<string>("All");   // target emotion filter
  const [script, setScript] = useState("");
  const [scriptHistory, setScriptHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
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

  // Re-Hook Inserter state
  const [rehookEnabled, setRehookEnabled] = useState(false);
  const [rehookInterval, setRehookInterval] = useState<10 | 12 | 15>(12);
  const [rehookSegments, setRehookSegments] = useState<Array<{ text: string; wordCount: number; rehookAfter: { type: string; line: string } | null }>>([]);
  const [acceptedRehooks, setAcceptedRehooks] = useState<Set<number>>(new Set());
  const [rejectedRehooks, setRejectedRehooks] = useState<Set<number>>(new Set());
  const [isInsertingRehooks, setIsInsertingRehooks] = useState(false);
  const [rehookApplied, setRehookApplied] = useState(false);

  // ── Viral Score state ─────────────────────────────────────────────────────
  type ViralTier = "Low" | "Medium" | "High" | "Outlier";
  type AttributeScore = { score: number; reason: string; fix: string };
  type ViralScoreResult = {
    buckets: {
      attention: { tam: AttributeScore; explosivity: AttributeScore; emotionalMagnitude: AttributeScore; novelty: AttributeScore };
      retention: { speedToValue: AttributeScore; curiosity: AttributeScore; absorption: AttributeScore; rehookRate: AttributeScore; stickiness: AttributeScore };
    };
    shareScore: number;
    avdScore: number;
    totalScore: number;
    predictedViralTier: ViralTier;
    topFixes: string[];
  };
  const [viralScore, setViralScore] = useState<ViralScoreResult | null>(null);
  const [isScoringViral, setIsScoringViral] = useState(false);
  const [viralScoreError, setViralScoreError] = useState("");
  const [viralScoreScriptHash, setViralScoreScriptHash] = useState("");

  // ── Story Locks state ─────────────────────────────────────────────────────
  type StoryLockId = "term_branding" | "embedded_truths" | "thought_narration" | "negative_frames" | "loop_openers" | "contrast_words";
  type StoryLock = { id: StoryLockId; label: string; present: boolean; quality: number; evidence: string[]; missingIn: string[]; fixLine: string };
  type StoryLocksResult = { locks: StoryLock[]; overallLockScore: number };
  const [storyLocks, setStoryLocks] = useState<StoryLocksResult | null>(null);
  const [isAnalyzingLocks, setIsAnalyzingLocks] = useState(false);
  const [storyLocksError, setStoryLocksError] = useState("");
  const [expandedLock, setExpandedLock] = useState<StoryLockId | null>(null);

  // ── Quality Panel tab state ────────────────────────────────────────────────
  type QualityTab = "viral" | "locks" | "checks";
  const [qualityTab, setQualityTab] = useState<QualityTab>("viral");

  // Localization Engine state
  const [localeLang, setLocaleLang] = useState("Hinglish (Default)");
  const [activeModel, setActiveModel] = useState("gemini-3-flash-preview");
  const [activeLanguage, setActiveLanguage] = useState("English");
  const [emotionFilter, setEmotionFilter] = useState("Shock & Curiosity");
  // Humanize feature
  const [humanizeEnabled, setHumanizeEnabled] = useState(true);
  const [isHumanizing, setIsHumanizing] = useState(false);
  // Analyze features
  const [isAnalyzing, setIsAnalyzing] = useState<"hook" | "script" | null>(null);
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  // Info tooltip state
  const [activeInfoTooltip, setActiveInfoTooltip] = useState<string | null>(null);
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

  const updateScriptAndHistory = (newContent: string) => {
    const newHistory = scriptHistory.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    setScriptHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setScript(newContent);
  };

  const handleInsertRehooks = async () => {
    if (!script.trim()) return;
    setIsInsertingRehooks(true);
    setRehookSegments([]);
    setAcceptedRehooks(new Set());
    setRejectedRehooks(new Set());
    setRehookApplied(false);
    try {
      const res = await fetch("/api/rehook/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, language: activeLanguage, interval: rehookInterval }),
      });
      if (res.ok) {
        const data = await res.json();
        setRehookSegments(data.segments ?? []);
      }
    } finally {
      setIsInsertingRehooks(false);
    }
  };

  const applyAcceptedRehooks = () => {
    if (rehookSegments.length === 0) return;
    const lines: string[] = [];
    rehookSegments.forEach((seg, i) => {
      lines.push(seg.text);
      if (seg.rehookAfter && acceptedRehooks.has(i)) {
        lines.push(`\n[Re-Hook | ${seg.rehookAfter.type}] ${seg.rehookAfter.line}\n`);
      }
    });
    updateScriptAndHistory(lines.join("\n"));
    setRehookApplied(true);
    setRehookSegments([]);
  };

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
      .then((data: Record<string, boolean>) => {
        // API keys are returned as boolean flags — treat as "has keys" if any provider is configured
        setSettingsHasKeys(
          !!(data.geminiApiKeySet || data.openaiApiKeySet || data.anthropicApiKeySet ||
             data.apifyApiKeySet || data.elevenlabsApiKeySet || data.sarvamApiKeySet)
        );
      })
      .catch(() => {}); // silently fail — don't block anything
  }, []);

  // A/B Hook Generator state
  const [abHooks, setAbHooks] = useState<Array<{ type: string; spoken?: string; visual?: string; text?: string }>>([]); 
  const [scriptJob, setScriptJob] = useState("Views (Broad Appeal)");
  const [videoFormat, setVideoFormat] = useState<"short" | "long" | "carousel">("short");
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
  const isProcessing = !!activeAction;
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

  const clientVoiceFields = useMemo(() => {
    const c = selectedClient;
    if (!c) return {};
    return {
      scriptMasterGuide: typeof c.scriptMasterGuide === "string" ? c.scriptMasterGuide : undefined,
      customInstructions: typeof c.customInstructions === "string" ? c.customInstructions : undefined,
      tonePersona: c.tonePersona || c.tone || undefined,
      niche: c.niche || undefined,
      targetAudience: c.targetAudience || undefined,
      language: c.language || undefined,
      avoidTopics: c.avoidTopics || undefined,
      preferredTopics: c.preferredTopics || c.topics || undefined,
      ctaStyle: c.ctaStyle || undefined,
      vocabularyLevel: c.vocabularyLevel || c.vocabulary || undefined,
    };
  }, [selectedClient]);

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

  useEffect(() => {
    setVideoLength((prev) => {
      if (videoFormat === "short") return Math.min(120, Math.max(30, prev || 60));
      if (videoFormat === "long") return Math.min(1800, Math.max(180, prev || 600));
      return Math.min(20, Math.max(5, prev || 8)); // carousel slides
    });
  }, [videoFormat]);

  const selectedHook = useMemo(
    () => hookCards.find((card) => card.id === selectedHookId) ?? hookCards[0] ?? null,
    [hookCards, selectedHookId],
  );
  const selectedStyle = useMemo(
    () => styleCards.find((card) => card.id === selectedStyleId) ?? styleCards[0] ?? null,
    [selectedStyleId, styleCards],
  );

  const hookBuilderSettings = useMemo((): LocalSettings => {
    if (typeof window === "undefined") return DEFAULT_LOCAL_SETTINGS;
    const parsed = parseLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY));
    const g = localStorage.getItem("geminiApiKey")?.trim();
    const o = localStorage.getItem("openAiApiKey")?.trim();
    const cl = localStorage.getItem("anthropicApiKey")?.trim();
    return {
      ...parsed,
      geminiApiKey: g || parsed.geminiApiKey,
      openaiApiKey: o || parsed.openaiApiKey,
      anthropicApiKey: cl || parsed.anthropicApiKey,
      aiKeys: {
        ...parsed.aiKeys,
        gemini: g || parsed.aiKeys.gemini,
        openai: o || parsed.aiKeys.openai,
        claude: cl || parsed.aiKeys.claude,
      },
    };
  }, []);

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

  const hookAngleOptions = ["All", "Negative Spin", "Positive Spin", "Targeted Question", "Personal Experience", "Call-Out", "How-To Process", "Social Proof", "Contrarian"];
  const hookStrategyOptions = ["All", "standard", "blueball", "desire", "tofu", "mofu", "bofu"];
  const hookStrategyLabels: Record<string, string> = {
    "All": "All Strategies", "standard": "Standard", "blueball": "Blueball (Tension)",
    "desire": "Desire-Based (Leads)", "tofu": "TOFU — Cold Traffic", "mofu": "MOFU — Warm", "bofu": "BOFU — Hot",
  };

  // Info tooltip content for each filter
  const storyFilterInfo = {
    category: {
      title: "CATEGORY — What Type of Story Are You Telling?",
      description: "Categories group structures by their narrative purpose. Choose the one that best matches how your content naturally unfolds — the structure should feel like the story, not force it.",
      color: "#3BFFC8",
      items: [
        { name: "Story Arc", desc: "Traditional narrative progressions with a clear beginning, transformation, and resolution. Best for personal journeys, case studies, and emotional content. Creates deep viewer investment." },
        { name: "Reveal & Shift", desc: "Structures built around a surprising turn, hidden truth, or unexpected perspective change. Best for contrarian takes, exposés, and 'what you don't know' content. Highest share rate." },
        { name: "Educational", desc: "Step-by-step or lesson-based formats optimized for teaching. Best for tutorials, breakdowns, and 'how-to' content. Builds authority and saves. Strong long-tail SEO value." },
        { name: "Framework", desc: "Repeatable models or systems (numbered, acronyms, formulas). Best for building intellectual authority. Viewers save and return to these. Highest 'bookmark' rate." },
        { name: "Narrative", desc: "Story-led structures where the journey itself is the content. Best for day-in-the-life, documentary-style, and immersive storytelling. Highest average watch time." },
        { name: "Proof", desc: "Validation-first structures leading with results, testimonials, or case studies. Best for building trust and credibility. Most effective for converting viewers into followers or buyers." },
        { name: "Retention", desc: "Structures specifically engineered to maximize watch time and reduce drop-off. Uses open loops, re-hooks, and progressive reveals. Best when algorithm push is the primary goal." },
      ]
    },
    emotion: {
      title: "TARGET EMOTION — What Should They Feel?",
      description: "The emotion filter finds structures optimized to trigger a specific feeling in your viewer. Scripts that create strong emotional responses get 3–5× more shares and saves. Choose the emotion you want the viewer to experience AFTER watching.",
      color: "#A78BFA",
      items: [
        { name: "Curiosity", desc: "Creates a knowledge gap the viewer must resolve. Drives watch time, rewatches, and 'tag a friend' shares. Best structures: Big Reveal, ARC Formula, Investigator arc, Curiosity Loop. Use when you have a surprising fact or counter-intuitive insight." },
        { name: "Inspiration", desc: "Elevates the viewer's belief in what's possible. Drives saves, follows, and story reposts. Best structures: Hero's Journey, X-to-Y Journey, Transformation Snapshot. Use for aspirational content and overcoming-struggle stories." },
        { name: "Empathy", desc: "Makes the viewer feel deeply seen and understood. Drives comments ('this is me'), DMs, and loyal following. Best structures: Man in a Hole, Failure/Restart, One Decision Story. Use for vulnerable, relatable content." },
        { name: "Excitement", desc: "Creates energy and urgency. Drives immediate action — follow, DM, save. Best structures: Challenge to Victory, 5-Part Arc, Dopamine Ladder. Use for announcements, launches, challenges, and trending topics." },
        { name: "Awe", desc: "Produces a 'wow' response to scale, beauty, or genius. Highest share-to-view ratio of any emotion. Best structures: Big Reveal, Magician format, Transformation Snapshot. Use for visual content or mind-blowing statistics." },
        { name: "Outrage", desc: "Triggers righteous anger at injustice or incompetence. Highest comment and debate rate. Best structures: Contrarian, Reveal & Shift, POV Formula. Use carefully — must be genuine and grounded in fact." },
        { name: "Motivation", desc: "Activates drive and a desire to take action. Drives saves, profile visits, and link clicks. Best structures: Challenge to Victory, 5-Line Method, Breakthrough arc. Use for productivity, fitness, and business content." },
        { name: "Nostalgia", desc: "Creates warm familiarity and emotional safety. Drives shares with friends and family, high completion rate. Best structures: One Thing I Wish I Knew, Lesson From Others, Mistake & Fix. Use for reflective or generational content." },
      ]
    }
  };

  const hookFilterInfo = {
    format: {
      title: "FORMAT — What Role Are You Playing?",
      description: "The 'Format' is the character archetype or storytelling role you take in the hook. It shapes HOW the information is delivered and sets the viewer's expectation.",
      items: [
        { name: "Fortune Teller", desc: "Predict a future outcome or trend. Creates instant curiosity about whether the prediction will affect the viewer. e.g. 'In 6 months, 80% of creators will do this.'" },
        { name: "Experimenter", desc: "Show the result of a test or experiment. Creates proof-based curiosity — the viewer wants to know the outcome. e.g. 'I tried X for 30 days. Here's what happened.'" },
        { name: "Teacher", desc: "Share lessons from your own journey. Positions you as an authority through lived experience. e.g. 'The 3 mistakes I made growing from 0 to 100K.'" },
        { name: "Magician", desc: "Create a visual or conceptual stun effect. Stops the scroll through shock or unexpected contrast. e.g. 'This one line turned my failing business around.'" },
        { name: "Investigator", desc: "Expose a hidden truth or mystery. Creates a curiosity loop the viewer must resolve. e.g. 'No one is talking about what Instagram is doing to small creators.'" },
        { name: "Contrarian", desc: "Challenge a widely held belief. Creates pattern interruption — the viewer wants to know why you disagree. e.g. 'Stop posting daily. Here's why it's killing your growth.'" },
        { name: "Storyteller", desc: "Open with a dramatic narrative moment. Creates emotional investment immediately. e.g. 'I lost everything in 48 hours. Here's what I learned.'" },
        { name: "Case Study", desc: "Use a specific example as the hook. Creates credibility and relatability through real-world proof. e.g. 'This account went from 200 to 50K followers using one system.'" },
        { name: "POV", desc: "Invite the viewer into a first-person perspective. Creates immediate identification. e.g. 'POV: You wake up to 10K new followers from one video.'" },
      ]
    },
    angle: {
      title: "ANGLE — How Are You Saying It?",
      description: "The 'Angle' is the emotional or rhetorical direction of the hook. It determines the TONE and FEELING the viewer gets in the first second. Same topic, 7 different angles = 7 completely different hooks.",
      items: [
        { name: "Negative Spin", desc: "Lead with the mistake, failure, or problem. Highest stop-rate because pain is more motivating than pleasure. 'Most creators do this wrong.'" },
        { name: "Positive Spin", desc: "Lead with the win, achievement, or transformation. Aspirational and uplifting. 'This one strategy 10x'd my engagement in 30 days.'" },
        { name: "Targeted Question", desc: "Ask a question that makes a specific viewer self-identify. Creates instant relevance. 'Are you a creator stuck under 10K followers?'" },
        { name: "Personal Experience", desc: "Use 'I' stories to humanize the hook. Highest authenticity score. 'I spent 3 years on Instagram before I figured this out.'" },
        { name: "Call-Out", desc: "Directly address the viewer by identity or behavior. Creates maximum identification. 'This is for every fitness creator posting every day with zero growth.'" },
        { name: "How-To Process", desc: "Promise a clear method or system. Sets expectation of value. 'How I plan a month of content in 45 minutes.'" },
        { name: "Social Proof", desc: "Lead with evidence — numbers, results, others' transformations. Builds trust instantly. '3,000 creators used this system to hit 100K.'" },
        { name: "Contrarian", desc: "Directly contradict a popular belief. Creates pattern interruption. 'The advice you've been following is actually hurting your growth.'" },
      ]
    },
    strategy: {
      title: "STRATEGY — What's Your Conversion Goal?",
      description: "The 'Strategy' defines the psychological mechanism and the stage of the viewer's awareness. Different strategies are optimized for different outcomes: virality vs. leads vs. sales.",
      items: [
        { name: "Standard", desc: "Classic curiosity-gap or value-promise hooks. Best for broad virality and views. No agenda except: stop the scroll and deliver value." },
        { name: "Blueball (Tension)", desc: "Withhold the key answer as long as possible while building emotional investment. Engineered for maximum watch time and rewatches. Never reveal the punchline in the hook." },
        { name: "Desire-Based (Leads)", desc: "Lead with the transformation, not the method. Optimized to convert viewers into followers or leads. 'What if you could X without Y?' Creates desire before delivering solution." },
        { name: "TOFU — Cold Traffic", desc: "Top of Funnel. For viewers who don't know you. Wide appeal, no assumed knowledge, no jargon. Focus on broad pain points everyone feels." },
        { name: "MOFU — Warm", desc: "Middle of Funnel. For viewers who've seen your content before. Can use slightly more specific language, reference your system or framework." },
        { name: "BOFU — Hot", desc: "Bottom of Funnel. For highly engaged followers ready to buy or act. Can be highly specific, reference past content, use strong CTAs within the hook itself." },
      ]
    }
  };

  const filteredHookCards = useMemo(() => {
    const cards = Array.isArray(hookCards) ? hookCards : [];
    const query = hookSearchQuery.trim().toLowerCase();
    const matchesQuery = (card: HookCard) =>
      query.length === 0 ||
      card.title.toLowerCase().includes(query) ||
      card.psychology.toLowerCase().includes(query) ||
      card.tag.toLowerCase().includes(query) ||
      card.angle.toLowerCase().includes(query) ||
      card.example.toLowerCase().includes(query);

    const full = cards.filter((card) => {
      const matchesFormat = hookTagFilter === "All" || card.tag === hookTagFilter;
      const matchesAngle = hookAngleFilter === "All" || card.angle === hookAngleFilter;
      const matchesStrategy = hookStrategyFilter === "All" || card.strategy === hookStrategyFilter;
      return matchesFormat && matchesAngle && matchesStrategy && matchesQuery(card);
    });

    if (full.length > 0) return { cards: full, isFallback: false };

    // Relax strategy filter — show closest format + angle match
    const relaxed = cards.filter((card) => {
      const matchesFormat = hookTagFilter === "All" || card.tag === hookTagFilter;
      const matchesAngle = hookAngleFilter === "All" || card.angle === hookAngleFilter;
      return matchesFormat && matchesAngle && matchesQuery(card);
    });

    if (relaxed.length > 0) return { cards: relaxed, isFallback: true };

    // Last resort: relax angle too
    const formatOnly = cards.filter((card) => {
      const matchesFormat = hookTagFilter === "All" || card.tag === hookTagFilter;
      return matchesFormat && matchesQuery(card);
    });

    return { cards: formatOnly.length > 0 ? formatOnly : cards, isFallback: true };
  }, [hookCards, hookSearchQuery, hookTagFilter, hookAngleFilter, hookStrategyFilter]);

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
        const initialScript = found.content || "";
        setScript(initialScript);
        setScriptHistory([initialScript]);
        setHistoryIndex(0);
        if (found.hooks && Array.isArray(found.hooks)) setAbHooks(found.hooks);
        if (found.caption) setGeneratedCaption(found.caption);
        if (found.repurposed) setRepurposedText(found.repurposed);
        if (found.scriptJob) setScriptJob(found.scriptJob);
        if (found.directorsCut) setDirectorsCutData(found.directorsCut);
        if (found.prompts) setPromptDirectorData(found.prompts);
        if (found.packaging) setPackagingData(found.packaging);
        if (found.metadata) {
          const meta = found.metadata as any;
          if (meta.editorSettings) {
            if (meta.editorSettings.language) setActiveLanguage(meta.editorSettings.language);
            if (meta.editorSettings.model) setActiveModel(meta.editorSettings.model);
            if (typeof meta.editorSettings.emotion === "number") setEmotionIntensity(meta.editorSettings.emotion);
            if (typeof meta.editorSettings.length === "number") setVideoLength(meta.editorSettings.length);
          }
          if (meta.research) setResearchData(meta.research);
          if (meta.remixState) {
            const remixState = meta.remixState as any;
            if (typeof remixState.remixTranscript === "string") setRemixTranscript(remixState.remixTranscript);
            if (typeof remixState.tweakAttribute === "string") setTweakAttribute(remixState.tweakAttribute);
            if (typeof remixState.onePercentFocus === "string") setOnePercentFocus(remixState.onePercentFocus);
            if (remixState.videoFormat === "short" || remixState.videoFormat === "long" || remixState.videoFormat === "carousel") setVideoFormat(remixState.videoFormat);
            if (Array.isArray(remixState.pacingData?.segments)) setPacingData(remixState.pacingData);
            if (Array.isArray(remixState.improvementLog)) setImprovementLog(remixState.improvementLog);
            if (typeof remixState.visualCues === "string") setVisualCues(remixState.visualCues);
            if (Array.isArray(remixState.imagePrompts)) setImagePrompts(remixState.imagePrompts);
            if (remixState.visualPrompts && typeof remixState.visualPrompts === "object") setVisualPrompts(remixState.visualPrompts);
            if (Array.isArray(remixState.brainstormSuggestions)) setBrainstormSuggestions(remixState.brainstormSuggestions);
          }
        }
        setScriptTitle(found.title || "New Script");

        const matchedHook = nextHookCards.find((c: any) => c.title === found.hook);
        if (matchedHook) setSelectedHookId(matchedHook.id);

        const matchedStyle = nextStyleCards.find((c: any) => c.title === found.style);
        if (matchedStyle) setSelectedStyleId(matchedStyle.id);

        const shouldLoadAsRemix = found.type === "REMIX" || Boolean((found.metadata as any)?.remixState);
        if (shouldLoadAsRemix) {
          setCreationMode("remix");
          setIsRemixMode(true);
          setScriptType("REMIX");
        } else {
          setCreationMode("scratch");
          setIsRemixMode(false);
          setScriptType("ORIGINAL");
          setRemixData(null);
        }
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
            repurposed: repurposedText || undefined,
            scriptJob: scriptJob || undefined,
            directorsCut: directorsCutData || undefined,
            prompts: promptDirectorData || undefined,
            packaging: packagingData || undefined,
            metadata: {
              editorSettings: {
                language: activeLanguage,
                model: activeModel,
                emotion: emotionIntensity,
                length: videoLength,
              },
              research: researchData || undefined,
              remixState: {
                remixTranscript: remixTranscript || undefined,
                tweakAttribute: tweakAttribute || undefined,
                onePercentFocus: onePercentFocus || undefined,
                videoFormat,
                pacingData: pacingData || undefined,
                improvementLog: improvementLog.length > 0 ? improvementLog : undefined,
                visualCues: visualCues || undefined,
                imagePrompts: imagePrompts || undefined,
                visualPrompts: visualPrompts || undefined,
                brainstormSuggestions: brainstormSuggestions || undefined,
              },
            },
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
  }, [scriptTitle, script, selectedClientId, scriptId, searchParams, abHooks, generatedCaption, repurposedText, scriptJob, directorsCutData, promptDirectorData, packagingData, activeLanguage, activeModel, emotionIntensity, videoLength, researchData, remixTranscript, tweakAttribute, onePercentFocus, videoFormat, pacingData, improvementLog, visualCues, imagePrompts, visualPrompts, brainstormSuggestions]);

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
      const getStoredKey = (k: string) => {
        const v = typeof window !== "undefined" ? localStorage.getItem(k) : null;
        return v && v !== "undefined" && v !== "null" ? v.trim() : "";
      };
      const response = await fetch("/api/edit-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: selection.text,
          promptCommand: aiCommand.trim(),
          fullScript: script,
          geminiApiKey: getStoredKey("geminiApiKey") || undefined,
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
      updateScriptAndHistory(nextScriptText);
      
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

    // Lock in state BEFORE the async call — prevents stale closure issues
    // if the user clicks elsewhere while the request is in flight
    const currentScript = script;
    const pin = pinnedScriptSelectionRef.current;
    let startIdx = selection?.start ?? null;
    let endIdx = selection?.end ?? null;
    const currentSelectedText = selectedText.trim();
    if (currentSelectedText && (startIdx === null || endIdx === null) && pin) {
      if (currentScript.slice(pin.start, pin.end) === currentSelectedText) {
        startIdx = pin.start;
        endIdx = pin.end;
      }
    }
    const getStoredKey = (k: string) => {
      const v = typeof window !== "undefined" ? localStorage.getItem(k) : null;
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };
    const geminiApiKey = getStoredKey("geminiApiKey");

    setIsProcessingInlineAI(true);
    try {
      const response = await fetch("/api/edit-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullScript: currentScript,
          selectedText: currentSelectedText,
          promptCommand: command,
          videoLength: videoLength,
          geminiApiKey: geminiApiKey || undefined,
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "AI Edit Failed");
      }

      const { replacement } = await response.json();

      const hasSelection =
        Boolean(currentSelectedText) &&
        startIdx !== null &&
        endIdx !== null &&
        currentScript.slice(startIdx, endIdx) === currentSelectedText;

      if (hasSelection) {
        const stitchedScript =
          currentScript.substring(0, startIdx!) +
          String(replacement ?? "").trim() +
          currentScript.substring(endIdx!);
        updateScriptAndHistory(stitchedScript);
        setSelectedText("");
        setSelection(null);
        pinnedScriptSelectionRef.current = null;
      } else if (!currentSelectedText) {
        updateScriptAndHistory(String(replacement ?? "").trim());
        pinnedScriptSelectionRef.current = null;
      } else {
        const idx = currentScript.indexOf(currentSelectedText);
        if (idx >= 0) {
          const stitchedScript =
            currentScript.slice(0, idx) +
            String(replacement ?? "").trim() +
            currentScript.slice(idx + currentSelectedText.length);
          updateScriptAndHistory(stitchedScript);
        } else {
          updateScriptAndHistory(String(replacement ?? "").trim());
        }
        setSelectedText("");
        setSelection(null);
        pinnedScriptSelectionRef.current = null;
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
    const getStoredKey = (k: string) => {
      const v = localStorage.getItem(k);
      return v && v !== "undefined" && v !== "null" ? v.trim() : "";
    };
    const provider = getStoredKey("activeProvider") || "Gemini";
    let apiKey = "";
    if (provider === "OpenAI") apiKey = getStoredKey("openAiApiKey");
    else if (provider === "Anthropic") apiKey = getStoredKey("anthropicApiKey");
    else apiKey = getStoredKey("geminiApiKey");

    const topicOrRemix =
      creationMode === "remix"
        ? (topic.trim() || remixTranscript.trim().slice(0, 1200))
        : topic.trim();
    if (!topicOrRemix) {
      toast("warning", "Context Missing", creationMode === "remix" ? "Add a transcript or topic hint for auto-match." : "Please enter a topic first.");
      return;
    }

    if (!apiKey && !settingsHasKeys) {
      toast("error", "API Key Missing", "Add an API key in Settings (or local Settings) for your active provider.");
      return;
    }

    setIsAutoMatchingStructure(true);
    try {
      const res = await fetch("/api/script/match-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: topicOrRemix,
          provider,
          apiKey: apiKey || undefined,
          model: getStoredKey("activeModel") || activeModel || "",
        }),
      });
      const data = (await res.json()) as { structureId?: string; error?: string; raw?: string };
      if (!res.ok) {
        throw new Error(data.error || "Structure match failed");
      }
      const cleanId = data.structureId || "";
      const matched = styleCards.find((c) => c.id === cleanId);
      if (matched) {
        setSelectedStyleId(matched.id);
        toast("success", "✨ Structure Auto-Matched!", `Selected "${matched.title}" as the best fit.`);
      } else {
        toast("warning", "Match Uncertain", data.raw ? `Server: ${data.raw.slice(0, 120)}…` : "Unexpected response.");
      }
    } catch (error) {
      console.error("Auto-match error:", error);
      toast("error", "Auto-Match Failed", error instanceof Error ? error.message : "Could not determine the best structure automatically.");
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
          format: videoFormat,
          language: activeLanguage,
          targetAudience: selectedClient?.targetAudience?.trim() || "a general viral audience",
          videoGoal: scriptJob,
          emotion: emotionFilter,
          emotionIntensity: emotionIntensity,
          videoLength: videoLength,
          slideCount: videoFormat === "carousel" ? videoLength : undefined,
          hookStyle: hookData.title,
          structureName: styleData.title,
          structureSteps: styleData.flow.join(" -> "),
          onePercentFocus,
          openaiApiKey: localStorage.getItem("openAiApiKey") || undefined,
          geminiApiKey: localStorage.getItem("geminiApiKey") || undefined,
          anthropicApiKey: localStorage.getItem("anthropicApiKey") || undefined,
          ...clientVoiceFields,
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
          updateScriptAndHistory(data.script);
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
        const userIdea =
          creationMode === "scratch"
            ? (topic.trim() || "A viral video concept.")
            : (topic.trim() || (remixData?.transcript as string)?.trim() || "A viral video concept.");
        if (!userIdea.trim()) {
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

        const model = activeModel || "gemini-1.5-flash";
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
    const userIdea =
      creationMode === "scratch"
        ? (topic.trim() || "A viral video concept.")
        : (topic.trim() || (remixData?.transcript as string)?.trim() || "A viral video concept.");
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
      const scratchExecutiveSummary =
        typeof researchData?.executiveSummary === "string" ? researchData.executiveSummary.trim() : "";

      const scratchPayload = {
        engine: activeModel,
        topic: userIdea,
        executiveSummary: scratchExecutiveSummary,
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
        slideCount: videoFormat === "carousel" ? videoLength : undefined,
        format: videoFormat,
        onePercentFocus,
        language: activeLanguage,
        targetAudience: selectedClient?.targetAudience || "a general viral audience",
        openaiApiKey: localStorage.getItem("openAiApiKey") || undefined,
        geminiApiKey: localStorage.getItem("geminiApiKey") || undefined,
        anthropicApiKey: localStorage.getItem("anthropicApiKey") || undefined,
        ...clientVoiceFields,
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
      let generatedText = (responseData.script || "").trim();

      // Auto-humanize if enabled
      if (humanizeEnabled && generatedText) {
        try {
          setIsHumanizing(true);
          const hRes = await fetch("/api/humanize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ script: generatedText, model: activeModel }),
          });
          if (hRes.ok) {
            const hData = await hRes.json() as { humanized?: string };
            if (hData.humanized) generatedText = hData.humanized;
          }
        } catch { /* skip humanize silently */ } finally {
          setIsHumanizing(false);
        }
      }

      updateScriptAndHistory(generatedText);
      toast("success", "Script Generated", humanizeEnabled ? "Viral script generated & humanized." : "Your viral script is ready.");

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

  async function handleManualHumanize() {
    if (!script.trim()) return;
    setIsHumanizing(true);
    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, model: activeModel }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        toast("error", "Humanize Failed", d.error || "Try again");
        return;
      }
      const data = await res.json() as { humanized?: string };
      if (data.humanized) {
        updateScriptAndHistory(data.humanized);
        toast("success", "Humanized", "Script rewritten to sound more natural.");
      }
    } catch (err) {
      toast("error", "Humanize Failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsHumanizing(false);
    }
  }

  async function handleAnalyze(mode: "hook" | "script") {
    if (!script.trim()) {
      toast("error", "No Script", "Generate a script first before analyzing.");
      return;
    }
    setIsAnalyzing(mode);
    setAnalysisResult(null);
    setShowAnalysisPanel(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, content: script, model: activeModel }),
      });
      const data = await res.json() as { analysis?: Record<string, unknown>; error?: string };
      if (!res.ok || data.error) {
        toast("error", "Analysis Failed", data.error || "Try again");
        return;
      }
      setAnalysisResult(data.analysis ?? null);
    } catch (err) {
      toast("error", "Analysis Failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsAnalyzing(null);
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
      updateScriptAndHistory(newText);
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
      const getStoredKey = (k: string) => {
        const v = typeof window !== "undefined" ? localStorage.getItem(k) : null;
        return v && v !== "undefined" && v !== "null" ? v.trim() : "";
      };
      const geminiApiKey = getStoredKey("geminiApiKey");

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
          geminiApiKey: geminiApiKey || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action failed");

      if (action === 'improve') {
        updateScriptAndHistory(data.result);
        setPacingData(null);
        setImprovementLog(prev => ["Script rewritten for +10% retention", ...prev]);
        toast("success", "Script Improved", "Retention-focused rewrite applied.");
      } else if (action === 'shorten') {
        updateScriptAndHistory(data.result);
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
      updateScriptAndHistory(data.newScript);
      setImprovementLog(prev => [suggestionObj.title, ...prev]);
      setBrainstormSuggestions(prev => prev ? prev.filter(s => s.title !== suggestionObj.title) : null);
      toast("success", "Improvement Applied", suggestionObj.title);
    } catch (error: any) {
      toast("error", "Apply Failed", error.message);
    } finally {
      setActiveAction(null);
    }
  }


  // Simple string hash to detect script changes and show stale badge
  function simpleHash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return h.toString(36);
  }

  async function handleRunViralScore() {
    if (!script.trim()) return;
    setIsScoringViral(true);
    setViralScoreError("");
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
      const model = getStoredKey("activeModel") || activeModel || "";
      const clientProfileStr =
        selectedClient
          ? JSON.stringify({
              name: selectedClient.name,
              niche: selectedClient.niche,
              audience: selectedClient.targetAudience,
            })
          : "";

      const res = await fetch("/api/script/viral-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          topic,
          angle: selectedAngle?.statement || topic,
          clientProfile: clientProfileStr,
          provider,
          apiKey: apiKey || undefined,
          model: model || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Scoring failed");
      setViralScore(data);
      setViralScoreScriptHash(simpleHash(script));
    } catch (err: any) {
      setViralScoreError(err.message || "Viral scoring failed.");
    } finally {
      setIsScoringViral(false);
    }
  }

  async function handleRunStoryLocks() {
    if (!script.trim()) return;
    setIsAnalyzingLocks(true);
    setStoryLocksError("");
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
      const model = getStoredKey("activeModel") || activeModel || "";
      const clientProfileStr =
        selectedClient
          ? JSON.stringify({
              name: selectedClient.name,
              niche: selectedClient.niche,
            })
          : "";

      const res = await fetch("/api/script/story-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          clientProfile: clientProfileStr,
          provider,
          apiKey: apiKey || undefined,
          model: model || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Analysis failed");
      setStoryLocks(data);
    } catch (err: any) {
      setStoryLocksError(err.message || "Story locks analysis failed.");
    } finally {
      setIsAnalyzingLocks(false);
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
    const model = getStoredKey("activeModel") || "gemini-1.5-flash";
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
      updateScriptAndHistory((payload.text || "").trim());
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
    const model = getStoredKey("activeModel") || "gemini-1.5-flash";
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
    const model = scriptLlm || getStoredKey("activeModel") || "gemini-1.5-flash";
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
    const model = scriptLlm || getStoredKey("activeModel") || "gemini-1.5-flash";
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
        updateScriptAndHistory(newHook + " " + text.slice(delimEnd));
      } else {
        // Script is a single sentence — replace entirely
        updateScriptAndHistory(newHook);
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
    const model = scriptLlm || getStoredKey("activeModel") || "gemini-1.5-flash";
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
      updateScriptAndHistory(newHookText);
    } else {
      const firstBreak = text.search(/[.!?]\s|\n/);
      if (firstBreak > 0) {
        const delimEnd = text[firstBreak] === "\n" ? firstBreak + 1 : firstBreak + 2;
        updateScriptAndHistory(newHookText.trim() + " " + text.slice(delimEnd));
      } else {
        updateScriptAndHistory(newHookText.trim());
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
    const model = activeModel || "gemini-1.5-flash";
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

  const hookStep = creationMode === "remix" ? 3 : 4;
  const formatStep = 4;
  const structureStep = 5;
  const packagingStep = 6;
  const generateStep = creationMode === "remix" ? 7 : 6;
  const formatLengthConfig = videoFormat === "long"
    ? { min: 180, max: 1800, unit: "s", label: "Long-form Length", hint: "(180s - 1800s)" }
    : videoFormat === "carousel"
      ? { min: 5, max: 20, unit: "slides", label: "Carousel Length", hint: "(5 - 20 slides)" }
      : { min: 30, max: 120, unit: "s", label: "Short-form Length", hint: "(30s - 120s)" };

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
            onClick={() => {
              setCreationMode("remix");
              setActiveStep(0);
            }}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${creationMode === "remix" ? "bg-white/10 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]" : "text-white/50 hover:text-white"}`}
          >
            🔄 Engineering Remix
          </button>
        </div>

        {creationMode === "remix" && (
          <div className="mb-8 rounded-2xl border border-[rgba(59,255,200,0.12)] bg-[rgba(59,255,200,0.04)] px-4 py-4">
            <p className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.14em] text-[#5A6478] mb-2">
              Remix path — only what you need
            </p>
            <p className="font-['DM_Sans'] text-[12px] text-[#8892A4] mb-3 max-w-[720px] leading-relaxed">
              Use the remix flow below: source + original buckets, choose one bucket to twist, then go through hook, format, structure, packaging, and final generation.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "remix-rail-source", step: 1, label: "Source", sub: "Transcript + buckets" },
                  { id: "remix-rail-lever", step: 2, label: "Twist", sub: "Hold 4 · Twist 1" },
                  { id: "editor-step-hook", step: 3, label: "Hook", sub: "Select hook" },
                  { id: "editor-step-format", step: 4, label: "Format", sub: "Short / Long / Carousel" },
                  { id: "editor-step-structure", step: 5, label: "Structure", sub: "Story arc" },
                  { id: "editor-step-packaging", step: 6, label: "Packaging", sub: "Title + cover angle" },
                  { id: "editor-step-generate", step: 7, label: "Script", sub: "Generate + refine" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.step >= 3) setActiveStep(item.step);
                    else setActiveStep(0);
                    requestAnimationFrame(() => {
                      document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                  className="inline-flex flex-col items-start rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0D1017]/90 px-3 py-2 text-left transition hover:border-[rgba(59,255,200,0.35)] hover:bg-[rgba(59,255,200,0.06)]"
                >
                  <span className="font-['JetBrains_Mono'] text-[9px] text-[#3BFFC8]">
                    {item.step} — {item.label}
                  </span>
                  <span className="font-['DM_Sans'] text-[10px] text-[#5A6478]">{item.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
                  <div className="mt-[10px] rounded-[10px] border border-[rgba(59,255,200,0.12)] bg-[rgba(59,255,200,0.03)] p-[12px] animate-fade-in space-y-[8px]">
                    <div className="flex items-center gap-[6px] mb-[4px]">
                      <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#3BFFC8]">✅ Client Profile Loaded</span>
                    </div>
                    <div className="grid grid-cols-2 gap-[8px]">
                      {selectedClient.niche && (
                        <div>
                          <p className="font-['JetBrains_Mono'] text-[8px] text-[#5A6478] uppercase mb-[2px]">Niche</p>
                          <p className="font-['DM_Sans'] text-[11px] text-[#F0F2F7]">{selectedClient.niche}</p>
                        </div>
                      )}
                      {selectedClient.language && (
                        <div>
                          <p className="font-['JetBrains_Mono'] text-[8px] text-[#5A6478] uppercase mb-[2px]">Language</p>
                          <p className="font-['DM_Sans'] text-[11px] text-[#F0F2F7] flex items-center gap-1"><Globe className="w-3 h-3 text-[#5A6478]" />{selectedClient.language}</p>
                        </div>
                      )}
                      {selectedClient.duration && (
                        <div>
                          <p className="font-['JetBrains_Mono'] text-[8px] text-[#5A6478] uppercase mb-[2px]">Video Length</p>
                          <p className="font-['DM_Sans'] text-[11px] text-[#F0F2F7] flex items-center gap-1"><Zap className="w-3 h-3 text-[#5A6478]" />{selectedClient.duration}</p>
                        </div>
                      )}
                      {selectedClient.targetAudience && (
                        <div>
                          <p className="font-['JetBrains_Mono'] text-[8px] text-[#5A6478] uppercase mb-[2px]">Target Audience</p>
                          <p className="font-['DM_Sans'] text-[11px] text-[#F0F2F7] truncate">{selectedClient.targetAudience}</p>
                        </div>
                      )}
                    </div>
                    {selectedClient.styleDNA && Object.keys(selectedClient.styleDNA as object).length > 0 && (
                      <div className="flex items-center gap-[5px] pt-[4px] border-t border-[rgba(255,255,255,0.04)]">
                        <User className="w-3 h-3 text-[#A78BFA]" />
                        <span className="font-['JetBrains_Mono'] text-[9px] text-[#A78BFA]">Style DNA active — generation engine tuned to client voice</span>
                      </div>
                    )}
                    {selectedClient.scriptMasterGuide && String(selectedClient.scriptMasterGuide).trim().length > 0 && (
                      <div className="flex items-center gap-[5px] pt-[4px] border-t border-[rgba(255,255,255,0.04)]">
                        <FileText className="w-3 h-3 text-[#3BFFC8]" />
                        <span className="font-['JetBrains_Mono'] text-[9px] text-[#3BFFC8]">Master script guide on file — injected into remix & scratch generation</span>
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

              <div className="rounded-[12px] border border-[rgba(255,255,255,0.07)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowScratchAnatomy(!showScratchAnatomy)}
                  className="w-full flex items-center justify-between p-[12px_16px] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                >
                  <span className="font-['Syne'] font-[700] text-[11px] text-[#3BFFC8] uppercase tracking-[0.08em]">Reference: short-form script anatomy</span>
                  <span className="text-[#5A6478] text-[10px]">{showScratchAnatomy ? "▲ collapse" : "▼ expand"}</span>
                </button>
                {showScratchAnatomy && (
                  <div className="p-[14px_16px] bg-[rgba(255,255,255,0.01)] border-t border-[rgba(255,255,255,0.06)]">
                    <p className="font-['DM_Sans'] text-[10px] text-[#5A6478] mb-2">Used in the model prompt for create-from-scratch. Your client master guide (if any) overrides generic advice.</p>
                    <pre className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.55] whitespace-pre-wrap max-h-[220px] overflow-y-auto">{SCRATCH_SCRIPT_ANATOMY_BLOCK}</pre>
                  </div>
                )}
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
          <div id="remix-rail-source" className="space-y-6 mb-[16px] scroll-mt-24">
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
                    {selectedClient.scriptMasterGuide && String(selectedClient.scriptMasterGuide).trim().length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#3BFFC8]">
                        <FileText className="w-3.5 h-3.5 opacity-80" />
                        <span>Master script guide on file</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Step 1 of remix path: transcript */}
            <section className="glass-surface rounded-2xl overflow-hidden">
              <div className="p-[16px_20px] border-b border-[rgba(255,255,255,0.06)]">
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] mr-2">1 / 7</span>
                  Source — transcript
                </h2>
                <p className="font-['DM_Sans'] text-[11px] text-[#5A6478] mt-1">Pre-filled from your video analysis. Edit if you want a tighter remix window.</p>
              </div>
              <div className="p-[18px]">
                <textarea
                  value={remixTranscript}
                  onChange={(e) => setRemixTranscript(e.target.value)}
                  placeholder="Paste outlier transcript here..."
                  className="w-full bg-[#111620]/60 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3.5 text-[#F0F2F7] text-[13.5px] focus:border-[#3BFFC8]/50 focus:ring-1 focus:ring-[#3BFFC8]/20 transition-all outline-none min-h-[120px] resize-y"
                />
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                  {[
                    { k: "Idea/Topic", v: topic || "Inferred from source transcript" },
                    { k: "Hook", v: (remixData as any)?.analysis?.analysis?.hookAnalysis?.type || "Detected from source" },
                    { k: "Story Structure", v: (remixData as any)?.analysis?.analysis?.structureAnalysis?.type || "Detected from source" },
                    { k: "Format", v: (remixData as any)?.format || "Short-form reel" },
                    { k: "Visuals", v: (remixData as any)?.analysis?.analysis?.styleAnalysis?.description || "Detected from source" },
                  ].map((item) => (
                    <div key={item.k} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#5A6478] mb-1">{item.k}</p>
                      <p className="font-['DM_Sans'] text-[11px] text-[#F0F2F7] leading-relaxed">{item.v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            
            {/* Step 2 of remix path: what to re-engineer */}
            <section id="remix-rail-lever" className="glass-surface rounded-2xl overflow-hidden scroll-mt-24">
              <div className="p-[16px_20px] border-b border-[rgba(255,255,255,0.06)]">
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] mr-2">2 / 7</span>
                  Lever — Hold 4, twist 1
                </h2>
                <p className="font-['DM_Sans'] text-[11px] text-[#5A6478] mt-1">Five buckets describe the reel: format, idea, hook, script/structure, visuals/edit. Pick exactly one to rebuild; the other four stay faithful to the source. Align the twist with your script job (views, followers, leads, sales).</p>
              </div>
              <div className="p-[18px] space-y-6">
                <div>
                  <h3 className="font-['Syne'] font-[700] text-[#F0F2F7] text-[13px] mb-3">Twist one bucket (the other four are held)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {REMIX_UI_ORDER.map((bucketId) => {
                      const meta = REMIX_CONTENT_BUCKETS.find((b) => b.id === bucketId);
                      const label = meta?.label ?? bucketId;
                      const desc = meta?.description ?? "";
                      return (
                        <button
                          key={bucketId}
                          type="button"
                          onClick={() => {
                            setTweakAttribute(bucketId);
                            setActiveStep(hookStep);
                            requestAnimationFrame(() => {
                              document.getElementById("editor-step-hook")?.scrollIntoView({ behavior: "smooth", block: "start" });
                            });
                          }}
                          className={`text-left p-3 rounded-xl transition-all border min-h-[88px] flex flex-col gap-1
                          ${tweakAttribute === bucketId
                            ? "bg-cyan-500/20 border-cyan-400 text-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                            : "bg-white/[0.03] border-white/10 text-gray-400 hover:bg-white/[0.08] hover:text-white"
                          }
                        `}
                        >
                          <span className="font-['DM_Sans'] text-xs font-bold">{label}</span>
                          <span className="font-['DM_Sans'] text-[10px] leading-snug text-[#8892A4] font-normal">{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {creationMode === "scratch" && (
          <section id="editor-step-packaging-scratch" className="glass-surface rounded-2xl overflow-hidden mb-[14px] transition-all duration-300 scroll-mt-24">
            <div
              onClick={() => setActiveStep(activeStep === 3 ? 0 : 3)}
              className="flex items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            >
              <div className="flex items-center gap-[12px]">
                <div className={`font-['JetBrains_Mono'] text-[10px] w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center ${activeStep >= 3 ? "bg-[rgba(59,255,200,0.1)] border-[rgba(59,255,200,0.3)] text-[#3BFFC8]" : "border-[rgba(255,255,255,0.15)] text-[#5A6478]"}`}>3</div>
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Packaging</h2>
              </div>
              <span className={`text-[#5A6478] transition-transform duration-300 ${activeStep === 3 ? "rotate-180" : ""}`}>▼</span>
            </div>
            {activeStep === 3 && (
              <div className="p-[18px] space-y-3">
                <p className="font-['DM_Sans'] text-[11px] text-[#5A6478]">Set your packaging focus before picking hooks and structure.</p>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                  <p className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#3BFFC8]">What to put in packaging</p>
                  <p className="font-['DM_Sans'] text-[11px] text-white/80">1) <span className="text-[#3BFFC8]">Text hook</span>: a 5–9 word promise for on-screen title.</p>
                  <p className="font-['DM_Sans'] text-[11px] text-white/80">2) <span className="text-[#3BFFC8]">Cover visual</span>: one concrete visual scene that proves the promise.</p>
                  <p className="font-['DM_Sans'] text-[11px] text-white/80">3) <span className="text-[#3BFFC8]">Caption first line</span>: curiosity + clarity in one sentence.</p>
                </div>
                <select
                  value={onePercentFocus}
                  onChange={(e) => setOnePercentFocus(e.target.value)}
                  className="w-full bg-[#111620] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white"
                >
                  <option>Stronger Packaging (Title/Cover)</option>
                  <option>Stronger Hook Promise</option>
                  <option>Stronger Outcome Clarity</option>
                  <option>Stronger Curiosity Gap</option>
                  <option>Stronger CTA Direction</option>
                </select>
                <div className="flex justify-end">
                  <button onClick={() => setActiveStep(4)} className="bg-[#3BFFC8] text-[#080A0F] p-[8px_16px] rounded-[8px] font-['DM_Sans'] text-[12.5px] font-[600] hover:opacity-90 transition-colors">
                    Continue
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* STEP 4: HOOKS */}
        <section id="editor-step-hook" className="glass-surface rounded-2xl overflow-hidden mb-[14px] transition-all duration-300 scroll-mt-24">
          <div
            onClick={() => setActiveStep(activeStep === hookStep ? 0 : hookStep)}
            className="flex items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
          >
            <div className="flex items-center gap-[12px]">
              <div className={`font-['JetBrains_Mono'] text-[10px] w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center ${activeStep >= hookStep ? "bg-[rgba(59,255,200,0.1)] border-[rgba(59,255,200,0.3)] text-[#3BFFC8]" : "border-[rgba(255,255,255,0.15)] text-[#5A6478]"}`}>{creationMode === "remix" ? 3 : 4}</div>
              <div>
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">
                  {creationMode === "remix" ? (
                    <>
                      <span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] font-[600] mr-2">3 / 7</span>
                      Choose a Hook
                    </>
                  ) : (
                    "Hook Format + Video Type"
                  )}
                </h2>
                {creationMode === "remix" && (
                  <p className="font-['DM_Sans'] text-[10px] text-[#5A6478] mt-0.5">Remix path — packaging step from the create wizard is skipped.</p>
                )}
              </div>
              {selectedHook && <span className="hidden md:inline font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] bg-[rgba(59,255,200,0.08)] border border-[rgba(59,255,200,0.2)] px-[8px] py-[2px] rounded-full">{selectedHook.tag} — {selectedHook.angle}</span>}
            </div>
            <span className={`text-[#5A6478] transition-transform duration-300 ${activeStep === hookStep ? "rotate-180" : ""}`}>▼</span>
          </div>

          {activeStep === hookStep && (
            <div className="p-[18px]">
              {creationMode === "scratch" && (
                <div className="mb-4">
                  <p className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#5A6478] mb-2">Video Type</p>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { id: "short", label: "Short" },
                      { id: "long", label: "Long" },
                      { id: "carousel", label: "Carousel" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setVideoFormat(opt.id as "short" | "long" | "carousel")}
                        className={`px-3 py-1.5 rounded-md text-[11px] border ${videoFormat === opt.id ? "bg-cyan-500/20 border-cyan-400 text-cyan-200" : "bg-white/[0.03] border-white/10 text-white/70 hover:text-white"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── LEARN THE FRAMEWORK (collapsible) ── */}
              <div className="mb-[16px] rounded-[12px] border border-[rgba(255,255,255,0.07)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHookFramework(!showHookFramework)}
                  className="w-full flex items-center justify-between p-[12px_16px] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                >
                  <span className="font-['Syne'] font-[700] text-[11px] text-[#3BFFC8] uppercase tracking-[0.1em]">📖 The Hook Science — Read This First</span>
                  <span className="text-[#5A6478] text-[10px]">{showHookFramework ? "▲ collapse" : "▼ expand"}</span>
                </button>

                {showHookFramework && (
                  <div className="p-[16px] bg-[rgba(255,255,255,0.01)] space-y-[16px]">

                    {/* THE TRIFECTA */}
                    <div>
                      <p className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] uppercase tracking-[0.1em] mb-[8px]">The Trifecta — 3 hooks in the first 3 seconds</p>
                      <div className="grid grid-cols-3 gap-[8px]">
                        {[
                          { icon: "🗣", label: "Verbal Hook", desc: "What the viewer HEARS. 1-3 punchy staccato sentences. Write at 5th-grade level. Cut every word that doesn't carry weight." },
                          { icon: "📝", label: "Written Hook", desc: "What the viewer READS on screen. Place in the safe zone (top of screen, above UI). Must reinforce — not repeat — the verbal hook." },
                          { icon: "👁", label: "Visual Hook", desc: "What the viewer SEES. Movement must start in frame 1. Just enough motion to stun the brain — not so much it overwhelms." },
                        ].map(t => (
                          <div key={t.label} className="p-[10px] rounded-[8px] bg-[rgba(59,255,200,0.05)] border border-[rgba(59,255,200,0.1)]">
                            <p className="text-[14px] mb-[4px]">{t.icon}</p>
                            <p className="font-['JetBrains_Mono'] font-[600] text-[10px] text-[#3BFFC8] mb-[4px]">{t.label}</p>
                            <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]">{t.desc}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-[8px] font-['DM_Sans'] text-[10px] text-[#5A6478]"><span className="text-[#3BFFC8] font-[600]">Alignment Rule:</span> All 3 layers must say the SAME thing. If your verbal is about productivity but your visual shows food, the brain freezes — and the viewer leaves.</p>
                    </div>

                    {/* THE CURIOSITY LOOP */}
                    <div>
                      <p className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] uppercase tracking-[0.1em] mb-[8px]">The Curiosity Loop — the engine of every hook</p>
                      <div className="flex items-center gap-[6px] flex-wrap">
                        {["Open the Loop", "→", "Hold it Open", "→", "Close it", "→", "Immediately Reopen"].map((s, i) => (
                          s === "→"
                            ? <span key={i} className="text-[#3A4153] text-[12px]">→</span>
                            : <span key={i} className={`px-[8px] py-[3px] rounded-[4px] font-['DM_Sans'] text-[10px] font-[500] ${i === 0 ? "bg-[rgba(59,255,200,0.1)] text-[#3BFFC8] border border-[rgba(59,255,200,0.2)]" : i === 6 ? "bg-[rgba(167,139,250,0.1)] text-[#A78BFA] border border-[rgba(167,139,250,0.2)]" : "bg-[rgba(255,255,255,0.05)] text-[#8892A4] border border-[rgba(255,255,255,0.08)]"}`}>{s}</span>
                        ))}
                      </div>
                      <p className="mt-[8px] font-['DM_Sans'] text-[10px] text-[#5A6478]"><span className="text-[#3BFFC8] font-[600]">The golden rule:</span> Open a question in the viewer's mind, refuse to close it for as long as possible, then close it right as you open a NEW one. Tension = Retention.</p>
                    </div>

                    {/* THE 3-STEP FORMULA */}
                    <div>
                      <p className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] uppercase tracking-[0.1em] mb-[8px]">The 3-Step Hook Formula</p>
                      <div className="space-y-[6px]">
                        {[
                          { step: "1", name: "Context Lean", desc: "Make the topic crystal clear in 1-2 sentences. Establish common ground, name a pain point, or drop a mind-blowing fact. The viewer must be able to decide in 1 second if this is for them." },
                          { step: "2", name: "Scroll-Stop Interjection", desc: "Hit them with a contrast word that stops their forward momentum: 'but', 'however', 'yet', 'except'. This creates the turning point — the brain can't move on without knowing what comes next." },
                          { step: "3", name: "Contrarian Snapback", desc: "Deliver the haymaker — a statement that goes in the OPPOSITE direction of what they leaned into. The bigger the shock, the deeper the curiosity loop. This is what makes them physically unable to scroll." },
                        ].map(s => (
                          <div key={s.step} className="flex gap-[10px] p-[10px] rounded-[8px] bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
                            <span className="font-['JetBrains_Mono'] font-[700] text-[11px] text-[#3BFFC8] mt-[1px] min-w-[14px]">{s.step}</span>
                            <div>
                              <p className="font-['Syne'] font-[700] text-[11px] text-[#F0F2F7] mb-[2px]">{s.name}</p>
                              <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]">{s.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* THE 4 MISTAKES */}
                    <div>
                      <p className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] uppercase tracking-[0.1em] mb-[8px]">The 4 Hook Mistakes — and how to fix them</p>
                      <div className="grid grid-cols-2 gap-[6px]">
                        {[
                          { mistake: "Delay", fix: "Introduce the topic in the very first 1-2 seconds. Cut all fluff. Retention falls off exponentially after second 2." },
                          { mistake: "Confusion", fix: "Write at a 6th-grade reading level. Use active, direct voice. Single subject, single question in every viewer's head." },
                          { mistake: "Irrelevance", fix: "Say 'you' and 'your' — never 'I' or 'me'. Agitate a KNOWN pain point, not nice-to-have information." },
                          { mistake: "Disinterest", fix: "Build contrast: state the baseline belief, then deliver your contrarian alternative. The bigger the gap, the stronger the hook." },
                        ].map(m => (
                          <div key={m.mistake} className="p-[10px] rounded-[8px] bg-[rgba(255,80,80,0.04)] border border-[rgba(255,80,80,0.1)]">
                            <p className="font-['JetBrains_Mono'] font-[600] text-[10px] text-[#ff6b6b] mb-[3px]">❌ {m.mistake}</p>
                            <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]"><span className="text-[#3BFFC8]">Fix:</span> {m.fix}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* SPECIAL STRATEGIES */}
                    <div>
                      <p className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] uppercase tracking-[0.1em] mb-[8px]">Special Hook Strategies</p>
                      <div className="space-y-[6px]">
                        <div className="p-[10px] rounded-[8px] bg-[rgba(167,139,250,0.05)] border border-[rgba(167,139,250,0.15)]">
                          <p className="font-['Syne'] font-[700] text-[10px] text-[#A78BFA] mb-[2px]">🎯 Blueball Strategy — Tension = Retention</p>
                          <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]">Tease → hint → withhold → delay. Do NOT give away the answer in the first 5-10 seconds. Step 1: Trigger their belief (confirm or challenge). Step 2: Hint at the answer with cliffhangers. Step 3: Hold the payoff through storytelling, analogies, or context-building. The longer the tension, the higher the retention.</p>
                        </div>
                        <div className="p-[10px] rounded-[8px] bg-[rgba(255,180,60,0.05)] border border-[rgba(255,180,60,0.12)]">
                          <p className="font-['Syne'] font-[700] text-[10px] text-[#f5a623] mb-[2px]">💰 Desire-Based Hook — For Conversions & Leads</p>
                          <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]">Formula: [Dream Outcome] + [Relatable Character] + [Minimal Constraints]. Paint the dream first — not the problem. Make the character so relatable that the viewer says 'that could be me.' Then strip away every constraint (time, money, experience) to make the path feel accessible. 5 frameworks: About Me / If I / To You / Can You / He-She Just Did.</p>
                        </div>
                        <div className="p-[10px] rounded-[8px] bg-[rgba(59,255,200,0.05)] border border-[rgba(59,255,200,0.1)]">
                          <p className="font-['Syne'] font-[700] text-[10px] text-[#3BFFC8] mb-[2px]">🔥 Hook Machine — 3 Pillars of Maximum Attention</p>
                          <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]">Pillar 1: Constant Visual Movement (never start static — any motion will do). Pillar 2: Engineered Absurdity (catch them completely off guard — disrupt the scroll reflex). Pillar 3: Promise of a Payoff (reveal the WHAT, hide the HOW and WHEN until the end — the brain can't leave an open loop unsatisfied).</p>
                        </div>
                      </div>
                    </div>

                    {/* WRITING CHECKLIST */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowHookChecklist(!showHookChecklist)}
                        className="w-full flex items-center justify-between p-[10px_12px] bg-[rgba(59,255,200,0.06)] border border-[rgba(59,255,200,0.15)] rounded-[8px] hover:bg-[rgba(59,255,200,0.1)] transition-colors"
                      >
                        <span className="font-['JetBrains_Mono'] font-[600] text-[10px] text-[#3BFFC8]">✅ The 7-Step Hook Writing Checklist</span>
                        <span className="text-[#5A6478] text-[10px]">{showHookChecklist ? "▲" : "▼"}</span>
                      </button>
                      {showHookChecklist && (
                        <div className="mt-[8px] space-y-[5px]">
                          {[
                            { n: "1", t: "Pick the Subject", d: "Get crystal clear on the ONE single subject this video will focus on. Not two. Not a topic. One subject." },
                            { n: "2", t: "Decide the Question", d: "Determine the EXACT emotion-inducing or shock-driven question you want to pop into EVERY viewer's head simultaneously." },
                            { n: "3", t: "Visualize the Shot", d: "Have a clear vision of what your visual hook will look like BEFORE you write a single word. The visual determines the verbal." },
                            { n: "4", t: "Write the Spoken Hook", d: "Draft 1-3 punchy sentences. 5th-grade reading level. Active voice. Cut every word that doesn't earn its place." },
                            { n: "5", t: "The Gut Check", d: "Ask: Does this unmistakably reference ONE subject? Does it pop ONE question into the viewer's mind? If not — rewrite." },
                            { n: "6", t: "Build & Align All 3 Layers", d: "Create the visual hook, add text overlay, ensure perfect alignment with your spoken words. Misalignment = viewer confusion = swipe." },
                            { n: "7", t: "The 4-Question Final Audit", d: "1) Am I clear on the subject? 2) Am I clear on the question it creates? 3) Are all 3 layers (Visual+Text+Verbal) aligned? 4) Am I curious enough to watch the second sentence?" },
                          ].map(s => (
                            <div key={s.n} className="flex gap-[8px] p-[8px] rounded-[6px] bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]">
                              <span className="font-['JetBrains_Mono'] font-[700] text-[10px] text-[#3BFFC8] min-w-[14px]">{s.n}.</span>
                              <div><p className="font-['Syne'] font-[700] text-[10px] text-[#F0F2F7] mb-[2px]">{s.t}</p><p className="font-['DM_Sans'] text-[9.5px] text-[#8892A4] leading-[1.4]">{s.d}</p></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── FILTER ROW 1: FORMAT (God-Tier types) ── */}
              <div className="mb-[10px] relative">
                <div className="flex items-center gap-[6px] mb-[6px]">
                  <p className="font-['JetBrains_Mono'] text-[8.5px] text-[#5A6478] uppercase tracking-[0.1em]">Format — what role are you playing?</p>
                  <button
                    onClick={() => setActiveInfoTooltip(activeInfoTooltip === "format" ? null : "format")}
                    className="text-[#5A6478] hover:text-[#3BFFC8] transition-colors"
                  >
                    <Info className="w-[12px] h-[12px]" />
                  </button>
                </div>
                {activeInfoTooltip === "format" && (
                  <div className="mb-[10px] rounded-[10px] border border-[rgba(59,255,200,0.2)] bg-[rgba(59,255,200,0.03)] p-[12px] z-[50]">
                    <div className="flex items-start justify-between mb-[8px]">
                      <p className="font-['Syne'] font-[700] text-[11px] text-[#3BFFC8]">{hookFilterInfo.format.title}</p>
                      <button onClick={() => setActiveInfoTooltip(null)} className="text-[#5A6478] hover:text-white ml-2 shrink-0"><X className="w-3 h-3" /></button>
                    </div>
                    <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] mb-[8px] leading-[1.5]">{hookFilterInfo.format.description}</p>
                    <div className="space-y-[5px] max-h-[200px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(59,255,200,0.2) transparent" }}>
                      {hookFilterInfo.format.items.map(item => (
                        <div key={item.name} className="flex gap-[6px]">
                          <span className="font-['JetBrains_Mono'] text-[9px] font-[700] text-[#3BFFC8] min-w-[90px] shrink-0">{item.name}</span>
                          <span className="font-['DM_Sans'] text-[9.5px] text-[#8892A4] leading-[1.4]">{item.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-[6px]">
                  {hookTagOptions.map((tag) => (
                    <button key={tag} onClick={() => setHookTagFilter(tag)}
                      className={`px-[10px] py-[5px] rounded-[7px] font-['JetBrains_Mono'] text-[10px] font-[500] transition-all ${hookTagFilter === tag ? "bg-[#3BFFC8] text-[#080A0F]" : "bg-[#111620] text-[#8892A4] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(59,255,200,0.3)] hover:text-[#3BFFC8]"}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── FILTER ROW 2: ANGLE (7 angles) ── */}
              <div className="mb-[10px] relative">
                <div className="flex items-center gap-[6px] mb-[6px]">
                  <p className="font-['JetBrains_Mono'] text-[8.5px] text-[#5A6478] uppercase tracking-[0.1em]">Angle — how are you saying it?</p>
                  <button
                    onClick={() => setActiveInfoTooltip(activeInfoTooltip === "angle" ? null : "angle")}
                    className="text-[#5A6478] hover:text-[#A78BFA] transition-colors"
                  >
                    <Info className="w-[12px] h-[12px]" />
                  </button>
                </div>
                {activeInfoTooltip === "angle" && (
                  <div className="mb-[10px] rounded-[10px] border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.03)] p-[12px]">
                    <div className="flex items-start justify-between mb-[8px]">
                      <p className="font-['Syne'] font-[700] text-[11px] text-[#A78BFA]">{hookFilterInfo.angle.title}</p>
                      <button onClick={() => setActiveInfoTooltip(null)} className="text-[#5A6478] hover:text-white ml-2 shrink-0"><X className="w-3 h-3" /></button>
                    </div>
                    <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] mb-[8px] leading-[1.5]">{hookFilterInfo.angle.description}</p>
                    <div className="space-y-[5px] max-h-[200px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(167,139,250,0.2) transparent" }}>
                      {hookFilterInfo.angle.items.map(item => (
                        <div key={item.name} className="flex gap-[6px]">
                          <span className="font-['JetBrains_Mono'] text-[9px] font-[700] text-[#A78BFA] min-w-[110px] shrink-0">{item.name}</span>
                          <span className="font-['DM_Sans'] text-[9.5px] text-[#8892A4] leading-[1.4]">{item.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-[6px]">
                  {hookAngleOptions.map((angle) => (
                    <button key={angle} onClick={() => setHookAngleFilter(angle)}
                      className={`px-[10px] py-[5px] rounded-[7px] font-['JetBrains_Mono'] text-[10px] font-[500] transition-all ${hookAngleFilter === angle ? "bg-[#A78BFA] text-[#080A0F]" : "bg-[#111620] text-[#8892A4] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(167,139,250,0.3)] hover:text-[#A78BFA]"}`}>
                      {angle}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── FILTER ROW 3: STRATEGY ── */}
              <div className="mb-[16px] relative">
                <div className="flex items-center gap-[6px] mb-[6px]">
                  <p className="font-['JetBrains_Mono'] text-[8.5px] text-[#5A6478] uppercase tracking-[0.1em]">Strategy — what's your conversion goal?</p>
                  <button
                    onClick={() => setActiveInfoTooltip(activeInfoTooltip === "strategy" ? null : "strategy")}
                    className="text-[#5A6478] hover:text-[#f5a623] transition-colors"
                  >
                    <Info className="w-[12px] h-[12px]" />
                  </button>
                </div>
                {activeInfoTooltip === "strategy" && (
                  <div className="mb-[10px] rounded-[10px] border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.03)] p-[12px]">
                    <div className="flex items-start justify-between mb-[8px]">
                      <p className="font-['Syne'] font-[700] text-[11px] text-[#f5a623]">{hookFilterInfo.strategy.title}</p>
                      <button onClick={() => setActiveInfoTooltip(null)} className="text-[#5A6478] hover:text-white ml-2 shrink-0"><X className="w-3 h-3" /></button>
                    </div>
                    <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] mb-[8px] leading-[1.5]">{hookFilterInfo.strategy.description}</p>
                    <div className="space-y-[5px] max-h-[200px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(245,166,35,0.2) transparent" }}>
                      {hookFilterInfo.strategy.items.map(item => (
                        <div key={item.name} className="flex gap-[6px]">
                          <span className="font-['JetBrains_Mono'] text-[9px] font-[700] text-[#f5a623] min-w-[110px] shrink-0">{item.name}</span>
                          <span className="font-['DM_Sans'] text-[9.5px] text-[#8892A4] leading-[1.4]">{item.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-[6px]">
                  {hookStrategyOptions.map((s) => (
                    <button key={s} onClick={() => setHookStrategyFilter(s)}
                      className={`px-[10px] py-[5px] rounded-[7px] font-['JetBrains_Mono'] text-[10px] font-[500] transition-all ${hookStrategyFilter === s ? "bg-[#f5a623] text-[#080A0F]" : "bg-[#111620] text-[#8892A4] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(245,166,35,0.3)] hover:text-[#f5a623]"}`}>
                      {hookStrategyLabels[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── RESULTS COUNT + RESET ── */}
              <div className="flex items-center justify-between mb-[10px]">
                <p className="font-['JetBrains_Mono'] text-[10px] text-[#5A6478]">
                  {filteredHookCards.cards.length} hook{filteredHookCards.cards.length !== 1 ? "s" : ""}
                  {filteredHookCards.isFallback && hookStrategyFilter !== "All" && (
                    <span className="text-[#f5a623] ml-[6px]">· closest match (strategy relaxed)</span>
                  )}
                  {!filteredHookCards.isFallback && hookTagFilter !== "All" && <span className="text-[#3BFFC8] ml-[4px]">· {hookTagFilter}</span>}
                  {!filteredHookCards.isFallback && hookAngleFilter !== "All" && <span className="text-[#A78BFA] ml-[4px]">· {hookAngleFilter}</span>}
                  {!filteredHookCards.isFallback && hookStrategyFilter !== "All" && <span className="text-[#f5a623] ml-[4px]">· {hookStrategyLabels[hookStrategyFilter]}</span>}
                </p>
                {(hookTagFilter !== "All" || hookAngleFilter !== "All" || hookStrategyFilter !== "All") && (
                  <button onClick={() => { setHookTagFilter("All"); setHookAngleFilter("All"); setHookStrategyFilter("All"); }}
                    className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] hover:text-[#F0F2F7] transition-colors">
                    clear filters ✕
                  </button>
                )}
              </div>

              {/* ── HOOK CARDS — scrollable container ── */}
              <div className="max-h-[640px] overflow-y-auto pr-[4px] rounded-[8px]" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(59,255,200,0.2) transparent" }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px] mb-[4px]">
                  {filteredHookCards.cards.map((card) => {
                    const active = card.id === selectedHookId;
                    const isFallbackCard = filteredHookCards.isFallback && hookStrategyFilter !== "All" && card.strategy !== hookStrategyFilter;
                    const triggerColors: Record<string, string> = {
                      curiosity: "text-[#60a5fa] bg-[rgba(96,165,250,0.08)] border-[rgba(96,165,250,0.2)]",
                      contrarian: "text-[#fb923c] bg-[rgba(251,146,60,0.08)] border-[rgba(251,146,60,0.2)]",
                      desire: "text-[#f472b6] bg-[rgba(244,114,182,0.08)] border-[rgba(244,114,182,0.2)]",
                      tension: "text-[#a78bfa] bg-[rgba(167,139,250,0.08)] border-[rgba(167,139,250,0.2)]",
                      fomo: "text-[#facc15] bg-[rgba(250,204,21,0.08)] border-[rgba(250,204,21,0.2)]",
                      "social-proof": "text-[#34d399] bg-[rgba(52,211,153,0.08)] border-[rgba(52,211,153,0.2)]",
                    };
                    const triggerColor = triggerColors[card.trigger] ?? triggerColors.curiosity;

                    return (
                      <div
                        key={card.id}
                        onClick={() => {
                          setSelectedHookId(card.id);
                          setActiveStep(creationMode === "remix" ? formatStep : structureStep);
                          requestAnimationFrame(() => {
                            document.getElementById(creationMode === "remix" ? "editor-step-format" : "editor-step-structure")?.scrollIntoView({ behavior: "smooth", block: "start" });
                          });
                        }}
                        className={`rounded-[12px] p-[14px] cursor-pointer transition-all duration-150 border flex flex-col gap-[12px] ${active ? "border-[rgba(59,255,200,0.4)] bg-[rgba(59,255,200,0.03)] shadow-[0_0_0_2px_rgba(59,255,200,0.1)]" : "border-[rgba(255,255,255,0.06)] bg-[#111620] hover:border-[rgba(255,255,255,0.12)]"}`}
                      >
                        {/* Fallback badge */}
                        {isFallbackCard && (
                          <div className="rounded-[5px] px-[7px] py-[3px] bg-[rgba(245,166,35,0.08)] border border-[rgba(245,166,35,0.2)] w-fit">
                            <p className="font-['JetBrains_Mono'] text-[8px] text-[#f5a623]">closest match — no exact {hookStrategyLabels[hookStrategyFilter] || "strategy"} card yet</p>
                          </div>
                        )}

                        {/* ── Card Header: badges + title ── */}
                        <div>
                          <div className="flex flex-wrap items-center gap-[5px] mb-[8px]">
                            <span className="rounded-full px-[7px] py-[2px] font-['JetBrains_Mono'] text-[8.5px] uppercase tracking-[0.06em] text-[#3BFFC8] bg-[rgba(59,255,200,0.08)] border border-[rgba(59,255,200,0.2)]">{card.tag}</span>
                            <span className="rounded-full px-[7px] py-[2px] font-['JetBrains_Mono'] text-[8.5px] uppercase tracking-[0.06em] text-[#A78BFA] bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.2)]">{card.angle}</span>
                            <span className={`rounded-full px-[7px] py-[2px] font-['JetBrains_Mono'] text-[8.5px] uppercase tracking-[0.06em] border ${triggerColor}`}>{card.trigger}</span>
                            {card.conversionFit === "leads" && <span className="rounded-full px-[7px] py-[2px] font-['JetBrains_Mono'] text-[8.5px] text-[#f472b6] bg-[rgba(244,114,182,0.08)] border border-[rgba(244,114,182,0.2)]">💰 leads</span>}
                            {card.conversionFit === "virality" && <span className="rounded-full px-[7px] py-[2px] font-['JetBrains_Mono'] text-[8.5px] text-[#60a5fa] bg-[rgba(96,165,250,0.08)] border border-[rgba(96,165,250,0.2)]">🚀 viral</span>}
                            {card.conversionFit === "both" && <span className="rounded-full px-[7px] py-[2px] font-['JetBrains_Mono'] text-[8.5px] text-[#3BFFC8] bg-[rgba(59,255,200,0.08)] border border-[rgba(59,255,200,0.2)]">⚡ both</span>}
                          </div>
                          <p className="font-['Syne'] text-[13px] font-[700] text-[#F0F2F7] mb-[6px]">{card.title}</p>
                          <p className="font-['DM_Sans'] text-[11px] text-[#8892A4] leading-[1.45]">{card.psychology}</p>
                        </div>

                        {/* ── Curiosity Score Bar ── */}
                        <div>
                          <div className="flex items-center justify-between mb-[4px]">
                            <span className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] uppercase tracking-[0.08em]">Curiosity Loop Strength</span>
                            <span className="font-['JetBrains_Mono'] text-[9px] text-[#3BFFC8] font-[600]">{card.curiosityScore}/100</span>
                          </div>
                          <div className="h-[3px] bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#3BFFC8] to-[#A78BFA] transition-all" style={{ width: `${card.curiosityScore}%` }} />
                          </div>
                        </div>

                        {/* ── Trifecta Layers ── */}
                        <div className="rounded-[8px] border border-[rgba(255,255,255,0.05)] overflow-hidden">
                          <div className="p-[8px_10px] bg-[rgba(255,255,255,0.02)] border-b border-[rgba(255,255,255,0.04)]">
                            <p className="font-['JetBrains_Mono'] text-[8.5px] text-[#5A6478] uppercase tracking-[0.08em]">Trifecta — how to execute this hook</p>
                          </div>
                          <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                            <div className="flex gap-[8px] p-[8px_10px]">
                              <span className="text-[11px]">🗣</span>
                              <div><p className="font-['JetBrains_Mono'] text-[8.5px] text-[#3BFFC8] mb-[2px]">VERBAL (what to say)</p><p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]">{card.verbalLayer}</p></div>
                            </div>
                            <div className="flex gap-[8px] p-[8px_10px]">
                              <span className="text-[11px]">📝</span>
                              <div><p className="font-['JetBrains_Mono'] text-[8.5px] text-[#A78BFA] mb-[2px]">WRITTEN (text overlay)</p><p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]">{card.writtenLayer}</p></div>
                            </div>
                            <div className="flex gap-[8px] p-[8px_10px]">
                              <span className="text-[11px]">👁</span>
                              <div><p className="font-['JetBrains_Mono'] text-[8.5px] text-[#f5a623] mb-[2px]">VISUAL (what to show)</p><p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]">{card.visualLayer}</p></div>
                            </div>
                          </div>
                        </div>

                        {/* ── Example + best-paired ── */}
                        <div>
                          <p className="font-['Georgia'] italic text-[11px] text-[#F0F2F7] opacity-80 border-l-2 border-[rgba(59,255,200,0.3)] pl-[8px] mb-[6px]">"{card.example}"</p>
                          <p className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478]">Pairs with: <span className="text-[#A78BFA]">{card.bestPairedWith}</span></p>
                        </div>

                        {/* ── Select indicator ── */}
                        {active && (
                          <div className="flex items-center gap-[6px] pt-[4px] border-t border-[rgba(59,255,200,0.15)]">
                            <span className="w-[6px] h-[6px] rounded-full bg-[#3BFFC8]"></span>
                            <span className="font-['JetBrains_Mono'] text-[9px] text-[#3BFFC8]">Selected — advancing to Story Structure</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-[20px] pt-[16px] border-t border-white/10">
                <HookBuilder
                  topic={topic.trim() || "Video topic"}
                  angle={selectedHook?.angle}
                  clientProfile={
                    selectedClient
                      ? JSON.stringify({
                          name: selectedClient.name,
                          niche: selectedClient.niche,
                          tone: selectedClient.tonePersona || selectedClient.tone,
                        })
                      : undefined
                  }
                  gameMode={selectedHook?.conversionFit === "leads" ? "conversion" : "awareness"}
                  settings={hookBuilderSettings}
                  onInsert={(hook) => {
                    const h = hook.trim();
                    if (!h) return;
                    void navigator.clipboard.writeText(h);
                    let inserted = false;
                    setScript((prev) => {
                      if (!prev.trim()) {
                        inserted = true;
                        return `[HOOK]\n\n${h}\n\n`;
                      }
                      return prev;
                    });
                    toast(
                      "success",
                      "Hook ready",
                      inserted
                        ? "Inserted at the top under [HOOK] (also copied)."
                        : "Copied to clipboard — paste where you need it.",
                    );
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {creationMode === "remix" && (
          <section id="editor-step-format" className="glass-surface rounded-2xl overflow-hidden mb-[14px] transition-all duration-300 scroll-mt-24">
            <div
              onClick={() => setActiveStep(activeStep === formatStep ? 0 : formatStep)}
              className="flex items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            >
              <div className="flex items-center gap-[12px]">
                <div className={`font-['JetBrains_Mono'] text-[10px] w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center ${activeStep >= formatStep ? "bg-[rgba(59,255,200,0.1)] border-[rgba(59,255,200,0.3)] text-[#3BFFC8]" : "border-[rgba(255,255,255,0.15)] text-[#5A6478]"}`}>4</div>
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]"><span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] font-[600] mr-2">4 / 7</span>Choose Format</h2>
              </div>
              <span className={`text-[#5A6478] transition-transform duration-300 ${activeStep === formatStep ? "rotate-180" : ""}`}>▼</span>
            </div>
            {activeStep === formatStep && (
              <div className="p-[18px]">
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: "short", label: "Short" },
                    { id: "long", label: "Long" },
                    { id: "carousel", label: "Carousel" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setVideoFormat(opt.id as "short" | "long" | "carousel")}
                      className={`px-3 py-1.5 rounded-md text-[11px] border ${videoFormat === opt.id ? "bg-cyan-500/20 border-cyan-400 text-cyan-200" : "bg-white/[0.03] border-white/10 text-white/70 hover:text-white"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* STEP 5: STORY STRUCTURE */}
        <section id="editor-step-structure" className="glass-surface rounded-2xl overflow-hidden mb-[14px] transition-all duration-300 scroll-mt-24">
          <div
            onClick={() => setActiveStep(activeStep === structureStep ? 0 : structureStep)}
            className="flex items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
          >
            <div className="flex items-center gap-[12px]">
              <div className={`font-['JetBrains_Mono'] text-[10px] w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center ${activeStep >= structureStep ? "bg-[rgba(59,255,200,0.1)] border-[rgba(59,255,200,0.3)] text-[#3BFFC8]" : "border-[rgba(255,255,255,0.15)] text-[#5A6478]"}`}>5</div>
              <div>
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">
                  {creationMode === "remix" ? (
                    <>
                      <span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] font-[600] mr-2">5 / 7</span>
                      Choose a Story Structure
                    </>
                  ) : (
                    "Choose a Story Structure"
                  )}
                </h2>
                {creationMode === "remix" && <p className="font-['DM_Sans'] text-[10px] text-[#5A6478] mt-0.5">Pick the narrative flow after setting hook and format.</p>}
              </div>
              {selectedStyleId && styleCards.find(c => c.id === selectedStyleId) && (
                <span className="hidden md:inline font-['JetBrains_Mono'] text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-[8px] py-[2px] rounded-full">
                  {styleCards.find(c => c.id === selectedStyleId)?.title}
                </span>
              )}
            </div>
            <span className={`text-[#5A6478] transition-transform duration-300 ${activeStep === structureStep ? "rotate-180" : ""}`}>▼</span>
          </div>

          {activeStep === structureStep && (
            <div className="p-[18px]">

              {/* ── STORY SCIENCE PANEL (collapsible) ── */}
              <div className="mb-[16px] rounded-[12px] border border-[rgba(255,255,255,0.07)] overflow-hidden">
                <button
                  onClick={() => setShowStoryScience(!showStoryScience)}
                  className="w-full flex items-center justify-between p-[10px_14px] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                >
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#F0F2F7] font-[600] tracking-[0.04em]">📖 STORY SCIENCE — READ THIS FIRST</span>
                  <span className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478]">{showStoryScience ? "▲ collapse" : "▼ expand"}</span>
                </button>
                {showStoryScience && (
                  <div className="p-[14px] border-t border-[rgba(255,255,255,0.05)] space-y-[14px]">

                    {/* Modern Arc */}
                    <div className="rounded-[8px] bg-[rgba(59,255,200,0.04)] border border-[rgba(59,255,200,0.12)] p-[10px_12px]">
                      <p className="font-['JetBrains_Mono'] text-[9px] text-[#3BFFC8] uppercase tracking-[0.08em] mb-[6px]">⚡ The Modern Story Arc (not what school taught you)</p>
                      <p className="font-['DM_Sans'] text-[11px] text-[#8892A4] leading-[1.5]">
                        Traditional arc = slow build → 80% bounce rate. The modern internet arc starts at <strong className="text-[#F0F2F7]">70/100 intensity</strong> and spikes to <strong className="text-[#F0F2F7]">90/100 within the first minute</strong> via conflict or contrast. Then release, build again. Repeat on a 2–5 minute cadence.
                      </p>
                    </div>

                    {/* 5 Psychological Triggers */}
                    <div>
                      <p className="font-['JetBrains_Mono'] text-[9px] text-[#A78BFA] uppercase tracking-[0.08em] mb-[8px]">🧠 5 Psychological Triggers — use at least 3 in your hook</p>
                      <div className="grid grid-cols-1 gap-[5px]">
                        {[
                          { t: "Pattern Interruption", d: "Break the expected. 'Today I'll teach you' → DEAD. 'Your teachers were wrong about this' → ALIVE." },
                          { t: "Curiosity Gap", d: "Human brain hates incomplete info. 'Hearing the 5th tip will make you angry' forces them to stay." },
                          { t: "Social Proof + FOMO", d: "'Only 1% of people know why Bill Gates goes to this café' — herd mentality + fear of missing out." },
                          { t: "Personal Stakes", d: "Make it about them. 'If you also feel X, this video is for you' — self-interest is the #1 motivator." },
                          { t: "Immediate Threat / Reward", d: "Urgency + payoff. 'In the next 5 min you'll understand why you overthink' = click." },
                        ].map(item => (
                          <div key={item.t} className="flex gap-[8px] p-[6px_8px] bg-[rgba(167,139,250,0.04)] rounded-[6px]">
                            <span className="font-['JetBrains_Mono'] text-[8.5px] text-[#A78BFA] mt-[1px] whitespace-nowrap">{item.t}</span>
                            <span className="font-['DM_Sans'] text-[10px] text-[#5A6478] leading-[1.4]">{item.d}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 7 Mistakes */}
                    <div>
                      <button onClick={() => setShowStoryMistakes(!showStoryMistakes)} className="flex items-center gap-[6px] mb-[8px]">
                        <span className="font-['JetBrains_Mono'] text-[9px] text-[#fb923c] uppercase tracking-[0.08em]">🚫 7 Storytelling Mistakes Killing Your Retention</span>
                        <span className="text-[#5A6478] text-[9px]">{showStoryMistakes ? "▲" : "▼"}</span>
                      </button>
                      {showStoryMistakes && (
                        <div className="space-y-[6px]">
                          {[
                            { m: "Traditional Story Arc", fix: "Start at 70/100 intensity, not at zero. The slow build is dead." },
                            { m: "Wrong W-Order in Intro", fix: "Start with WHAT + WHY. Save WHO/WHERE/WHEN for last — viewers need to know what's in it for them in the first 5s." },
                            { m: "Not Re-Hooking Throughout", fix: "Every time you close a curiosity loop, immediately open a new one. 'But the truth is…' = free retention." },
                            { m: "No Villain / Antagonist", fix: "Great stories have contrast. Pick an antagonist (a concept, system, belief) to build stakes against your hero." },
                            { m: "Nothing for the Viewer to Root For", fix: "Give common ground. Share examples that relate directly to the viewer's exact situation so they root for you." },
                            { m: "Lacking Atomic Shareability", fix: "Can the viewer retell this story in 10 words? If not, simplify. Paul Revere: 'The British are coming.'" },
                            { m: "Not Painting the Picture", fix: "Use B-roll, visual cues, examples. The brain is designed for visual input — words alone cause comprehension loss." },
                          ].map((item, i) => (
                            <div key={i} className="flex gap-[8px] p-[6px_8px] bg-[rgba(251,146,60,0.04)] rounded-[6px]">
                              <span className="font-['JetBrains_Mono'] text-[8px] text-[#fb923c] whitespace-nowrap mt-[1px]">{i+1}. {item.m}</span>
                              <span className="font-['DM_Sans'] text-[10px] text-[#5A6478] leading-[1.4]">Fix: {item.fix}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* CVF Method */}
                    <div className="rounded-[8px] bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] p-[10px_12px]">
                      <p className="font-['JetBrains_Mono'] text-[9px] text-[#3BFFC8] uppercase tracking-[0.08em] mb-[6px]">⚙️ CVF Method — Retention Blueprint for Each Point</p>
                      <div className="space-y-[4px]">
                        {[
                          { l: "C — Context", d: "Explain your point simply, immediately after the hook." },
                          { l: "V — Visual Cues", d: "Show it with B-roll/examples — viewers need to see, not just hear." },
                          { l: "F — Framing", d: "Every point must explain WHY it's necessary for the overall video." },
                        ].map(x => (
                          <div key={x.l} className="flex gap-[8px]">
                            <span className="font-['JetBrains_Mono'] text-[8.5px] text-[#3BFFC8] whitespace-nowrap">{x.l}:</span>
                            <span className="font-['DM_Sans'] text-[10px] text-[#8892A4]">{x.d}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 4-Question Script Audit */}
                    <div className="rounded-[8px] bg-[rgba(167,139,250,0.04)] border border-[rgba(167,139,250,0.12)] p-[10px_12px]">
                      <p className="font-['JetBrains_Mono'] text-[9px] text-[#A78BFA] uppercase tracking-[0.08em] mb-[6px]">✅ 4-Question Script Audit (run before recording)</p>
                      <div className="space-y-[3px]">
                        {["Is this story actually interesting? (1-100 shock score)", "Is this script as compressed as it can be? (no fluff)", "Does this hook actually hook ME on its own?", "What emotion do I feel when I finish reading?"].map((q, i) => (
                          <p key={i} className="font-['DM_Sans'] text-[10px] text-[#8892A4]">☐ {q}</p>
                        ))}
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* ── TOP ROW: Auto-Match + Filters ── */}
              <div className="flex items-center justify-between mb-[10px] gap-[8px] flex-wrap">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleAutoMatchStructure(); }}
                  disabled={isAutoMatchingStructure || !topic}
                  className="flex items-center gap-[6px] p-[6px_12px] bg-[rgba(59,255,200,0.1)] border border-[rgba(59,255,200,0.3)] rounded-[6px] text-[#3BFFC8] font-['JetBrains_Mono'] text-[11px] font-[600] transition-all hover:bg-[rgba(59,255,200,0.2)] hover:shadow-[0_0_15px_rgba(59,255,200,0.2)] disabled:opacity-50"
                >
                  {isAutoMatchingStructure ? "Matching..." : "✨ Auto-Match Structure"}
                </button>
                {(storyCategoryFilter !== "All" || storyEmotionTarget !== "All") && (
                  <button onClick={() => { setStoryCategoryFilter("All"); setStoryEmotionTarget("All"); }}
                    className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] hover:text-[#F0F2F7] transition-colors">
                    clear filters ✕
                  </button>
                )}
              </div>

              {/* ── CATEGORY FILTER ── */}
              <div className="mb-[8px]">
                <div className="flex items-center gap-[6px] mb-[6px]">
                  <p className="font-['JetBrains_Mono'] text-[8.5px] text-[#5A6478] uppercase tracking-[0.08em]">Category</p>
                  <button
                    type="button"
                    onClick={() => setActiveInfoTooltip(activeInfoTooltip === "story-category" ? null : "story-category")}
                    className="w-[14px] h-[14px] rounded-full border border-[rgba(59,255,200,0.3)] text-[#3BFFC8] flex items-center justify-center hover:border-[#3BFFC8] hover:bg-[rgba(59,255,200,0.1)] transition-all flex-shrink-0"
                    title="What does Category mean?"
                  >
                    {activeInfoTooltip === "story-category" ? <X className="w-[8px] h-[8px]" /> : <Info className="w-[8px] h-[8px]" />}
                  </button>
                </div>
                {activeInfoTooltip === "story-category" && (
                  <div className="mb-[8px] rounded-[10px] border border-[rgba(59,255,200,0.2)] bg-[rgba(59,255,200,0.04)] p-[12px]">
                    <div className="flex items-center justify-between mb-[6px]">
                      <p className="font-['Syne'] font-[700] text-[11px] text-[#3BFFC8]">{storyFilterInfo.category.title}</p>
                      <button onClick={() => setActiveInfoTooltip(null)} className="text-[#5A6478] hover:text-[#F0F2F7] transition-colors"><X className="w-[10px] h-[10px]" /></button>
                    </div>
                    <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] mb-[8px] leading-[1.5]">{storyFilterInfo.category.description}</p>
                    <div className="max-h-[160px] overflow-y-auto space-y-[5px] pr-[2px]" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(59,255,200,0.2) transparent" }}>
                      {storyFilterInfo.category.items.map(item => (
                        <div key={item.name} className="p-[7px_9px] rounded-[6px] bg-[rgba(59,255,200,0.03)] border border-[rgba(59,255,200,0.1)]">
                          <p className="font-['JetBrains_Mono'] text-[9px] font-[700] text-[#3BFFC8] mb-[2px]">{item.name}</p>
                          <p className="font-['DM_Sans'] text-[9.5px] text-[#8892A4] leading-[1.4]">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-[5px]">
                  {["All", "Story Arc", "Reveal & Shift", "Educational", "Framework", "Narrative", "Proof", "Retention"].map(cat => (
                    <button key={cat} onClick={() => setStoryCategoryFilter(cat)}
                      className={`px-[9px] py-[4px] rounded-[6px] font-['JetBrains_Mono'] text-[9.5px] font-[500] transition-all ${storyCategoryFilter === cat ? "bg-emerald-400 text-[#080A0F]" : "bg-[#111620] text-[#8892A4] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(16,185,129,0.3)] hover:text-emerald-400"}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── EMOTION FILTER ── */}
              <div className="mb-[12px]">
                <div className="flex items-center gap-[6px] mb-[6px]">
                  <p className="font-['JetBrains_Mono'] text-[8.5px] text-[#5A6478] uppercase tracking-[0.08em]">Target Emotion</p>
                  <button
                    type="button"
                    onClick={() => setActiveInfoTooltip(activeInfoTooltip === "story-emotion" ? null : "story-emotion")}
                    className="w-[14px] h-[14px] rounded-full border border-[rgba(167,139,250,0.3)] text-[#A78BFA] flex items-center justify-center hover:border-[#A78BFA] hover:bg-[rgba(167,139,250,0.1)] transition-all flex-shrink-0"
                    title="What does Target Emotion mean?"
                  >
                    {activeInfoTooltip === "story-emotion" ? <X className="w-[8px] h-[8px]" /> : <Info className="w-[8px] h-[8px]" />}
                  </button>
                </div>
                {activeInfoTooltip === "story-emotion" && (
                  <div className="mb-[8px] rounded-[10px] border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.04)] p-[12px]">
                    <div className="flex items-center justify-between mb-[6px]">
                      <p className="font-['Syne'] font-[700] text-[11px] text-[#A78BFA]">{storyFilterInfo.emotion.title}</p>
                      <button onClick={() => setActiveInfoTooltip(null)} className="text-[#5A6478] hover:text-[#F0F2F7] transition-colors"><X className="w-[10px] h-[10px]" /></button>
                    </div>
                    <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] mb-[8px] leading-[1.5]">{storyFilterInfo.emotion.description}</p>
                    <div className="max-h-[180px] overflow-y-auto space-y-[5px] pr-[2px]" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(167,139,250,0.2) transparent" }}>
                      {storyFilterInfo.emotion.items.map(item => (
                        <div key={item.name} className="p-[7px_9px] rounded-[6px] bg-[rgba(167,139,250,0.03)] border border-[rgba(167,139,250,0.1)]">
                          <p className="font-['JetBrains_Mono'] text-[9px] font-[700] text-[#A78BFA] mb-[2px]">{item.name}</p>
                          <p className="font-['DM_Sans'] text-[9.5px] text-[#8892A4] leading-[1.4]">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-[5px]">
                  {[
                    { id: "All", label: "All" },
                    { id: "curiosity", label: "😮 Curiosity", genEmotion: "Shock & Curiosity" },
                    { id: "inspiration", label: "✨ Inspiration", genEmotion: "Inspiration & Hope" },
                    { id: "empathy", label: "❤️ Empathy", genEmotion: "Empathy & Connection" },
                    { id: "excitement", label: "🚀 Excitement", genEmotion: "FOMO & Excitement" },
                    { id: "awe", label: "🤯 Awe", genEmotion: "Awe & Wonder" },
                    { id: "outrage", label: "😡 Outrage", genEmotion: "Anger & Injustice" },
                    { id: "motivation", label: "💪 Motivation", genEmotion: "Motivation & Drive" },
                    { id: "nostalgia", label: "🌅 Nostalgia", genEmotion: "Nostalgia & Warmth" },
                  ].map(e => (
                    <button key={e.id} onClick={() => {
                      setStoryEmotionTarget(e.id);
                      if (e.genEmotion) setEmotionFilter(e.genEmotion);
                    }}
                      className={`px-[9px] py-[4px] rounded-[6px] font-['JetBrains_Mono'] text-[9.5px] font-[500] transition-all ${storyEmotionTarget === e.id ? "bg-[#A78BFA] text-[#080A0F]" : "bg-[#111620] text-[#8892A4] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(167,139,250,0.3)] hover:text-[#A78BFA]"}`}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-[580px] overflow-y-auto pr-[4px] rounded-[8px]" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(16,185,129,0.2) transparent" }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-[4px]">
                {styleCards.filter(card => {
                  const matchesCat = storyCategoryFilter === "All" || card.category === storyCategoryFilter;
                  const matchesEmotion = storyEmotionTarget === "All" || card.emotionTarget === storyEmotionTarget;
                  return matchesCat && matchesEmotion;
                }).map((card) => {
                  const active = card.id === selectedStyleId;
                  
                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        setSelectedStyleId(card.id);
                        setActiveStep(creationMode === "remix" ? 6 : 6);
                        requestAnimationFrame(() => {
                          document.getElementById(creationMode === "remix" ? "editor-step-packaging" : "editor-step-generate")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        });
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
                        <p className="font-['DM_Sans'] text-[11.5px] text-[#8892A4] leading-[1.4]">{card.description}</p>
                      </div>
                      {/* Slot flow — the structure's step-by-step breakdown */}
                      <div className="mt-[10px] pt-[10px] border-t border-white/5">
                        <p className="font-['JetBrains_Mono'] text-[8.5px] text-[#5A6478] uppercase tracking-[0.08em] mb-[6px]">Structure Flow</p>
                        <div className="flex flex-wrap gap-[4px]">
                          {card.flow.map((slot, i) => (
                            <span key={i} className="flex items-center gap-[3px]">
                              <span className={`px-[6px] py-[2px] rounded-[4px] font-['DM_Sans'] text-[9.5px] font-[500] whitespace-nowrap ${
                                i === 0 ? "bg-[rgba(59,255,200,0.1)] text-[#3BFFC8] border border-[rgba(59,255,200,0.2)]"
                                : i === card.flow.length - 1 ? "bg-[rgba(167,139,250,0.1)] text-[#A78BFA] border border-[rgba(167,139,250,0.2)]"
                                : "bg-[rgba(255,255,255,0.04)] text-[#8892A4] border border-[rgba(255,255,255,0.06)]"
                              }`}>{slot}</span>
                              {i < card.flow.length - 1 && <span className="text-[#3A4153] text-[9px]">→</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Psychological core */}
                      {card.psychologicalCore && (
                        <div className="mt-[8px] pt-[8px] border-t border-white/5">
                          <p className="font-['JetBrains_Mono'] text-[8px] text-[#5A6478] uppercase tracking-[0.06em] mb-[3px]">🧠 Psych Core</p>
                          <p className="font-['DM_Sans'] text-[10px] text-[#5A6478] leading-[1.35] italic">{card.psychologicalCore}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          )}
        </section>

        {creationMode === "remix" && (
          <section id="editor-step-packaging" className="glass-surface rounded-2xl overflow-hidden mb-[14px] transition-all duration-300 scroll-mt-24">
            <div
              onClick={() => setActiveStep(activeStep === packagingStep ? 0 : packagingStep)}
              className="flex items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            >
              <div className="flex items-center gap-[12px]">
                <div className={`font-['JetBrains_Mono'] text-[10px] w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center ${activeStep >= packagingStep ? "bg-[rgba(59,255,200,0.1)] border-[rgba(59,255,200,0.3)] text-[#3BFFC8]" : "border-[rgba(255,255,255,0.15)] text-[#5A6478]"}`}>6</div>
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]"><span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] font-[600] mr-2">6 / 7</span>Packaging</h2>
              </div>
              <span className={`text-[#5A6478] transition-transform duration-300 ${activeStep === packagingStep ? "rotate-180" : ""}`}>▼</span>
            </div>
            {activeStep === packagingStep && (
              <div className="p-[18px] space-y-3">
                <p className="font-['DM_Sans'] text-[11px] text-[#5A6478]">Choose your final packaging emphasis before generation.</p>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                  <p className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-[#3BFFC8]">Packaging checklist</p>
                  <p className="font-['DM_Sans'] text-[11px] text-white/80">- Spoken hook must clearly state the premise in first 3 seconds.</p>
                  <p className="font-['DM_Sans'] text-[11px] text-white/80">- Visual hook should increase contrast/motion/brightness immediately.</p>
                  <p className="font-['DM_Sans'] text-[11px] text-white/80">- Text hook should be fast to read and aligned with spoken hook.</p>
                </div>
                <select
                  value={onePercentFocus}
                  onChange={(e) => setOnePercentFocus(e.target.value)}
                  className="w-full bg-[#111620] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white"
                >
                  <option>Stronger Packaging (Title/Cover)</option>
                  <option>Stronger Hook Promise</option>
                  <option>Stronger Outcome Clarity</option>
                  <option>Stronger Curiosity Gap</option>
                  <option>Stronger CTA Direction</option>
                </select>
              </div>
            )}
          </section>
        )}

        {/* STEP 6/7: GENERATION ENGINE */}
        <section
          id="editor-step-generate"
          className={`glass-surface glow-cyan rounded-[14px] overflow-hidden mb-[16px] transition-all duration-300 scroll-mt-24 ${activeStep === generateStep ? "opacity-100 shadow-[0_0_30px_rgba(59,255,200,0.03)]" : "opacity-80"}`}
        >
          <div
            onClick={() => setActiveStep(generateStep)}
            className="flex flex-col md:flex-row items-start md:items-center justify-between p-[16px_20px] border-b border-[rgba(255,255,255,0.08)] gap-[12px] cursor-pointer relative"
          >
            <div className="flex items-center gap-[8px]">
              <div>
                <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">
                  {creationMode === "remix" ? (
                    <>
                      <span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] font-[600] mr-2">7 / 7</span>
                      🤖 Generate & refine script
                    </>
                  ) : (
                    <>6 / 6 · Generate & refine script</>
                  )}
                </h2>
                {creationMode === "remix" && (
                  <p className="font-['DM_Sans'] text-[10px] text-[#5A6478] mt-0.5">Final remix step — then use pacing, viral score, and repurpose tools below.</p>
                )}
              </div>
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
              <optgroup label="── Gemini (Google)">
                <option value="gemini-3-flash-preview">Gemini 3 Flash ✦ New</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro ✦ New</option>
              </optgroup>
              <optgroup label="── GPT (OpenAI)">
                <option value="gpt-5.4">GPT-5.4 ✦ New</option>
                <option value="gpt-5.4-mini">GPT-5.4 Mini ✦ New</option>
              </optgroup>
              <optgroup label="── Claude (Anthropic)">
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 ✦ New</option>
                <option value="claude-opus-4-7">Claude Opus 4.7 ✦ New</option>
              </optgroup>
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

            {/* Humanize Toggle */}
            <div className="flex items-center gap-[6px] pl-[10px] border-l border-white/10">
              <button
                type="button"
                onClick={() => setHumanizeEnabled(!humanizeEnabled)}
                title="Auto-humanize: removes AI patterns from every generated script"
                className={`relative flex items-center gap-[5px] px-[9px] py-[5px] rounded-[7px] border transition-all font-['DM_Sans'] text-[11px] font-[600] ${
                  humanizeEnabled
                    ? "border-[#3BFFC8]/60 bg-[#3BFFC8]/10 text-[#3BFFC8]"
                    : "border-white/10 bg-white/5 text-[#8892A4] hover:bg-white/10"
                }`}
              >
                <span>🧠</span>
                <span>Humanize</span>
                <span className={`w-[8px] h-[8px] rounded-full ${humanizeEnabled ? "bg-[#3BFFC8]" : "bg-gray-600"}`} />
              </button>
            </div>

            {videoFormat !== "carousel" && (
              <div className="flex items-center gap-[8px] ml-[4px] pl-[10px] border-l border-white/10">
                <button
                  type="button"
                  onClick={() => setRehookEnabled(!rehookEnabled)}
                  title="Re-Hook Inserter: prevent mid-video drop-off"
                  className={`relative flex items-center gap-[6px] px-[10px] py-[5px] rounded-[7px] border transition-all font-['DM_Sans'] text-[11px] font-[600] ${
                    rehookEnabled
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
                      : "border-white/10 bg-white/5 text-[#8892A4] hover:bg-white/10"
                  }`}
                >
                  <span>⚡</span>
                  <span>Re-Hook</span>
                  <span className={`w-[8px] h-[8px] rounded-full ${rehookEnabled ? "bg-amber-400" : "bg-gray-600"}`} />
                </button>
                {rehookEnabled && (
                  <select
                    value={rehookInterval}
                    onChange={(e) => setRehookInterval(Number(e.target.value) as 10 | 12 | 15)}
                    className="bg-white/5 border border-amber-500/30 rounded-[7px] p-[5px_24px_5px_8px] font-['DM_Sans'] text-[11px] text-amber-300 outline-none cursor-pointer"
                  >
                    <option value={10}>Every 10s</option>
                    <option value={12}>Every 12s</option>
                    <option value={15}>Every 15s</option>
                  </select>
                )}
                {rehookEnabled && (
                  <button
                    type="button"
                    onClick={() => void handleInsertRehooks()}
                    disabled={isInsertingRehooks}
                    className="px-[10px] py-[5px] rounded-[7px] bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-['DM_Sans'] text-[11px] font-[600] transition flex items-center gap-1"
                  >
                    {isInsertingRehooks ? "Analyzing..." : "Insert Re-Hooks"}
                  </button>
                )}
              </div>
            )}
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
            <div
              title="Set in Step 4 → Choose a Story Structure"
              className="flex items-center gap-[6px] bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.2)] rounded-[7px] px-[10px] py-[5px] cursor-default"
            >
              <span className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] uppercase tracking-[0.06em]">Emotion</span>
              <span className="font-['DM_Sans'] text-[11px] font-[600] text-[#A78BFA]">{emotionFilter}</span>
              <span className="font-['JetBrains_Mono'] text-[8px] text-[#5A6478]">← step 4</span>
            </div>
          </div>

          {videoFormat !== "carousel" && (
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
          )}

          <div className="p-[10px_20px] flex items-center gap-[12px] bg-[rgba(17,22,32,0.4)] border-b border-[rgba(255,255,255,0.06)]">
            <span className="font-['JetBrains_Mono'] text-[9px] uppercase text-[#5A6478] whitespace-nowrap">{formatLengthConfig.label}</span>
            <span className="font-['DM_Sans'] text-[11px] text-[#5A6478] whitespace-nowrap">{formatLengthConfig.hint}</span>
            <div className="flex-1 relative flex items-center ml-[8px]">
              <div className="w-full h-[3px] bg-[rgba(255,255,255,0.08)] rounded-[2px] absolute"></div>
              <div className="h-[3px] rounded-[2px] absolute bg-[#3BFFC8]" style={{ width: `${((videoLength - formatLengthConfig.min) / (formatLengthConfig.max - formatLengthConfig.min)) * 100}%` }}></div>
              <input
                type="range"
                min={formatLengthConfig.min}
                max={formatLengthConfig.max}
                value={videoLength}
                onChange={(e) => setVideoLength(Number(e.target.value))}
                className="w-full h-[3px] appearance-none bg-transparent cursor-pointer z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F0F2F7] [&::-webkit-slider-thumb]:border-[2px] [&::-webkit-slider-thumb]:border-[#3BFFC8] [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(59,255,200,0.4)]"
              />
            </div>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8] bg-[rgba(59,255,200,0.08)] border border-[rgba(59,255,200,0.2)] p-[2px_8px] rounded-[4px] ml-[8px]">
              {videoLength}{formatLengthConfig.unit}
            </span>
          </div>

          {/* Humanize / Analyze action bar (shown when script exists) */}
          {script.trim() && (
            <div className="px-[20px] py-[10px] flex items-center gap-[8px] bg-[rgba(17,22,32,0.6)] border-b border-[rgba(255,255,255,0.05)] flex-wrap">
              <button
                type="button"
                onClick={() => void handleManualHumanize()}
                disabled={isHumanizing}
                className="flex items-center gap-[5px] px-[10px] py-[6px] rounded-[7px] bg-[rgba(59,255,200,0.08)] border border-[rgba(59,255,200,0.25)] text-[#3BFFC8] font-['DM_Sans'] text-[11px] font-[600] hover:bg-[rgba(59,255,200,0.15)] transition disabled:opacity-50"
              >
                🧠 {isHumanizing ? "Humanizing..." : "Humanize"}
              </button>
              <button
                type="button"
                onClick={() => void handleAnalyze("hook")}
                disabled={isAnalyzing !== null}
                className="flex items-center gap-[5px] px-[10px] py-[6px] rounded-[7px] bg-[rgba(96,165,250,0.08)] border border-[rgba(96,165,250,0.25)] text-[#60a5fa] font-['DM_Sans'] text-[11px] font-[600] hover:bg-[rgba(96,165,250,0.15)] transition disabled:opacity-50"
              >
                🎯 {isAnalyzing === "hook" ? "Analyzing..." : "Analyze Hook"}
              </button>
              <button
                type="button"
                onClick={() => void handleAnalyze("script")}
                disabled={isAnalyzing !== null}
                className="flex items-center gap-[5px] px-[10px] py-[6px] rounded-[7px] bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.25)] text-[#A78BFA] font-['DM_Sans'] text-[11px] font-[600] hover:bg-[rgba(167,139,250,0.15)] transition disabled:opacity-50"
              >
                📊 {isAnalyzing === "script" ? "Analyzing..." : "Analyze Script"}
              </button>
              {showAnalysisPanel && (
                <button
                  onClick={() => { setShowAnalysisPanel(false); setAnalysisResult(null); }}
                  className="ml-auto text-[#5A6478] hover:text-white font-['JetBrains_Mono'] text-[10px] transition"
                >
                  hide analysis ✕
                </button>
              )}
            </div>
          )}

          {/* Analysis Results Panel */}
          {showAnalysisPanel && (
            <div className="mx-[20px] mt-[14px] mb-0 rounded-[12px] border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.04)] overflow-hidden">
              <div className="p-[12px_14px] border-b border-[rgba(167,139,250,0.12)] flex items-center gap-[8px]">
                <span className="font-['Syne'] font-[700] text-[11px] text-[#A78BFA]">
                  {isAnalyzing ? (isAnalyzing === "hook" ? "🎯 Analyzing Hook..." : "📊 Analyzing Full Script...") : (analysisResult?.type === "hook_analysis" ? "🎯 Hook Analysis" : "📊 Script Analysis")}
                </span>
              </div>
              {isAnalyzing && (
                <div className="p-[20px] text-center">
                  <div className="inline-block w-[20px] h-[20px] border-2 border-[#A78BFA] border-t-transparent rounded-full animate-spin mb-[8px]" />
                  <p className="font-['DM_Sans'] text-[11px] text-[#8892A4]">Analyzing with {activeModel}...</p>
                </div>
              )}
              {!isAnalyzing && analysisResult && (
                <AnalysisPanel result={analysisResult} />
              )}
            </div>
          )}

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
                    pinnedScriptSelectionRef.current = { start, end, text };
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
                    pinnedScriptSelectionRef.current = null;
                  }
                }}
                placeholder="Your viral script will appear here..."
                className="min-h-[500px] w-full bg-transparent p-8 pb-20 font-['DM_Sans'] text-[15px] leading-[1.7] text-gray-200 outline-none focus:outline-none whitespace-pre-wrap resize-none scrollbar-hide"
                spellCheck={false}
              />

              {/* Re-Hook Review Panel */}
              {rehookSegments.length > 0 && (
                <div className="mx-4 mb-4 rounded-xl border border-amber-500/40 bg-amber-900/10 overflow-hidden">
                  <div className="flex items-center justify-between p-3 border-b border-amber-500/20">
                    <p className="text-xs font-semibold text-amber-300">⚡ Re-Hook Suggestions — Accept or Reject each</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAcceptedRehooks(new Set(rehookSegments.map((_, i) => i).filter((i) => rehookSegments[i].rehookAfter)))}
                        className="text-[10px] text-amber-400 border border-amber-600/40 px-2 py-1 rounded hover:bg-amber-900/30 transition"
                      >Accept All</button>
                      <button
                        type="button"
                        onClick={applyAcceptedRehooks}
                        className="text-[10px] bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded font-semibold transition"
                      >Apply to Script</button>
                      <button
                        type="button"
                        onClick={() => setRehookSegments([])}
                        className="text-[10px] text-gray-500 hover:text-white transition"
                      >✕</button>
                    </div>
                  </div>
                  <div className="p-3 space-y-3 max-h-[420px] overflow-y-auto">
                    {rehookSegments.map((seg, i) => (
                      <div key={i} className="space-y-1">
                        <p className="text-xs text-gray-300 font-['DM_Sans'] leading-relaxed">{seg.text}</p>
                        {seg.rehookAfter && (
                          <div className={`flex items-start gap-2 p-2.5 rounded-lg border transition ${acceptedRehooks.has(i) ? "border-amber-500/60 bg-amber-900/20" : rejectedRehooks.has(i) ? "border-gray-700 bg-gray-900/40 opacity-40" : "border-amber-500/30 bg-amber-900/10"}`}>
                            <div className="flex-1 min-w-0">
                              <span className="text-[9px] uppercase tracking-wide text-amber-500 font-semibold mr-1">[{seg.rehookAfter.type}]</span>
                              <span className="text-xs text-amber-200 italic">{seg.rehookAfter.line}</span>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => { setAcceptedRehooks((p) => { const n = new Set(p); n.add(i); return n; }); setRejectedRehooks((p) => { const n = new Set(p); n.delete(i); return n; }); }}
                                className={`text-[10px] px-2 py-0.5 rounded transition ${acceptedRehooks.has(i) ? "bg-amber-600 text-white" : "border border-amber-600/40 text-amber-400 hover:bg-amber-900/30"}`}
                              >✓</button>
                              <button
                                type="button"
                                onClick={() => { setRejectedRehooks((p) => { const n = new Set(p); n.add(i); return n; }); setAcceptedRehooks((p) => { const n = new Set(p); n.delete(i); return n; }); }}
                                className={`text-[10px] px-2 py-0.5 rounded transition ${rejectedRehooks.has(i) ? "bg-gray-700 text-gray-400" : "border border-gray-700 text-gray-500 hover:bg-gray-800"}`}
                              >✕</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sticky AI Command Bar */}
              <div ref={bottomBarRef} className="absolute bottom-0 left-0 right-0 p-3 bg-[#111620] border-t border-[rgba(255,255,255,0.05)] rounded-b-[14px] z-10">
                {selectedText && (
                  <div className="mb-2 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
                    <p className="text-[11px] text-[#A78BFA] font-['DM_Sans'] line-clamp-1 border-l-2 border-[#A78BFA] pl-2">
                      <span className="font-bold opacity-70 mr-1">Editing:</span> "{selectedText}"
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { if (historyIndex > 0) { setHistoryIndex(historyIndex - 1); setScript(scriptHistory[historyIndex - 1]); } }}
                          disabled={historyIndex <= 0}
                          className="p-1.5 text-[#8892A4] hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Undo"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
                        </button>
                        <button
                          onClick={() => { if (historyIndex < scriptHistory.length - 1) { setHistoryIndex(historyIndex + 1); setScript(scriptHistory[historyIndex + 1]); } }}
                          disabled={historyIndex >= scriptHistory.length - 1}
                          className="p-1.5 text-[#8892A4] hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Redo"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedText("");
                          pinnedScriptSelectionRef.current = null;
                        }}
                        className="text-[#8892A4] hover:text-white text-[10px]"
                      >
                        ✕ Clear
                      </button>
                    </div>
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
            <button onClick={() => void handlePostGenAction('pacing')} disabled={isProcessing || !script.trim()} className="relative z-[99] pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full border border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/60 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'pacing' ? <><Spinner /> Analyzing...</> : '⚖ Analyze Pacing'}
            </button>
            <button onClick={() => {
              if (!pacingData) { toast("error", "Pacing Required", "Please analyze pacing first so the AI knows what to cut."); return; }
              void handlePostGenAction('shorten');
            }} disabled={isProcessing || !script.trim()} className="relative z-[99] pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full border border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/60 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'shorten' ? <><Spinner /> Shortening...</> : '✂️ Shorten Script'}
            </button>
            <button onClick={() => void handlePostGenAction('improve')} disabled={isProcessing || !script.trim()} className="relative z-[99] pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 hover:border-emerald-500/60 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'improve' ? <><Spinner /> Improving...</> : pacingData ? '✦ Fix Pacing Issues' : '✦ Improve Script'}
            </button>
            <button onClick={() => {
              setActiveAction('sharpen-hook');
              const getStoredKey = (k: string) => {
                const v = localStorage.getItem(k);
                return v && v !== "undefined" && v !== "null" ? v.trim() : "";
              };
              const geminiApiKey = getStoredKey("geminiApiKey");

              fetch("/api/sharpen-hook", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ script, geminiApiKey: geminiApiKey || undefined })
              })
                .then(r => r.json())
                .then(d => {
                  if (d.error) throw new Error(d.error);
                  if (!d || !d.updatedScript) throw new Error("Invalid response from AI");
                  updateScriptAndHistory(String(d.updatedScript).trim());
                  setImprovementLog(p => ["Hook sharpened with viral framework", ...p]);
                  toast("success", "Hook Sharpened", "Viral hook applied.");
                })
                .catch(e => toast("error", "Failed", e.message))
                .finally(() => setActiveAction(null));
            }} disabled={isProcessing || !script.trim()} className="relative z-[99] pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full border border-sky-500/30 text-sky-400 bg-sky-500/5 hover:bg-sky-500/15 hover:border-sky-500/60 font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'sharpen-hook' ? <><Spinner /> Sharpening...</> : '🎣 Sharpen Hook'}
            </button>
            <button onClick={() => {
              setActiveAction('fix-structure');
              const getStoredKey = (k: string) => {
                const v = localStorage.getItem(k);
                return v && v !== "undefined" && v !== "null" ? v.trim() : "";
              };
              const geminiApiKey = getStoredKey("geminiApiKey");
              fetch("/api/fix-structure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script, geminiApiKey: geminiApiKey || undefined }) })
                .then(r => r.json()).then(d => {
                  if (!d || (!d.updatedScript && !d.result)) throw new Error("Invalid response from AI");
                  updateScriptAndHistory(d.updatedScript || d.result);
                  setImprovementLog(p => ["Story structure improved", ...p]);
                  toast("success", "Structure Improved", "");
                }).catch(e => toast("error", "Failed", e.message)).finally(() => setActiveAction(null));
            }} disabled={isProcessing || !script.trim()} className="relative z-[99] pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full border border-orange-500/30 text-orange-400 bg-orange-500/5 hover:bg-orange-500/15 hover:border-orange-500/60 font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'fix-structure' ? <><Spinner /> Restructuring...</> : '🏗 Fix Structure'}
            </button>
            <button onClick={() => void handlePostGenAction('visuals')} disabled={isProcessing || !script.trim()} className="relative z-[99] pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full border border-purple-500/30 text-purple-400 bg-purple-500/5 hover:bg-purple-500/15 hover:border-purple-500/60 hover:shadow-[0_0_15px_rgba(168,85,247,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'visuals' ? <><Spinner /> Generating...</> : '◎ Generate Visual Cues'}
            </button>
            <button onClick={() => void handlePostGenAction('prompts')} disabled={isProcessing || !script.trim()} className="relative z-[99] pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full border border-cyan-500/30 text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/15 hover:border-cyan-500/60 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'prompts' ? <><Spinner /> Generating...</> : 'Image/Video Prompts List'}
            </button>
            <button onClick={() => void handlePostGenAction('caption')} disabled={isProcessing || !script.trim()} className="relative z-[99] pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full border border-amber-500/30 text-amber-400 bg-amber-500/5 hover:bg-amber-500/15 hover:border-amber-500/60 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] font-['DM_Sans'] text-[11px] font-[500] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'caption' ? <><Spinner /> Generating Caption...</> : '📝 Generate Caption'}
            </button>
            <button onClick={() => void handlePostGenAction('brainstorm')} disabled={isProcessing || !script.trim()} className="relative z-[99] pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full border border-violet-400/40 text-violet-300 bg-violet-500/5 hover:bg-violet-500/15 hover:border-violet-400/70 hover:shadow-[0_0_15px_rgba(167,139,250,0.2)] font-['DM_Sans'] text-[11px] font-[700] cursor-pointer transition-all disabled:opacity-50">
              {activeAction === 'brainstorm' ? <><Spinner /> Brainstorming...</> : '✦ Suggest 1% Improvement'}
            </button>
          </div>

          {/* Pacing Analysis Panel */}
          {pacingData && (
            <div className="mt-[14px] p-[16px] glass-surface rounded-[12px] border border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-['Syne'] font-[700] text-[12px] text-red-400 uppercase tracking-[0.1em]">⚖ Pacing Analysis</h3>
                  <p className="text-[9px] text-white/35 font-['DM_Sans'] mt-0.5">Line numbers = spoken lines only (blank lines, [SECTION] labels, and recap/meta lines are excluded).</p>
                </div>
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
            <div className="mt-[14px] glass-surface rounded-[12px] border border-[rgba(59,255,200,0.15)] bg-gradient-to-r from-[rgba(59,255,200,0.03)] to-[rgba(167,139,250,0.03)]">
              {/* Panel header + tabs */}
              <div className="flex items-center justify-between px-[16px] pt-[14px] pb-0">
                <h3 className="font-['Syne'] font-[700] text-[12px] text-[#3BFFC8] uppercase tracking-[0.1em]">Quality Panel</h3>
                <div className="flex gap-[2px] bg-white/[0.04] rounded-lg p-[3px]">
                  {(["viral", "locks", "checks"] as QualityTab[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setQualityTab(t)}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold font-['Syne'] uppercase tracking-wide transition-all cursor-pointer ${qualityTab === t ? "bg-[#3BFFC8]/20 text-[#3BFFC8] border border-[#3BFFC8]/30" : "text-white/40 hover:text-white/70"}`}
                    >
                      {t === "viral" ? "Viral Score" : t === "locks" ? "Story Locks" : "Quick Checks"}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Viral Score tab ── */}
              {qualityTab === "viral" && (
                <div className="p-[16px]">
                  {!viralScore && !isScoringViral && (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <p className="text-[12px] text-[#8892A4] font-['DM_Sans'] max-w-[320px]">Score your script against the 9 Attributes framework — predicts share potential (Bucket 1) and watch time (Bucket 2).</p>
                      <button
                        onClick={() => void handleRunViralScore()}
                        disabled={!script.trim()}
                        className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#3BFFC8]/15 border border-[#3BFFC8]/40 text-[#3BFFC8] text-[11px] font-bold hover:bg-[#3BFFC8]/25 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        ⚡ Run Viral Score
                      </button>
                      {viralScoreError && <p className="text-[11px] text-red-400">{viralScoreError}</p>}
                    </div>
                  )}

                  {isScoringViral && (
                    <div className="flex items-center gap-3 py-8 justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-[#3BFFC8] border-opacity-50" />
                      <span className="text-[12px] text-[#8892A4] font-['DM_Sans']">Scoring against 9 Attributes…</span>
                    </div>
                  )}

                  {viralScore && !isScoringViral && (() => {
                    const isStale = viralScoreScriptHash !== simpleHash(script);
                    const tierColors: Record<string, string> = { Low: "text-red-400", Medium: "text-amber-400", High: "text-emerald-400", Outlier: "text-[#3BFFC8]" };
                    const tierBg: Record<string, string> = { Low: "bg-red-500/10 border-red-500/30", Medium: "bg-amber-500/10 border-amber-500/30", High: "bg-emerald-500/10 border-emerald-500/30", Outlier: "bg-[#3BFFC8]/10 border-[#3BFFC8]/30" };
                    const scoreBar = (score: number) => (
                      <div className="w-full bg-white/5 rounded-full h-1 mt-1">
                        <div className={`h-1 rounded-full transition-all ${score >= 80 ? "bg-[#3BFFC8]" : score >= 60 ? "bg-emerald-400" : score >= 40 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${score}%` }} />
                      </div>
                    );
                    const attrCard = (name: string, a: AttributeScore) => (
                      <div key={name} className="p-[10px] bg-white/[0.03] rounded-xl border border-white/[0.06]">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold font-['Syne'] text-white/70 uppercase tracking-wide">{name}</span>
                          <span className={`text-[11px] font-bold font-['JetBrains_Mono'] ${a.score >= 60 ? "text-emerald-400" : "text-red-400"}`}>{a.score}</span>
                        </div>
                        {scoreBar(a.score)}
                        <p className="text-[10.5px] text-[#8892A4] font-['DM_Sans'] mt-1.5 leading-relaxed">{a.reason}</p>
                        {a.score < 60 && a.fix && (
                          <div className="mt-2 flex items-start gap-2">
                            <p className="text-[10px] text-amber-300/80 italic flex-1">{a.fix}</p>
                            <button
                              onClick={() => void applyImprovement({ title: `Fix ${name}`, suggestion: a.fix, impact: "High" })}
                              disabled={!!activeAction}
                              className="shrink-0 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-bold hover:bg-amber-500/25 transition-colors cursor-pointer disabled:opacity-50"
                            >Apply</button>
                          </div>
                        )}
                      </div>
                    );
                    return (
                      <div>
                        {isStale && (
                          <div className="mb-3 flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <span className="text-[10px] text-amber-400">⚠ Script changed — rescore for fresh results</span>
                            <button onClick={() => void handleRunViralScore()} className="ml-auto text-[10px] text-amber-300 underline cursor-pointer">Rescore</button>
                          </div>
                        )}
                        {/* Total score ring */}
                        <div className={`flex items-center gap-4 p-[12px] rounded-xl border mb-4 ${tierBg[viralScore.predictedViralTier]}`}>
                          <div className="text-center shrink-0">
                            <div className={`text-[28px] font-black font-['JetBrains_Mono'] leading-none ${tierColors[viralScore.predictedViralTier]}`}>{Math.round(viralScore.totalScore)}</div>
                            <div className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">/ 100</div>
                          </div>
                          <div className="flex-1">
                            <div className={`text-[11px] font-bold font-['Syne'] ${tierColors[viralScore.predictedViralTier]}`}>{viralScore.predictedViralTier} Viral Potential</div>
                            <div className="flex gap-3 mt-1.5 text-[10px] text-[#8892A4]">
                              <span>Shares: <strong className="text-white">{Math.round(viralScore.shareScore)}</strong></span>
                              <span>AVD: <strong className="text-white">{Math.round(viralScore.avdScore)}</strong></span>
                            </div>
                          </div>
                          <button onClick={() => void handleRunViralScore()} className="shrink-0 text-[10px] text-white/40 hover:text-white/70 underline cursor-pointer">Rescore</button>
                        </div>
                        {/* Two buckets */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2">Bucket 1 — Getting Shares</p>
                            <div className="space-y-2">
                              {attrCard("TAM", viralScore.buckets.attention.tam)}
                              {attrCard("Explosivity", viralScore.buckets.attention.explosivity)}
                              {attrCard("Emotional Magnitude", viralScore.buckets.attention.emotionalMagnitude)}
                              {attrCard("Novelty", viralScore.buckets.attention.novelty)}
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2">Bucket 2 — Holding Attention</p>
                            <div className="space-y-2">
                              {attrCard("Speed to Value", viralScore.buckets.retention.speedToValue)}
                              {attrCard("Curiosity", viralScore.buckets.retention.curiosity)}
                              {attrCard("Absorption", viralScore.buckets.retention.absorption)}
                              {attrCard("Rehook Rate", viralScore.buckets.retention.rehookRate)}
                              {attrCard("Stickiness", viralScore.buckets.retention.stickiness)}
                            </div>
                          </div>
                        </div>
                        {/* Top fixes */}
                        {viralScore.topFixes?.length > 0 && (
                          <div className="mt-4 p-[10px] bg-amber-500/5 border border-amber-500/20 rounded-xl">
                            <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-2">Top 3 Fixes</p>
                            <div className="space-y-1.5">
                              {viralScore.topFixes.map((fix, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="shrink-0 text-[9px] font-bold text-amber-400/60 mt-0.5">{i + 1}.</span>
                                  <p className="text-[10.5px] text-[#8892A4] font-['DM_Sans']">{fix}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── Story Locks tab ── */}
              {qualityTab === "locks" && (
                <div className="p-[16px]">
                  {!storyLocks && !isAnalyzingLocks && (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <p className="text-[12px] text-[#8892A4] font-['DM_Sans'] max-w-[320px]">Analyze your script for the 6 Story Locks — psychological techniques that make content psychologically addictive.</p>
                      <button
                        onClick={() => void handleRunStoryLocks()}
                        disabled={!script.trim()}
                        className="flex items-center gap-2 px-5 py-2 rounded-full bg-violet-500/15 border border-violet-400/40 text-violet-300 text-[11px] font-bold hover:bg-violet-500/25 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        🔒 Analyze Story Locks
                      </button>
                      {storyLocksError && <p className="text-[11px] text-red-400">{storyLocksError}</p>}
                    </div>
                  )}

                  {isAnalyzingLocks && (
                    <div className="flex items-center gap-3 py-8 justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-violet-400 border-opacity-50" />
                      <span className="text-[12px] text-[#8892A4] font-['DM_Sans']">Analyzing story locks…</span>
                    </div>
                  )}

                  {storyLocks && !isAnalyzingLocks && (
                    <div>
                      {/* Overall score + rescore */}
                      <div className="flex items-center justify-between mb-4 p-[10px] rounded-xl bg-violet-500/10 border border-violet-400/20">
                        <div className="flex items-center gap-3">
                          <span className="text-[24px] font-black font-['JetBrains_Mono'] text-violet-300">{storyLocks.locks.filter(l => l.present).length}<span className="text-[14px] text-violet-400/60"> / 6</span></span>
                          <div>
                            <div className="text-[11px] font-bold font-['Syne'] text-violet-300">Story Locks Active</div>
                            <div className="text-[10px] text-white/40">Overall quality: {Math.round(storyLocks.overallLockScore)} / 100</div>
                          </div>
                        </div>
                        <button onClick={() => void handleRunStoryLocks()} className="text-[10px] text-white/40 hover:text-white/70 underline cursor-pointer">Re-analyze</button>
                      </div>
                      {/* Lock rows */}
                      <div className="space-y-2">
                        {storyLocks.locks.map(lock => {
                          const isOpen = expandedLock === lock.id;
                          const lockIcon: Record<string, string> = { term_branding: "🏷", embedded_truths: "💎", thought_narration: "💬", negative_frames: "⚠️", loop_openers: "🔄", contrast_words: "⚡" };
                          return (
                            <div key={lock.id} className={`rounded-xl border transition-all ${lock.present ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-red-500/20 bg-red-500/[0.03]"}`}>
                              <button
                                onClick={() => setExpandedLock(isOpen ? null : lock.id)}
                                className="w-full flex items-center gap-3 px-[12px] py-[10px] text-left cursor-pointer"
                              >
                                <span className="text-[14px] shrink-0">{lockIcon[lock.id]}</span>
                                <span className="flex-1 text-[11.5px] font-bold font-['Syne'] text-white">{lock.label}</span>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${lock.present ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                                  {lock.present ? "✓ Active" : "✗ Missing"}
                                </span>
                                <span className="text-[10px] font-['JetBrains_Mono'] text-white/40 ml-1">{lock.quality}</span>
                                <span className="text-[10px] text-white/30 ml-1">{isOpen ? "▲" : "▼"}</span>
                              </button>
                              {/* Score bar */}
                              <div className="px-[12px] pb-[6px]">
                                <div className="w-full bg-white/5 rounded-full h-0.5">
                                  <div className={`h-0.5 rounded-full ${lock.present ? "bg-emerald-400" : "bg-red-400"}`} style={{ width: `${lock.quality}%` }} />
                                </div>
                              </div>
                              {/* Expanded detail */}
                              {isOpen && (
                                <div className="px-[12px] pb-[12px] space-y-2">
                                  {lock.evidence.length > 0 && (
                                    <div>
                                      <p className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Evidence in script</p>
                                      {lock.evidence.map((e, i) => (
                                        <p key={i} className="text-[10.5px] text-emerald-300/70 italic font-['DM_Sans'] border-l border-emerald-500/30 pl-2 mb-1">"{e}"</p>
                                      ))}
                                    </div>
                                  )}
                                  {lock.missingIn.length > 0 && (
                                    <div>
                                      <p className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Missing in</p>
                                      {lock.missingIn.map((m, i) => (
                                        <p key={i} className="text-[10.5px] text-amber-300/70 font-['DM_Sans']">• {m}</p>
                                      ))}
                                    </div>
                                  )}
                                  {lock.fixLine && (
                                    <div className="flex items-start gap-2 mt-1 p-2 bg-violet-500/10 rounded-lg border border-violet-400/20">
                                      <p className="text-[10.5px] text-violet-300 italic flex-1 font-['DM_Sans']">{lock.fixLine}</p>
                                      <button
                                        onClick={() => void applyImprovement({ title: `Add ${lock.label}`, suggestion: lock.fixLine, impact: "High" })}
                                        disabled={!!activeAction}
                                        className="shrink-0 px-2 py-0.5 rounded bg-violet-500/20 border border-violet-400/30 text-violet-300 text-[9px] font-bold hover:bg-violet-500/30 transition-colors cursor-pointer disabled:opacity-50"
                                      >Insert</button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Quick Checks tab ── */}
              {qualityTab === "checks" && (
                <div className="p-[16px]">
                  <p className="text-[11px] text-[#8892A4] font-['DM_Sans'] mb-[14px]">Manual checklist — tick each box as you review the script.</p>
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
          <div className="mt-4 bg-white/5 border border-white/10 backdrop-blur-md rounded-xl p-6 max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-[rgba(255,255,255,0.1)] scrollbar-track-transparent flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3 shrink-0">
              <h3 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">📝 Caption</h3>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { if (generatedCaption) { void navigator.clipboard.writeText(generatedCaption); toast("success", "Copied", "Caption copied"); } }} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg text-white/50 hover:text-white transition-all text-sm" title="Copy caption">⎘</button>
                <button onClick={() => setGeneratedCaption(null)} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-lg text-white/30 hover:text-red-400 transition-all text-xs" title="Dismiss">✕</button>
              </div>
            </div>
            <p className="text-white/90 whitespace-pre-wrap text-[13.5px] leading-relaxed font-['DM_Sans'] pr-1">{generatedCaption}</p>
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
              <button
                onClick={() => setShowRecyclingQueue(true)}
                className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20 bg-amber-500/10 px-2 py-1 rounded-lg hover:bg-amber-500/20 transition-colors"
              >
                ♻️ Recycling Queue
              </button>
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

      <RecyclingQueueModal
        isOpen={showRecyclingQueue}
        onClose={() => setShowRecyclingQueue(false)}
      />
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
