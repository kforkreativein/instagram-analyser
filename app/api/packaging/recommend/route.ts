import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getGameModePrompt } from "@/lib/game-mode";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LENSES = [
  "Comparison",
  "Contrarian",
  "Challenge",
  "Breakdown",
  "POV",
  "Case Study",
  "Transformation",
  "Myth Bust",
  "Tutorial",
  "Listicle",
];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();
  const {
    topic,
    executiveSummary = "",
    keyContext = "",
    clientProfile = "",
    provider: reqProvider,
    apiKey: reqApiKey,
    model: reqModel,
    gameMode,
  } = body;

  if (!topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const provider = reqProvider ?? dbSettings.activeProvider ?? "Gemini";
  const apiKey = reqApiKey ?? dbSettings.geminiApiKey ?? dbSettings.openaiApiKey ?? dbSettings.anthropicApiKey ?? "";
  const model = reqModel ?? "";

  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });

  const gameModeInstruction = getGameModePrompt(gameMode, "packaging");

  const prompt = `You are a top-tier content packaging strategist. "Packaging" is the lens that wraps an idea — it must be chosen BEFORE writing hooks or scripts because it dictates which hooks and structures fit.
${gameModeInstruction}

TOPIC: ${topic}
EXECUTIVE SUMMARY: ${executiveSummary}
KEY CONTEXT: ${keyContext}
CLIENT PROFILE: ${clientProfile}

The 10 packaging lenses are:
${LENSES.map((l, i) => `${i + 1}. ${l}`).join("\n")}

Rank ALL 10 lenses for this specific topic+client. For each, provide:
- lens: (name from the list)
- fitScore: (0-100) how well this lens fits the topic and client
- reason: (1-2 sentences why this lens works or doesn't)
- bestHookFormat: (which of the 6 hook formats pairs best: Fortune Teller, Experimenter, Teacher, Magician, Investigator, Contrarian)
- microSkeleton: (array of 5-6 strings — the rough script outline for this lens applied to the topic)

Return ONLY a valid JSON array sorted by fitScore descending. No markdown fences.
[{ "lens": string, "fitScore": number, "reason": string, "bestHookFormat": string, "microSkeleton": string[] }]`;

  let generatedText = "";
  try {
    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = res.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const res = await anthropic.messages.create({
        model: model || "claude-3-5-haiku-20241022",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: model || "gemini-2.0-flash-exp" });
      const res = await geminiModel.generateContent(prompt);
      generatedText = res.response.text().trim();
    }

    const cleaned = generatedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const lenses = JSON.parse(cleaned);
    return NextResponse.json({ lenses });
  } catch (err) {
    console.error("Packaging recommend error:", err);
    return NextResponse.json({ error: "Failed to recommend packaging lenses" }, { status: 500 });
  }
}
