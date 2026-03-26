import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { AIAnalysis, AnalyzeRequestBody, AnalyzeResponse, DeepAnalysis } from "../../../lib/types";
import { calculateOutlierScore } from "../../../lib/utils";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const TRANSCRIPTION_PROMPT =
  "You are an expert transcriber. Watch this video and transcribe the exact spoken words. You MUST return the output strictly in standard .SRT format with sequential numbers, timestamps (00:00:00,000 --> 00:00:00,000), and the text on a third line per block. Example:\n1\n00:00:00,000 --> 00:00:03,500\nHello, welcome to this video.\n\n2\n00:00:03,500 --> 00:00:07,000\nToday we are covering an important topic.";
const TRANSCRIPTION_MODEL = "gemini-3-flash-preview";
const MAX_TRANSCRIPT_CHARS = 12000;

/** Strip SRT timestamps/numbers to get plain spoken text for LLM analysis */
function srtToPlainText(srt: string): string {
  return srt
    .split(/\r?\n/)
    .filter((line) => {
      if (!line.trim()) return false;
      if (/^\d+$/.test(line.trim())) return false; // sequence numbers
      // Standard SRT timeline
      if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/.test(line.trim())) return false;
      return true;
    })
    .map((line) => line.replace(/\[?\d{1,4}:\d{2}(:\d{2})?([.,]\d{1,4})?\]?/g, "").trim()) // aggressively strip lingering inline timestamps
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type UnknownRecord = Record<string, unknown>;
type ActionOutputType = "remix_ideas" | "director_prompt";
type TranscriptSource = "post.videoUrl.gemini" | "post.transcript" | "post.text" | "post.caption";
type Provider = "Gemini" | "OpenAI" | "Anthropic";
type SourceType = "gemini" | "openai" | "anthropic";

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

function toPositiveFiniteNumber(value: unknown): number | null {
  const normalized = toFiniteNumber(value);
  return normalized !== null && normalized > 0 ? normalized : null;
}

function calculateAverageViews(totalViews: unknown, totalVideos: unknown): number | null {
  const normalizedTotalViews = toPositiveFiniteNumber(totalViews);
  const normalizedTotalVideos = toPositiveFiniteNumber(totalVideos);

  if (normalizedTotalViews === null || normalizedTotalVideos === null) {
    return null;
  }

  return Math.floor(normalizedTotalViews / normalizedTotalVideos);
}

function getTranscriptInput(post: AnalyzeRequestBody["post"] & { text?: string }): {
  transcript: string;
  source: TranscriptSource | null;
} {
  const fromTranscript = toStringSafe((post as { transcript?: unknown }).transcript).trim();
  if (fromTranscript) {
    return { transcript: fromTranscript, source: "post.transcript" };
  }

  const fromText = toStringSafe((post as { text?: unknown }).text).trim();
  if (fromText) {
    return { transcript: fromText, source: "post.text" };
  }

  const fromCaption = toStringSafe(post.caption).trim();
  if (fromCaption) {
    return { transcript: fromCaption, source: "post.caption" };
  }

  return { transcript: "", source: null };
}

function fallbackAnalysis(transcript: string, views: number | null, likes: number | null): AIAnalysis {
  const firstLine = transcript.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "Strong opening promise.";

  return {
    hookAnalysis: {
      type: /\?/.test(firstLine) ? "Question Hook" : "Problem Hook",
      description: firstLine,
      frameworks: ["PAS", "AIDA"],
      justification: "The opening provides immediate context and a clear reason to keep watching.",
    },
    structureAnalysis: {
      type: "Problem Solver",
      description: "The transcript should move quickly from an opening claim into practical value and a direct CTA.",
      bestFor: "Short-form Nutrition and Lifestyle coaching content",
      justification: "This structure improves watch-through and conversion intent for coaching reels.",
    },
    styleAnalysis: {
      tone: "Direct",
      voice: "Conversational",
      wordChoice: "Simple and concrete",
      pacing: "Fast",
    },
    breakdownBlocks: {
      hook: firstLine,
      cta: "End with one explicit ask (save, comment, or follow).",
      targetAudienceAndTone: "Busy viewers seeking practical Nutrition and Lifestyle coaching guidance.",
      problemAndSolution: transcript || "Transcript unavailable.",
      audioAndAtmosphere: "Not analyzed in lightweight mode.",
      keyTakeaways: [
        "Use one clear promise in the first sentence.",
        "Sequence ideas from problem to payoff.",
        "Close with a measurable CTA.",
      ],
    },
    summary: {
      coreIdea: `Transcript-led outlier potential with ${views ?? 0} views and ${likes ?? 0} likes.`,
      outlierPotential: "Moderate to high if the opening and CTA are tightened.",
      actionableImprovements: [
        "Reduce opening to under 12 words.",
        "Add one concrete proof point.",
        "Align CTA with post objective.",
      ],
    },
  };
}

function sanitizeAnalysis(payload: unknown, transcript: string, views: number | null, likes: number | null): AIAnalysis {
  if (!payload || typeof payload !== "object") {
    return fallbackAnalysis(transcript, views, likes);
  }

  const base = fallbackAnalysis(transcript, views, likes);
  const obj = payload as UnknownRecord;
  const hook = (obj.hookAnalysis ?? {}) as UnknownRecord;
  const structure = (obj.structureAnalysis ?? {}) as UnknownRecord;
  const style = (obj.styleAnalysis ?? {}) as UnknownRecord;

  return {
    ...base,
    hookAnalysis: {
      type: toStringSafe(hook.type, base.hookAnalysis.type),
      description: toStringSafe(hook.description, base.hookAnalysis.description),
      frameworks: toStringArray(hook.frameworks).length > 0 ? toStringArray(hook.frameworks) : base.hookAnalysis.frameworks,
      justification: toStringSafe(hook.justification, base.hookAnalysis.justification),
    },
    structureAnalysis: {
      type: toStringSafe(structure.type, base.structureAnalysis.type),
      description: toStringSafe(structure.description, base.structureAnalysis.description),
      bestFor: toStringSafe(structure.bestFor, base.structureAnalysis.bestFor),
      justification: toStringSafe(structure.justification, base.structureAnalysis.justification),
    },
    styleAnalysis: {
      tone: toStringSafe(style.tone, base.styleAnalysis.tone),
      voice: toStringSafe(style.voice, base.styleAnalysis.voice),
      wordChoice: toStringSafe(style.wordChoice, base.styleAnalysis.wordChoice),
      pacing: toStringSafe(style.pacing, base.styleAnalysis.pacing),
    },
  };
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const exactFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (exactFence?.[1]) {
    return exactFence[1].trim();
  }

  const firstFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (firstFence?.[1]) {
    return firstFence[1].trim();
  }

  return trimmed;
}

function parseJsonResponse(text: string): UnknownRecord {
  const cleaned = stripMarkdownFences(text);

  try {
    return JSON.parse(cleaned) as UnknownRecord;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const extracted = cleaned.slice(firstBrace, lastBrace + 1);
      return JSON.parse(extracted) as UnknownRecord;
    }

    const preview = cleaned.slice(0, 280);
    throw new Error(`Failed to parse model JSON response. Preview: ${preview}`);
  }
}

function parseTextResponse(text: string): string {
  return stripMarkdownFences(text).replace(/^```[\w-]*\s*/i, "").replace(/```$/i, "").trim();
}

function getVideoUrl(post: AnalyzeRequestBody["post"] & { videoUrl?: unknown; video_url?: unknown; video?: unknown }): string {
  const direct = toStringSafe((post as UnknownRecord).videoUrl).trim();
  if (direct) return direct;

  const snake = toStringSafe((post as UnknownRecord).video_url).trim();
  if (snake) return snake;

  const generic = toStringSafe((post as UnknownRecord).video).trim();
  if (generic) return generic;

  return "";
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function normalizeProvider(value: string): Provider {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("openai") || normalized.includes("gpt")) return "OpenAI";
  if (normalized.includes("anthropic") || normalized.includes("claude")) return "Anthropic";
  return "Gemini";
}

function mapGeminiModel(modelSelection: string): string {
  const normalized = modelSelection.toLowerCase().trim();
  if (!normalized) return "gemini-3-flash-preview";
  if (normalized.startsWith("gemini-")) return normalized;
  if (normalized.includes("2.5") && normalized.includes("pro")) return "gemini-2.5-pro";
  if (normalized.includes("1.5") && normalized.includes("pro")) return "gemini-3-flash-preview";
  if (normalized.includes("pro")) return "gemini-2.5-pro";
  return "gemini-3-flash-preview";
}

function mapOpenAIModel(modelSelection: string): string {
  const normalized = modelSelection.toLowerCase().trim();
  if (!normalized) return "gpt-5-mini-2025-08-07";
  if (normalized.startsWith("gpt-")) return normalized;
  if (normalized.includes("4.1")) return "gpt-4.1";
  if (normalized.includes("4o-mini")) return "gpt-4o-mini";
  return "gpt-5-mini-2025-08-07";
}

function mapAnthropicModel(modelSelection: string): string {
  const normalized = modelSelection.toLowerCase().trim();
  if (!normalized) return "claude-4.5-haiku";
  if (normalized.startsWith("claude-")) return normalized;
  if (normalized.includes("3.7") && normalized.includes("sonnet")) return "claude-3-7-sonnet-latest";
  if (normalized.includes("haiku")) return "claude-3-5-haiku-latest";
  return "claude-4.5-haiku";
}

function extractAnthropicText(response: unknown): string {
  if (!response || typeof response !== "object" || !("content" in response)) {
    return "";
  }

  const content = (response as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((block): block is { type: string; text?: string } => {
      return Boolean(block && typeof block === "object" && "type" in block && (block as { type?: unknown }).type === "text");
    })
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

function normalizeUniversalAnalysisShape(payload: UnknownRecord, transcriptText: string): UnknownRecord {
  if (payload.hookAnalysis || payload.structureAnalysis || payload.styleAnalysis) {
    return payload;
  }

  // Handle new 11-attribute schema
  if (payload.narrative || payload.hooks || payload.architecture || payload.conversion) {
    const narrative = (payload.narrative ?? {}) as UnknownRecord;
    const hooks = (payload.hooks ?? {}) as UnknownRecord;
    const architecture = (payload.architecture ?? {}) as UnknownRecord;
    const conversion = (payload.conversion ?? {}) as UnknownRecord;
    return {
      ...payload,
      hookAnalysis: {
        type: toStringSafe(hooks.hookType, "Problem Hook"),
        description: toStringSafe(hooks.spokenHook, transcriptText),
        visual_hook: toStringSafe(hooks.visualHook, ""),
        frameworks: [],
        justification: toStringSafe(hooks.spokenHook, "Generated from transcript."),
        formula: toStringSafe(hooks.formula, ""),
      },
      structureAnalysis: {
        type: toStringSafe(narrative.storyStructure, "Problem Solver"),
        description: toStringSafe(narrative.substance, "Starts with a hook, delivers value quickly, and ends with a clear CTA."),
        bestFor: toStringSafe(narrative.topic, "Short-form videos"),
        justification: toStringSafe(narrative.seed, "Generated from transcript."),
      },
      styleAnalysis: {
        tone: "Direct",
        voice: "Conversational",
        wordChoice: toStringSafe(architecture.visualElements, "Simple and concrete"),
        pacing: "Fast",
      },
      breakdownBlocks: {
        hook: toStringSafe(hooks.spokenHook, ""),
        cta: toStringSafe(conversion.cta, ""),
        targetAudienceAndTone: toStringSafe(narrative.topic, ""),
        problemAndSolution: transcriptText,
        audioAndAtmosphere: toStringSafe(architecture.visualElements, ""),
        keyTakeaways: [toStringSafe(narrative.seed, ""), toStringSafe(narrative.substance, "")].filter(Boolean),
      },
    };
  }

  const hookObj = (payload.hook ?? {}) as UnknownRecord;
  const styleObj = (payload.style ?? {}) as UnknownRecord;
  const structureObj = (payload.structure ?? {}) as UnknownRecord;

  const hookType = toStringSafe(hookObj.text_hook_type, toStringSafe(hookObj.type, "Problem Hook"));
  const hookDescription = toStringSafe(
    hookObj.text_hook_description,
    toStringSafe(hookObj.description, toStringSafe(payload.description, transcriptText)),
  );
  const visualHook = toStringSafe(hookObj.visual_hook, "");
  const frameworks = Array.isArray(hookObj.frameworks) ? hookObj.frameworks.map(String) : [];
  const styleType = toStringSafe(styleObj.type, "Conversational");
  const styleDescription = toStringSafe(styleObj.description, "Direct and clear delivery.");
  const structureType = toStringSafe(structureObj.type, "Problem Solver");
  const structureDescription = toStringSafe(
    structureObj.description,
    "Starts with a hook, delivers value quickly, and ends with a clear CTA.",
  );

  return {
    hookAnalysis: {
      type: hookType,
      description: hookDescription,
      visual_hook: visualHook,
      frameworks,
      justification: hookDescription || "Generated from transcript.",
      formula: toStringSafe(hookObj.formula, ""),
    },
    structureAnalysis: {
      type: structureType,
      description: structureDescription,
      bestFor: "Short-form videos",
      justification: structureDescription || "Generated from transcript.",
    },
    styleAnalysis: {
      tone: styleType || "Direct",
      voice: styleDescription || "Conversational",
      wordChoice: "Simple and concrete",
      pacing: "Fast",
    },
  };
}

async function downloadVideoAsBase64(videoUrl: string): Promise<string> {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Video fetch failed with status ${response.status}`);
  }

  const videoBuffer = await response.arrayBuffer();
  if (videoBuffer.byteLength === 0) {
    throw new Error("Downloaded video buffer is empty");
  }

  return Buffer.from(videoBuffer).toString("base64");
}

async function extractFirstFrameAsBase64(videoUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = [];
    ffmpeg(videoUrl)
      .seekInput("00:00:01.000") // Extract at 1-second mark to avoid blank starting frames
      .outputOptions(["-vframes 1", "-f image2pipe", "-vcodec png"])
      .on("error", (err) => {
        console.warn("FFMPEG extraction failed:", err);
        resolve(null);
      })
      .pipe()
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => {
        if (chunks.length === 0) {
          resolve(null);
        } else {
          const buffer = Buffer.concat(chunks);
          resolve(`data:image/png;base64,${buffer.toString("base64")}`);
        }
      });
  });
}

async function transcribeVideoWithGemini(
  transcriptionApiKey: string,
  base64Video: string,
  mimeType = "video/mp4",
): Promise<string> {
  const transcriptionClient = new GoogleGenerativeAI(transcriptionApiKey);
  const transcriptionModel = transcriptionClient.getGenerativeModel({
    model: TRANSCRIPTION_MODEL,
  });

  const result = await transcriptionModel.generateContent([
    { text: TRANSCRIPTION_PROMPT },
    { inlineData: { data: base64Video, mimeType } },
  ]);

  return parseTextResponse(result.response.text() || "");
}

function buildActionPrompt(
  actionType: ActionOutputType,
  prompt: string,
  transcript: string,
  hook: string,
  structure: string,
): string {
  const actionHeader =
    actionType === "director_prompt"
      ? "You are an expert director prompt engineer for AI video tools."
      : "You are an expert social media strategist for a Nutrition and Lifestyle coach.";

  return [
    actionHeader,
    prompt,
    "Return plain text only. No markdown fences.",
    `Transcript:\n${transcript || "N/A"}`,
    `Hook:\n${hook || "N/A"}`,
    `Structure:\n${structure || "N/A"}`,
  ].join("\n\n");
}

function buildUniversalSystemPrompt(transcriptText: string): string {
  return (
    `You are an elite viral content strategist and behavioral psychologist. Analyze this transcript and return a STRICT JSON object with EXACTLY this structure and nothing else. Do not add extra keys, markdown fences, or commentary.

` +
    `{
` +
    `  "hooks": {
    "spokenHook": "The exact first words spoken in the video.",
    "visualHook": "What grabs the eye in the first 3 seconds.",
    "textHook": "The on-screen text used to stop the scroll.",
    "hookType": "STRICT HOOK CATEGORIZATION: For the 'hookType' field, you are FORBIDDEN from using generic terms like \\"Curiosity\\", \\"Statement\\", or \\"Question\\". You MUST categorize the spoken hook using ONLY one of the following exact 10 strings: [\\"Secret Reveal\\", \\"Contrarian\\", \\"Problem Hook\\", \\"Question Hook\\", \\"Case Study\\", \\"Education Hook\\", \\"List Hook\\", \\"Comparison Hook\\", \\"Personal Experience\\", \\"The Viral Stack\\"] If it does not perfectly fit one, pick the closest match from this exact list. Do not invent new categories.",
    "formula": "CRITICAL: Extract the core psychological template of the spoken hook as a SHORT, PUNCHY fill-in-the-blank formula. Do NOT explain the hook. Return ONLY the template. Use bracketed placeholders like [Insert Noun], [Timeframe], or [Result]. PERFECT EXAMPLES: 'Here\\'s exactly how much [Item] you need to [Result].' | 'It took me [Timeframe] to learn this, but I\\'ll teach it to you in 60 seconds.' | 'Day [Number] of turning from [Before State] to [After State].' | 'Stop trying to [Action]. Start trying to [Better Action].' | '[Subject] is not [Common Belief], it is [Surprising Truth].'"
  },

  "narrative": {
    "topic": "The core subject matter (1-3 words).",
    "seed": "A 1-sentence summary of the core video concept.",
    "substance": "A brief summary of what is actually discussed.",
    "storyStructure": "STRICT NARRATIVE CATEGORIZATION: For the 'storyStructure' field, you are FORBIDDEN from using generic terms like \"Linear\", \"Educational\", or \"Vlog\". You MUST categorize the story structure using ONLY one of the following exact 10 strings: [\"Problem/Solution\", \"The Pivot\", \"Case Study\", \"Listicle\", \"Vulnerability-Led\", \"Myth-Buster\", \"Direct-to-Camera\", \"B-Roll Only\", \"Tutorial Step-by-Step\", \"The Transformation Loop\"] If it does not perfectly fit one, pick the closest match from this exact list. Do not invent new categories.",
    "uniqueAngle": "What is the specific, unique perspective or framing the creator uses to introduce this topic? (e.g., 'Open with a dramatic confrontation to introduce a lesson...')",
    "commonBelief": "What widespread myth, assumption, or common belief is this video explicitly or implicitly challenging?",
    "supportingEvidence": [
      "Provide 2-3 bullet points of specific evidence, visual proof, or logical arguments the creator uses in the video to back up their unique angle."
    ]
  },

  "architecture": {
    "visualLayout": "How the screen is arranged (e.g., split-screen, green screen, dynamic zoom, talking head).",
    "visualElements": "Specific video and audio elements used (e.g., sound effects, pop-up text, B-roll, captions).",
    "keyVisuals": "Specific icons, props, or recurring visual symbols shown on screen.",
    "audio": "The vibe of the background music or specific SFX (e.g., Chill Lo-fi, Ding sound, Orchestral build)."
  },

  "conversion": {
    "cta": "The exact Call to Action at the end of the video."
  }
}

STRICT INSTRUCTION FOR CATEGORIZATION:
1. hookType MUST be one of the 7 specified.
2. storyStructure MUST be one of the 7 specified. If it doesn't fit perfectly, choose the mathematically closest match based on the video's flow.

STRICT INSTRUCTION FOR HOOKS:
You will be provided with a text transcript of a short-form video. Audio transcripts inherently lack visual descriptions.
UNDER NO CIRCUMSTANCES are you allowed to output "Not specified in transcript", "N/A", "Not available", or any similar placeholder for the visualHook or textHook fields.
Instead, you MUST use your expertise as a viral video strategist to INFER and RECONSTRUCT the most highly probable visualHook (actions, B-roll footage, camera movement) and textHook (on-screen pop-up text) that would perfectly accompany the spoken words to maximize viewer retention. Base your inference on the topic, tone, and spoken hook of the transcript.

Transcript:
` + transcriptText
  );
}

function extractDeepAnalysis(payload: UnknownRecord): DeepAnalysis | null {
  const narrative = (payload.narrative ?? {}) as UnknownRecord;
  const hooks = (payload.hooks ?? {}) as UnknownRecord;
  const architecture = (payload.architecture ?? {}) as UnknownRecord;
  const conversion = (payload.conversion ?? {}) as UnknownRecord;

  if (!narrative.topic && !hooks.spokenHook && !architecture.visualLayout) return null;

  return {
    narrative: {
      topic: toStringSafe(narrative.topic, "Not analyzed"),
      seed: toStringSafe(narrative.seed, "Not analyzed"),
      substance: toStringSafe(narrative.substance, "Not analyzed"),
      storyStructure: toStringSafe(narrative.storyStructure, "Not analyzed"),
      uniqueAngle: toStringSafe(narrative.uniqueAngle, ""),
      commonBelief: toStringSafe(narrative.commonBelief, ""),
      supportingEvidence: Array.isArray(narrative.supportingEvidence) ? narrative.supportingEvidence.map(String) : [],
    },
    hooks: {
      spokenHook: toStringSafe(hooks.spokenHook, "Not analyzed"),
      visualHook: toStringSafe(hooks.visualHook, "Not analyzed"),
      textHook: toStringSafe(hooks.textHook, "Not analyzed"),
      hookType: toStringSafe(hooks.hookType, "Not analyzed"),
      formula: toStringSafe(hooks.formula, "Not analyzed"),
    },
    architecture: {
      visualLayout: toStringSafe(architecture.visualLayout, "Not analyzed"),
      visualElements: toStringSafe(architecture.visualElements, "Not analyzed"),
      keyVisuals: toStringSafe(architecture.keyVisuals, "Not analyzed"),
      audio: toStringSafe(architecture.audio, "Not analyzed"),
    },
    conversion: {
      cta: toStringSafe(conversion.cta, "Not analyzed"),
    },
  };
}

async function generateWithProvider(
  provider: Provider,
  modelSelection: string,
  apiKey: string,
  prompt: string,
  jsonMode: boolean,
): Promise<{ text: string; model: string; source: SourceType }> {
  if (provider === "OpenAI") {
    const selectedModel = mapOpenAIModel(modelSelection);
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: selectedModel,
      ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      messages: [{ role: "user", content: prompt }],
    });

    return {
      text: response.choices[0]?.message?.content?.trim() ?? "",
      model: selectedModel,
      source: "openai",
    };
  }

  if (provider === "Anthropic") {
    const selectedModel = mapAnthropicModel(modelSelection);
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: selectedModel,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: jsonMode ? `${prompt}\n\nEnsure your response is valid JSON.` : prompt,
        },
      ],
    });

    return {
      text: extractAnthropicText(response),
      model: selectedModel,
      source: "anthropic",
    };
  }

  const selectedModel = mapGeminiModel(modelSelection);
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({
    model: selectedModel,
    generationConfig: jsonMode
      ? {
        responseMimeType: "application/json",
      }
      : {},
  });
  const response = await geminiModel.generateContent(prompt);

  return {
    text: response.response.text().trim(),
    model: selectedModel,
    source: "gemini",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnalyzeRequestBody & {
      post?: AnalyzeRequestBody["post"] & { text?: string; videoUrl?: string; video_url?: string; video?: string };
      outputType?: "analysis" | ActionOutputType;
      prompt?: string;
      transcript?: string;
      hook?: string;
      structure?: string;
      provider?: string;
      model?: string;
      apiKey?: string;
      analysisApiKey?: string;
      transcriptionApiKey?: string;
      videoUrl?: string;
      engine?: string;
      geminiApiKey?: string;
      url?: string;
      apifyApiKey?: string;
    };

    // Fetch user settings from database — all AI and Apify keys live here
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userSettings = await prisma.settings.findUnique({ where: { userId: dbUser.id } });

    const userApifyKey = userSettings?.apifyApiKey ?? "";

    const post = body.post ?? {};
    const videoId = toStringSafe((post as any).id, "unknown");

    // ── Platform detection ────────────────────────────────────────
    let platform = (toStringSafe(body.platform).trim().toLowerCase() || "instagram") as "instagram" | "tiktok" | "youtube";
    const ytShortsRegex = /(?:youtube\.com\/shorts\/|youtu\.be\/)([\w-]+)/;

    let incomingUrl =
      toStringSafe(body.url).trim() ||
      toStringSafe(body.videoUrl).trim() ||
      toStringSafe((body.post as UnknownRecord | undefined)?.permalink).trim() ||
      toStringSafe((body.post as UnknownRecord | undefined)?.videoUrl).trim();

    if (incomingUrl.includes("tiktok.com") && platform !== "tiktok") {
      platform = "tiktok";
    } else if ((incomingUrl.includes("youtube.com/shorts") || ytShortsRegex.test(incomingUrl)) && platform !== "youtube") {
      platform = "youtube";
    }

    // Smart YouTube Parsing
    if (platform === "youtube" && incomingUrl && !incomingUrl.startsWith("http")) {
      incomingUrl = `https://www.youtube.com/@${incomingUrl.replace("@", "")}/shorts`;
      console.log("Formatted YouTube Username to URL:", incomingUrl);
    }

    if (platform === "tiktok") {
      return NextResponse.json(
        { error: "TikTok Apify actor not configured yet. Instagram analysis is fully functional." },
        { status: 400 },
      );
    }
    if (platform === "youtube") {
      console.log("YouTube Shorts detected, proceeding with Apify extraction.");
      if (userApifyKey) {
        try {
          const input = {
            "startUrls": [{ "url": incomingUrl }],
            "max_results": 1,
            "scrape_shorts": true
          };
          const apifyUrl = `https://api.apify.com/v2/acts/apify~youtube-scraper/run-sync-get-dataset-items?token=${userApifyKey}`;
          const apifyRes = await fetch(apifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            cache: "no-store",
          });
          if (!apifyRes.ok) {
            const errText = await apifyRes.text();
            throw new Error(`Apify API Error: ${errText}`);
          }
          const items: any[] = await apifyRes.json();

          if (items && items.length > 0) {
            const ytPost = items[0] as any;
            const authorAverageViews =
              calculateAverageViews(ytPost.channelViewCount, ytPost.channelVideoCount) ??
              calculateAverageViews(ytPost.channelViews, ytPost.videoCount) ??
              toPositiveFiniteNumber((body.post as any)?.authorAverageViews);

            body.post = {
              id: ytPost.id || videoId,
              caption: ytPost.title || ytPost.description || "",
              videoUrl: ytPost.url || incomingUrl,
              displayUrl: ytPost.thumbnailUrl || "",
              metrics: {
                views: ytPost.viewCount || 0,
                likes: ytPost.likeCount || 0,
                comments: ytPost.commentCount || 0
              },
              authorAverageViews: authorAverageViews ?? undefined,
              permalink: ytPost.url || incomingUrl,
              mediaType: "SHORTS",
              username: ytPost.channelName || "YouTube User",
            } as any;
          } else {
            console.warn("Apify returned no items for URL:", incomingUrl);
          }
        } catch (ytError: any) {
          console.error("YouTube Scraping Failed:", ytError);
          return NextResponse.json({ error: `YouTube Scraping Failed: ${ytError.message}` }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: "Apify API Key missing" }, { status: 401 });
      }
    }

    const provider = normalizeProvider(toStringSafe(body.provider || body.engine || "Gemini"));
    const modelSelection =
      toStringSafe(body.model).trim() ||
      (provider === "OpenAI" ? "gpt-5-mini-2025-08-07" : provider === "Anthropic" ? "claude-4.5-haiku" : "gemini-3-flash-preview");

    // Select the API key from the database based on the active provider
    let analysisApiKey = "";
    const activeProvider = userSettings?.activeProvider ?? provider;
    if (activeProvider === "OpenAI") {
      analysisApiKey = userSettings?.openaiApiKey ?? "";
    } else if (activeProvider === "Anthropic") {
      analysisApiKey = userSettings?.anthropicApiKey ?? "";
    } else {
      // Default to Gemini
      analysisApiKey = userSettings?.geminiApiKey ?? "";
    }

    // Always use Gemini for transcription regardless of active provider
    const transcriptionApiKey = userSettings?.geminiApiKey ?? "";

    const outputTypeRaw = toStringSafe((body as unknown as UnknownRecord).outputType);
    const outputType: "analysis" | ActionOutputType =
      outputTypeRaw === "director_prompt" || outputTypeRaw === "remix_ideas" ? outputTypeRaw : "analysis";

    if (!analysisApiKey) {
      return NextResponse.json(
        { error: `Missing API key for ${activeProvider}. Please add it in your Settings.` },
        { status: 400 },
      );
    }

    if (outputType !== "analysis") {
      const prompt = toStringSafe(body.prompt).trim();
      if (!prompt) {
        return NextResponse.json({ error: "prompt is required for action generation" }, { status: 400 });
      }

      const result = await generateWithProvider(
        provider,
        modelSelection,
        analysisApiKey,
        buildActionPrompt(
          outputType,
          prompt,
          toStringSafe(body.transcript).trim(),
          toStringSafe(body.hook).trim(),
          toStringSafe(body.structure).trim(),
        ),
        false,
      );

      if (!result.text) {
        throw new Error("Model returned an empty response");
      }

      return NextResponse.json(
        {
          result: parseTextResponse(result.text),
          outputType,
          source: result.source,
          model: result.model,
          generatedAt: new Date().toISOString(),
        },
        { status: 200 },
      );
    }

    if (!transcriptionApiKey) {
      return NextResponse.json({ error: "Gemini API key is required for transcription. Please add it in your Settings." }, { status: 400 });
    }

    const { transcript: transcriptInput, source: transcriptInputSource } = getTranscriptInput(post as any);
    let transcript = transcriptInput;
    let source = transcriptInputSource;
    console.log("1. Pinged API, starting analysis for video ID:", videoId);

    const videoUrl = toStringSafe(body.videoUrl).trim() || getVideoUrl(post);
    let srtTranscript = ""; // raw SRT output from Gemini
    let firstFrameThumbnail = "";

    if (videoUrl && isHttpUrl(videoUrl)) {
      try {
        console.log("1.0.1 Generating thumbnail fallback from videoUrl via FFMPEG...");
        const frameData = await extractFirstFrameAsBase64(videoUrl);
        if (frameData) {
          firstFrameThumbnail = frameData;
          console.log("1.0.2 FFMPEG thumbnail generated successfully.");
        }
      } catch (thumbError) {
        console.warn("1.0.3 Thumbnail generation error (non-fatal):", thumbError);
      }

      try {
        console.log("1.1 Downloading video for Gemini transcription...");
        const base64Video = await downloadVideoAsBase64(videoUrl);
        console.log("1.2 Video downloaded. Starting Gemini transcription...");
        const transcribed = await transcribeVideoWithGemini(transcriptionApiKey, base64Video, "video/mp4");
        if (transcribed) {
          srtTranscript = transcribed; // keep the full SRT
          transcript = srtToPlainText(transcribed) || transcribed; // plain text for Brain LLM
          source = "post.videoUrl.gemini";
        }
      } catch (transcriptionError) {
        console.warn(
          "1.2 Video transcription failed, falling back to text transcript source:",
          transcriptionError instanceof Error ? transcriptionError.message : transcriptionError,
        );
      }
    }

    console.log("1.3 Using transcript input source:", source ?? "none");

    if (!transcript) {
      return NextResponse.json({ error: "post.transcript, post.text, or post.caption is required" }, { status: 400 });
    }

    const transcriptForModel = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
    if (transcriptForModel.length !== transcript.length) {
      console.log("1.2 Transcript truncated for model safety:", transcript.length, "->", transcriptForModel.length);
    }

    const result = await generateWithProvider(
      provider,
      modelSelection,
      analysisApiKey,
      buildUniversalSystemPrompt(transcriptForModel),
      true,
    );
    if (!result.text) {
      throw new Error("Model returned an empty response");
    }

    const views = toFiniteNumber(post.metrics?.views);
    const likes = toFiniteNumber(post.metrics?.likes);
    const avgViews = toFiniteNumber(post.authorAverageViews);
    const outlierScore = calculateOutlierScore(views, avgViews);

    let parsed: UnknownRecord = {};
    try {
      parsed = parseJsonResponse(result.text);
    } catch (parseError) {
      console.warn("Failed to parse analysis JSON, falling back to defaults:", parseError);
    }
    const deepAnalysis = extractDeepAnalysis(parsed);
    const normalized = normalizeUniversalAnalysisShape(parsed, transcriptForModel);
    const analysis = sanitizeAnalysis(normalized, transcriptForModel, views, likes);
    analysis.breakdownBlocks.problemAndSolution = transcriptForModel;
    if (deepAnalysis) {
      analysis.deepAnalysis = deepAnalysis;
    }
    if (firstFrameThumbnail) {
      analysis.firstFrameThumbnail = firstFrameThumbnail;
    }
    if (outlierScore !== null) {
      analysis.outlierScore = outlierScore;
    }

    // Phase 2: AI Vision Pattern Recognition
    let vision_patterns = null;
    if (post.displayUrl) {
      try {
        console.log("Vision: Fetching image from Apify URL:", post.displayUrl);
        const imgRes = await fetch(post.displayUrl);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const base64Img = Buffer.from(buffer).toString("base64");
          const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

          const visionAi = new GoogleGenerativeAI(analysisApiKey || "");
          const visionModel = visionAi.getGenerativeModel({ model: "gemini-3-flash-preview" });

          const visionPrompt = `Analyze this video frame. Return a strict JSON object with these keys: { "lighting": "...", "setting": "...", "format": "..." }. Keep descriptions under 3 words (e.g., 'Dark/Moody', 'Car Interior', 'Talking Head'). Return ONLY valid JSON, no markdown fences.`;

          const visionResult = await visionModel.generateContent([
            visionPrompt,
            { inlineData: { data: base64Img, mimeType } },
          ]);

          const visionText = visionResult.response.text();
          try {
            const rawVision = JSON.parse(visionText.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim());
            vision_patterns = {
              lighting: rawVision.lighting || "Unknown",
              setting: rawVision.setting || "Unknown",
              format: rawVision.format || "Unknown",
            };
          } catch (e) {
            console.warn("Vision: Failed to parse JSON:", e);
          }
        }
      } catch (e) {
        console.warn("Vision: Failed to extract patterns:", e);
      }
    }

    if (vision_patterns) {
      analysis.vision_patterns = vision_patterns;
    }

    return NextResponse.json(
      {
        analysis,
        transcript: transcriptForModel,
        srt: srtTranscript || undefined,
        source: result.source,
        model: result.model,
        generatedAt: new Date().toISOString(),
      } as AnalyzeResponse & { transcript: string; srt?: string },
      { status: 200 },
    );
  } catch (error) {
    console.error("ANALYSIS FAILED:", error);
    return NextResponse.json(
      { error: "Unknown error" },
      { status: 500 },
    );
  }
}
