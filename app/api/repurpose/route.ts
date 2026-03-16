import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60; // Prevent Vercel Timeout

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1. Parse the incoming body safely
    const body = await req.json();
    const scriptText = body.scriptContent || body.script || body.text;
    const platform = body.platform;

    if (!scriptText || !platform) {
      return NextResponse.json({ error: "Missing script or platform" }, { status: 400 });
    }

    // 2. Fetch User Settings for API Key
    const user = await prisma.user.findUnique({ 
      where: { email: session.user.email },
      include: { settings: true }
    });
    
    const apiKey = user?.settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API Key found. Please add it in Settings." }, { status: 400 });

    // 3. Call the AI
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Fast model

    const prompt = `You are an expert social media manager. Convert this video script into a highly engaging text post for ${platform}. 
    If Twitter, make it a concise thread (using 🧵). 
    If LinkedIn, use a professional but engaging hook with good spacing. 
    If YouTube, write a community tab post or SEO description. 
    DO NOT output markdown code blocks like \`\`\` or \`\`\`json. Output ONLY the raw text.
    
    Script:
    ${scriptText}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 4. Return success
    return NextResponse.json({ repurposedContent: responseText });

  } catch (error) {
    console.error("Repurpose API Error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}
