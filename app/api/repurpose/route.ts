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
    const platform = body.platform;

    if (!scriptText || !platform) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const settings = await getSettings(session.user.id);
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) return NextResponse.json({ error: "No API Key found" }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    
    const prompt = `Convert this video script into a highly engaging text post for ${platform}. Output raw text only. No markdown formatting. \n\nScript:\n${scriptText}`;
    
    const result = await model.generateContent(prompt);
    return NextResponse.json({ repurposedContent: result.response.text() });
  } catch (error: any) {
    console.error("Repurpose Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
  }
}
