import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSettings } from "../../../lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreativeEngine = "claude_3_5_sonnet" | "gpt_4o" | "gemini_1_5_pro";

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
};

function parseEngine(value: unknown): CreativeEngine {
  if (value === "claude_3_5_sonnet" || value === "gemini_1_5_pro") {
    return value;
  }

  return "gpt_4o";
}

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function buildPrompt(body: GenerateScriptBody): string {
  const language = toStringSafe(body.language, "English");
  const targetAudience = toStringSafe(body.targetAudience, "a general viral audience");
  const videoGoal = toStringSafe(body.videoGoal, "Broad Appeal");
  const emotion = toStringSafe(body.emotion, "Engaging");
  const emotionIntensity = toStringSafe(String(body.emotionIntensity || body.intensity || "5"), "5");
  const videoLength = toStringSafe(String(body.videoLength || "30"), "30");
  const transcript = toStringSafe(body.transcript, body.executiveSummary || "");
  const remixAttribute = toStringSafe(body.remixAttribute, "Idea");
  const hookStyle = toStringSafe(body.hookStyle || body.hookType || body.hookTitle, "Curiosity Gap");
  const structureName = toStringSafe(body.structureName || body.storyStructure || body.styleTitle, "Problem Solver");
  const structureSteps = toStringSafe(body.structureSteps, "Hook -> Problem -> Agitation -> Solution -> CTA");

  const wordCountTarget = Math.floor((parseInt(videoLength) || 30) * 2.5);

  return `You are an elite short-form video scriptwriter. Your job is to remix an existing transcript into a highly viral, new script.

CRITICAL INSTRUCTIONS:
- LANGUAGE: Write the entire script strictly in ${language}. Translate the source if necessary.
- GOAL/AUDIENCE: Optimize this script for ${videoGoal}. The target audience is '${targetAudience}'.
- VIBE: Inject the emotion of '${emotion}' at an intensity level of ${emotionIntensity}/10.
- LENGTH: The video is ${videoLength} seconds long. Keep the word count strictly around ${wordCountTarget} words.

CRITICAL LAWS YOU MUST OBEY:
1. STRICT LANGUAGE ENFORCEMENT: The final script MUST be written entirely in ${language}.
2. NO VISUAL CUES: DO NOT write camera directions, subtitle notes, text pop-ups, B-roll instructions, or cover cards. Output ONLY the spoken words and the structural headers.
3. EXACT LENGTH: Spoken text MUST be strictly around ${wordCountTarget} words.

SOURCE TRANSCRIPT:
"""
${transcript}
"""

REMIX DIRECTIVE (Hold 4, Tweak 1):
You must re-engineer this concept. The core attribute to radically change is: [${remixAttribute}]. Keep the other elements of the idea similar, but completely reinvent the ${remixAttribute}.

REQUIRED STORY STRUCTURE:
You must follow the "${structureName}" framework. 
The steps are: ${structureSteps}

REQUIRED HOOK STYLE:
Use this specific hook style to start the video: ${hookStyle}.

FORMATTING INSTRUCTIONS:
You must format the output by explicitly naming the structure steps in brackets on their own lines. Do not use bolding for the headers. 
Example format:
[Hook]
The spoken words go here.

[Subject Intro]
The spoken words go here.

(Write the script now, strictly adhering to the structure above):`;
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

    let script = "";
    let model = "";

    if (engine === "claude_3_5_sonnet") {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const result = await anthropic.messages.create({
        model: "claude-4.5-haiku",
        max_tokens: 800,
        temperature: 0.6,
        system:    "You are an expert Hollywood scriptwriter and social media strategist. " +
    "Your goal is to write a highly engaging, viral-ready script based on the provided topic, research, and structure. " +
    "STRICT FORMATING RULES:\n" +
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
      model = "claude-4.5-haiku";
    } else if (engine === "gemini_1_5_pro") {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const gemini = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
      const result = await gemini.generateContent(prompt);
      script = result.response.text().trim();
      model = "gemini-3-flash-preview";
    } else {
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const result = await openai.chat.completions.create({
        model: "gpt-5-mini-2025-08-07",
        temperature: 0.6,
        messages: [
          { role: "system", content: "You are a world-class short-form script writer." },
          { role: "user", content: prompt },
        ],
      });

      script = result.choices[0]?.message?.content?.trim() ?? "";
      model = "gpt-5-mini-2025-08-07";
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected script generation error" },
      { status: 500 },
    );
  }
}
