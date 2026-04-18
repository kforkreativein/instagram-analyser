import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getGameModePrompt } from "@/lib/game-mode";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAROUSEL_FORMATS = [
  {
    id: "tutorial-angle",
    name: "Tutorial Angle",
    slidePattern: "Hook → Step 1 (text+breakdown+visual) → Step 2 → Step 3 → CTA",
  },
  {
    id: "do-vs-dont",
    name: "Do vs Don't",
    slidePattern: "Hook → Do/Don't pair 1 (text+explanation+visual) → pair 2 → pair 3 → CTA",
  },
  {
    id: "educational-tips",
    name: "Educational Tips",
    slidePattern: "Hook → Tip 1 (tip+breakdown+visual+result) → Tip 2 → Tip 3 → CTA",
  },
  {
    id: "storytelling",
    name: "Storytelling",
    slidePattern: "Hook → Story line 1+visual → Story line 2+visual → ... → CTA",
  },
  {
    id: "transformation",
    name: "Transformation Carousel",
    slidePattern: "Hook (before/after) → Step/Tip 1 (text+breakdown+visual) → Step 2 → Step 3 → CTA",
  },
  {
    id: "problem-solution",
    name: "Problem/Solution",
    slidePattern: "Hook → Problem 1+Solution 1 (text+explanation+visual) → Problem 2+Solution 2 → CTA",
  },
  {
    id: "listicle",
    name: "List Style",
    slidePattern: "Hook → Point 1 (state+breakdown+visual) → Point 2 → Point 3 → CTA",
  },
  {
    id: "types-carousel",
    name: "Types Carousel",
    slidePattern: "Hook → Type 1 (name+breakdown+visual) → Type 2 → Type 3 → CTA",
  },
];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const body = await req.json();
  const {
    topic,
    hook = "",
    structureId = "",
    carouselFormat,
    clientProfile = "",
    provider: reqProvider,
    apiKey: reqApiKey,
    model: reqModel,
    gameMode,
  } = body;

  if (!topic || !carouselFormat) return NextResponse.json({ error: "topic and carouselFormat required" }, { status: 400 });

  const format = CAROUSEL_FORMATS.find((f) => f.id === carouselFormat) ?? CAROUSEL_FORMATS[0];

  const provider = reqProvider ?? dbSettings.activeProvider ?? "Gemini";
  const apiKey = reqApiKey ?? dbSettings.geminiApiKey ?? dbSettings.openaiApiKey ?? dbSettings.anthropicApiKey ?? "";
  const model = reqModel ?? "";

  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });

  // Narrative arc adapted from Instagram Carousel Skill
  const narrativeArc: Record<string, string[]> = {
    "tutorial-angle": [
      "SLIDE 1 — HERO: Bold scroll-stopper hook. Instantly signals what the viewer will learn.",
      "SLIDE 2 — PROBLEM: The pain point or struggle the viewer faces. 2-3 specific bullets.",
      "SLIDE 3 — THE FIX: Overview of the solution / system. Clear framing.",
      "SLIDE 4 — STEP 1: First actionable step. Specific and concrete.",
      "SLIDE 5 — STEP 2: Second step. Include a key insight or common mistake.",
      "SLIDE 6 — STEP 3: Third step. The 'secret sauce' that makes it work.",
      "SLIDE 7 — CTA: Clear keyword + what they get. Save prompt + follow ask."
    ],
    "problem-solution": [
      "SLIDE 1 — HERO: Bold hook that names the exact problem.",
      "SLIDE 2 — PROBLEM DEPTH: Agitate the pain. Make them feel seen.",
      "SLIDE 3 — SOLUTION A: First solution with explanation.",
      "SLIDE 4 — SOLUTION B: Second solution / approach.",
      "SLIDE 5 — SOLUTION C: Third and most powerful solution.",
      "SLIDE 6 — PROOF: Result / transformation this creates.",
      "SLIDE 7 — CTA: Save + follow + keyword offer."
    ],
    "listicle": [
      "SLIDE 1 — HERO: Hook naming the number of things. e.g. '7 reasons X happens'.",
      "SLIDE 2 — ITEM 1: Concise point + brief explanation.",
      "SLIDE 3 — ITEM 2: Concise point + brief explanation.",
      "SLIDE 4 — ITEM 3: Concise point + brief explanation.",
      "SLIDE 5 — ITEM 4-5: Two quick points.",
      "SLIDE 6 — BONUS ITEM: The most surprising / contrarian point.",
      "SLIDE 7 — CTA: Save for reference + follow ask."
    ],
    "storytelling": [
      "SLIDE 1 — HERO: Dramatic narrative moment that hooks immediately.",
      "SLIDE 2 — CONTEXT: The situation before. Relatable backstory.",
      "SLIDE 3 — CONFLICT: The crisis, turning point, or challenge.",
      "SLIDE 4 — DISCOVERY: The key insight or moment of change.",
      "SLIDE 5 — TRANSFORMATION: What happened after applying the insight.",
      "SLIDE 6 — LESSON: The universal takeaway anyone can use.",
      "SLIDE 7 — CTA: Save + follow for more stories like this."
    ],
    "transformation": [
      "SLIDE 1 — HERO: Before/after hook. 'From X to Y in Z time'.",
      "SLIDE 2 — BEFORE STATE: The problem in detail.",
      "SLIDE 3 — CHANGE 1: First thing that shifted.",
      "SLIDE 4 — CHANGE 2: Second change / decision.",
      "SLIDE 5 — CHANGE 3: Third and most impactful shift.",
      "SLIDE 6 — AFTER STATE: The result and transformation.",
      "SLIDE 7 — CTA: Save + follow + what they'll get."
    ],
    "do-vs-dont": [
      "SLIDE 1 — HERO: Hook naming the most common mistake. Immediate polarisation.",
      "SLIDE 2 — DON'T 1 / DO 1: Split comparison. Wrong way vs right way. Bold contrast.",
      "SLIDE 3 — DON'T 2 / DO 2: Second comparison. Why it matters.",
      "SLIDE 4 — DON'T 3 / DO 3: Third comparison. Include real consequence of Don't.",
      "SLIDE 5 — DON'T 4 / DO 4: Fourth comparison. A surprising one the viewer didn't expect.",
      "SLIDE 6 — KEY INSIGHT: The underlying principle that unites all the Do's.",
      "SLIDE 7 — CTA: Save as a reference + follow for more comparisons."
    ],
    "educational-tips": [
      "SLIDE 1 — HERO: Curiosity hook. Promise a specific number of tips.",
      "SLIDE 2 — TIP 1: Name + one-sentence explanation + why it works.",
      "SLIDE 3 — TIP 2: Name + one-sentence explanation + common mistake avoided.",
      "SLIDE 4 — TIP 3: Name + one-sentence explanation + quick result.",
      "SLIDE 5 — TIP 4: Name + one-sentence explanation + pro-level depth.",
      "SLIDE 6 — BONUS TIP: The counterintuitive or surprising one that breaks the pattern.",
      "SLIDE 7 — CTA: Save for later + follow for weekly tips."
    ],
    "types-carousel": [
      "SLIDE 1 — HERO: Hook questioning which type the viewer is / what type fits them best.",
      "SLIDE 2 — TYPE 1: Name + defining trait + who it's for + visual icon idea.",
      "SLIDE 3 — TYPE 2: Name + defining trait + who it's for + how it differs from Type 1.",
      "SLIDE 4 — TYPE 3: Name + defining trait + who it's for + common confusion with other types.",
      "SLIDE 5 — TYPE 4: Name + defining trait + the most overlooked type.",
      "SLIDE 6 — HOW TO CHOOSE: Decision framework — if X, choose A; if Y, choose B.",
      "SLIDE 7 — CTA: 'Which type are you? Comment below' + follow for more frameworks."
    ],
  };

  const arc = narrativeArc[format.id] ?? [
    "SLIDE 1 — HERO: Powerful hook statement. Bold and specific.",
    "SLIDE 2 — PAIN/CONTEXT: The problem or situation.",
    "SLIDE 3 — MAIN POINT 1: First key insight or step.",
    "SLIDE 4 — MAIN POINT 2: Second key insight or step.",
    "SLIDE 5 — MAIN POINT 3: Third key insight or step.",
    "SLIDE 6 — INSIGHT: The key takeaway or twist.",
    "SLIDE 7 — CTA: Save + follow + clear next action."
  ];

  const gameModeInstruction = getGameModePrompt(gameMode, "carousel");

  const prompt = `You are an expert Instagram carousel writer. Your job is to write the slide-by-slide text content for a carousel post. This is WRITING ONLY — no HTML, no design, no code.
${gameModeInstruction}

TOPIC: ${topic}
OPENING HOOK: ${hook || "Use a powerful hook based on the topic"}
FORMAT: ${format.name} — ${format.slidePattern}
CLIENT CONTEXT: ${clientProfile || "None"}

CAROUSEL NARRATIVE ARC (follow this slide by slide):
${arc.join("\n")}

WRITING RULES (mandatory):
1. ONE idea per slide. No cramming.
2. Main text: MAXIMUM 20 words. Short, punchy, skimmable.
3. Caption/subtext: MAXIMUM 15 words if needed.
4. No filler words. Every word earns its place.
5. The hook slide must stop the scroll in 0.5 seconds.
6. Body slides each deliver ONE clear point or step.
7. CTA slide: "Save this" or "Follow for more [specific value]" + clear keyword or action.
8. Visual direction: specific description of what image/graphic/icon fits this slide.

Return ONLY valid JSON — no markdown, no explanation:
{ "title": string, "format": string, "slides": [{ "index": number, "role": "hook" | "body" | "cta", "text": string, "visualDirection": string, "caption": string }] }`;

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
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = (res.content[0] as { type: string; text: string }).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: model || "gemini-2.0-flash" });
      const res = await geminiModel.generateContent(prompt);
      generatedText = res.response.text().trim();
    }

    const cleaned = generatedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(cleaned);
    return NextResponse.json({ ...result, formatMeta: format });
  } catch (err: unknown) {
    console.error("Carousel generate error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || "Failed to generate carousel" }, { status: 500 });
  }
}
