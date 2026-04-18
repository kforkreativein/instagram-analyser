import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { scriptBodyForAuxiliaryAI } from "@/lib/script-pacing-utils";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const scriptText = body.scriptContent || body.script || body.text;
    if (!scriptText) return NextResponse.json({ error: "Missing script" }, { status: 400 });

    const settings = await getSettings(session.user.id);
    const apiKey =
      (typeof body.geminiApiKey === "string" && body.geminiApiKey.trim()) ||
      settings.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      "";

    if (!apiKey) return NextResponse.json({ error: "No API Key found" }, { status: 400 });

    const spoken = scriptBodyForAuxiliaryAI(scriptText);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: { responseMimeType: "application/json" },
    });

    const prompt = `You are a storyboard director.

Split the following script into complete SPOKEN SENTENCES only (each sentence ends at . ! or ?). Treat each full sentence as ONE unit — never assign prompts to single words or half-sentences.

Ignore lines that are only bracket labels like [HOOK] or meta lines like "Quick recap".

For EVERY sentence, return one JSON object:
{ "scriptLine": "the exact full sentence from the script", "imagePrompt": "one Midjourney/Flux-ready image prompt for that sentence", "videoPrompt": "one Runway/Kling-style video prompt for that sentence" }

Return ONLY a JSON array (no markdown). Minimum 1 object, maximum 40 objects.

Script:
${spoken}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    let prompts: unknown;
    try {
      prompts = JSON.parse(responseText);
    } catch {
      const first = responseText.indexOf("[");
      const last = responseText.lastIndexOf("]");
      if (first >= 0 && last > first) {
        prompts = JSON.parse(responseText.slice(first, last + 1));
      } else {
        return NextResponse.json({ error: "Invalid JSON from model" }, { status: 502 });
      }
    }

    return NextResponse.json({ prompts });
  } catch (error) {
    console.error("Generate Prompts Error:", error);
    return NextResponse.json({ error: "Failed to generate prompts" }, { status: 500 });
  }
}
