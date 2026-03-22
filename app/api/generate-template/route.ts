export const maxDuration = 60;

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { niche, tone } = body;

    if (!niche || !tone) {
      return NextResponse.json(
        { error: "Niche and tone are required" },
        { status: 400 }
      );
    }

    // Fetch user settings to determine active provider
    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    const activeProvider = settings?.activeProvider || "Gemini";
    const systemPrompt = `You are an elite B2B/B2C sales copywriter specializing in Instagram DM outreach.
The user wants a new DM template for the niche: "${niche}", with a "${tone}" tone.

Rules:
1. Keep it under 100 words.
2. Use [Name] as a placeholder for the prospect's name.
3. Use [Topic] as a placeholder for a specific piece of content they posted.
4. The structure MUST follow: Compliment -> Identify Pain Point/Ask Question -> Soft Pitch -> Low-Friction Call to Action.
5. Return ONLY the template text. No intros, no markdown formatting.`;

    let generatedTemplate = "";

    if (activeProvider === "Gemini" && settings?.geminiApiKey) {
      // Use Gemini
      const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: settings.activeModel?.includes("2.0")
          ? "gemini-2.0-flash-exp"
          : "gemini-1.5-flash",
      });

      const result = await model.generateContent(systemPrompt);
      generatedTemplate = result.response.text();
    } else if (activeProvider === "OpenAI" && settings?.openaiApiKey) {
      // Use OpenAI
      const openai = new OpenAI({ apiKey: settings.openaiApiKey });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      generatedTemplate = completion.choices[0]?.message?.content || "";
    } else {
      return NextResponse.json(
        {
          error: `No API key configured for ${activeProvider}. Please add your API key in settings.`,
        },
        { status: 400 }
      );
    }

    // Clean up the response (remove any markdown, extra whitespace)
    generatedTemplate = generatedTemplate.trim().replace(/```[\s\S]*?```/g, "").replace(/^\*\*.*?\*\*\n?/gm, "");

    return NextResponse.json({ template: generatedTemplate });
  } catch (error) {
    console.error("[GENERATE_TEMPLATE]", error);
    return NextResponse.json(
      { error: "Failed to generate template" },
      { status: 500 }
    );
  }
}
