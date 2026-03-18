export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, angle, hookType, provider = "Gemini", apiKey, model } = body;

    if (!topic || !hookType) {
      return NextResponse.json({ error: "Topic and hookType are required" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: `${provider} API key is required` }, { status: 401 });
    }

    const prompt = `You are a viral content strategist. Grade the "Curiosity Gap" of this hook on a scale of 1-10. 

CONTEXT:
Topic: ${topic}
Angle: ${JSON.stringify(angle)}
Hook Framework: ${hookType}

${hookType === "THE VIRAL STACK" ? `
IF HOOK TYPE IS "THE VIRAL STACK":
You must generate a highly compressed, 3-part sequence that occurs within the first 5 seconds of spoken audio. 
You must sequence these exact psychological triggers in order:
1. PATTERN INTERRUPT: Open with a jarring, unexpected statement that breaks normal scrolling rhythms.
2. PERSONAL STAKES: Immediately tie the pattern interrupt to the viewer's personal life, ego, or wallet (what do they stand to lose or gain?).
3. CURIOSITY GAP: Open a knowledge loop that makes it psychologically painful for them to scroll away without hearing the answer.
` : ""}

STRICT INSTRUCTION: Return ONLY a valid JSON object.
Format: { "score": number, "hook": "The best implementation of this hook type", "suggestions": ["Alternative Hook 1", "Alternative Hook 2", "Alternative Hook 3"] }

The score should be based on how much it forces the viewer to keep watching. Suggestions should be elite, high-curiosity alternatives.`;

    let generatedText = "";

    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: model || "gpt-5-mini-2025-08-07",
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = response.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: model || "claude-4.5-haiku",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = (response.content[0] as any).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: model || "gemini-3-flash-preview" });
      const response = await geminiModel.generateContent(prompt);
      generatedText = response.response.text().trim();
    }

    const cleaned = generatedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      const data = JSON.parse(cleaned);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ error: "Failed to parse hook rating JSON", raw: cleaned }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Hook rating failed" }, { status: 500 });
  }
}
