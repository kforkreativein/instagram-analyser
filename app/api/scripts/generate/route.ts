import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSettings } from "../../../../lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreativeEngine = "claude_3_5_sonnet" | "gpt_4o" | "gemini_1_5_pro";

type GenerateScriptBody = {
  engine?: CreativeEngine;
  topic?: string;
  executiveSummary?: string;
  keyContext?: string;
  selectedAngle?: string;
  hookType?: string;
  hookVariation?: string;
  storyStructure?: string;
  emotion?: string;
  intensity?: string | number;
  openaiApiKey?: string;
  geminiApiKey?: string;
  anthropicApiKey?: string;
  language?: string;
  videoLength?: number;
  clientProfile?: any;
};

function parseEngine(value: unknown): CreativeEngine {
  if (value === "claude_3_5_sonnet" || value === "gemini_1_5_pro") {
    return value;
  }
  return "gpt_4o";
}

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function buildPrompt(body: GenerateScriptBody): string {
  const topic = toStringSafe(body.topic, "Untitled topic");
  const executiveSummary = toStringSafe(body.executiveSummary, "No executive summary provided.");
  const keyContext = toStringSafe(body.keyContext, "No key context provided.");
  
  const selectedAngle = toStringSafe(body.selectedAngle, "");
  const hookType = toStringSafe(body.hookType, "Hook");
  const hookVariation = toStringSafe(body.hookVariation, "");
  const storyStructure = toStringSafe(body.storyStructure, "Structure");
  const emotion = toStringSafe(body.emotion, "Engaging");
  const intensity = toStringSafe(String(body.intensity || ""), "5");
  const language = toStringSafe(body.language, "English");
  const videoLength = body.videoLength || 60;
  const targetWords = Math.round(videoLength * 2.5);
  const client = body.clientProfile;

  const customDirectives = client?.customInstructions ? [
    `=========================================================`,
    `🔥 MASTER CLIENT OVERRIDE: STRICT PERSONA & RULES 🔥`,
    `You must absolutely embody the following persona and follow every single formatting rule, tone restriction, and output requirement listed below. This block supersedes all other tonal instructions:`,
    ``,
    client.customInstructions,
    `=========================================================`,
    ``
  ].join("\n") : "";

  const clientContext = client ? [
    `CLIENT VOICE PROFILE:`,
    `- Name: ${client.name}`,
    `- Niche: ${client.niche}`,
    `- Target Audience: ${client.targetAudience}`,
    `- Tone & Persona: ${client.tonePersona || client.tone || ""}`,
    `- Vocabulary: ${client.vocabularyLevel || client.vocabulary || ""}`,
    `- Preferred Topics: ${client.preferredTopics || client.topics || ""}`,
    client.styleDNA ? `- Style DNA: ${JSON.stringify(client.styleDNA)}` : "",
    (client.examples || client.winningScripts)?.filter((s:any) => s.useAsReference).length > 0
      ? `- FEW-SHOT WINNING EXAMPLES (mirror these rhythms exactly):\n${(client.examples || client.winningScripts).filter((s:any) => s.useAsReference).map((s:any) => `  [${s.signal}] ${s.title}:\n  "${s.content}"`).join("\n")}`
      : "",
    `STRICT STYLE INSTRUCTION: You MUST mirror the tone, vocabulary level, and structural patterns identified in the Style DNA and Winning Examples above.`,
    "",
    `CRITICAL LENGTH CONSTRAINT: This script is for a ${videoLength}-second short-form video. Therefore, the ENTIRE script (excluding bracketed tags) MUST be approximately ${targetWords} words long. You will be penalized if the script is too long. Keep sentences punchy and fast-paced.`
  ].filter(Boolean).join("\n") : "";

  return [
    customDirectives,
    clientContext,
    `You are a top-tier viral scriptwriter. Write a short-form video script for a ${videoLength}s video.`,
    "",
    "CRITICAL INSTRUCTIONS — YOU MUST FOLLOW THESE EXACTLY:",
    "1. NO VISUAL CUES: Do NOT include any [Visual: ...] tags, camera angles, b-roll descriptions, or shot directions. Output ONLY the spoken words.",
    `2. TARGET LENGTH: Output exactly ${targetWords} words (±5 words). Do not exceed this.`,
    "3. LINE BY LINE FORMATTING: Separate every single spoken sentence with a double line break (\\n\\n). Do not write in paragraphs.",
    `4. STORY STRUCTURE HEADERS: Break the script into sections using bracketed headers on their own line matching the chosen Story Structure (e.g., [HOOK], [BODY], [CALL TO ACTION]).`,
    "",
    "PSYCHOLOGICAL CONSTRAINTS (CVF FRAMEWORK):",
    "1. CLEAR THE CONTEXT EARLY: The sentence after the hook MUST establish the context immediately.",
    "2. BEST POINT FIRST: Put the highest-value insight immediately after context — do not build slowly.",
    "3. NOVEL ANALOGY: Present the core concept using an unexpected analogy the viewer has never heard.",
    "4. SEO INDEXING: Speak the core topic within the first 2 sentences.",
    "",
    `Topic: ${topic}`,
    `Reference Research: ${executiveSummary}`,
    `Key Context: ${keyContext}`,
    selectedAngle ? `Angle: ${selectedAngle}` : "",
    `Hook Framework: ${hookType}${hookVariation ? ` — Variation: ${hookVariation}` : ""}`,
    `Story Structure: ${storyStructure}`,
    `Emotion: ${emotion} at intensity ${intensity}/10`,
    language === "Hinglish" ? `LANGUAGE INSTRUCTION: Write using a natural blend of Hindi and English as spoken in urban India (Hinglish). Keep sentence structure viral and punchy, but vocabulary conversational — the way a young Indian creator would actually speak.` : "",
    "",
    `Return ONLY the final script text in ${language}. No commentary, no preamble.`,
  ].filter(Boolean).join("\n");
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as GenerateScriptBody;
    const engine = parseEngine(body.engine);

    const dbSettings = await getSettings(session.user.id);
    const openaiApiKey = toStringSafe(body.openaiApiKey) || dbSettings.openaiApiKey;
    const geminiApiKey = toStringSafe(body.geminiApiKey) || dbSettings.geminiApiKey;
    const anthropicApiKey = toStringSafe(body.anthropicApiKey) || dbSettings.anthropicApiKey;

    if (engine === "claude_3_5_sonnet" && !anthropicApiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }
    if (engine === "gpt_4o" && !openaiApiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }
    if (engine === "gemini_1_5_pro" && !geminiApiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }

    const prompt = buildPrompt(body);

    let script = "";
    let model = "";

    if (engine === "claude_3_5_sonnet") {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const result = await anthropic.messages.create({
        model: "claude-4.5-haiku",
        max_tokens: 1000,
        temperature: 0.7,
        system: "You are a world-class short-form script writer who provides clean teleprompter-ready outputs.",
        messages: [{ role: "user", content: prompt }],
      });
      script = result.content.filter(i => i.type === 'text').map(i => (i as any).text).join("\n").trim();
      model = "claude-4.5-haiku";
    } else if (engine === "gemini_1_5_pro") {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const gemini = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
      const result = await gemini.generateContent(prompt);
      script = result.response.text().trim();
      model = "gemini-3-flash-preview";
    } else {
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const result = await openai.chat.completions.create({
        model: "gpt-5-mini-2025-08-07",
        temperature: 0.7,
        messages: [
          { role: "system", content: "You are a world-class short-form script writer who provides clean teleprompter-ready outputs." },
          { role: "user", content: prompt },
        ],
      });
      script = result.choices[0]?.message?.content?.trim() ?? "";
      model = "gpt-5-mini-2025-08-07";
    }

    return NextResponse.json({ script, engine, model });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Script generation error" }, { status: 500 });
  }
}
