import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "Gemini" | "OpenAI" | "Anthropic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { script, provider = "Gemini", apiKey, model, language = "English", emotion = "" } = body;

    if (!script) {
      return NextResponse.json({ error: "Script is required for visual cues generation" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: `${provider} API key is required` }, { status: 401 });
    }

    const prompt = `You are an elite video director. Take this spoken script and generate the highly probable Visual Action (camera movements, B-roll, specific shot descriptions) and On-Screen Text that should accompany each segment.

SCRIPT:
${script}

STRICT INSTRUCTION: Return ONLY a strict JSON array of objects.
Format: [{"timestamp": "0:00", "line": "Exact text from script (or summarized)", "action": "Visual Action/Shot description", "text": "On-Screen text overlays"}]

ALIGNMENT RULE: For the FIRST 3 seconds of the video ONLY, you MUST format the output as a strict JSON object with these exact keys: "spokenHook", "visualAction", "onScreenText".

EDITOR BLUEPRINT RULE: Based on the selected Emotion Filter (${emotion}), generate 3 strict "Editor Instructions" (e.g., "No whoosh SFX", "Use fast cuts", "Keep text clean").

FINAL OUTPUT FORMAT: 
{
  "matrix": { "spokenHook": "...", "visualAction": "...", "onScreenText": "..." },
  "cues": [{"timestamp": "...", "line": "...", "action": "...", "text": "..."}],
  "editorInstructions": ["Instruction 1", "Instruction 2", "Instruction 3"],
  "packaging": { "titleText": "Viral Title Idea", "coverVisual": "Visual description for a scroll-stopping cover" }
}

The array should cover the script from start to finish. Language: ${language}.`;

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
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = (response.content[0] as any).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: model || "gemini-3-flash-preview" });
      const response = await geminiModel.generateContent(prompt);
      generatedText = response.response.text().trim();
    }

    // Clean up potential markdown code blocks
    const cleaned = generatedText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({ data: parsed });
    } catch {
      return NextResponse.json({ error: "Failed to parse visual cues JSON", raw: cleaned }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Visual cues generation failed" }, { status: 500 });
  }
}
