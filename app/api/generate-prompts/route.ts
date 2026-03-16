import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const scriptText = body.scriptContent || body.script || body.text;
    if (!scriptText) return NextResponse.json({ error: "Missing script" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { settings: true } });
    const apiKey = user?.settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API Key" }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Analyze this script. Break it down into 3 to 5 key visual moments. For each moment, return ONLY a raw JSON array of objects with this exact structure:
    [
      { "scriptLine": "Exact quote from script", "imagePrompt": "Midjourney prompt details...", "videoPrompt": "Runway/Kling prompt details..." }
    ]
    Do not wrap the output in markdown code blocks. Output raw JSON only.
    Script: ${scriptText}`;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    if (responseText.startsWith('```json')) responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    else if (responseText.startsWith('```')) responseText = responseText.replace(/```/g, '').trim();

    const prompts = JSON.parse(responseText);
    return NextResponse.json({ prompts });
  } catch (error) {
    console.error("Generate Prompts Error:", error);
    return NextResponse.json({ error: "Failed to generate prompts" }, { status: 500 });
  }
}
