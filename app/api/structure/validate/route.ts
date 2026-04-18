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
    script,
    structureId,
    provider: reqProvider,
    apiKey: reqApiKey,
    model: reqModel,
  } = body;

  if (!script || !structureId) return NextResponse.json({ error: "script and structureId required" }, { status: 400 });

  const structure = STORY_STRUCTURES.find((s) => s.id === structureId);
  if (!structure) return NextResponse.json({ error: "Unknown structure" }, { status: 400 });

  const provider = reqProvider ?? dbSettings.activeProvider ?? "Gemini";
  const apiKey = reqApiKey ?? dbSettings.geminiApiKey ?? dbSettings.openaiApiKey ?? dbSettings.anthropicApiKey ?? "";
  const model = reqModel ?? "";

  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });

  const prompt = `You are a script structure validator. Analyze the following script against the "${structure.name}" structure.

STRUCTURE SLOTS: ${structure.slots.join(" → ")}

SCRIPT:
${script}

For each slot, determine:
- present: true/false (is this slot represented in the script?)
- excerpt: (the script excerpt that corresponds to this slot, or "" if missing)
- suggestion: (if missing or weak, a 1-sentence rewrite suggestion)

Also provide an overall structureScore (0-100).

Return ONLY valid JSON:
{
  "structureScore": number,
  "slots": [{ "slot": string, "present": boolean, "excerpt": string, "suggestion": string }]
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
        max_tokens: 2048,
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
    return NextResponse.json({ ...result, structureName: structure.name, structureId });
  } catch (err) {
    console.error("Structure validate error:", err);
    return NextResponse.json({ error: "Failed to validate structure" }, { status: 500 });
  }
}
