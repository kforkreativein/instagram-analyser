import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { getSettings } from '../../../lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: true, message: "Unauthorized" }, { status: 401 });

    try {
        const { prompt, geminiApiKey } = await req.json();
        const dbSettings = await getSettings(session.user.id);
        const apiKey = geminiApiKey || dbSettings.geminiApiKey;

        if (!apiKey) return NextResponse.json({ error: true, message: "API Key not found in Settings. Please go to Settings to add it." }, { status: 400 });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

        const generateConcept = async (styleVariation: string) => {
            // The safety layer: We force the AI to abstract real people to avoid deepfake filters
            const safePrompt = `A vertical 9:16 aspect ratio Instagram Reel cover image. Core Topic: ${prompt}. Concept Style: ${styleVariation}. CRITICAL: Do NOT depict real, identifiable people. Use generic silhouettes, avatars, or conceptual imagery instead. High contrast, cinematic lighting.`;

            const response = await model.generateContent(safePrompt);
            const candidate = response.response.candidates?.[0];

            // Catch Google's safety block explicitly
            if (candidate?.finishReason === 'SAFETY') {
                throw new Error("Safety filter tripped: Google AI cannot generate images of real people or unsafe topics. Please edit the script hook to be more generic.");
            }

            const parts = candidate?.content?.parts;
            if (parts && parts[0]?.inlineData) {
                return `data:${parts[0].inlineData.mimeType || 'image/jpeg'};base64,${parts[0].inlineData.data}`;
            }
            return null;
        };

        // Fetch sequentially to prevent 429 Too Many Requests errors
        const img1 = await generateConcept("Bold, minimal, dramatic lighting, focused on a generic human silhouette");
        const img2 = await generateConcept("Abstract, neon accents, highly dynamic and fast-paced aesthetic");
        const img3 = await generateConcept("Clean, bright, infographic-style, high-end studio lighting");
        const img4 = await generateConcept("Gritty, documentary-style, realistic and highly intriguing");

        const finalImages = [img1, img2, img3, img4].filter(Boolean);
        if (finalImages.length === 0) {
            throw new Error("No image data returned. Your prompt may contain names of real people.");
        }

        return NextResponse.json({ images: finalImages });
    } catch (error: any) {
        console.error("Image Generation Error:", error);
        return NextResponse.json({
            error: true,
            message: error.message || "Failed to generate thumbnails."
        }, { status: 500 });
    }
}
