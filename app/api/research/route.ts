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
        const model = (body.model || "gemini-2.5-flash").trim();

        if (!apiKey) {
            return NextResponse.json({ error: true, message: `${provider} API key is required.` }, { status: 401 });
        }

        const systemPrompt = `You are an expert researcher. The user wants to make a video about: ${topic}. Provide 3-4 highly factual, interesting data points, statistics, or practical real-world examples related to this topic. Return a strict JSON array of objects with the following format: [{ "fact": "string", "shockScore": number }]. The shockScore should be a number from 1 to 100 based on this exact prompt: "Out of 100 people, how many would NOT have heard this fact before?". Do not return markdown blocks, just raw JSON.`;

        let generatedText = "";

        if (provider === "OpenAI") {
            const openai = new OpenAI({ apiKey });
            const response = await openai.chat.completions.create({
                model: model.startsWith("gpt-") ? model : "gpt-4o",
                messages: [{ role: "user", content: systemPrompt }],
            });
            generatedText = response.choices[0]?.message?.content?.trim() ?? "";
        } else if (provider === "Anthropic") {
            const anthropic = new Anthropic({ apiKey });
            const response = await anthropic.messages.create({
                model: model.startsWith("claude-") ? model : "claude-3-5-sonnet-20241022",
                max_tokens: 1000,
                messages: [{ role: "user", content: systemPrompt }],
            });
            const block = response.content[0];
            generatedText = block && block.type === "text" ? block.text.trim() : "";
        } else {
            const genAI = new GoogleGenerativeAI(apiKey);
            const geminiModel = genAI.getGenerativeModel({
                model: model.startsWith("gemini-") ? model : "gemini-2.5-flash",
                generationConfig: { temperature: 0.5 },
            });
            const response = await geminiModel.generateContent(systemPrompt);
            generatedText = response.response.text().trim();
        }

        return NextResponse.json({ text: generatedText });
    } catch (error: any) {
        return NextResponse.json(
            { error: true, message: error.message || "Research failed" },
            { status: 500 },
        );
    }
}
