import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const { scripts, apiKey } = await req.json();

    if (!scripts || !Array.isArray(scripts) || scripts.length === 0) {
      return NextResponse.json({ error: "No scripts provided for analysis" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is required" }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are a content style analyst and viral growth engineer. Analyse the following scripts (including their "winning signals") and extract their writing style profile and a strategic "double down" growth plan.

    SCRIPTS TO ANALYSE:
    ${scripts.map((s, i) => `Script ${i + 1}:\nContent: ${s.content}\nWinning Signal: ${s.signal}`).join("\n\n")}
    
    Output a strict JSON object with these 9 keys:
    1. tone (string)
    2. sentenceLength (string)
    3. vocabularyLevel (string)
    4. emotionUsed (string)
    5. pacing (string)
    6. hookPattern (string)
    7. ctaPattern (string)
    8. repeatedPhrases (array of strings)
    9. doubleDownStrategy (string: Based on the "Winning Signals" of these scripts, provide a 1-2 sentence high-level strategy on what this creator should do more of to guarantee the next viral hit.)
    
    STRICT INSTRUCTION: Return ONLY the JSON object. Do not include markdown formatting or any other text.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    // Clean up potential markdown formatting if model ignores instruction
    const jsonString = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    try {
      const styleDNA = JSON.parse(jsonString);
      return NextResponse.json(styleDNA);
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText);
      return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 });
    }

  } catch (error) {
    console.error("Style analysis error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
