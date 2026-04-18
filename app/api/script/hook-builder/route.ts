import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getGameModePrompt } from "@/lib/game-mode";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();
  const {
    topic,
    angle = "",
    clientProfile = "",
    gameMode = "awareness",
    provider: reqProvider,
    apiKey: reqApiKey,
    model: reqModel,
  } = body;

  if (!topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const pr = String(reqProvider ?? dbSettings.activeProvider ?? "Gemini").trim().toLowerCase();
  const provider = pr === "openai" ? "OpenAI" : pr === "anthropic" ? "Anthropic" : "Gemini";
  const apiKey = reqApiKey ?? dbSettings.geminiApiKey ?? dbSettings.openaiApiKey ?? dbSettings.anthropicApiKey ?? "";
  const model = reqModel ?? "";

  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });

  const gameModeNote = getGameModePrompt(gameMode, "hook");

  const prompt = `You are a world-class hook copywriter trained on the "Hookonomics Masterclass" and the "6 Power Words" framework.

TOPIC: ${topic}
ANGLE: ${angle || "Any strong angle"}
CLIENT PROFILE: ${clientProfile || "General creator"}
${gameModeNote}

The 6 Power Words anatomy every hook has:
- SUBJECT: Who or what the hook is about
- ACTION: The verb or dynamic element
- OBJECTIVE: The desired outcome or result
- CONTRAST: The surprising or polarising element
- PROOF (optional): Data point, credential, or social proof
- TIME (optional): Urgency, specificity of time frame

Generate exactly 5 hook variants. Each uses a DIFFERENT psychological mechanism:
1. Brain Hook — mechanism: Curiosity Gap (leave a question unanswered that demands the click)
2. Brain Hook — mechanism: Shock / Pattern Interrupt (violates expectation)
3. Social/Status Hook — mechanism: Identity Trigger (directly addresses who they are)
4. Social/Status Hook — mechanism: Social Proof / Polarising (challenges a majority belief)
5. Narrative Hook — mechanism: Data + Process (specific numbers + a promised method)

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "id": "h1",
    "category": "Brain Hook",
    "mechanism": "Curiosity Gap",
    "hook": "the full hook text as it would appear on screen",
    "anatomy": {
      "subject": "...",
      "action": "...",
      "objective": "...",
      "contrast": "...",
      "proof": "... or null",
      "time": "... or null"
    }
  }
]`;

  try {
    let text = "";
    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      text = res.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const res = await anthropic.messages.create({
        model: model || "claude-3-5-haiku-20241022",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      text = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: model || "gemini-2.0-flash" });
      const res = await geminiModel.generateContent(prompt);
      text = res.response.text().trim();
    }

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let variants: unknown;
    try {
      variants = JSON.parse(cleaned);
    } catch {
      const first = cleaned.indexOf("[");
      const last = cleaned.lastIndexOf("]");
      if (first >= 0 && last > first) {
        try {
          variants = JSON.parse(cleaned.slice(first, last + 1));
        } catch {
          return NextResponse.json({ error: "Invalid JSON from model" }, { status: 502 });
        }
      } else {
        return NextResponse.json({ error: "Invalid JSON from model" }, { status: 502 });
      }
    }
    return NextResponse.json({ variants });
  } catch (err) {
    console.error("Hook builder error:", err);
    return NextResponse.json({ error: "Failed to generate hooks" }, { status: 500 });
  }
}
