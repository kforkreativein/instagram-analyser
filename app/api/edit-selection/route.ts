import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSettings } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { selectedText, prompt, fullContext } = await request.json();

        if (!selectedText || !prompt) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const dbSettings = await getSettings(session.user.id);
        const apiKey = dbSettings.geminiApiKey;

        if (!apiKey) {
            return NextResponse.json({ error: "Gemini API Key not found in Settings." }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const systemPrompt = `You are a script editor. The user wants to change this specific text: '${selectedText}'. Their instruction is: '${prompt}'. Rewrite ONLY the selected text based on the instruction. Do not return the surrounding context, only the replacement text.`;

        const result = await model.generateContent(systemPrompt);
        const replacement = result.response.text().trim().replace(/^["']|["']$/g, '');

        if (!replacement) {
            return NextResponse.json({ error: "No replacement generated" }, { status: 502 });
        }

        return NextResponse.json({ replacement });
    } catch (error) {
        console.error("Edit selection error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unexpected edit error" },
            { status: 500 },
        );
    }
}
