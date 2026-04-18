export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { buildStoryLocksPrompt } from "@/lib/viral-prompts";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

function parseJson(raw: string) {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON object found");
  return JSON.parse(cleaned.slice(first, last + 1));
}

function resolveGeminiModelId(requested: string): string {
  const m = (requested || "").trim().toLowerCase();
  if (!m || m.startsWith("gpt") || m.startsWith("claude")) return "gemini-2.0-flash";
  if (!m.includes("gemini")) return "gemini-2.0-flash";
  if (m.includes("flash-exp") || m === "gemini-2.0-flash-exp") return "gemini-2.0-flash";
  return requested.trim() || "gemini-2.0-flash";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();

  const {
    script,
    clientProfile: rawClientProfile,
    provider: reqProvider,
    apiKey: reqApiKey,
    model: reqModel,
  } = body;
  const clientProfile =
    typeof rawClientProfile === "string"
      ? rawClientProfile
      : rawClientProfile != null
      ? JSON.stringify(rawClientProfile)
      : "";

  if (!script?.trim()) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }

  const provider = reqProvider ?? dbSettings.activeProvider ?? "Gemini";
  const apiKey =
    (typeof reqApiKey === "string" && reqApiKey.trim()
      ? reqApiKey.trim()
      : undefined) ??
    (provider === "OpenAI"
      ? dbSettings.openaiApiKey
      : provider === "Anthropic"
      ? dbSettings.anthropicApiKey
      : dbSettings.geminiApiKey) ??
    "";
  const model = typeof reqModel === "string" ? reqModel.trim() : "";

  if (!apiKey) {
    return NextResponse.json({ error: "API key required — add it in Settings" }, { status: 401 });
  }

  const prompt = buildStoryLocksPrompt({ script, clientProfile });

  let generatedText = "";
  try {
    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });
      generatedText = res.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const res = await anthropic.messages.create({
        model: model || "claude-3-5-haiku-20241022",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModelId = resolveGeminiModelId(model);
      const geminiModel = genAI.getGenerativeModel({
        model: geminiModelId,
        generationConfig: { responseMimeType: "application/json" },
      });
      const res = await geminiModel.generateContent(prompt);
      generatedText = res.response.text().trim();
    }

    const data = parseJson(generatedText);
    return NextResponse.json(data);
  } catch (err) {
    console.error("story-locks error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg.includes("JSON") ? `Story locks parse error: ${msg}` : msg },
      { status: 500 }
    );
  }
}
