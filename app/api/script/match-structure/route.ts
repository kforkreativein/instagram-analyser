export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const KNOWN_IDS = [
  "problem-solver",
  "breakdown",
  "listicle",
  "case-study-explainer",
  "tutorial",
  "educational-storytelling",
  "newscaster",
] as const;

function resolveIdFromText(raw: string): string {
  const t = raw.toLowerCase();
  const direct = KNOWN_IDS.find((id) => t.includes(id));
  if (direct) return direct;
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
    const id = typeof j?.structureId === "string" ? j.structureId.trim().toLowerCase() : "";
    if (KNOWN_IDS.includes(id as (typeof KNOWN_IDS)[number])) return id;
  } catch {
    /* ignore */
  }
  const compact = t.replace(/[^a-z-]/g, "");
  return KNOWN_IDS.find((id) => compact.includes(id)) || "";
}

function resolveGeminiModelId(requested: string): string {
  const m = (requested || "").trim().toLowerCase();
  if (!m || m.startsWith("gpt") || m.startsWith("claude")) return "gemini-2.0-flash";
  if (!m.includes("gemini")) return "gemini-2.0-flash";
  if (m.includes("flash-exp") || m === "gemini-2.0-flash-exp") return "gemini-2.0-flash";
  return requested.trim() || "gemini-2.0-flash";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (!brief) return NextResponse.json({ error: "brief is required" }, { status: 400 });

  const provider = (typeof body.provider === "string" ? body.provider : null) ?? dbSettings.activeProvider ?? "Gemini";
  const reqApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";

  const apiKey =
    reqApiKey ||
    (provider === "OpenAI"
      ? dbSettings.openaiApiKey
      : provider === "Anthropic"
      ? dbSettings.anthropicApiKey
      : dbSettings.geminiApiKey) ||
    "";

  if (!apiKey) {
    return NextResponse.json({ error: "API key required — add it in Settings or pass apiKey from the app." }, { status: 401 });
  }

  const prompt = `Based on this short-form video brief, pick the single best storytelling structure.

BRIEF:
${brief}

OPTIONS (return JSON only):
- problem-solver — pain → agitate → solve → CTA
- breakdown — dissect a thing, reveal layers
- listicle — numbered / modular tips
- case-study-explainer — proof, blueprint, experiment narrative
- tutorial — ordered steps, teaching
- educational-storytelling — POV journey, motivation arc
- newscaster — fast facts, newsy authority

Return ONLY valid JSON on one line: {"structureId":"<one-of-the-kebab-case-ids-above>"}`;

  let rawText = "";
  try {
    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: model.startsWith("gpt") ? model : "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });
      rawText = res.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const res = await anthropic.messages.create({
        model: model.startsWith("claude") ? model : "claude-3-5-haiku-20241022",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });
      rawText = (res.content[0] as { type: string; text?: string }).text?.trim() ?? "";
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({
        model: resolveGeminiModelId(model),
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await geminiModel.generateContent(prompt);
      rawText = result.response.text().trim();
    }

    const structureId = resolveIdFromText(rawText);
    if (!structureId) {
      return NextResponse.json(
        { error: "Could not map model output to a structure id.", raw: rawText.slice(0, 200) },
        { status: 422 }
      );
    }
    return NextResponse.json({ structureId, raw: rawText.slice(0, 300) });
  } catch (err) {
    console.error("match-structure error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
