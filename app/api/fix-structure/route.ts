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
    const apiKey =
      (typeof body.geminiApiKey === "string" && body.geminiApiKey.trim()) ||
      settings.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      "";

    if (!apiKey) return NextResponse.json({ error: "No API Key found" }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `Analyze this script. It may contain duplicate blocks or repeated section headers.

1. Remove duplicate copies of the same paragraph or section (keep one best version).
2. Reformat using bracketed tags ONLY on their own lines: [HOOK], [BODY], [CALL TO ACTION] (use these three; map "CTA" to [CALL TO ACTION]).
3. Each tag must appear at most once in order: [HOOK] then [BODY] then [CALL TO ACTION].
4. Do not change the meaning of spoken lines; light punctuation/line-break fixes are OK.
5. Double line break between sections. Raw text only — no markdown code fences.\n\nScript:\n${scriptText}`;
    
    const result = await model.generateContent(prompt);
    return NextResponse.json({ updatedScript: result.response.text().replace(/```/g, '').trim() });
  } catch (error) {
    console.error("Fix Structure Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
