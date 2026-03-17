import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-3-flash-preview";
const TRANSCRIPTION_PROMPT =
  "You are an expert transcriber. Watch this video and provide a highly accurate, word-for-word transcript of the audio. Do not include any formatting, timestamps, speaker names, or descriptions of visuals. Return ONLY the spoken words.";

type TranscribeRequestBody = {
  videoUrl?: string;
  geminiApiKey?: string;
};

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseVideoUrl(value: unknown): string {
  const raw = toStringSafe(value).trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseTranscriptText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:[\w-]+)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as TranscribeRequestBody;
    const videoUrl = parseVideoUrl(body.videoUrl);
    if (!videoUrl) {
      return NextResponse.json({ error: "videoUrl is required" }, { status: 400 });
    }

    const response = await fetch(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
        Referer: "https://www.instagram.com/",
      },
    });
    if (!response.ok) throw new Error(`Instagram blocked the request or URL expired: ${response.statusText}`);

    const videoBuffer = await response.arrayBuffer();
    if (videoBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Failed to fetch video stream" }, { status: 500 });
    }

    const base64String = Buffer.from(videoBuffer).toString("base64");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      { text: TRANSCRIPTION_PROMPT },
      {
        inlineData: {
          data: base64String,
          mimeType: "video/mp4",
        },
      },
    ]);

    const transcript = parseTranscriptText(result.response.text() || "");
    if (!transcript) {
      return NextResponse.json({ error: "Failed to process transcription output" }, { status: 500 });
    }

    return NextResponse.json({ transcript }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch video stream" },
      { status: 500 },
    );
  }
}
