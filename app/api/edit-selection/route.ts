export const maxDuration = 60;

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
        const { fullScript, selectedText, promptCommand, videoLength, geminiApiKey: bodyGemini } = await request.json();

        if (!promptCommand) {
            return NextResponse.json({ error: "Missing required promptCommand" }, { status: 400 });
        }

        const dbSettings = await getSettings(session.user.id);
        const apiKey =
            (typeof bodyGemini === "string" && bodyGemini.trim()) ||
            dbSettings.geminiApiKey ||
            process.env.GEMINI_API_KEY ||
            "";

        if (!apiKey) {
            return NextResponse.json({ error: "Gemini API Key not found. Add it in Settings or Script Studio keys." }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        // When no text is selected (or only whitespace), the user is rewriting the full script — enforce word budget
        const isFullRewrite =
            selectedText == null || typeof selectedText !== "string" || !selectedText.trim();
        const targetSeconds = videoLength ? Number(videoLength) : null;
        const maxWordCount = targetSeconds ? Math.floor(targetSeconds * 2.5) : null;
        const minWordCount = targetSeconds ? Math.floor(targetSeconds * 2.0) : null;
        const lengthConstraint = (isFullRewrite && maxWordCount)
            ? `\n5. WORD BUDGET: This is a ${targetSeconds}-second video. The rewritten script MUST be between ${minWordCount} and ${maxWordCount} words. Do NOT exceed ${maxWordCount} words.`
            : "";

        const systemPrompt = `You are an elite script editor.
Context (Full Script): "${fullScript}"
Target Text to Edit: "${selectedText || fullScript}"
User Command: "${promptCommand}"

Execute the user command ON THE TARGET TEXT ONLY.

CRITICAL RULES:
1. You MUST return ONLY the final edited version of the "Target Text".
2. DO NOT return the "Full Script".
3. DO NOT include quotes around your answer, markdown formatting, or introductory phrases like "Here is the rewrite".
4. Ensure your edited text flows perfectly back into the surrounding context.${lengthConstraint}`;

        const result = await model.generateContent(systemPrompt);
        const replacement = result.response.text().trim().replace(/^["']|["']$/g, '');

        if (!replacement) {
            return NextResponse.json({ error: "No replacement generated" }, { status: 502 });
        }

        return NextResponse.json({ replacement });
    } catch (error) {
        console.error("Edit selection error:", error);
        return NextResponse.json(
            { error: "Unexpected edit error" },
            { status: 500 },
        );
    }
}
