export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSettings } from "../../../lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGameModePrompt } from "@/lib/game-mode";
import { buildHoldTwistPromptBlock } from "@/lib/remix-hold-twist-framework";
import { SCRATCH_SCRIPT_ANATOMY_BLOCK } from "@/lib/script-anatomy-scratch";
import { buildClientVoiceAppendix } from "@/lib/client-voice-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreativeEngine = "claude_3_5_sonnet" | "gpt_4o" | "gemini_1_5_pro";

// Mapping from UI model value to actual API model ID
const MODEL_API_IDS: Record<string, string> = {
  // Gemini models
  "gemini-3-flash-preview": "gemini-3-flash-preview",
  "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
  "gemini-1.5-flash": "gemini-1.5-flash",
  "gemini-1.5-pro": "gemini-1.5-pro",
  // OpenAI models
  "gpt-5.4": "gpt-5.4",
  "gpt-5.4-mini": "gpt-5.4-mini",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  // Anthropic models
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-opus-4-7": "claude-opus-4-7",
  "claude-3-5-sonnet-20241022": "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022": "claude-3-5-haiku-20241022",
};

function getActualModelId(value: string, engine: CreativeEngine): string {
  if (MODEL_API_IDS[value]) return MODEL_API_IDS[value];
  // Fallback defaults per engine
  if (engine === "claude_3_5_sonnet") return "claude-sonnet-4-6";
  if (engine === "gpt_4o") return "gpt-5.4-mini";
  return "gemini-3-flash-preview";
}

type GenerateScriptBody = {
  engine?: CreativeEngine;
  topic?: string;
  executiveSummary?: string;
  keyContext?: string;
  selectedAngle?: string;
  hookType?: string;
  storyStructure?: string;
  emotion?: string;
  intensity?: string | number;
  hookTitle?: string;
  hookTeaser?: string;
  styleTitle?: string;
  styleTeaser?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  anthropicApiKey?: string;
  videoLength?: string | number;
  // New Remix Parameters
  language?: string;
  targetAudience?: string;
  videoGoal?: string;
  emotionIntensity?: string | number;
  transcript?: string;
  remixAttribute?: string;
  hookStyle?: string;
  structureName?: string;
  structureSteps?: string;
  gameMode?: string;
  packagingLens?: string;
  contentFormat?: string;
  /** Injected when a client profile is selected in Script Studio */
  scriptMasterGuide?: string;
  tonePersona?: string;
  niche?: string;
  avoidTopics?: string;
  preferredTopics?: string;
  ctaStyle?: string;
  vocabularyLevel?: string;
  customInstructions?: string;
};

function parseEngine(value: unknown): CreativeEngine {
  if (typeof value === "string") {
    if (value === "claude_3_5_sonnet" || value.startsWith("claude")) return "claude_3_5_sonnet";
    if (value === "gemini_1_5_pro" || value.startsWith("gemini")) return "gemini_1_5_pro";
    if (value === "gpt_4o" || value.startsWith("gpt")) return "gpt_4o";
  }
  return "gemini_1_5_pro";
}

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function pacingBlock(body: GenerateScriptBody): { targetSeconds: number; minWordCount: number; maxWordCount: number; gameModeInstruction: string } {
  const videoLength = toStringSafe(String(body.videoLength || "30"), "30");
  const targetSeconds = parseInt(videoLength, 10) || 30;
  const maxWordCount = Math.floor(targetSeconds * 2.5);
  const minWordCount = Math.floor(targetSeconds * 2.0);
  const gameModeInstruction = getGameModePrompt(body.gameMode, "script");
  return { targetSeconds, minWordCount, maxWordCount, gameModeInstruction };
}

function clientAppendixFromBody(body: GenerateScriptBody): string {
  return buildClientVoiceAppendix({
    scriptMasterGuide: body.scriptMasterGuide,
    customInstructions: body.customInstructions,
    tonePersona: body.tonePersona,
    niche: body.niche,
    targetAudience: body.targetAudience,
    language: body.language,
    avoidTopics: body.avoidTopics,
    preferredTopics: body.preferredTopics,
    ctaStyle: body.ctaStyle,
    vocabularyLevel: body.vocabularyLevel,
  });
}

function isRemixBody(body: GenerateScriptBody): boolean {
  return Boolean(toStringSafe(body.remixAttribute) && toStringSafe(body.transcript));
}

function buildRemixPrompt(body: GenerateScriptBody): string {
  const language = toStringSafe(body.language, "English");
  const targetAudience = toStringSafe(body.targetAudience, "a general viral audience");
  const videoGoal = toStringSafe(body.videoGoal, "Views (Broad Appeal)");
  const emotion = toStringSafe(body.emotion, "Engaging");
  const emotionIntensity = toStringSafe(String(body.emotionIntensity || body.intensity || "5"), "5");
  const transcript = toStringSafe(body.transcript, "");
  const remixAttribute = toStringSafe(body.remixAttribute, "Hook");
  const hookStyle = toStringSafe(body.hookStyle || body.hookType || body.hookTitle, "Curiosity Gap");
  const structureName = toStringSafe(body.structureName || body.storyStructure || body.styleTitle, "Problem Solver");
  const structureSteps = toStringSafe(body.structureSteps, "Hook -> Problem -> Agitation -> Solution -> CTA");
  const { targetSeconds, minWordCount, maxWordCount, gameModeInstruction } = pacingBlock(body);
  const holdTwist = buildHoldTwistPromptBlock({ twistBucket: remixAttribute, videoGoal });
  const clientBlock = clientAppendixFromBody(body);

  return `You are an elite short-form video scriptwriter. Your job is to remix an existing transcript into a highly viral, new script.
${gameModeInstruction}
${clientBlock}
${holdTwist}

CRITICAL PACING CONSTRAINT:
The user has requested a ${targetSeconds}-second video.
To match a dynamic, fast-paced speaking style, your script MUST be between ${minWordCount} and ${maxWordCount} words in total length.
Rules:
1. DO NOT exceed ${maxWordCount} words under any circumstances.
2. Cut all fluff. Every single word must earn its place.
3. Count your words before returning the final output to ensure it fits the ${targetSeconds}s timeframe.

CRITICAL INSTRUCTIONS:
- LANGUAGE: Write the entire script strictly in ${language}. Translate the source if necessary.
- GOAL/AUDIENCE: Optimize this script for ${videoGoal}. The target audience is '${targetAudience}'.
- VIBE: Inject the emotion of '${emotion}' at an intensity level of ${emotionIntensity}/10.

CRITICAL LAWS YOU MUST OBEY:
1. STRICT LANGUAGE ENFORCEMENT: The final script MUST be written entirely in ${language}.
2. NO VISUAL CUES: DO NOT write camera directions, subtitle notes, text pop-ups, B-roll instructions, or cover cards. Output ONLY the spoken words and the structural headers.
3. EXACT LENGTH: Spoken text MUST be between ${minWordCount} and ${maxWordCount} words. Do NOT exceed ${maxWordCount} words.

SOURCE TRANSCRIPT:
"""
${transcript}
"""

REQUIRED STORY STRUCTURE:
You must follow the "${structureName}" framework.
The steps are: ${structureSteps}

REQUIRED HOOK STYLE (for the twisted hook layer when Hook is the twist bucket; otherwise align opening energy with this style):
${hookStyle}

FORMATTING INSTRUCTIONS:
You must format the output by explicitly naming the structure steps in brackets on their own lines. Do not use bolding for the headers.
Example format:
[Hook]
The spoken words go here.

[Subject Intro]
The spoken words go here.

(Write the script now, strictly adhering to the structure above):`;
}

function buildScratchPrompt(body: GenerateScriptBody): string {
  const language = toStringSafe(body.language, "English");
  const targetAudience = toStringSafe(body.targetAudience, "a general viral audience");
  const videoGoal = toStringSafe(body.videoGoal, "Views (Broad Appeal)");
  const emotion = toStringSafe(body.emotion, "Engaging");
  const emotionIntensity = toStringSafe(String(body.emotionIntensity || body.intensity || "5"), "5");
  const topic = toStringSafe(body.topic, "A compelling short-form video topic");
  const exec = toStringSafe(body.executiveSummary, "");
  const keyCtx = toStringSafe(body.keyContext, "");
  const research = [exec, keyCtx].filter(Boolean).join("\n\n");
  const hookStyle = toStringSafe(body.hookType || body.hookTitle || body.hookStyle, "Strong scroll-stopping hook");
  const structureName = toStringSafe(body.storyStructure || body.structureName || body.styleTitle, "Problem Solver");
  const structureSteps = toStringSafe(body.structureSteps || body.styleTeaser, "Hook -> Problem -> Explanation -> Steps -> Close -> CTA");
  const angle = toStringSafe(body.selectedAngle, "");
  const packaging = toStringSafe(body.packagingLens, "");
  const { targetSeconds, minWordCount, maxWordCount, gameModeInstruction } = pacingBlock(body);
  const clientBlock = clientAppendixFromBody(body);

  return `You are an elite short-form video scriptwriter. Write an original viral-ready script from the brief below.
${gameModeInstruction}
${clientBlock}

${SCRATCH_SCRIPT_ANATOMY_BLOCK}

CRITICAL PACING CONSTRAINT:
Target a ${targetSeconds}-second video. The script MUST be between ${minWordCount} and ${maxWordCount} spoken words.
Do NOT exceed ${maxWordCount} words.

TOPIC:
${topic}

RESEARCH / CONTEXT:
${research || "(Use topic only; keep claims defensible.)"}

${angle ? `ANGLE / POSITIONING:\n${angle}\n` : ""}${packaging ? `PACKAGING LENS:\n${packaging}\n` : ""}
GOAL: ${videoGoal}
AUDIENCE: ${targetAudience}
LANGUAGE (entire script): ${language}
EMOTION: ${emotion} at intensity ${emotionIntensity}/10

HOOK STYLE TO LEAN INTO: ${hookStyle}

STORY STRUCTURE: ${structureName}
BEATS: ${structureSteps}

RULES:
- NO camera directions, B-roll notes, or subtitle instructions — spoken words + bracket section headers only.
- Use bracket headers that match the structure beats (e.g. [Hook], [Problem], …, [CTA]).
- One primary CTA only.

Write the full script now:`;
}

function buildPrompt(body: GenerateScriptBody): string {
  return isRemixBody(body) ? buildRemixPrompt(body) : buildScratchPrompt(body);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as GenerateScriptBody;
    const engine = parseEngine(body.engine);

    const dbSettings = await getSettings(session.user.id);
    const openaiApiKey =
      toStringSafe(body.openaiApiKey) || toStringSafe(request.headers.get("x-openai-key")) || dbSettings.openaiApiKey;
    const geminiApiKey =
      toStringSafe(body.geminiApiKey) || toStringSafe(request.headers.get("x-gemini-key")) || dbSettings.geminiApiKey;
    const anthropicApiKey =
      toStringSafe(body.anthropicApiKey) || toStringSafe(request.headers.get("x-anthropic-key")) || dbSettings.anthropicApiKey;

    if (engine === "claude_3_5_sonnet" && !anthropicApiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }

    if (engine === "gpt_4o" && !openaiApiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }

    if (engine === "gemini_1_5_pro" && !geminiApiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }

    const prompt = buildPrompt(body);
    const engineStr = toStringSafe(body.engine as unknown as string, "gemini-3-flash-preview");
    const actualModelId = getActualModelId(engineStr, engine);

    let script = "";
    let model = "";

    if (engine === "claude_3_5_sonnet") {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const result = await anthropic.messages.create({
        model: actualModelId,
        max_tokens: 800,
        temperature: 0.6,
        system: "You are an expert Hollywood scriptwriter and social media strategist. " +
          "Your goal is to write a highly engaging, viral-ready script based on the provided topic, research, and structure. " +
          "STRICT FORMATTING RULES:\n" +
          "1. Use exactly TWO line breaks (\\n\\n) between every section.\n" +
          "2. Every script MUST start with [HOOK], followed by [BODY], and end with [CTA].\n" +
          "3. No bolding (**), no bullet points, no directional cues like (Smiling) or [Camera Zoom].\n" +
          "4. Return ONLY the script text using these segment tags.",
        messages: [{ role: "user", content: prompt }],
      });

      script = result.content
        .filter((item) => item.type === "text")
        .map((item) => (item.type === "text" ? item.text : ""))
        .join("\n")
        .trim();
      model = actualModelId;
    } else if (engine === "gemini_1_5_pro") {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const gemini = genAI.getGenerativeModel({ model: actualModelId });
      const result = await gemini.generateContent(prompt);
      script = result.response.text().trim();
      model = actualModelId;
    } else {
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const result = await openai.chat.completions.create({
        model: actualModelId,
        temperature: 0.6,
        messages: [
          { role: "system", content: "You are a world-class short-form script writer." },
          { role: "user", content: prompt },
        ],
      });

      script = result.choices[0]?.message?.content?.trim() ?? "";
      model = actualModelId;
    }

    if (!script) {
      return NextResponse.json({ error: "Script generation returned empty text" }, { status: 502 });
    }

    return NextResponse.json(
      {
        script,
        engine,
        model,
        generatedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[generate-script] Error:", message);
    return NextResponse.json(
      { error: message || "Unexpected script generation error" },
      { status: 500 },
    );
  }
}
