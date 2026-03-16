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
    const { script } = body;

    const dbSettings = await getSettings(session.user.id);
    const apiKey = dbSettings.geminiApiKey;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not found in Settings." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const systemPrompt = `You are a master Creative Director and Retention Engineer. Analyze this script and provide 3 high-impact "1% improvements".
Script: ${script}

You MUST include diverse, multi-disciplinary suggestions. Provide exactly:
1. One Audio/SFX suggestion (e.g., specific music cuts, sound effects, or riser cues).
2. One Visual/B-Roll suggestion (e.g., specific transitions like match-cuts, dolly zooms, or visual pattern interrupts).
3. One Pacing/Delivery suggestion (e.g., specific lines to emphasize, where to hold silence, or where to speed up).

Return ONLY a valid JSON array of objects with this structure:
[{ "title": "Succinct Title", "suggestion": "Detailed instruction", "impact": "High/Medium/Low" }]

Output ONLY the JSON array. No markdown, no intro text.`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text().trim();
    
    const jsonString = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const suggestions = JSON.parse(jsonString);

    return NextResponse.json({ result: suggestions });
  } catch (error: any) {
    console.error("SUGGEST IMPROVEMENTS API ERROR:", error);
    return NextResponse.json({ error: "Failed to suggest improvements", details: error.message }, { status: 500 });
  }
}
