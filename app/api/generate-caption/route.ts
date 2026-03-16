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
      return NextResponse.json(
        { error: "API Key not found in Settings. Please go to Settings to add it." },
        { status: 401 },
      );
    }

    const genAI = new GoogleGenerativeAI(effectiveKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `You are an expert Instagram SEO strategist. Your job is to write a highly optimized, storytelling caption for the following video script.

STRICT RULES (THE STORYTELLING CAPTION METHOD):
1. THE FIRST LINE: Determine the ONE "main search phrase" or core keyword this video is about. This search phrase MUST be in the very first line of the caption.
2. THE STORY: Do not write a robotic summary. Write the caption naturally like a mini-story or highly engaging context block that provides additional value beyond just the script.
3. KEYWORD WEAVING: Intentionally repeat the main search phrase and slight natural variations of it 3-4 times naturally throughout the sentences.
4. NO SPAM: DO NOT include a block of random keywords at the bottom.
5. HASHTAGS: Provide exactly 2 or 3 "Condensed, Exact-Match" hashtags based on the search phrase (e.g., if the topic is 'meal prep recipes', use #mealprep and #mealpreprecipes). Do not use broad, random tags.

Do not output any meta-commentary, just the final caption and hashtags.

Script to analyze:
${scriptBody}
`;

    const result = await model.generateContent(prompt);
    const generatedText = result.response.text().trim();

    return NextResponse.json({ caption: generatedText });
  } catch (error: any) {
    console.error("Caption Generation Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate caption" },
      { status: 500 },
    );
  }
}
