import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();
  const {
    videoAnalysis = {},
    metrics = {},
    videoUrl = "",
    clientNiche = "",
    gameMode = "awareness",
    geminiApiKey: bodyGemini,
    openaiApiKey: bodyOpenai,
    anthropicApiKey: bodyAnthropic,
    activeProvider: bodyProvider,
  } = body;

  const providerRaw =
    (typeof bodyProvider === "string" && bodyProvider.trim()) || dbSettings.activeProvider || "Gemini";
  const pl = providerRaw.trim().toLowerCase();
  const provider = pl === "openai" ? "OpenAI" : pl === "anthropic" ? "Anthropic" : "Gemini";
  let apiKey = "";
  if (provider === "OpenAI") {
    apiKey =
      (typeof bodyOpenai === "string" && bodyOpenai.trim()) || dbSettings.openaiApiKey || "";
  } else if (provider === "Anthropic") {
    apiKey =
      (typeof bodyAnthropic === "string" && bodyAnthropic.trim()) || dbSettings.anthropicApiKey || "";
  } else {
    apiKey =
      (typeof bodyGemini === "string" && bodyGemini.trim()) || dbSettings.geminiApiKey || "";
  }
  if (!apiKey) {
    apiKey =
      dbSettings.geminiApiKey || dbSettings.openaiApiKey || dbSettings.anthropicApiKey || "";
  }

  if (!apiKey) return NextResponse.json({ error: "API key required in Settings" }, { status: 401 });

  const metricsStr = Object.entries(metrics)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const analysisStr = JSON.stringify(videoAnalysis, null, 2).slice(0, 2000);

  const prompt = `You are an Instagram content analyst. A video has been identified as a "True Winner" by Signal Score (a composite of comments×5 + shares×4 + saves×3 + likes×2 + views×0.1).

GAME MODE: ${gameMode === "conversion" ? "CONVERSION (narrow TAM, tactical solve, buyer intent)" : "AWARENESS (broad TAM, entertainment, mass reach)"}
CLIENT NICHE: ${clientNiche}
VIDEO URL: ${videoUrl}
METRICS: ${metricsStr || "not available"}

VIDEO ANALYSIS DATA:
${analysisStr}

Dissect this winning video across exactly 4 layers. Be specific and actionable — each answer must be 1–2 sentences.

Return ONLY a JSON object (no markdown):
{
  "topic": "What specific topic angle made this work for this audience",
  "packaging": "What packaging/framing lens was used (Comparison, Tutorial, Contrarian, Case Study, etc.) and why it worked",
  "contentStyle": "What format and editing style (pacing, text overlays, talking head vs B-roll, etc.)",
  "emotionalTrigger": "What emotional mechanism drove shares/saves/comments (curiosity, fear, pride, anger, aspiration, etc.)",
  "verdict": "One actionable sentence: the swing factor the creator should double down on"
}`;

  try {
    let text = "";
    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      text = res.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const res = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      text = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const res = await model.generateContent(prompt);
      text = res.response.text().trim();
    }

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    const slice = first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;
    const result = JSON.parse(slice);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Signal breakdown error:", err);
    return NextResponse.json({ error: "Failed to generate breakdown" }, { status: 500 });
  }
}
