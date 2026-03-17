import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as {
            topic?: string;
            provider?: string;
            apiKey?: string;
            model?: string;
        };

        const topic = (body.topic || "").trim();
        if (!topic) {
            return NextResponse.json({ error: true, message: "Topic is required" }, { status: 400 });
        }

        const provider = body.provider || "Gemini";
        const apiKey = (body.apiKey || "").trim();
        const model = (body.model || "gemini-3-flash-preview").trim();

        if (!apiKey) {
            return NextResponse.json({ error: true, message: `${provider} API key is required.` }, { status: 401 });
        }

        const systemPrompt = `You are an elite researcher for viral short-form content. 
    Topic: ${topic}

    You MUST return a STRICT JSON object with exactly three keys: "title", "executiveSummary", and "facts".
    
    1. "title": A punchy, highly clickable 3-to-5 word title for this script (e.g., "The Sleep Jetlag Killer").
    2. "executiveSummary": A dense, highly informative paragraph summarizing the core mechanics of the topic.
    3. "facts": An array of 3 to 5 shocking facts. Each fact is an object: { "statement": "...", "score": 95 }.

    Format exactly like this:
    {
      "title": "Your Short Title",
      "executiveSummary": "Your paragraph...",
      "facts": [
        { "statement": "The first shocking fact...", "score": 88 },
        { "statement": "The second shocking fact...", "score": 95 }
      ]
    }`;

        let generatedText = "";

        if (provider === "OpenAI") {
            const openai = new OpenAI({ apiKey });
            const response = await openai.chat.completions.create({
                model: model.startsWith("gpt-") ? model : "gpt-5-mini-2025-08-07",
                messages: [{ role: "user", content: systemPrompt }],
                response_format: { type: "json_object" }
            });
            generatedText = response.choices[0]?.message?.content?.trim() ?? "";
        } else if (provider === "Anthropic") {
            const anthropic = new Anthropic({ apiKey });
            const response = await anthropic.messages.create({
                model: model.startsWith("claude-") ? model : "claude-4.5-haiku",
                max_tokens: 1000,
                messages: [{ role: "user", content: systemPrompt }],
            });
            const block = response.content[0];
            generatedText = block && block.type === "text" ? block.text.trim() : "";
        } else {
            const genAI = new GoogleGenerativeAI(apiKey);
            const geminiModel = genAI.getGenerativeModel({
                model: model.startsWith("gemini-") ? model : "gemini-3-flash-preview",
                generationConfig: {
                  responseMimeType: "application/json"
                },
            });
            const response = await geminiModel.generateContent(systemPrompt);
            generatedText = response.response.text().trim();
        }

        return new NextResponse(generatedText, { 
          headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: true, message: error.message || "Research failed" },
            { status: 500 },
        );
    }
}
