import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDbUserForSession } from "@/lib/session-user";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import os from "os";
import fs from "fs";
import path from "path";
import type { AIAnalysis, DeepAnalysis } from "../../../../lib/types";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

// Longer window for transcribe + analysis (platform cap still applies on Hobby).
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRANSCRIPTION_PROMPT =
  "You are an expert transcriber. The input may be a short video or an audio extract from a video. Transcribe the exact spoken words. You MUST return the output strictly in standard .SRT format with sequential numbers, timestamps (00:00:00,000 --> 00:00:00,000), and the text on a third line per block. Example:\n1\n00:00:00,000 --> 00:00:03,500\nHello, welcome to this video.\n\n2\n00:00:03,500 --> 00:00:07,000\nToday we are covering an important topic.";
const TRANSCRIPTION_MODEL = "gemini-2.0-flash";
/** Gemini inline payloads above this size often stall or fail — extract audio first. */
const INLINE_TRANSCRIBE_MAX_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 12000;

async function extractThumbnail(videoBuffer: Buffer, mimeType: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const ext = mimeType === "video/mp4" ? ".mp4" : mimeType === "video/webm" ? ".webm" : mimeType === "video/quicktime" ? ".mov" : ".mp4";
      const tmpIn = path.join(os.tmpdir(), `thumb-in-${Date.now()}${ext}`);
      const tmpOut = path.join(os.tmpdir(), `thumb-out-${Date.now()}.jpg`);
      fs.writeFileSync(tmpIn, videoBuffer);
      ffmpeg(tmpIn)
        .screenshots({ timestamps: ["00:00:00.001"], filename: path.basename(tmpOut), folder: path.dirname(tmpOut), size: "480x?" })
        .on("end", () => {
          try {
            const data = fs.readFileSync(tmpOut);
            const b64 = `data:image/jpeg;base64,${data.toString("base64")}`;
            fs.unlinkSync(tmpIn);
            fs.unlinkSync(tmpOut);
            resolve(b64);
          } catch { resolve(null); }
        })
        .on("error", () => { try { fs.unlinkSync(tmpIn); } catch { } resolve(null); });
    } catch { resolve(null); }
  });
}

/**
 * Large uploads exceed practical inline limits for video+vision. Extract up to 2 minutes of audio as MP3.
 */
async function prepareMediaForTranscription(videoBuffer: Buffer, mimeType: string): Promise<{ base64: string; mimeType: string }> {
  if (videoBuffer.length <= INLINE_TRANSCRIBE_MAX_BYTES) {
    return { base64: videoBuffer.toString("base64"), mimeType: mimeType || "video/mp4" };
  }
  if (!ffmpegPath) {
    throw new Error(
      "This video is too large to transcribe inline. Please upload a file under about 10MB, or trim to a shorter clip.",
    );
  }
  const ext =
    mimeType === "video/mp4" ? ".mp4" : mimeType === "video/quicktime" ? ".mov" : ".mp4";
  const tmpIn = path.join(os.tmpdir(), `tx-in-${Date.now()}${ext}`);
  const tmpOut = path.join(os.tmpdir(), `tx-out-${Date.now()}.mp3`);
  fs.writeFileSync(tmpIn, videoBuffer);
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tmpIn)
        .outputOptions("-vn", "-t", "120")
        .audioCodec("libmp3lame")
        .audioBitrate("128k")
        .audioFrequency(44100)
        .format("mp3")
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(tmpOut);
    });
    const audioBuf = fs.readFileSync(tmpOut);
    try {
      fs.unlinkSync(tmpIn);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmpOut);
    } catch {
      /* ignore */
    }
    return { base64: audioBuf.toString("base64"), mimeType: "audio/mpeg" };
  } catch (e) {
    try {
      fs.unlinkSync(tmpIn);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmpOut);
    } catch {
      /* ignore */
    }
    console.error("[Worker] prepareMediaForTranscription ffmpeg error:", e);
    throw new Error(
      "Could not prepare a smaller audio clip for transcription. Try a smaller or shorter video.",
    );
  }
}

function srtToPlainText(srt: string): string {
  return srt
    .split(/\r?\n/)
    .filter((line) => {
      if (!line.trim()) return false;
      if (/^\d+$/.test(line.trim())) return false;
      if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/.test(line.trim())) return false;
      return true;
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type UnknownRecord = Record<string, unknown>;
type Provider = "Gemini" | "OpenAI" | "Anthropic";
type SourceType = "gemini" | "openai" | "anthropic";

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const exactFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (exactFence?.[1]) return exactFence[1].trim();
  const firstFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (firstFence?.[1]) return firstFence[1].trim();
  return trimmed;
}

function parseTextResponse(text: string): string {
  return stripMarkdownFences(text).replace(/^```[\w-]*\s*/i, "").replace(/```$/i, "").trim();
}

function parseJsonResponse(text: string): UnknownRecord {
  const cleaned = stripMarkdownFences(text);
  try {
    return JSON.parse(cleaned) as UnknownRecord;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as UnknownRecord;
    }
    throw new Error("Failed to parse model JSON response");
  }
}

function fallbackAnalysis(transcript: string): AIAnalysis {
  const firstLine = transcript.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "Strong opening promise.";
  return {
    hookAnalysis: {
      type: /\?/.test(firstLine) ? "Question Hook" : "Curiosity Hook",
      description: firstLine,
      frameworks: ["PAS", "AIDA"],
      justification: "The opening gives a clear reason for the viewer to keep watching.",
    },
    structureAnalysis: {
      type: "Hook -> Value -> CTA",
      description: "The delivery should move quickly from a strong hook to value and end with one clear CTA.",
      bestFor: "Short-form coaching content",
      justification: "This sequence keeps attention while making the takeaway actionable.",
    },
    styleAnalysis: {
      tone: "Direct",
      voice: "Conversational",
      wordChoice: "Simple and concrete",
      pacing: "Fast",
    },
    breakdownBlocks: {
      hook: firstLine,
      cta: "Close with a direct CTA that asks for one action.",
      targetAudienceAndTone: "Busy viewers who want practical, clear advice quickly.",
      problemAndSolution: transcript || "No transcript provided.",
      audioAndAtmosphere: "Not available from transcript-only analysis.",
      keyTakeaways: ["Open with one focused promise.", "Deliver value in concise steps.", "Finish with one specific CTA."],
    },
    summary: {
      coreIdea: "Transcript-based analysis for a manually uploaded short-form video.",
      outlierPotential: "Moderate if the hook and CTA are clear and specific.",
      actionableImprovements: ["Shorten the opening to one sharp line.", "Add one concrete proof point.", "Use a single direct CTA at the end."],
    },
  };
}

function sanitizeAnalysis(payload: unknown, transcript: string): AIAnalysis {
  if (!payload || typeof payload !== "object") return fallbackAnalysis(transcript);
  const base = fallbackAnalysis(transcript);
  const obj = payload as UnknownRecord;
  const hook = (obj.hookAnalysis ?? {}) as UnknownRecord;
  const structure = (obj.structureAnalysis ?? {}) as UnknownRecord;
  const style = (obj.styleAnalysis ?? {}) as UnknownRecord;
  const breakdown = (obj.breakdownBlocks ?? {}) as UnknownRecord;
  const summary = (obj.summary ?? {}) as UnknownRecord;
  return {
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
    breakdownBlocks: {
      hook: toStringSafe(breakdown.hook, base.breakdownBlocks.hook),
      cta: toStringSafe(breakdown.cta, base.breakdownBlocks.cta),
      targetAudienceAndTone: toStringSafe(breakdown.targetAudienceAndTone, base.breakdownBlocks.targetAudienceAndTone),
      problemAndSolution: transcript || toStringSafe(breakdown.problemAndSolution, base.breakdownBlocks.problemAndSolution),
      audioAndAtmosphere: toStringSafe(breakdown.audioAndAtmosphere, base.breakdownBlocks.audioAndAtmosphere),
      keyTakeaways: toStringArray(breakdown.keyTakeaways).length > 0 ? toStringArray(breakdown.keyTakeaways) : base.breakdownBlocks.keyTakeaways,
    },
    summary: {
      coreIdea: toStringSafe(summary.coreIdea, base.summary.coreIdea),
      outlierPotential: toStringSafe(summary.outlierPotential, base.summary.outlierPotential),
      actionableImprovements: toStringArray(summary.actionableImprovements).length > 0 ? toStringArray(summary.actionableImprovements) : base.summary.actionableImprovements,
    },
  };
}

function normalizeProvider(value: string): Provider {
  const n = value.trim().toLowerCase();
  if (n.includes("openai") || n.includes("gpt")) return "OpenAI";
  if (n.includes("anthropic") || n.includes("claude")) return "Anthropic";
  return "Gemini";
}

function mapGeminiModel(m: string): string {
  const n = m.toLowerCase().trim();
  if (!n) return "gemini-3-flash-preview";
  if (n.startsWith("gemini-")) return n;
  if (n.includes("2.5") && n.includes("pro")) return "gemini-2.5-pro";
  if (n.includes("pro")) return "gemini-2.5-pro";
  return "gemini-3-flash-preview";
}

function mapOpenAIModel(m: string): string {
  const n = m.toLowerCase().trim();
  if (!n) return "gpt-5-mini-2025-08-07";
  if (n.startsWith("gpt-")) return n;
  if (n.includes("4.1")) return "gpt-4.1";
  return "gpt-5-mini-2025-08-07";
}

function mapAnthropicModel(m: string): string {
  const n = m.toLowerCase().trim();
  if (!n) return "claude-4.5-haiku";
  if (n.startsWith("claude-")) return n;
  if (n.includes("3.7") && n.includes("sonnet")) return "claude-3-7-sonnet-latest";
  return "claude-4.5-haiku";
}

function extractAnthropicText(response: unknown): string {
  if (!response || typeof response !== "object" || !("content" in response)) return "";
  const content = (response as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: string; text?: string } => Boolean(b && typeof b === "object" && "type" in b && (b as { type?: unknown }).type === "text"))
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

function buildUniversalSystemPrompt(transcriptText: string): string {
  return `You are an elite viral content strategist and behavioral psychologist. Analyze this transcript and return ONLY a valid JSON object. Do not include markdown code blocks, backticks, or any commentary outside the JSON.

The JSON must exactly match this structure:
{
  "narrative": {
    "topic": "The core subject matter (1-3 words).",
    "seed": "A 1-sentence summary of the core video concept.",
    "substance": "A brief summary of what is actually discussed.",
    "storyStructure": "MUST BE EXACTLY ONE OF: Problem/Solution, Contrarian, Listicle, Story/Vlog, Step-by-Step",
    "uniqueAngle": "What is the specific, unique perspective or framing the creator uses?",
    "commonBelief": "What widespread myth or assumption is this video challenging?",
    "supportingEvidence": ["2-3 bullet points of specific evidence the creator uses."]
  },
  "hooks": {
    "spokenHook": "The exact first words spoken in the video.",
    "visualHook": "What grabs the eye in the first 3 seconds.",
    "textHook": "The on-screen text used to stop the scroll.",
    "hookType": "MUST BE EXACTLY ONE OF: Negative Hook, Curiosity Hook, Value Hook, Story Hook, Visual Hook, Question Hook, Direct Hook, Empathy Hook, Statistic Hook",
    "formula": "Extract the core psychological template of the spoken hook using bracketed variables."
  },
  "architecture": {
    "visualLayout": "How the screen is arranged.",
    "visualElements": "Specific video and audio elements used.",
    "keyVisuals": "The 2-3 most memorable visual moments.",
    "audioVibe": "The overall audio atmosphere."
  },
  "conversion": {
    "cta": "The exact Call to Action at the end of the video."
  }
}

STRICT INSTRUCTION: Never output "Not specified in transcript", "N/A", or any placeholder. Infer and reconstruct all fields from context.

Transcript:\n${transcriptText}`;
}

function normalizeUniversalAnalysisShape(payload: UnknownRecord, transcriptText: string): UnknownRecord {
  if (payload.hookAnalysis || payload.structureAnalysis || payload.styleAnalysis) return payload;

  if (payload.narrative || payload.hooks || payload.architecture || payload.conversion) {
    const narrative = (payload.narrative ?? {}) as UnknownRecord;
    const hooks = (payload.hooks ?? {}) as UnknownRecord;
    const architecture = (payload.architecture ?? {}) as UnknownRecord;
    const conversion = (payload.conversion ?? {}) as UnknownRecord;
    return {
      ...payload,
      hookAnalysis: {
        type: toStringSafe(hooks.textHook, "Hook"),
        description: toStringSafe(hooks.spokenHook, transcriptText),
        visual_hook: toStringSafe(hooks.visualHook, ""),
        frameworks: [],
        justification: toStringSafe(hooks.spokenHook, "Generated from transcript."),
        formula: toStringSafe(hooks.formula, ""),
      },
      structureAnalysis: {
        type: toStringSafe(narrative.format, "Hook -> Value -> CTA"),
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
        audioAndAtmosphere: toStringSafe(architecture.audioVibe, toStringSafe(architecture.visualElements, "")),
        keyTakeaways: [toStringSafe(narrative.seed, ""), toStringSafe(narrative.substance, "")].filter(Boolean),
      },
    };
  }

  return payload;
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
      storyStructure: toStringSafe(narrative.storyStructure, toStringSafe(narrative.format, "Not analyzed")),
      uniqueAngle: toStringSafe(narrative.uniqueAngle, ""),
      commonBelief: toStringSafe(narrative.commonBelief, ""),
      supportingEvidence: Array.isArray(narrative.supportingEvidence) ? narrative.supportingEvidence.map(String) : [],
    },
    hooks: {
      spokenHook: toStringSafe(hooks.spokenHook, "Not analyzed"),
      visualHook: toStringSafe(hooks.visualHook, "Not analyzed"),
      textHook: toStringSafe(hooks.textHook, "Not analyzed"),
      hookType: toStringSafe(hooks.hookType, toStringSafe(hooks.type, "Not analyzed")),
      formula: toStringSafe(hooks.formula, "Not analyzed"),
    },
    architecture: {
      visualLayout: toStringSafe(architecture.visualLayout, "Not analyzed"),
      visualElements: toStringSafe(architecture.visualElements, "Not analyzed"),
      keyVisuals: toStringSafe(architecture.keyVisuals, "Not analyzed"),
      audio: toStringSafe(architecture.audioVibe, toStringSafe(architecture.audio, "Not analyzed")),
    },
    conversion: {
      cta: toStringSafe(conversion.cta, "Not analyzed"),
    },
  };
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  errorContext: string = "Operation"
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        console.error(`[Retry] ${errorContext} failed after ${maxRetries} attempts:`, error);
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.warn(`[Retry] ${errorContext} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

async function transcribeWithGemini(apiKey: string, base64Payload: string, mimeType: string): Promise<string> {
  const perAttemptTimeoutMs = 240_000;
  return retryWithBackoff(async () => {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: TRANSCRIPTION_MODEL });
    const gen = model.generateContent([
      { text: TRANSCRIPTION_PROMPT },
      { inlineData: { data: base64Payload, mimeType: mimeType || "video/mp4" } },
    ]);
    const result = await Promise.race([
      gen,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Transcription exceeded ${perAttemptTimeoutMs / 1000}s`)),
          perAttemptTimeoutMs,
        ),
      ),
    ]);
    return result.response.text().trim();
  }, 2, 3000, "Gemini transcription");
}

async function generateWithProvider(
  provider: Provider,
  modelSelection: string,
  apiKey: string,
  prompt: string,
): Promise<{ text: string; model: string; source: SourceType }> {
  return retryWithBackoff(async () => {
    if (provider === "OpenAI") {
      const selectedModel = mapOpenAIModel(modelSelection);
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: selectedModel,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });
      return { text: response.choices[0]?.message?.content?.trim() ?? "", model: selectedModel, source: "openai" };
    }

    if (provider === "Anthropic") {
      const selectedModel = mapAnthropicModel(modelSelection);
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: 2000,
        messages: [{ role: "user", content: `${prompt}\n\nEnsure your response is valid JSON.` }],
      });
      return { text: extractAnthropicText(response), model: selectedModel, source: "anthropic" };
    }

    const selectedModel = mapGeminiModel(modelSelection);
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ model: selectedModel, generationConfig: { responseMimeType: "application/json" } });
    const response = await geminiModel.generateContent(prompt);
    return { text: response.response.text().trim(), model: selectedModel, source: "gemini" };
  }, 3, 2000, `${provider} analysis`);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id && !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await getDbUserForSession(session);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json() as {
    jobId?: string;
    videoUrl?: string;
    fileName?: string;
    geminiApiKey?: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    activeProvider?: string;
    activeModel?: string;
  };
  const { jobId, videoUrl, fileName } = body;

  if (!jobId || !videoUrl) {
    return NextResponse.json({ error: "jobId and videoUrl are required" }, { status: 400 });
  }

  // Verify the job belongs to this user
  const uploadRecord = await prisma.upload.findUnique({ where: { jobId } });
  if (!uploadRecord || uploadRecord.userId !== dbUser.id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const markFailed = async (reason: string, errorDetails?: string) => {
    console.error(`[Worker] Marking job ${jobId} as FAILED: ${reason}`, errorDetails || "");
    await prisma.upload.update({
      where: { jobId },
      data: { 
        status: "FAILED",
        errorMessage: reason,
      },
    }).catch((dbErr) => {
      console.error(`[Worker] Failed to update DB status:`, dbErr);
    });
    return NextResponse.json({ error: reason }, { status: 500 });
  };

  try {
    console.log(`[Worker] Starting job ${jobId} for file: ${fileName}`);
    
    // Fetch user settings
    const userSettings = await prisma.settings.findUnique({ where: { userId: dbUser.id } });

    const bodyGem = typeof body.geminiApiKey === "string" ? body.geminiApiKey.trim() : "";
    const bodyOpen = typeof body.openaiApiKey === "string" ? body.openaiApiKey.trim() : "";
    const bodyAnth = typeof body.anthropicApiKey === "string" ? body.anthropicApiKey.trim() : "";

    const geminiKey =
      bodyGem || userSettings?.geminiApiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
    const openaiKey = bodyOpen || userSettings?.openaiApiKey?.trim() || "";
    const anthropicKey = bodyAnth || userSettings?.anthropicApiKey?.trim() || "";

    const providerHint = body.activeProvider?.trim() || userSettings?.activeProvider || "Gemini";
    const provider = normalizeProvider(providerHint);
    const model =
      body.activeModel?.trim() ||
      userSettings?.activeModel?.trim() ||
      (provider === "OpenAI" ? "gpt-5-mini-2025-08-07" : provider === "Anthropic" ? "claude-4.5-haiku" : "gemini-3-flash-preview");

    function resolveAnalysisRun(
      pref: Provider,
      g: string,
      o: string,
      a: string,
    ): { provider: Provider; apiKey: string } {
      if (pref === "OpenAI" && o) return { provider: "OpenAI", apiKey: o };
      if (pref === "Anthropic" && a) return { provider: "Anthropic", apiKey: a };
      if (g) return { provider: "Gemini", apiKey: g };
      if (o) return { provider: "OpenAI", apiKey: o };
      if (a) return { provider: "Anthropic", apiKey: a };
      return { provider: "Gemini", apiKey: "" };
    }

    const { provider: analysisProvider, apiKey: analysisApiKey } = resolveAnalysisRun(
      provider,
      geminiKey,
      openaiKey,
      anthropicKey,
    );

    const transcriptionApiKey = geminiKey;

    if (!analysisApiKey) {
      console.error(`[Worker] Missing API keys for user ${dbUser.id}`);
      return markFailed("No AI API key found. Add Gemini (and optionally OpenAI/Anthropic) in Settings or Script Studio keys.");
    }
    if (!transcriptionApiKey) {
      console.error(`[Worker] Missing Gemini API key for transcription`);
      return markFailed("Gemini API key is required for transcription (add in Settings or pass from the app).");
    }

    console.log(`[Worker] Fetching video from: ${videoUrl.substring(0, 50)}...`);
    
    // Fetch video from Vercel Blob with timeout
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 30000); // 30s timeout
    
    let resp;
    try {
      resp = await fetch(videoUrl, { signal: fetchController.signal });
      clearTimeout(fetchTimeout);
    } catch (fetchErr) {
      clearTimeout(fetchTimeout);
      return markFailed("Failed to fetch video from storage (timeout or network error).", String(fetchErr));
    }
    
    if (!resp.ok) {
      return markFailed(`Failed to fetch video from storage (HTTP ${resp.status}).`);
    }
    
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = resp.headers.get("content-type") || "video/mp4";
    const resolvedFileName = fileName || uploadRecord.fileName;
    
    console.log(`[Worker] Video fetched: ${(buffer.length / 1024 / 1024).toFixed(2)} MB, type: ${mimeType}`);

    // Transcription (may shrink large files to an audio extract)
    console.log(`[Worker] Starting transcription with Gemini (${TRANSCRIPTION_MODEL})...`);
    let inlinePayload: { base64: string; mimeType: string };
    try {
      inlinePayload = await prepareMediaForTranscription(buffer, mimeType);
    } catch (prepErr) {
      console.error(`[Worker] Media preparation error:`, prepErr);
      return markFailed(prepErr instanceof Error ? prepErr.message : "Could not prepare media for transcription.");
    }

    let rawTranscript;
    try {
      rawTranscript = await transcribeWithGemini(
        transcriptionApiKey,
        inlinePayload.base64,
        inlinePayload.mimeType,
      );
    } catch (transErr) {
      console.error(`[Worker] Transcription error:`, transErr);
      return markFailed("Transcription failed. Check your Gemini API key and quota.", String(transErr));
    }
    
    if (!rawTranscript) {
      return markFailed("Transcription returned empty text.");
    }
    
    console.log(`[Worker] Transcription complete: ${rawTranscript.length} chars`);

    const plainTranscript = srtToPlainText(rawTranscript) || rawTranscript;
    const transcriptForModel = plainTranscript.slice(0, MAX_TRANSCRIPT_CHARS);

    // AI Analysis
    console.log(`[Worker] Starting analysis with ${analysisProvider} (${model})...`);
    
    let result;
    try {
      result = await generateWithProvider(
        analysisProvider,
        model,
        analysisApiKey,
        buildUniversalSystemPrompt(transcriptForModel),
      );
    } catch (analysisErr) {
      console.error(`[Worker] Analysis error:`, analysisErr);
      return markFailed(`${provider} analysis failed. Check your API key and quota.`, String(analysisErr));
    }
    
    if (!result.text) {
      return markFailed("Analysis returned empty text.");
    }
    
    console.log(`[Worker] Analysis complete: ${result.text.length} chars`);

    let parsed: UnknownRecord = {};
    try {
      parsed = parseJsonResponse(result.text);
    } catch (parseErr) {
      console.error(`[Worker] JSON parse error:`, parseErr);
      // Fall through to fallback
    }

    const deepAnalysis = extractDeepAnalysis(parsed);
    const normalized = normalizeUniversalAnalysisShape(parsed, transcriptForModel);
    const analysis = sanitizeAnalysis(normalized, transcriptForModel);
    analysis.breakdownBlocks.problemAndSolution = transcriptForModel;
    if (deepAnalysis) analysis.deepAnalysis = deepAnalysis;

    // Thumbnail (async, non-blocking failure)
    console.log(`[Worker] Extracting thumbnail...`);
    const thumbnail = await extractThumbnail(buffer, mimeType).catch((thumbErr) => {
      console.error(`[Worker] Thumbnail extraction failed (non-fatal):`, thumbErr);
      return null;
    });

    // Update Upload record to COMPLETED
    console.log(`[Worker] Saving results to database...`);
    await prisma.upload.update({
      where: { jobId },
      data: {
        status: "COMPLETED",
        fileName: resolvedFileName,
        analysis: analysis as any,
        transcript: transcriptForModel,
        errorMessage: null, // Clear any previous errors
        ...(thumbnail ? { thumbnail } : {}),
      },
    });

    console.log(`[Worker] Job ${jobId} completed successfully!`);
    return NextResponse.json({ ok: true, id: uploadRecord.id });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Worker] Unexpected error:", err);
    return markFailed("Worker encountered an unexpected error.", errorMsg);
  }
}
