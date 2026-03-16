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
    const { script, originalHook } = body;

    const dbSettings = await getSettings(session.user.id);
    const apiKey = dbSettings.geminiApiKey;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not found in Settings." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Using gemini-1.5-flash for speed as requested
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
      }
    });

    const systemPrompt = `You are an elite, multi-million-view short-form video scriptwriter. 
Your ONLY job is to take the user's drafted hook and rewrite it into a scroll-stopping masterpiece.

CRITICAL RULES:
1. Language Match: You MUST write the hook in the EXACT same language and tone as the input (e.g., if the input is in Hinglish, output in Hinglish).
2. The Curiosity Gap: The hook must make the viewer feel like they are missing out on a secret if they swipe away.
3. Visual/Visceral: Use punchy, high-impact words. 
4. Brevity: The hook MUST be under 15 words. Cut the fluff.
5. Direct Output: DO NOT include quotes, explanations, or introductory text. Output ONLY the raw rewritten hook text.

Frameworks to apply (pick the best fit):
- The Negative Hook: "Stop doing [X] if you want [Y]."
- The Secret Hook: "This is the real reason why [X] happens."
- The Contrarian Hook: "Everything you know about [X] is wrong."

Original Hook:
"${originalHook}"
`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const output = response.text().trim().replace(/^["']|["']$/g, ''); // Remove potential quotes

    return NextResponse.json({ result: output });
  } catch (error: any) {
    console.error("SHARPEN HOOK API ERROR:", error);
    return NextResponse.json({ error: "Failed to sharpen hook", details: error.message }, { status: 500 });
  }
}
