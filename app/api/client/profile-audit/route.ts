import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { getGameModePrompt } from "@/lib/game-mode";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();
  const {
    clientId,
    profileData,
    niche = "",
    gameMode = "awareness",
    recentContentTitles = [],
    geminiApiKey: bodyGemini,
    openaiApiKey: bodyOpenai,
    anthropicApiKey: bodyAnthropic,
    activeProvider: bodyProvider,
  } = body;

  const providerRaw =
    (typeof bodyProvider === "string" && bodyProvider.trim()) || dbSettings.activeProvider || "Gemini";
  const pl = providerRaw.trim().toLowerCase();
  const provider = pl === "openai" ? "OpenAI" : pl === "anthropic" ? "Anthropic" : "Gemini";
  let apiKey = "";
  if (provider === "OpenAI") {
    apiKey =
      (typeof bodyOpenai === "string" && bodyOpenai.trim()) || dbSettings.openaiApiKey || "";
  } else if (provider === "Anthropic") {
    apiKey =
      (typeof bodyAnthropic === "string" && bodyAnthropic.trim()) || dbSettings.anthropicApiKey || "";
  } else {
    apiKey =
      (typeof bodyGemini === "string" && bodyGemini.trim()) || dbSettings.geminiApiKey || "";
  }
  if (!apiKey) {
    apiKey =
      dbSettings.geminiApiKey || dbSettings.openaiApiKey || dbSettings.anthropicApiKey || "";
  }

  if (!apiKey) return NextResponse.json({ error: "API key required in Settings" }, { status: 401 });
  if (!profileData) return NextResponse.json({ error: "profileData required" }, { status: 400 });

  const gameModeNote = gameMode === "conversion"
    ? "This is a CONVERSION account — bio must establish authority, speak to buyers with a specific pain point, and CTA must drive off-platform action (DM/link)."
    : "This is an AWARENESS account — bio should be broadly appealing and CTA should drive follow/explore.";

  const prompt = `You are an expert Instagram profile optimization consultant. Apply these frameworks:
1. The 4-Step Bio Framework: Hook Line → Credibility Signal → Value Promise → CTA
2. The 30-Second Positioning Fix (4 questions): Who are you? What problem do you solve? What outcome do you deliver? Why should they trust you?
3. Profile Conversion Rate (PCR): % of profile visitors who become followers

GAME MODE NOTE: ${gameModeNote}
CLIENT NICHE: ${niche}
RECENT CONTENT TOPICS: ${recentContentTitles.filter(Boolean).slice(0, 5).join(", ") || "Unknown"}

PROFILE TO AUDIT:
- Handle: ${profileData.handle ?? "unknown"}
- Display Name: ${profileData.displayName ?? "unknown"}
- Bio: ${profileData.bio ?? "empty"}
- CTA Link Description: ${profileData.ctaLink ?? "none"}
- Follower Count: ${profileData.followers ?? "unknown"}
- Highlights (if described): ${(profileData.highlights ?? []).join(", ") || "none"}

Score this profile across 5 dimensions (0-20 each, total 0-100):
1. Handle & Name clarity (discoverability, searchability, niche signal)
2. Bio Hook Line (scroll-stopping first sentence)
3. CTA effectiveness (clear action, urgency, off-platform link)
4. Highlights strategy (organized, labelled, value-signalling)
5. Content-Bio Alignment (does the bio match what the account actually posts?)

Return ONLY valid JSON (no markdown):
{
  "score": number (0-100),
  "grade": "A" | "B" | "C" | "D" | "F",
  "breakdown": {
    "handle": { "score": number, "notes": string },
    "bio": { "score": number, "notes": string },
    "cta": { "score": number, "notes": string },
    "highlights": { "score": number, "notes": string },
    "alignment": { "score": number, "notes": string }
  },
  "rewrites": {
    "bioHook": string,
    "cta": string,
    "positioning": string
  },
  "contentBioMisalignment": boolean,
  "topPriority": string,
  "notes": string
}`;

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
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      text = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const res = await model.generateContent(prompt);
      text = res.response.text().trim();
    }

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    const slice = first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;
    const audit = JSON.parse(slice);
    const auditWithTimestamp = { ...audit, updatedAt: new Date().toISOString() };

    // Persist both profileData and pcrAudit to the client record
    if (clientId) {
      await prisma.client.updateMany({
        where: { id: clientId, userId: session.user.id },
        data: {
          profileData: { ...profileData, lastFetchedAt: new Date().toISOString() },
          pcrAudit: auditWithTimestamp,
        },
      });
    }

    return NextResponse.json({ audit: auditWithTimestamp, profileData });
  } catch (err) {
    console.error("Profile audit error:", err);
    return NextResponse.json({ error: "Failed to generate profile audit" }, { status: 500 });
  }
}
