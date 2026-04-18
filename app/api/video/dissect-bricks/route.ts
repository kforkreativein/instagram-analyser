export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { buildDissectBricksPrompt } from "@/lib/viral-prompts";
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();

  const {
    mode = "from-transcript",
    caption = "",
    transcript = "",
    analysis,
    metrics,
    provider: reqProvider,
    apiKey: reqApiKey,
    model: reqModel,
  } = body;

  if (!caption?.trim() && !transcript?.trim()) {
    return NextResponse.json({ error: "caption or transcript is required" }, { status: 400 });
  }

  const provider = reqProvider ?? dbSettings.activeProvider ?? "Gemini";
  const apiKey =
    reqApiKey ??
    (provider === "OpenAI"
      ? dbSettings.openaiApiKey
      : provider === "Anthropic"
      ? dbSettings.anthropicApiKey
      : dbSettings.geminiApiKey) ??
    "";
  const model = reqModel ?? "";

  if (!apiKey) {
    return NextResponse.json({ error: "API key required — add it in Settings" }, { status: 401 });
  }

  const hookAnalysis = analysis
    ? `Type: ${analysis.hookAnalysis?.type || ""}. ${analysis.hookAnalysis?.description || ""}`
    : "";
  const structureAnalysis = analysis
    ? `Type: ${analysis.structureAnalysis?.type || ""}. ${analysis.structureAnalysis?.description || ""}`
    : "";
  const styleAnalysis = analysis
    ? JSON.stringify(analysis.styleAnalysis || {})
    : "";
  const breakdownSummary = analysis
    ? `${analysis.summary?.coreIdea || ""} ${analysis.summary?.whyItWorked || ""}`
    : "";

  const prompt = buildDissectBricksPrompt({
    mode,
    caption,
    transcript,
    hookAnalysis,
    structureAnalysis,
    styleAnalysis,
    breakdownSummary,
    metrics,
  });

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
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({
        model: model || "gemini-2.0-flash-exp",
        generationConfig: { responseMimeType: "application/json" },
      });
      const res = await geminiModel.generateContent(prompt);
      generatedText = res.response.text().trim();
    }

    const data = parseJson(generatedText);
    return NextResponse.json(data);
  } catch (err) {
    console.error("dissect-bricks error:", err);
    return NextResponse.json(
      { error: "Failed to dissect bricks. Check your API key in Settings." },
      { status: 500 }
    );
  }
}
