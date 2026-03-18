import { NextResponse } from 'next/server';

function chunkTextSafely(text: string, maxCharLimit = 400) {
    const paragraphs = text.split(/\n+/).filter(p => p.trim() !== "");
    const chunks: string[] = [];
    for (const p of paragraphs) {
        if (p.length <= maxCharLimit) {
            chunks.push(p);
        } else {
            // Fallback to sentence splitting if a single paragraph is too long
            const sentences = p.match(/[^.!?]+[.!?]+/g) || [p];
            let currentTempChunk = "";
            for (const s of sentences) {
                if ((currentTempChunk + s).length <= maxCharLimit) {
                    currentTempChunk += s + " ";
                } else {
                    if (currentTempChunk) chunks.push(currentTempChunk.trim());
                    currentTempChunk = s + " ";
                }
            }
            if (currentTempChunk) chunks.push(currentTempChunk.trim());
        }
    }
    return chunks;
}

export async function POST(req: Request) {
    try {
        const { text, language, sarvamApiKey } = await req.json();

        if (!sarvamApiKey) {
            return NextResponse.json({ error: true, message: "Sarvam API key is missing in Settings." }, { status: 400 });
        }

        const langMap: Record<string, string> = {
            'English': 'en-IN',
            'Hindi': 'hi-IN',
            'Hinglish': 'hi-IN',
            'Gujarati': 'gu-IN',
            'Marathi': 'mr-IN'
        };

        const targetCode = langMap[language] || 'hi-IN';
        const textChunks = chunkTextSafely(text);
        const audioChunks: string[] = [];

        for (const chunk of textChunks) {
            const response = await fetch('https://api.sarvam.ai/text-to-speech', {
                method: 'POST',
                headers: {
                    'api-subscription-key': sarvamApiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: [chunk],
                    target_language_code: targetCode,
                    speaker: 'shubh',
                    pace: 1.0,
                    speech_sample_rate: 8000,
                    enable_preprocessing: true,
                    model: 'bulbul:v3'
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return NextResponse.json({ error: true, message: `Chunk failed: ${errText}` }, { status: response.status });
            }

            const data = await response.json();
            if (data.audios && data.audios[0]) {
                audioChunks.push(data.audios[0]);
            }
        }

        if (audioChunks.length === 0) {
            return NextResponse.json({ error: true, message: 'No audio generated' }, { status: 500 });
        }

        return NextResponse.json({ audioChunks });

    } catch (error: any) {
        console.error("TTS Stitching Error:", error);
        return NextResponse.json({ error: true, message: 'Failed to generate audio' }, { status: 500 });
    }
}
