import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import os from "os";
import fs from "fs";
import path from "path";
import type { AIAnalysis, AnalyzeResponse, DeepAnalysis } from "../../../lib/types";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRANSCRIPTION_PROMPT =
  "You are an expert transcriber. Watch this video and transcribe the exact spoken words. You MUST return the output strictly in standard .SRT format with sequential numbers, timestamps (00:00:00,000 --> 00:00:00,000), and the text on a third line per block. Example:\n1\n00:00:00,000 --> 00:00:03,500\nHello, welcome to this video.\n\n2\n00:00:03,500 --> 00:00:07,000\nToday we are covering an important topic.";
const TRANSCRIPTION_MODEL = "gemini-3-flash-preview";
const MAX_TRANSCRIPT_CHARS = 12000;

/** Extract first frame of a video buffer as a base64 JPEG thumbnail */
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

/** Strip SRT timestamps/numbers to get plain spoken text for LLM analysis */
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
      keyTakeaways: [
        "Open with one focused promise.",
        "Deliver value in concise steps.",
        "Finish with one specific CTA.",
      ],
    },
    summary: {
      coreIdea: "Transcript-based analysis for a manually uploaded short-form video.",
      outlierPotential: "Moderate if the hook and CTA are clear and specific.",
      actionableImprovements: [
        "Shorten the opening to one sharp line.",
        "Add one concrete proof point.",
        "Use a single direct CTA at the end.",
      ],
    },
  };
}

function sanitizeAnalysis(payload: unknown, transcript: string): AIAnalysis {
  if (!payload || typeof payload !== "object") {
    return fallbackAnalysis(transcript);
  }

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
      targetAudienceAndTone: toStringSafe(
        breakdown.targetAudienceAndTone,
        base.breakdownBlocks.targetAudienceAndTone,
      ),
      problemAndSolution: transcript || toStringSafe(breakdown.problemAndSolution, base.breakdownBlocks.problemAndSolution),
      audioAndAtmosphere: toStringSafe(breakdown.audioAndAtmosphere, base.breakdownBlocks.audioAndAtmosphere),
      keyTakeaways: toStringArray(breakdown.keyTakeaways).length > 0
        ? toStringArray(breakdown.keyTakeaways)
        : base.breakdownBlocks.keyTakeaways,
    },
    summary: {
      coreIdea: toStringSafe(summary.coreIdea, base.summary.coreIdea),
      outlierPotential: toStringSafe(summary.outlierPotential, base.summary.outlierPotential),
      actionableImprovements: toStringArray(summary.actionableImprovements).length > 0
        ? toStringArray(summary.actionableImprovements)
        : base.summary.actionableImprovements,
    },
  };
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

function buildUniversalSystemPrompt(transcriptText: string): string {
  return `You are an elite viral content strategist and behavioral psychologist. Analyze this transcript and return ONLY a valid JSON object. Do not include markdown code blocks, backticks, or any commentary outside the JSON.

The JSON must exactly match this structure:
{
  "narrative": {
    "topic": "The broad subject matter.",
    "seed": "A 1-line sentence about what makes this specific video interesting.",
    "substance": "The core facts, examples, or main takeaway.",
    "storyStructure": "MUST BE EXACTLY ONE OF: Problem/Solution, Contrarian, Listicle, Story/Vlog, Step-by-Step"
  },
  "hooks": {
    "spokenHook": "The exact first words spoken in the video.",
    "visualHook": "What grabs the eye in the first 3 seconds.",
    "textHook": "The on-screen text used to stop the scroll.",
    "hookType": "MUST BE EXACTLY ONE OF: Negative Hook, Curiosity Hook, Value Hook, Story Hook, Visual Hook, Question Hook, Direct Hook, Empathy Hook, Statistic Hook"
  },
  "architecture": {
    "visualLayout": "How the screen is arranged (e.g., split-screen, green screen, dynamic zoom, talking head).",
    "visualElements": "Specific video and audio elements used (e.g., sound effects, pop-up text, B-roll, captions).",
    "keyVisuals": "The 2-3 most memorable visual moments or shots in the video.",
    "audioVibe": "The overall audio atmosphere (e.g., upbeat, tense, calm, dramatic)."
  },
  "conversion": {
    "cta": "The exact Call to Action at the end of the video."
  }
}

STRICT INSTRUCTION FOR HOOKS:
You will be provided with a text transcript of a short-form video. Audio transcripts inherently lack visual descriptions.
UNDER NO CIRCUMSTANCES are you allowed to output "Not specified in transcript", "N/A", "Not available", or any similar placeholder for any field.
Instead, you MUST use your expertise as a viral video strategist to INFER and RECONSTRUCT the most highly probable values based on the topic, tone, and spoken content. Every field must be populated.

Transcript:\n${transcriptText}`;
}

function normalizeUniversalAnalysisShape(payload: UnknownRecord, transcriptText: string): UnknownRecord {
  if (payload.hookAnalysis || payload.structureAnalysis || payload.styleAnalysis) {
    return payload;
  }

  // Handle new master schema: narrative / hooks / architecture / conversion
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

  // Legacy fallback: hook / style / structure shape
  const hookObj = (payload.hook ?? {}) as UnknownRecord;
  const styleObj = (payload.style ?? {}) as UnknownRecord;
  const structureObj = (payload.structure ?? {}) as UnknownRecord;

  const hookType = toStringSafe(hookObj.text_hook_type, toStringSafe(hookObj.type, "Hook"));
  const hookDescription = toStringSafe(
    hookObj.text_hook_description,
    toStringSafe(hookObj.description, toStringSafe(payload.description, transcriptText)),
  );
  const visualHook = toStringSafe(hookObj.visual_hook, "");
  const frameworks = Array.isArray(hookObj.frameworks) ? hookObj.frameworks.map(String) : [];
  const styleType = toStringSafe(styleObj.type, "Conversational");
  const styleDescription = toStringSafe(styleObj.description, "Direct and clear delivery.");
  const structureType = toStringSafe(structureObj.type, "Hook -> Value -> CTA");
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
    },
    hooks: {
      spokenHook: toStringSafe(hooks.spokenHook, "Not analyzed"),
      visualHook: toStringSafe(hooks.visualHook, "Not analyzed"),
      textHook: toStringSafe(hooks.textHook, "Not analyzed"),
      hookType: toStringSafe(hooks.hookType, toStringSafe(hooks.type, "Not analyzed")),
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

async function transcribeWithGemini(
  transcriptionApiKey: string,
  base64Video: string,
  mimeType: string,
): Promise<string> {
  const transcriptionClient = new GoogleGenerativeAI(transcriptionApiKey);
  const transcriptionModel = transcriptionClient.getGenerativeModel({
    model: TRANSCRIPTION_MODEL,
    generationConfig: {
      temperature: 0.1,
    },
  });

  const transcriptionResult = await transcriptionModel.generateContent([
    { text: TRANSCRIPTION_PROMPT },
    {
      inlineData: {
        data: base64Video,
        mimeType: mimeType || "video/mp4",
      },
    },
  ]);

  return parseTextResponse(transcriptionResult.response.text() || "");
}

async function generateWithProvider(
  provider: Provider,
  modelSelection: string,
  apiKey: string,
  prompt: string,
): Promise<{ text: string; model: string; source: SourceType }> {
  if (provider === "OpenAI") {
    const selectedModel = mapOpenAIModel(modelSelection);
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: selectedModel,
      response_format: { type: "json_object" },
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
      messages: [{ role: "user", content: `${prompt}\n\nEnsure your response is valid JSON.` }],
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
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });
  const response = await geminiModel.generateContent(prompt);
  return {
    text: response.response.text().trim(),
    model: selectedModel,
    source: "gemini",
  };
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let buffer: Buffer;
    let mimeType: string;
    let fileName: string;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const videoUrl = body.videoUrl;
      fileName = body.fileName || videoUrl?.split("/").pop() || "uploaded_video.mp4";
      
      if (!videoUrl) return NextResponse.json({ error: "No videoUrl provided" }, { status: 400 });

      const resp = await fetch(videoUrl);
      if (!resp.ok) throw new Error("Failed to fetch video from storage.");
      const arrayBuffer = await resp.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      mimeType = resp.headers.get("content-type") || "video/mp4";
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      mimeType = file.type;
      fileName = file.name;
    }

    // Fetch user's API keys from database
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userSettings = await prisma.settings.findUnique({ where: { userId: dbUser.id } });

    const activeProvider = userSettings?.activeProvider ?? "Gemini";
    const provider = normalizeProvider(activeProvider);
    const model =
      userSettings?.activeModel?.trim() ||
      (provider === "OpenAI" ? "gpt-5-mini-2025-08-07" : provider === "Anthropic" ? "claude-4.5-haiku" : "gemini-3-flash-preview");

    let analysisApiKey = "";
    if (provider === "OpenAI") analysisApiKey = userSettings?.openaiApiKey ?? "";
    else if (provider === "Anthropic") analysisApiKey = userSettings?.anthropicApiKey ?? "";
    else analysisApiKey = userSettings?.geminiApiKey ?? "";

    const transcriptionApiKey = userSettings?.geminiApiKey ?? "";

    if (!analysisApiKey) {
      return NextResponse.json(
        { error: `Missing API key for ${activeProvider}. Please add it in your Settings.` },
        { status: 400 },
      );
    }
    if (!transcriptionApiKey) {
      return NextResponse.json({ error: "Gemini API key is required for transcription. Please add it in your Settings." }, { status: 400 });
    }

    const base64Video = buffer.toString("base64");

    const generatedTranscriptString = await transcribeWithGemini(transcriptionApiKey, base64Video, mimeType);
    if (!generatedTranscriptString) {
      throw new Error("Transcription completed but returned empty text.");
    }

    const srtTranscript = generatedTranscriptString; // keep raw SRT
    const plainTranscript = srtToPlainText(generatedTranscriptString) || generatedTranscriptString;
    const transcriptForModel = plainTranscript.slice(0, MAX_TRANSCRIPT_CHARS);

    const result = await generateWithProvider(
      provider,
      model,
      analysisApiKey,
      buildUniversalSystemPrompt(transcriptForModel),
    );
    if (!result.text) {
      throw new Error("Analysis completed but returned empty text.");
    }

    let parsed: UnknownRecord = {};
    try {
      parsed = parseJsonResponse(result.text);
    } catch (parseError) {
      console.warn("Failed to parse analysis JSON, falling back to defaults:", parseError);
    }

    const deepAnalysis = extractDeepAnalysis(parsed);
    const normalized = normalizeUniversalAnalysisShape(parsed, transcriptForModel);
    const analysis = sanitizeAnalysis(normalized, transcriptForModel);
    analysis.breakdownBlocks.problemAndSolution = transcriptForModel;
    if (deepAnalysis) {
      analysis.deepAnalysis = deepAnalysis;
    }

    let uploadId = `manual-${Date.now()}`;

    // Extract first-frame thumbnail (best-effort — non-fatal if ffmpeg fails)
    const thumbnail = await extractThumbnail(buffer, mimeType).catch(() => null);

    // Save to Prisma Upload table (user-isolated)
    try {
      const prismaRecord = await prisma.upload.create({
        data: {
          userId: dbUser.id,
          fileName: fileName,
          analysis: analysis as any,
          transcript: transcriptForModel,
          ...(thumbnail ? { thumbnail } : {}),
        },
      });
      uploadId = prismaRecord.id;
    } catch (dbErr) {
      console.error("Failed to save upload to DB:", dbErr);
      // Non-fatal — client localStorage still stores the data
    }

    return NextResponse.json(
      {
        id: uploadId,
        analysis,
        transcript: transcriptForModel,
        srt: srtTranscript || undefined,
        source: result.source,
        model: result.model,
        generatedAt: new Date().toISOString(),
      } as AnalyzeResponse & { id: string; transcript: string; srt?: string },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze manual upload" },
      { status: 500 },
    );
  }
}
