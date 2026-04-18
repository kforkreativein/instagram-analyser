export const maxDuration = 60;

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "../../../lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildHoldTwistPromptBlock, normalizeRemixBucket } from "@/lib/remix-hold-twist-framework";
import { buildClientVoiceAppendix } from "@/lib/client-voice-prompt";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    // 1. MATCH THE FRONTEND VARIABLES EXACTLY
    const {
      tweakAttribute: tweakFromBody,
      attribute: attributeFromBody,
      analysis = {},
      transcript = "",
      onePercentFocus = "",
      selectedModel = "gemini-3-flash-preview",
      clientProfile,
      videoGoal = "Views (Broad Appeal)",
    } = body as Record<string, unknown>;

    const rawTweakAttribute = String(tweakFromBody || attributeFromBody || "Hook");
    const twistBucket = normalizeRemixBucket(rawTweakAttribute);
    const tweakAttribute = twistBucket;

    // 2. SAFELY PULL API KEY (From body OR Settings Database)
    const dbSettings = await getSettings(session.user.id);
    const apiKey = body.geminiApiKey || dbSettings.geminiApiKey;

    // 3. STRICT VALIDATION
    if (!tweakAttribute) {
      console.error("CRASH: Missing tweakAttribute from frontend.");
      return NextResponse.json({ error: "Missing tweakAttribute" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    // Safely fallback analysis object in case it is null/undefined
    const safeAnalysis = (analysis || {}) as Record<string, any>;

    const cp = clientProfile as Record<string, string> | undefined;
    const clientContext = cp
      ? `\nCLIENT VOICE PROFILE:\n- Tone & Persona: ${cp.tonePersona || cp.tone || ""}\n- Audience: ${cp.targetAudience || ""}\n- Vocabulary: ${cp.vocabularyLevel || cp.vocabulary || ""}\n- Niche: ${cp.niche || ""}\nSTRICT: Mirror this client's tone and vocabulary in the remixed script.\n`
      : "";

    const masterGuideAppendix = buildClientVoiceAppendix(
      cp
        ? {
            scriptMasterGuide: cp.scriptMasterGuide,
            customInstructions: cp.customInstructions,
            tonePersona: cp.tonePersona || cp.tone,
            niche: cp.niche,
            targetAudience: cp.targetAudience,
            vocabularyLevel: cp.vocabularyLevel || cp.vocabulary,
          }
        : null,
    );

    const customDirectives =
      cp?.customInstructions && !cp?.scriptMasterGuide
        ? `\n=========================================================\nCLIENT SHORT DIRECTIVES\n${cp.customInstructions}\n=========================================================\n`
        : "";

    const holdTwist = buildHoldTwistPromptBlock({
      twistBucket: tweakAttribute,
      videoGoal: String(videoGoal),
    });

    const systemPrompt = `You are a viral content engineer. You are remixing a winning video analysis.
${masterGuideAppendix}${customDirectives}${clientContext}
${holdTwist}

Original Analysis (map onto five buckets: Format, Idea, Hook, Script, Visuals):
- Idea / angle: ${safeAnalysis.narrative?.seed || safeAnalysis.summary?.coreIdea || "N/A"}
- Hook: ${safeAnalysis.hooks?.spokenHook || safeAnalysis.hookAnalysis?.description || "N/A"}
- Topic label: ${safeAnalysis.narrative?.topic || "N/A"}
- Script / structure: ${safeAnalysis.narrative?.format || safeAnalysis.structureAnalysis?.type || "N/A"}
- Visual format: ${safeAnalysis.architecture?.visualLayout || "N/A"}
- Key Visuals: ${safeAnalysis.architecture?.keyVisuals || "N/A"}
- Audio: ${safeAnalysis.architecture?.audio || "N/A"}
- Transcript: ${transcript || "N/A"}

Selected bucket to TWIST (only this one): ${tweakAttribute}
The other four buckets must stay locked to the reference unless a tiny clarity tweak is unavoidable.

STRICT INSTRUCTION:
1. Output a valid JSON object with these keys: "angle", "hook", "topic", "storyStructure", "visualFormat", "keyVisuals", "audio", "script", "tweakReasoning", "twistedBucket". twistedBucket must be "${tweakAttribute}".
2. Fully rewrite content that belongs to the twisted bucket; keep the rest faithful to the source analysis and transcript.
3. Include the full generated spoken "script" (no camera directions).
4. No markdown fences. Output ONLY the JSON.

THE 1% BETTER RULE:
Iteration focus: "${String(onePercentFocus || "Make it 1% better.")}"
Ensure the new script reflects this focus while respecting Hold 4, Twist 1.`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const rawText = response.text().trim();

    // 4. ROBUST JSON EXTRACTION
    let cleanedText = rawText;
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanedText = rawText.substring(firstBrace, lastBrace + 1);
    } else {
      cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    }

    try {
      const remix = JSON.parse(cleanedText);
      return NextResponse.json({ remix });
    } catch (e) {
      console.error("Failed to parse remix JSON:", cleanedText);
      return NextResponse.json({ error: "Failed to generate valid remix JSON", raw: cleanedText }, { status: 500 });
    }
  } catch (error: any) {
    console.error("REMIX API CRASH:", error);
    return NextResponse.json({ error: "Backend failed to process remix." }, { status: 500 });
  }
}