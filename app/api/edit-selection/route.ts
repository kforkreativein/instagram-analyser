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
        const { fullScript, selectedText, promptCommand } = await request.json();

        if (!promptCommand) {
            return NextResponse.json({ error: "Missing required promptCommand" }, { status: 400 });
        }

        const dbSettings = await getSettings(session.user.id);
        const apiKey = dbSettings.geminiApiKey;

        if (!apiKey) {
            return NextResponse.json({ error: "Gemini API Key not found in Settings." }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const systemPrompt = `You are an elite script editor. 
Context (Full Script): "${fullScript}"
Target Text to Edit: "${selectedText || fullScript}"
User Command: "${promptCommand}"

Execute the user command on the Target Text. 
CRITICAL RULES:
1. Return ONLY the final edited text. 
2. DO NOT include quotes, markdown formatting, or introductory phrases like "Here is the rewrite".
3. If the user only selected a specific sentence, rewrite ONLY that sentence so it flows perfectly back into the context.`;

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
