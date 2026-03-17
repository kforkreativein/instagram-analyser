import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { script, provider = "Gemini", apiKey, model } = body;

    if (!script) {
      return NextResponse.json({ error: "Script is required" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: `${provider} API key is required` }, { status: 401 });
    }

    const cleanTextForPacing = script.replace(/\[.*?\]/g, '').trim();

    const prompt = `You are a ruthless viral video editor analyzing a script for pacing and retention drops. You have two primary jobs:

1. THE 30-SECOND JUSTIFICATION RULE: Analyze the first 60 words (approx. the first 30 seconds). Does the script explicitly justify WHY the viewer clicked and validate their attention? If it wanders, tell a slow story, or delays the context, you must flag the intro as "FAILED: Fails 30-Second Rule" and return the exact strings to cut.
2. FLUFF REMOVAL: Scan the rest of the script. Identify any sentences that repeat information, introduce secondary/confusing ideas, or delay the primary payoff.

Return an array of exact substrings that must be deleted to achieve maximum velocity and a 1-idea, 1-takeaway structure.

SCRIPT:
"${cleanTextForPacing}"

STRICT INSTRUCTION: Return a JSON array of EXACT substrings from the script that should be cut. Do not include any other text or markdown fences.
Example: ["This is a repeated sentence.", "This part is fluff."]`;

    let generatedText = "";

    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: model || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = response.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: model || "claude-3-5-sonnet-latest",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = (response.content[0] as any).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: model || "gemini-2.0-flash" });
      const response = await geminiModel.generateContent(prompt);
      generatedText = response.response.text().trim();
    }

    const cleaned = generatedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      const highlights = JSON.parse(cleaned);
      return NextResponse.json({ highlights });
    } catch {
      return NextResponse.json({ error: "Failed to parse pacing analysis JSON", raw: cleaned }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pacing analysis failed" }, { status: 500 });
  }
}
