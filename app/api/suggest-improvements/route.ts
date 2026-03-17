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
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are a master Creative Director analyzing a short-form video script. 
    Provide 3 high-impact '1% improvements'. You MUST include one Audio/SFX suggestion, one Visual/B-Roll suggestion, and one Hook/Pacing suggestion.
    
    CRITICAL INSTRUCTION: You MUST return ONLY a raw, valid JSON array. Do not include markdown formatting, code blocks, or conversational text.
    
    Schema Required:
    [
      { "title": "Accelerate Payoff", "description": "Specific edit suggestion...", "type": "Visual" },
      { "title": "...", "description": "...", "type": "Audio" },
      { "title": "...", "description": "...", "type": "Hook" }
    ]
    
    Script:
    ${scriptText}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const suggestions = JSON.parse(responseText);

    return NextResponse.json({ suggestions });

  } catch (error) {
    console.error("Suggest Improvements API Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to parse suggestions" }, { status: 500 });
  }
}
