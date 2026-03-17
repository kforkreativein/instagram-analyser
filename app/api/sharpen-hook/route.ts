import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSettings } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const scriptText = body.scriptContent || body.script || body.text;
    if (!scriptText) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const settings = await getSettings(session.user.id);
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) return NextResponse.json({ error: "No API Key found" }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `You are an expert scriptwriter. Rewrite ONLY the very first sentence (the Hook) of this script to make it incredibly punchy, curious, and viral. Keep the rest of the script exactly the same. Output ONLY the raw updated script text. Do not add markdown or conversational filler.\n\nScript:\n${scriptText}`;
    
    const result = await model.generateContent(prompt);
    // Ensure the return key matches what the frontend expects
    return NextResponse.json({ updatedScript: result.response.text().replace(/```/g, '').trim() });
  } catch (error) {
    console.error("Sharpen Hook Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
  }
}
