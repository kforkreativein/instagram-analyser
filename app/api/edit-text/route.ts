import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSettings } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EditEngine = "gpt_4o" | "gemini_1_5_pro" | "claude_3_5_sonnet";

type EditTextBody = {
  selectedText?: string;
  command?: string;
  beforeContext?: string;
  afterContext?: string;
  engine?: EditEngine;
  openaiApiKey?: string;
  geminiApiKey?: string;
  anthropicApiKey?: string;
};

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseEngine(value: unknown): EditEngine {
  if (value === "gemini_1_5_pro" || value === "claude_3_5_sonnet") {
    return value;
  }

  return "gpt_4o";
}

function buildEditPrompt(body: EditTextBody): string {
  const selectedText = toStringSafe(body.selectedText);
  const command = toStringSafe(body.command);
  const beforeContext = toStringSafe(body.beforeContext);
  const afterContext = toStringSafe(body.afterContext);

  return [
    "You are an expert line editor for short-form scripts.",
    "Rewrite ONLY the selected text based on the instruction.",
    "Keep style and continuity consistent with surrounding context.",
    "Do not add quotes, markdown, labels, or explanation.",
    "Return only the replacement text.",
    "",
    `Instruction: ${command}`,
    `Before context: ${beforeContext || "(none)"}`,
    `Selected text: ${selectedText}`,
    `After context: ${afterContext || "(none)"}`,
  ].join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as EditTextBody;
    const selectedText = toStringSafe(body.selectedText);
    const command = toStringSafe(body.command);

    if (!selectedText) {
      return NextResponse.json({ error: "selectedText is required" }, { status: 400 });
    }
    if (!command) {
      return NextResponse.json({ error: "command is required" }, { status: 400 });
    }

    const engine = parseEngine(body.engine);
    const dbSettings = getSettings();
    const openaiApiKey =
      toStringSafe(body.openaiApiKey) || toStringSafe(request.headers.get("x-openai-key")) || dbSettings.openaiApiKey;
    const geminiApiKey =
      toStringSafe(body.geminiApiKey) || toStringSafe(request.headers.get("x-gemini-key")) || dbSettings.geminiApiKey;
    const anthropicApiKey =
      toStringSafe(body.anthropicApiKey) || toStringSafe(request.headers.get("x-anthropic-key")) || dbSettings.anthropicApiKey;

    if (engine === "gpt_4o" && !openaiApiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }
    if (engine === "gemini_1_5_pro" && !geminiApiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }
    if (engine === "claude_3_5_sonnet" && !anthropicApiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }

    const prompt = buildEditPrompt(body);
    let replacement = "";
    let model = "";

    if (engine === "claude_3_5_sonnet") {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const result = await anthropic.messages.create({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 400,
        temperature: 0.2,
        system: "You are a precise editor that rewrites only selected text.",
        messages: [{ role: "user", content: prompt }],
      });

      replacement = result.content
        .filter((item) => item.type === "text")
        .map((item) => (item.type === "text" ? item.text : ""))
        .join("\n")
        .trim();
      model = "claude-3-5-sonnet-latest";
    } else if (engine === "gemini_1_5_pro") {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const gemini = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await gemini.generateContent(prompt);
      replacement = result.response.text().trim();
      model = "gemini-1.5-pro";
    } else {
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const result = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [
          { role: "system", content: "You rewrite selected passages. Return only the replacement text." },
          { role: "user", content: prompt },
        ],
      });
      replacement = result.choices[0]?.message?.content?.trim() ?? "";
      model = "gpt-4o";
    }

    if (!replacement) {
      return NextResponse.json({ error: "Model returned empty replacement text" }, { status: 502 });
    }

    return NextResponse.json(
      {
        replacement,
        engine,
        model,
        editedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected inline edit error" },
      { status: 500 },
    );
  }
}
