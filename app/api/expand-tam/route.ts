import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, provider = "Gemini", apiKey, model } = body;

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: `${provider} API key is required` }, { status: 401 });
    }

    const prompt = `You are a viral content strategist. Take this video topic and rewrite it to appeal to a significantly broader, mainstream audience while keeping the core premise intact. Make the Total Addressable Market (TAM) as large as possible. 

Original Topic: "${topic}"

STRICT INSTRUCTION: Return ONLY the rewritten topic. No quotes, no conversational filler, no introductions. Return the text for a single concise sentence.`;

    let expandedTopic = "";

    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: model || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
      });
      expandedTopic = response.choices[0]?.message?.content?.trim() ?? "";
    } else if (provider === "Anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: model || "claude-3-5-sonnet-latest",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });
      expandedTopic = (response.content[0] as any).text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: model || "gemini-1.5-pro" });
      const response = await geminiModel.generateContent(prompt);
      expandedTopic = response.response.text().trim();
    }

    return NextResponse.json({ expandedTopic });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "TAM expansion failed" }, { status: 500 });
  }
}
