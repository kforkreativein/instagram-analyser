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
  const topic = toStringSafe(body.topic, "Untitled topic");
  const executiveSummary = toStringSafe(body.executiveSummary, "No executive summary provided.");
  const keyContext = toStringSafe(body.keyContext, "No key context provided.");
  
  const selectedAngle = toStringSafe(body.selectedAngle, "");
  const hookType = toStringSafe(body.hookType || body.hookTitle, "Hook");
  const storyStructure = toStringSafe(body.storyStructure || body.styleTitle, "Style");
  const emotion = toStringSafe(body.emotion, "Engaging");
  const intensity = toStringSafe(String(body.intensity || ""), "5");

  return [
    "Write a compelling short-form video script in 90-120 words.",
    "Follow the 4 hook commandments: ALIGNMENT, SPEED TO VALUE, CLARITY, CURIOSITY GAP.",
    "Write with 1 topic / 1 takeaway.",
    "Tone: conversational, punchy, human, non-corny.",
    "Use one sentence per line, with blank lines between sentences.",
    "Add [VISUAL: description] cues every 2-3 lines.",
    "Include [PAUSE] markers for pacing.",
    "End with a strong CTA.",
    "",
    `Topic: ${topic}`,
    `Executive Summary: ${executiveSummary}`,
    `Key Context: ${keyContext}`,
    selectedAngle ? `Angle & Shock Score: ${selectedAngle}` : "",
    `Hook Framework: ${hookType}`,
    `Story Structure Outline: ${storyStructure}`,
    `Emotion Filter: ${emotion}`,
    `Emotion Intensity: ${intensity}/10`,
    "",
    "Return only the final script text.",
  ].filter(Boolean).join("\n");
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
        model: "claude-3-5-sonnet-latest",
        max_tokens: 800,
        temperature: 0.6,
        system: "You are a world-class short-form script writer.",
        messages: [{ role: "user", content: prompt }],
      });

      script = result.content
        .filter((item) => item.type === "text")
        .map((item) => (item.type === "text" ? item.text : ""))
        .join("\n")
        .trim();
      model = "claude-3-5-sonnet-latest";
    } else if (engine === "gemini_1_5_pro") {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const gemini = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await gemini.generateContent(prompt);
      script = result.response.text().trim();
      model = "gemini-1.5-pro";
    } else {
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const result = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.6,
        messages: [
          { role: "system", content: "You are a world-class short-form script writer." },
          { role: "user", content: prompt },
        ],
      });

      script = result.choices[0]?.message?.content?.trim() ?? "";
      model = "gpt-4o";
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
