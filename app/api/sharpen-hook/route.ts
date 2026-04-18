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

    const prompt = `You are an expert scriptwriter.

Task: Return the COMPLETE script with a stronger opening hook only.

Rules:
1. If the script contains a line exactly like [HOOK] (case-insensitive), keep that single tag line once. Rewrite only the spoken lines that belong to the hook section (immediately after [HOOK] until the next line that is ONLY a bracket tag like [BODY] or another [SECTION], or end of script).
2. If there is NO [HOOK] tag, rewrite only the first 1–3 non-empty spoken lines; keep everything after that identical.
3. Do NOT duplicate the full script. Do NOT repeat [HOOK] or any section header.
4. Preserve all other lines (including [BODY], [CALL TO ACTION], etc.) exactly except for the hook lines you improve.
5. Output ONLY the final full script — no markdown fences, no commentary.`;

    const result = await model.generateContent(`${prompt}\n\nScript:\n${scriptText}`);
    const updatedScript = result.response.text().replace(/```/g, "").trim();
    return NextResponse.json({ updatedScript });
  } catch (error) {
    console.error("Sharpen Hook Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
