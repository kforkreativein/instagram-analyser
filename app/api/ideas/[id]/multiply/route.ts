import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANGLES = [
  "Negative Spin",
  "Positive Spin",
  "Targeted Question",
  "Personal Experience",
  "Call-Out",
  "How-To Process",
  "Social Proof",
];

const HOOK_FORMATS = [
  "Fortune Teller",
  "Experimenter",
  "Teacher",
  "Magician",
  "Investigator",
  "Contrarian",
];

const FORMATS = ["Reel", "Carousel", "Long-form"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const idea = await prisma.idea.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json().catch(() => ({}));
  const provider = (body.provider ?? dbSettings.activeProvider ?? "Gemini") as string;
  const apiKey = (body.apiKey ?? dbSettings.geminiApiKey ?? dbSettings.openaiApiKey ?? dbSettings.anthropicApiKey ?? "") as string;
  const model = (body.model ?? "") as string;
  const clientProfile = (body.clientProfile ?? "") as string;

  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });

  const prompt = `You are a viral content strategist. Given the following video idea, expand it across all combinations of angles, hook formats, content formats, and audience slices. Score each combination 0-100 for viral potential.

IDEA TITLE: ${idea.title}
SEED/PREMISE: ${idea.seed}
${idea.substance ? `SUBSTANCE: ${idea.substance}` : ""}
${clientProfile ? `CLIENT PROFILE: ${clientProfile}` : ""}

ANGLES: ${ANGLES.join(", ")}
HOOK FORMATS: ${HOOK_FORMATS.join(", ")}
CONTENT FORMATS: ${FORMATS.join(", ")}

Return a JSON array of objects. Each object must have:
{
  "angle": string,
  "hookFormat": string,
  "contentFormat": string,
  "audienceSlice": string (e.g. "Beginners", "Advanced practitioners", "Business owners", etc.),
  "title": string (compelling 5-8 word title for this specific combination),
  "oneLineHook": string (the actual spoken opening line),
  "viralScore": number (0-100),
  "reason": string (1 sentence why this combo works)
}

Generate the top 21 highest-scoring combinations (3 per angle). Return ONLY valid JSON array, no markdown fences.`;

  let generatedText = "";

  try {
    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = res.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const res = await anthropic.messages.create({
        model: model || "claude-3-5-haiku-20241022",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: model || "gemini-2.0-flash-exp" });
      const res = await geminiModel.generateContent(prompt);
      generatedText = res.response.text().trim();
    }

    const cleaned = generatedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const matrix = JSON.parse(cleaned);

    // Persist angles on the idea
    await prisma.idea.update({ where: { id: params.id }, data: { angles: matrix } });

    return NextResponse.json({ matrix, angles: ANGLES, hookFormats: HOOK_FORMATS, formats: FORMATS });
  } catch (err) {
    console.error("Idea multiply error:", err);
    return NextResponse.json({ error: "Failed to generate idea matrix" }, { status: 500 });
  }
}
