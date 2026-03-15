import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "../../../lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { script, action, geminiApiKey, pacingAnalysis, focusArea, videoLength, clientProfile } = body;

    const apiKey = geminiApiKey || getSettings().geminiApiKey;

    if (!script) {
      return NextResponse.json({ error: "Missing script content" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not found in Settings. Please go to Settings to add it." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

    const customDirectives = clientProfile?.customInstructions ? `=========================================================\n🔥 MASTER CLIENT OVERRIDE: STRICT PERSONA & RULES 🔥\nYou must absolutely embody the following persona and follow every single formatting rule, tone restriction, and output requirement listed below. This block supersedes all other tonal instructions:\n\n${clientProfile.customInstructions}\n=========================================================\n\n` : "";

    let systemPrompt = "";
    const targetWords = videoLength ? Math.round(videoLength * 2.5) : null;
    const criticalInstructions = targetWords ? `\n\nCRITICAL OUTPUT RULES:\n1. NO VISUAL CUES: Output ONLY spoken words — no [Visual: ...], camera angles, or b-roll.\n2. TARGET LENGTH: Output exactly ${targetWords} words (±5). Do not exceed this.\n3. FORMATTING: Separate every sentence with a double line break. No paragraphs.\n4. HEADERS: Use bracketed section headers on their own line, e.g., [HOOK], [BODY], [CALL TO ACTION].` : "";
    switch (action) {
      case 'improve':
        if (pacingAnalysis) {
          const issues = pacingAnalysis.segments
            ?.filter((s: any) => s.status === 'Slow' || s.status === 'Critical')
            .map((s: any) => `Lines ${s.lineStart}-${s.lineEnd}: ${s.note}`)
            .join('\n') || pacingAnalysis.summary || "";
          systemPrompt = `${customDirectives}Rewrite this script to specifically fix these pacing issues:\n${issues}\n\nKeep the same language and tone. Return ONLY the rewritten script.${criticalInstructions}\n\nScript:\n${script}`;
        } else if (focusArea === 'hook') {
          systemPrompt = `${customDirectives}Rewrite ONLY the first 2-3 lines of this script to create a stronger hook that grabs attention instantly. Keep the rest of the script identical. Return the full script.${criticalInstructions}\n\nScript:\n${script}`;
        } else if (focusArea === 'structure') {
          systemPrompt = `${customDirectives}Restructure this script for better story flow: [HOOK] → [BODY] → [CALL TO ACTION]. Improve transitions between sections. Keep the core idea and language. Return ONLY the rewritten script.${criticalInstructions}\n\nScript:\n${script}`;
        } else {
          systemPrompt = `${customDirectives}Rewrite this script for 10% more retention. Make it 100% natural and human. Remove all AI-typical phrases. Use the exact same language as the input. Return ONLY the rewritten script.${criticalInstructions}\n\nScript:\n${script}`;
        }
        break;
      case 'pacing':
        systemPrompt = `Analyze this script's pacing as a Retention Engineer. Identify specific LINES where attention drops, value is delayed, or the pace is too slow.

Script (each line is numbered):
${script.split('\n').map((l: string, i: number) => `${i + 1}. ${l}`).join('\n')}

Return ONLY this JSON (no markdown, no extra text):
{"segments":[{"lineStart":1,"lineEnd":2,"status":"Good","note":"Strong opening hook"},{"lineStart":5,"lineEnd":6,"status":"Slow","note":"Value delayed here"}],"summary":"Overall assessment in one sentence"}

Status must be one of: "Good", "Slow", "Critical"`;
        break;
      case 'visuals':
        systemPrompt = `Analyze this script and produce a B-Roll cue list for every 5-second segment. Use ONLY this markdown format, one entry per line:\n- **0:00-0:05:** Description of the visual action or B-roll.\n\nDo not use tables. Do not add any extra text. Return ONLY the markdown list.\n\nScript:\n${script}`;
        break;
      case 'prompts':
        systemPrompt = `Generate a list of highly detailed Midjourney/Flux AI image generation prompts for the key scenes in this script. Each prompt should include subject, style, lighting, and camera details. Number each prompt.\n\nScript:\n${script}`;
        break;
      case 'caption':
        systemPrompt = `Write a viral Instagram caption and 5 high-impact hashtags for this script. Lead with a strong hook. Return ONLY the caption text followed by the hashtags.\n\nScript:\n${script}`;
        break;
      case 'brainstorm':
        systemPrompt = `You are a Retention Engineer and viral video director. Analyze this script holistically and find 3 specific ways to make it 1% better.

Do not just edit words. Analyze the full video concept. Suggest improvements for:
1. Visual Pattern Interrupts: Where should the camera cut, zoom, or graphic appear to re-hook attention?
2. Sound Design Cues: What audio (music swell, silence, SFX) would amplify the emotional peak?
3. Pacing & B-Roll Alignment: Which spoken lines need a B-roll cut to maintain visual momentum?
4. Payoff Speed: Can the core value be delivered faster in the first 3 seconds?
5. Curiosity Gap: Is the hook strong enough to hold attention until the end?

Script: ${script}

Return ONLY a valid JSON array. No markdown. No extra text. Format:
[{"title": "Fix X", "suggestion": "Do Y because Z", "impact": "High"}]`;
        break;
      case 'shorten':
        systemPrompt = `You are a ruthless viral video editor. Your goal is to shorten this script and increase retention speed.

  Here is the current script: [${script}]
  Here is the pacing analysis: [${JSON.stringify(pacingAnalysis)}]

  INSTRUCTIONS:
  1. Look specifically at the "Slow" or "Critical" drop-off points identified in the pacing analysis.
  2. Aggressively cut fluff, repeated points, and over-explanations in those specific sections.
  3. Reduce the overall word count by at least 15-20%.
  4. Maintain the line-by-line formatting (double line breaks) and [HOOK], [BODY] headers.
  5. DO NOT output visual cues. Only output the spoken script.`;
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const output = response.text().trim();

    return NextResponse.json({ result: output });
  } catch (error: any) {
    console.error("SCRIPT ACTION API CRASH:", error);
    return NextResponse.json({ error: "Backend failed to process action", details: error.message }, { status: 500 });
  }
}
