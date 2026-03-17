import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const scriptText = body.scriptContent || body.script || body.text;
    if (!scriptText) return NextResponse.json({ error: "Missing script" }, { status: 400 });

    const settings = await getSettings(session.user.id);
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) return NextResponse.json({ error: "No API Key found" }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Analyze this script. Break it down into 3 to 5 key visual moments. For each moment, return ONLY a raw JSON array of objects with this exact structure:
    [
      { "scriptLine": "Exact quote from script", "imagePrompt": "Midjourney prompt details...", "videoPrompt": "Runway/Kling prompt details..." }
    ]
    Do not wrap the output in markdown code blocks. Output raw JSON only.
    Script: ${scriptText}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const prompts = JSON.parse(responseText);
    
    return NextResponse.json({ prompts });
  } catch (error) {
    console.error("Generate Prompts Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate prompts" }, { status: 500 });
  }
}
