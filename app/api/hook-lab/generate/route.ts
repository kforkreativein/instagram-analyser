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
    targetLanguage = "English",
    count = 12,
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

  const gameModeInstruction = getGameModePrompt(gameMode, "hook");

  const prompt = `You are a world-class viral hook strategist. Generate ${count} distinct hook variants for the following content idea.
${gameModeInstruction}

TOPIC: ${topic}
EXECUTIVE SUMMARY: ${executiveSummary}
KEY CONTEXT: ${keyContext}
CLIENT PROFILE: ${clientProfile}
TARGET LANGUAGE: ${targetLanguage}

For each hook, use one of these 6 Hook FORMATS:
- Fortune Teller: Predict how the future will change based on the topic.
- Experimenter: Show results of an experiment or test (Mr. Beast style).
- Teacher: Share lessons/learnings from your own experience.
- Magician: Visual disruption/stun gun - stops scroll with unexpected visual.
- Investigator: Expose a hidden secret or finding nobody else knows.
- Contrarian: Directly challenge a widely-held belief.

And one of these 7 Hook ANGLES:
- Negative Spin: Frame the topic with negativity/contrast.
- Positive Spin: Highlight the ultimate dream result.
- Targeted Question: Agitate a specific pain point as a direct question.
- Personal Experience: Use storytelling vulnerability.
- Call-Out: Directly address target audience and their specific problem.
- How-To Process: Promise a direct actionable solution or process.
- Social Proof: Draft off credibility of a result/famous person.

Each hook must have the Trifecta (all 3 layers):
1. VERBAL (spoken): The punchy line actually said out loud.
2. VISUAL: Clear change or movement in first 1 second (camera move, cut, action).
3. TEXT: On-screen caption that reinforces the promise without repeating verbatim.

TRIGGER must be one of: curiosity, contrarian, desire, blueball, FOMO, social_proof.

SCORING:
- stopRateScore (0-100): How likely is this to stop scroll in the first 3 seconds.
- retentionFitScore (0-100): How well does this hook set up sustained retention.

Return ONLY a valid JSON array. No markdown fences. Each item:
{
  "format": string,
  "angle": string,
  "trigger": string,
  "verbal": string,
  "visual": string,
  "text": string,
  "specificityNote": string (one tip to add extreme specificity: numbers, names, outcomes),
  "stopRateScore": number,
  "retentionFitScore": number
}`;

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
    const hooks = JSON.parse(cleaned);
    return NextResponse.json({ hooks });
  } catch (err) {
    console.error("Hook lab generate error:", err);
    return NextResponse.json({ error: "Failed to generate hooks" }, { status: 500 });
  }
}
