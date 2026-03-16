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

    const systemPrompt = `You are a world-class Cinematic Director and Prompt Engineer for AI video generators (Kling, Luma, Runway).
Read this script carefully: [${script}]

Your mission is to generate a sequence of HIGH-DETAIL cinematic prompts for the key scenes.

You must return ONLY a JSON array of objects with this exact structure: 
[{ "scriptLine": "Exact line from script", "imagePrompt": "Detailed Midjourney/Stable Diffusion prompt...", "videoPrompt": "Detailed Luma/Runway/Kling motion prompt..." }]

RULES:
1. Provide a prompt for every major transition or visual shift.
2. Keep image prompts focused on lighting, composition, and subject.
3. Keep video prompts focused on camera movement and specific motion.
4. Output ONLY the JSON array. No markdown, no intro text.`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text().trim();
    
    // Clean potential markdown code blocks
    const jsonString = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const prompts = JSON.parse(jsonString);

    return NextResponse.json({ result: prompts });
  } catch (error: any) {
    console.error("GENERATE PROMPTS API ERROR:", error);
    return NextResponse.json({ error: "Failed to generate prompts", details: error.message }, { status: 500 });
  }
}
