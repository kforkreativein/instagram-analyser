export const maxDuration = 30;
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSettings } from "../../../lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HUMANIZE_SYSTEM = `You are a humanization expert. Your job is to transform AI-generated or robotic-sounding scripts into natural, human-written content.

CORE RULES — apply every single one:
1. Eliminate rhetorical constructions like "Here's the truth no one talks about", "But here's the thing", "What if I told you"
2. Remove ALL em-dashes (—). Replace with periods, commas, or rewrite the sentence.
3. Ban these words completely: leverage, paradigm, game-changer, seamlessly, robust, in today's world, unlock, dive into, journey, transformative, cutting-edge, innovative, it's important to note, moreover, furthermore, delve
4. Vary sentence length naturally — mix short punchy lines with longer flowing ones
5. Use conversational language people actually speak out loud
6. Add realistic hesitations when appropriate: "I think", "honestly", "basically", "kind of"
7. Avoid perfectly balanced arguments — let some thoughts be more emphatic than others
8. Keep ALL section headers like [HOOK], [BODY], [CTA] exactly as they are
9. Preserve the word count within ±10% of the original
10. Output ONLY the humanized script with no commentary, no explanations, no preamble.`;

function detectProvider(model: string): "gemini" | "openai" | "claude" {
  if (model.startsWith("claude")) return "claude";
  if (model.startsWith("gpt")) return "openai";
  return "gemini";
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as { script: string; model?: string };
    const { script, model = "gemini-3-flash-preview" } = body;

    if (!script?.trim()) {
      return NextResponse.json({ error: "No script provided" }, { status: 400 });
    }

    const dbSettings = await getSettings(session.user.id);
    const provider = detectProvider(model);
    const prompt = `Humanize this script while keeping all section headers and structure intact:\n\n${script}`;

    let humanized = "";

    if (provider === "claude") {
      if (!dbSettings.anthropicApiKey) {
        return NextResponse.json({ error: "Anthropic API key not found in Settings" }, { status: 400 });
      }
      const anthropic = new Anthropic({ apiKey: dbSettings.anthropicApiKey });
      const result = await anthropic.messages.create({
        model,
        max_tokens: 1200,
        temperature: 0.7,
        system: HUMANIZE_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      humanized = result.content.filter(c => c.type === "text").map(c => c.type === "text" ? c.text : "").join("").trim();
    } else if (provider === "openai") {
      if (!dbSettings.openaiApiKey) {
        return NextResponse.json({ error: "OpenAI API key not found in Settings" }, { status: 400 });
      }
      const openai = new OpenAI({ apiKey: dbSettings.openaiApiKey });
      const result = await openai.chat.completions.create({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: HUMANIZE_SYSTEM },
          { role: "user", content: prompt },
        ],
      });
      humanized = result.choices[0]?.message?.content?.trim() ?? "";
    } else {
      if (!dbSettings.geminiApiKey) {
        return NextResponse.json({ error: "Gemini API key not found in Settings" }, { status: 400 });
      }
      const genAI = new GoogleGenerativeAI(dbSettings.geminiApiKey);
      const gemini = genAI.getGenerativeModel({
        model,
        systemInstruction: HUMANIZE_SYSTEM,
      });
      const result = await gemini.generateContent(prompt);
      humanized = result.response.text().trim();
    }

    if (!humanized) {
      return NextResponse.json({ error: "Humanization returned empty text" }, { status: 502 });
    }

    return NextResponse.json({ humanized }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[humanize] Error:", message);
    return NextResponse.json({ error: message || "Humanization failed" }, { status: 500 });
  }
}
