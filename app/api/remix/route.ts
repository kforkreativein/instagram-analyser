import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "../../../lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    // 1. MATCH THE FRONTEND VARIABLES EXACTLY
    const { tweakAttribute = "", analysis = {}, transcript = "", onePercentFocus = "", selectedModel = "gemini-1.5-pro", clientProfile } = body;

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
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

    // Safely fallback analysis object in case it is null/undefined
    const safeAnalysis = analysis || {};

    const clientContext = clientProfile ? `\nCLIENT VOICE PROFILE:\n- Tone & Persona: ${clientProfile.tonePersona || clientProfile.tone || ""}\n- Audience: ${clientProfile.targetAudience}\n- Vocabulary: ${clientProfile.vocabularyLevel || clientProfile.vocabulary || ""}\n- Niche: ${clientProfile.niche}\nSTRICT: Mirror this client's tone and vocabulary in the remixed script.\n` : "";

    const customDirectives = clientProfile?.customInstructions ? `\n=========================================================\n🔥 MASTER CLIENT OVERRIDE: STRICT PERSONA & RULES 🔥\nYou must absolutely embody the following persona and follow every single formatting rule, tone restriction, and output requirement listed below. This block supersedes all other tonal instructions:\n\n${clientProfile.customInstructions}\n=========================================================\n` : "";

    const systemPrompt = `You are a viral content engineer. You are remixing a winning video analysis.
${customDirectives}${clientContext}Strictly follow the 'Hold 6, Tweak 1' rule.
You must LOCK 6 of these 7 attributes exactly as they are in the original video: Angle, Hook, Topic, Story Structure, Visual Format, Key Visuals, Audio.
You will ONLY completely change the attribute the user selected: [${tweakAttribute}].

Original Analysis:
- Angle: ${safeAnalysis.narrative?.seed || safeAnalysis.summary?.coreIdea || "N/A"}
- Hook: ${safeAnalysis.hooks?.spokenHook || safeAnalysis.hookAnalysis?.description || "N/A"}
- Topic: ${safeAnalysis.narrative?.topic || "N/A"}
- Story Structure: ${safeAnalysis.narrative?.format || safeAnalysis.structureAnalysis?.type || "N/A"}
- Visual Format: ${safeAnalysis.architecture?.visualLayout || "N/A"}
- Key Visuals: ${safeAnalysis.architecture?.keyVisuals || "N/A"}
- Audio: ${safeAnalysis.architecture?.audio || "N/A"}
- Transcript: ${transcript || "N/A"}

Selected Attribute to TWEAK: ${tweakAttribute}

STRICT INSTRUCTION:
1. Provide the remixed version where 6 attributes stay identical and the selected one is completely rewritten for maximum viral potential.
2. The output must be a valid JSON object with these keys: "angle", "hook", "topic", "storyStructure", "visualFormat", "keyVisuals", "audio", "script" and "tweakReasoning". Important: Include the full generated "script".
3. Do not use markdown fences. Output ONLY the JSON.

THE 1% BETTER RULE: 
The user is tweaking one specific attribute to iterate on this winning video. Their explicit iteration goal for this new version is: "[${onePercentFocus || "Make it 1% better."}]".
You MUST ensure the new generated script heavily over-indexes on this specific focus.`;

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
    return NextResponse.json({ error: "Backend failed to process remix.", details: error.message }, { status: 500 });
  }
}