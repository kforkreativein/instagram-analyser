import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { STORY_STRUCTURES } from "@/lib/story-structures";

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
    packagingLens = "",
    hook = "",
    clientProfile = "",
    provider: reqProvider,
    apiKey: reqApiKey,
    model: reqModel,
  } = body;

  if (!topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const provider = reqProvider ?? dbSettings.activeProvider ?? "Gemini";
  const apiKey = reqApiKey ?? dbSettings.geminiApiKey ?? dbSettings.openaiApiKey ?? dbSettings.anthropicApiKey ?? "";
  const model = reqModel ?? "";

  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });

  const structureList = STORY_STRUCTURES.map((s) => `- ${s.id}: ${s.name} (${s.slots.length} slots)`).join("\n");

  const prompt = `You are a viral scriptwriting coach. Recommend the top 3 story structures for this content idea.

TOPIC: ${topic}
PACKAGING LENS: ${packagingLens}
OPENING HOOK: ${hook}
CLIENT PROFILE: ${clientProfile}

AVAILABLE STRUCTURES:
${structureList}

For each of the top 3 structures, provide:
- structureId: (from the list above)
- fitScore: (0-100)
- reason: (1-2 sentences why this structure fits the topic+lens combination)
- slotFills: an object where each key is the slot name and value is a 1-sentence draft fill for that slot, based on the topic

Return ONLY a valid JSON array. No markdown fences.
[{ "structureId": string, "fitScore": number, "reason": string, "slotFills": { [slotName]: string } }]`;

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
    const recommendations = JSON.parse(cleaned);

    const enriched = recommendations.map((r: { structureId: string; fitScore: number; reason: string; slotFills: Record<string, string> }) => {
      const meta = STORY_STRUCTURES.find((s) => s.id === r.structureId) ?? STORY_STRUCTURES[0];
      return { ...r, name: meta.name, slots: meta.slots };
    });

    return NextResponse.json({ recommendations: enriched, allStructures: STORY_STRUCTURES });
  } catch (err) {
    console.error("Structure recommend error:", err);
    return NextResponse.json({ error: "Failed to recommend structures" }, { status: 500 });
  }
}
