import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
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
    script,
    language = "English",
    interval = 12,
    clientProfile = "",
    provider: reqProvider,
    apiKey: reqApiKey,
    model: reqModel,
  } = body;

  if (!script) return NextResponse.json({ error: "script is required" }, { status: 400 });

  const provider = reqProvider ?? dbSettings.activeProvider ?? "Gemini";
  const apiKey = reqApiKey ?? dbSettings.geminiApiKey ?? dbSettings.openaiApiKey ?? dbSettings.anthropicApiKey ?? "";
  const model = reqModel ?? "";

  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });

  const prompt = `You are a retention engineer. Analyze this video script and insert strategic Re-Hook lines to prevent viewer drop-off.

RULES:
- A re-hook is needed roughly every ${interval} seconds of speaking time (~${Math.round(interval * 2.5)} words per interval)
- Re-hooks must be inserted BETWEEN natural sentence breaks, not mid-sentence
- Never add a re-hook if one is already present or if it's the final CTA
- Language: ${language}

THE 4 RE-HOOK TYPES (choose the one that fits best at each break point):
1. "Surprise Shift" — Introduce something completely unexpected: "But here's what shocked me..."
2. "Common Mistake" — Call out what most people get wrong: "Most people mess this up without even realizing it..."
3. "Uncomfortable Truth" — Reveal hidden knowledge: "What no one tells you is..."
4. "Held Back Solution" — Withhold a critical step: "But even with the best X, your video will still flop if you miss Y..."

CLIENT PROFILE: ${clientProfile}

SCRIPT:
${script}

Split the script into segments (at natural sentence boundaries, roughly every ${Math.round(interval * 2.5)} words). After each segment (except the last), add a re-hook suggestion.

Return ONLY valid JSON:
{
  "segments": [
    { "text": string, "wordCount": number, "rehookAfter": { "type": string, "line": string } | null }
  ]
}
The last segment's rehookAfter should be null.`;

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
        max_tokens: 3000,
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
    const result = JSON.parse(cleaned);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Rehook insert error:", err);
    return NextResponse.json({ error: "Failed to insert re-hooks" }, { status: 500 });
  }
}
