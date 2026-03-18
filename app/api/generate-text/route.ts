import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "Gemini" | "OpenAI" | "Anthropic";

function mapOpenAIModel(model: string): string {
    const modelMap: Record<string, string> = {
        "GPT-4o": "gpt-5-mini-2025-08-07",
        "GPT-5": "gpt-5",
        "GPT-5.1": "gpt-5.1",
        "GPT-5.2": "gpt-5.2",
    };
    return modelMap[model] ?? "gpt-5-mini-2025-08-07";
}

function mapAnthropicModel(model: string): string {
    const modelMap: Record<string, string> = {
        "Claude 3.7 Sonnet": "claude-3-7-sonnet-latest",
        "Claude 4.5 Sonnet": "claude-4-5-sonnet-latest",
    };
    return modelMap[model] ?? "claude-4.5-haiku";
}

function mapGeminiModel(model: string): string {
    // If the value already looks like a raw API model ID, use it directly
    if (model.startsWith("gemini-")) return model;

    const modelMap: Record<string, string> = {
        "Gemini 3.0 Flash": "gemini-3-flash-preview",
        "Gemini 3.0 Pro": "gemini-3-flash-preview",
    };
    return modelMap[model] ?? "gemini-3-flash-preview";
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as {
            prompt?: string;
            provider?: string;
            apiKey?: string;
            model?: string;
            responseFormat?: string;
        };

        const {
            topic,
            researchContent,
            selectedAngle,
            selectedHook,
            selectedStyle,
            emotion,
            intensity,
            videoLength,
            scriptJob = "Views (Broad Appeal)",
            language = "English"
        } = body as any;

        let prompt = (body.prompt || "").trim();

        // If we have the pillars, construct the master synthesis prompt
        if (topic && selectedHook && selectedStyle) {
            prompt = `You are a world-class short-form viral scriptwriter.

CONTEXT:
- Topic / Core Takeaway: ${topic}
- Research/Substance: ${researchContent || 'General knowledge'}
- Angle & Shock Score: ${selectedAngle ? JSON.stringify(selectedAngle) : 'None'}
- Hook Framework: ${selectedHook}
- Story Structure Outline: ${selectedStyle}
- Emotion Filter: ${emotion || 'Engaging'}
- Emotion Intensity: ${intensity || 5}/10
- Script Job: ${scriptJob}
- Target Length: ${videoLength || 60} seconds
- Language: ${language}

STRICT CRITERIA & STRUCTURE:
1. Follow the 4 hook commandments: ALIGNMENT, SPEED TO VALUE, CLARITY, CURIOSITY GAP.
2. Write with 1 topic / 1 takeaway.
3. Tone: conversational, punchy, human, non-corny.
4. Use one sentence per line, with blank lines between sentences.
5. Add [VISUAL: description] cues every 2-3 lines.
6. Include [PAUSE] markers for pacing.
7. End with a strong CTA.

Return ONLY the final script text. Do not include introductory filler. Output in ${language}.`;
        }

        if (!prompt) {
            return NextResponse.json({ error: true, message: "prompt or core pillars are required" }, { status: 400 });
        }

        const provider = (body.provider || "Gemini") as Provider;
        const apiKey = (body.apiKey || "").trim();
        const model = (body.model || "").trim();
        const wantJSON = body.responseFormat === "json";

        const safeModel = model;

        if (wantJSON) {
            prompt += "\n\nIMPORTANT: Return ONLY valid JSON. No markdown code fences, no extra text.";
        }

        if (!apiKey) {
            return NextResponse.json(
                { error: true, message: `${provider} API key is required.` },
                { status: 401 },
            );
        }

        let generatedText = "";

        if (provider === "OpenAI") {
            const selectedModel = mapOpenAIModel(safeModel);
            const openai = new OpenAI({ apiKey });
            const response = await openai.chat.completions.create({
                model: selectedModel,
                messages: [{ role: "user", content: prompt }],
            });
            generatedText = response.choices[0]?.message?.content?.trim() ?? "";
        } else if (provider === "Anthropic") {
            const selectedModel = mapAnthropicModel(safeModel);
            const anthropic = new Anthropic({ apiKey });
            const response = await anthropic.messages.create({
                model: selectedModel,
                max_tokens: 2000,
                messages: [{ role: "user", content: prompt }],
            });
            const block = response.content[0];
            generatedText = block && block.type === "text" ? block.text.trim() : "";
        } else {
            // Gemini (default)
            const genAI = new GoogleGenerativeAI(apiKey);
            const geminiModel = genAI.getGenerativeModel({
                model: mapGeminiModel(safeModel),
                generationConfig: {},
            });
            const response = await geminiModel.generateContent(prompt);
            generatedText = response.response.text().trim();
        }

        // If JSON was requested, clean and parse the output
        if (wantJSON) {
            let cleaned = generatedText
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim();
            try {
                const parsed = JSON.parse(cleaned);
                return NextResponse.json({ text: JSON.stringify(parsed), json: parsed });
            } catch {
                // Return raw text if parsing fails — let the client handle it
                return NextResponse.json({ text: cleaned });
            }
        }

        return NextResponse.json({ text: generatedText });
    } catch (error: any) {
        console.error("Text generation error:", error);

        // Provide a clearer frontend error instead of silent failures or generic messages
        const errMsg = error?.message || "";
        if (errMsg.toLowerCase().includes("timeout") || errMsg.toLowerCase().includes("fetch")) {
            return NextResponse.json(
                { error: "AI Provider Timeout - Check API Key or try a different model." },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { error: "Text generation failed" },
            { status: 500 },
        );
    }
}
