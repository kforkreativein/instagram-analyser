import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "../../../lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { script, platform, language } = body;

    const dbSettings = await getSettings(session.user.id);
    const apiKey = dbSettings.geminiApiKey;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not found in Settings." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const systemPrompt = `You are an expert social media manager. 
Convert this video script into a highly engaging text post for ${platform}. 

PLATFORM GUIDELINES:
- If Twitter/X: Make it a concise thread with a high-impact hook and value-packed tweets.
- If LinkedIn: Use a professional but engaging hook with good spacing (Broetry format).
- If YouTube: Write a community tab post or SEO-optimized video description.

CRITICAL RULES:
- DO NOT output markdown code blocks.
- Output ONLY the raw text. No intro or outro filler.
- Language: ${language || 'English'}.

Script:
${script}`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const output = response.text().trim();

    return NextResponse.json({ result: output });
  } catch (error: any) {
    console.error("REPURPOSE API ERROR:", error);
    return NextResponse.json({ error: "Failed to repurpose content", details: error.message }, { status: 500 });
  }
}
