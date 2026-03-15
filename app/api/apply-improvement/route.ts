import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "../../../lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { script, instruction, geminiApiKey } = body;

    const settings = getSettings();
    const apiKey = geminiApiKey || settings.geminiApiKey || process.env.GEMINI_API_KEY;

    if (!script || !instruction) {
      return NextResponse.json({ error: "Missing script or instruction" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const selectedModel = settings?.activeModel || "gemini-3-flash-preview";
    const model = genAI.getGenerativeModel({ model: selectedModel });

    const prompt = `You are a Retention Engineer. Apply the following specific improvement to this script. Make ONLY the targeted change described — do not rewrite anything else. Keep the language, tone, and structure identical to the original.

Improvement to apply: ${instruction}

Script:
${script}

Return ONLY the updated script. No commentary, no markdown, no extra text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const newScript = response.text().trim();

    return NextResponse.json({ newScript });
  } catch (error: any) {
    console.error("Apply Improvement Error:", error);
    return NextResponse.json({ error: error.message || "Apply failed" }, { status: 500 });
  }
}
