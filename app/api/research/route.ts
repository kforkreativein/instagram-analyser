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
            clientProfile?: string;
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

        const clientProfile = body.clientProfile || "General Creator";

        const systemPrompt = `You are an elite research strategist for short-form video.
Topic: ${topic}
Target Client/Brand Profile: ${clientProfile}

Analyze the topic specifically through the lens of the Target Client Profile. You MUST return a STRICT JSON object with these keys:
1. "title": A highly clickable 3-to-5 word title.
2. "executiveSummary": A dense, 2-sentence summary of the core thesis.
3. "engagementAngles": An array of 2 string bullet points on 'How To Engage Viewers' (e.g., specific hooks, mysteries to open with, or relatable analogies).
4. "facts": An array of 3 to 4 surprising facts. Each must be an object: { "statement": "The fact...", "score": 95 }. Score based on viral potential.
5. "contrastMoments": An array of 2 string bullet points highlighting a 'Myth vs Reality' or 'Common Belief vs Truth' related to the topic.

Format EXACTLY as valid JSON.`;

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
            { error: true, message: "Research failed" },
            { status: 500 },
        );
    }
}
