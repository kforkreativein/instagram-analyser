import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "../../../lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { scriptBody, apiKey } = await req.json();

        if (!scriptBody) {
            return NextResponse.json({ error: "Script body is required" }, { status: 400 });
        }

        const dbSettings = await getSettings(session.user.id);
        const effectiveKey = apiKey || dbSettings.geminiApiKey;

        if (!effectiveKey) {
            return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 401 });
        }

        const genAI = new GoogleGenerativeAI(effectiveKey);
        // Using gemini-3-flash-preview for high-speed, low-latency JSON generation
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const systemPrompt = `Read the following video script. Your job is to generate 4 highly engaging, alternative opening hooks to replace the current intro.

A viral hook must align on three levels:
1. Visual Hook (a clear visual shift, action, or scroll-stopping prop).
2. Spoken Hook (the punchy line you say).
3. Text Hook (on-screen text that adds context to the spoken word without just repeating it).

Leverage these specific psychological triggers: Pattern Interruption, Curiosity Gap, Personal Stakes, and Dopamine Gap (Expectation vs Reality).

RETURN STRICT JSON ONLY IN THIS EXACT FORMAT (no markdown code fences, no extra text):
[
  { 
    "type": "Pattern Interruption", 
    "spoken": "...", 
    "visual": "...", 
    "text": "..." 
  },
  { 
    "type": "Curiosity Gap", 
    "spoken": "...", 
    "visual": "...", 
    "text": "..." 
  },
  { 
    "type": "Personal Stakes", 
    "spoken": "...", 
    "visual": "...", 
    "text": "..." 
  },
  { 
    "type": "Dopamine Gap", 
    "spoken": "...", 
    "visual": "...", 
    "text": "..." 
  }
]

Script to analyze:
${scriptBody}`;

        const result = await model.generateContent(systemPrompt);
        const responseText = result.response.text().trim();

        // Safety check to strip potential markdown blocks if the model ignores the "no fences" instruction
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedHooks = JSON.parse(cleanJson);

        return NextResponse.json(parsedHooks);
    } catch (error: any) {
        console.error("Hook Generation Error:", error);
        return NextResponse.json({ error: error.message || "Failed to generate hooks" }, { status: 500 });
    }
}
