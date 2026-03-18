import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { script, instruction, geminiApiKey } = body;

    // Fetch user's Gemini key from database
    let apiKey = geminiApiKey; // fallback to body if provided
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (user?.id) {
          const userSettings = await prisma.settings.findUnique({ where: { userId: user.id } });
          if (userSettings?.geminiApiKey) {
            apiKey = userSettings.geminiApiKey;
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch user settings:", error);
    }

    if (!script || !instruction) {
      return NextResponse.json({ error: "Missing script or instruction" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API Key not found in Settings. Please go to Settings to add it." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const selectedModel = "gemini-3-flash-preview";
    const model = genAI.getGenerativeModel({ model: selectedModel });

    const prompt = `You are a Retention Engineer. Apply the following specific improvement to this script. Make ONLY the targeted change described — do not rewrite anything else. Keep the language, tone, and structure identical to the original.

Improvement to apply: ${instruction}

Script:
${script}

Return ONLY the updated script. No commentary, no markdown, no extra text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const newScript = response.text().trim();

    return NextResponse.json({ newScript });
  } catch (error: any) {
    console.error("Apply Improvement Error:", error);
    return NextResponse.json({ error: "Apply failed" }, { status: 500 });
  }
}
