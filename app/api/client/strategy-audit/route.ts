import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";

export const maxDuration = 90;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Step = "iva" | "platform" | "anchors" | "patterns" | "gap-report";

interface SessionState {
  iva?: string;
  platform?: string;
  anchors?: string[];
  patterns?: string;
  gapReport?: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();
  const {
    step,
    sessionState = {} as SessionState,
    input,
    clientId,
    clientNiche = "",
    platform = "Instagram",
    gameMode = "awareness",
    currentContentTitles = [],
  } = body;

  const apiKey = dbSettings.geminiApiKey || dbSettings.openaiApiKey || dbSettings.anthropicApiKey || "";
  const provider = dbSettings.activeProvider ?? "Gemini";

  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });

  let prompt = "";

  if (step === "iva") {
    prompt = `You are a content strategist. Build an Ideal Viewer Avatar (IVA) for this creator.

CLIENT NICHE: ${clientNiche}
PLATFORM: ${platform}
GAME MODE: ${gameMode === "conversion" ? "Conversion — target active buyers with a specific problem" : "Awareness — maximize broad reach"}
USER NOTES: ${input ?? ""}

The IVA must include:
1. Demographics (age range, location, income level)
2. Psychographics (beliefs, fears, aspirations, identity)
3. Content behavior (when they scroll, what stops them, what they save)
4. Pain trigger (the ONE sentence that makes them think "this is for me")

Return a concise IVA as formatted plain text (no JSON), structured clearly with headers.`;

  } else if (step === "platform") {
    prompt = `Based on this IVA:
${sessionState.iva ?? "Unknown"}

The client niche is "${clientNiche}" and they plan to use ${platform}.

Confirm platform fit and recommend:
1. Primary platform and why
2. Content types that work best (Reels, carousels, stories)
3. Optimal posting frequency
4. Secondary platforms worth testing

Be specific and direct. Return plain text.`;

  } else if (step === "anchors") {
    const anchorList = Array.isArray(input) ? input.join(", ") : (input ?? "");
    prompt = `These are the anchor (competitor) accounts the client identified:
${anchorList}

IVA: ${sessionState.iva?.slice(0, 500) ?? "Unknown"}
Platform: ${platform}
Game Mode: ${gameMode}

Analyze what can be observed about these accounts from their public profile/niche. For each anchor:
- What topics they consistently win on
- Hook formats that likely work for them (Fortune Teller, Contrarian, Teacher, etc.)
- Content packaging lens (Tutorial, Myth Bust, POV, etc.)

Return structured plain text.`;

  } else if (step === "patterns") {
    prompt = `Given the anchor account analysis:
${sessionState.patterns ?? input ?? ""}

IVA: ${sessionState.iva?.slice(0, 300) ?? "Unknown"}

Synthesize the key WINNING PATTERNS across these anchors:
1. Top 3 topics that outperform
2. Top 3 hook mechanisms
3. Top 3 packaging lenses
4. Top 3 visual/production styles
5. Common CTAs or retention tactics

Be concise and specific. Return structured plain text.`;

  } else if (step === "gap-report") {
    const currentTopics = currentContentTitles.filter(Boolean).join(", ") || "Unknown";
    prompt = `You are producing a "Growth Diagnosis Report" for a creator.

CLIENT NICHE: ${clientNiche}
PLATFORM: ${platform}
GAME MODE: ${gameMode}

IVA:
${sessionState.iva?.slice(0, 400) ?? "Not completed"}

WINNING PATTERNS (from anchor accounts):
${sessionState.patterns?.slice(0, 600) ?? "Not completed"}

CLIENT CURRENT CONTENT TOPICS:
${currentTopics}

Compare the client's current content to the winning patterns across 7 variables:
1. Topic — are they on the right subjects?
2. Angle — are they using high-leverage angles (Contrarian, Identity, etc.)?
3. Hook Format — what hook types are they missing?
4. Story Structure — is their structure optimized for retention?
5. Visual Format — Reels vs carousels vs text? Optimal?
6. Key Visuals — what visual hooks are winning that they're not using?
7. Audio — trending sounds, voiceover quality, SFX?

For each variable, rate: ✅ Strong / ⚠️ Needs Work / 🔴 Critical Gap

End with:
TOP 3 PRIORITY FIXES (ranked by impact)

Return structured plain text suitable for a printable report.`;

    // After generating, save to DB
  }

  try {
    let text = "";
    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      text = res.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const res = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      });
      text = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const res = await model.generateContent(prompt);
      text = res.response.text().trim();
    }

    // If final step, persist to client record
    if (step === "gap-report" && clientId) {
      const finalAudit = {
        iva: sessionState.iva,
        platform: sessionState.platform ?? platform,
        anchors: sessionState.anchors ?? (Array.isArray(input) ? input : []),
        patterns: sessionState.patterns,
        gapReport: text,
        updatedAt: new Date().toISOString(),
      };
      await prisma.client.updateMany({
        where: { id: clientId, userId: session.user.id },
        data: { strategyAudit: finalAudit },
      });
      return NextResponse.json({ result: text, completed: true, audit: finalAudit });
    }

    return NextResponse.json({ result: text });
  } catch (err) {
    console.error("Strategy audit error:", err);
    return NextResponse.json({ error: "Failed to generate strategy audit step" }, { status: 500 });
  }
}
