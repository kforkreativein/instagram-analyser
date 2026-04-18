import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();
  const { seed, clientId, country = "us", provider: reqProvider, apiKey: reqApiKey, model: reqModel } = body;

  if (!seed) return NextResponse.json({ error: "seed is required" }, { status: 400 });

  const apifyKey = dbSettings.apifyApiKey ?? (body.apifyApiKey ?? "");

  // Try Apify answer-the-public first
  if (apifyKey) {
    try {
      const apifyUrl = `https://api.apify.com/v2/acts/misceres~answer-the-public-scraper/run-sync-get-dataset-items?token=${apifyKey}&timeout=55`;
      const apifyRes = await fetch(apifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: seed, country }),
      });

      if (apifyRes.ok) {
        const items = await apifyRes.json() as Array<{ type?: string; keyword?: string; searchType?: string; query?: string }>;
        if (Array.isArray(items) && items.length > 0) {
          const questions = items.filter((i) => i.type === "question" || i.searchType === "question").map((i) => i.keyword ?? i.query ?? "").filter(Boolean);
          const prepositions = items.filter((i) => i.type === "preposition" || i.searchType === "preposition").map((i) => i.keyword ?? i.query ?? "").filter(Boolean);
          const comparisons = items.filter((i) => i.type === "comparison" || i.searchType === "comparison").map((i) => i.keyword ?? i.query ?? "").filter(Boolean);
          const alphabeticals = items.filter((i) => i.type === "alphabetical" || i.searchType === "alphabetical").map((i) => i.keyword ?? i.query ?? "").filter(Boolean);
          const related = items.filter((i) => i.type === "related" || i.searchType === "related").map((i) => i.keyword ?? i.query ?? "").filter(Boolean);

          const all = [...questions, ...prepositions, ...comparisons, ...alphabeticals, ...related];
          const problemStatements = all.map((kw) => ({ keyword: kw, packagingLens: inferLens(kw), hookAngle: inferAngle(kw) }));

          return NextResponse.json({ source: "apify", questions, prepositions, comparisons, alphabeticals, related, problemStatements });
        }
      }
    } catch (err) {
      console.warn("Apify ATP failed, falling back to LLM:", err);
    }
  }

  // LLM fallback
  const provider = reqProvider ?? dbSettings.activeProvider ?? "Gemini";
  const llmKey = reqApiKey ?? dbSettings.geminiApiKey ?? dbSettings.openaiApiKey ?? dbSettings.anthropicApiKey ?? "";
  const llmModel = reqModel ?? "";

  if (!llmKey) return NextResponse.json({ error: "API key required for LLM fallback" }, { status: 401 });

  const prompt = `You are an Instagram SEO strategist. Generate search-intent keyword research for Instagram content creators.

SEED KEYWORD: "${seed}"
COUNTRY: ${country}

Generate realistic search phrases that people type into Instagram Search for this topic.
Organize them exactly like Answer The Public into these categories:
- questions (how, what, why, where, when, which — 8 items)
- prepositions (for, with, without, near, can, is — 6 items)
- comparisons (vs, versus, or, like — 4 items)
- alphabeticals (a-z variations of the seed — 6 items)
- related (related searches — 6 items)

Every keyword is a "problem statement" — someone is searching because they have a need.

Return ONLY valid JSON:
{
  "questions": string[],
  "prepositions": string[],
  "comparisons": string[],
  "alphabeticals": string[],
  "related": string[]
}`;

  let generatedText = "";
  try {
    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey: llmKey });
      const res = await openai.chat.completions.create({
        model: llmModel || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = res.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey: llmKey });
      const res = await anthropic.messages.create({
        model: llmModel || "claude-3-5-haiku-20241022",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(llmKey);
      const geminiModel = genAI.getGenerativeModel({ model: llmModel || "gemini-2.0-flash-exp" });
      const res = await geminiModel.generateContent(prompt);
      generatedText = res.response.text().trim();
    }

    const cleaned = generatedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(cleaned);
    const all = [...(result.questions ?? []), ...(result.prepositions ?? []), ...(result.comparisons ?? []), ...(result.alphabeticals ?? []), ...(result.related ?? [])];
    const problemStatements = all.map((kw: string) => ({ keyword: kw, packagingLens: inferLens(kw), hookAngle: inferAngle(kw) }));

    return NextResponse.json({ source: "llm", ...result, problemStatements });
  } catch (err) {
    console.error("SEO keywords error:", err);
    return NextResponse.json({ error: "Failed to generate SEO keywords" }, { status: 500 });
  }
}

function inferLens(keyword: string): string {
  const kw = keyword.toLowerCase();
  if (kw.includes("vs") || kw.includes("versus") || kw.includes("or ")) return "Comparison";
  if (kw.includes("how to") || kw.includes("step")) return "Tutorial";
  if (kw.includes("what is") || kw.includes("best")) return "Breakdown";
  if (kw.includes("why") || kw.includes("mistake") || kw.includes("wrong")) return "Contrarian";
  if (kw.includes("before") || kw.includes("after") || kw.includes("transform")) return "Transformation";
  if (kw.includes("case study") || kw.includes("example")) return "Case Study";
  return "Tutorial";
}

function inferAngle(keyword: string): string {
  const kw = keyword.toLowerCase();
  if (kw.includes("how to") || kw.includes("how do")) return "How-To Process";
  if (kw.startsWith("what") || kw.startsWith("why") || kw.startsWith("when")) return "Targeted Question";
  if (kw.includes("mistake") || kw.includes("wrong") || kw.includes("avoid")) return "Negative Spin";
  if (kw.includes("best") || kw.includes("top") || kw.includes("improve")) return "Positive Spin";
  return "Targeted Question";
}
