import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const DB_PATH = path.join(process.cwd(), "database.json");

function readDB() {
  const data = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(data);
}

function writeDB(data: any) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Ensure unique platform naming
function detectPlatform(url: string) {
  if (url.includes("instagram.com")) return "Instagram";
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  return "Unknown";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { videoUrl, apifyApiKey: bodyApifyKey, geminiApiKey: bodyGeminiKey } = await req.json();
    const clientId = params.id;

    // Fetch user's API keys from database
    let apifyToken = bodyApifyKey;
    let geminiKey = bodyGeminiKey;
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (user?.id) {
          const userSettings = await prisma.settings.findUnique({ where: { userId: user.id } });
          if (userSettings?.apifyApiKey) {
            apifyToken = userSettings.apifyApiKey;
          }
          if (userSettings?.geminiApiKey) {
            geminiKey = userSettings.geminiApiKey;
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch user settings:", error);
    }

    if (!videoUrl) {
      return NextResponse.json({ error: "Missing required field: videoUrl" }, { status: 400 });
    }
    if (!apifyToken || !geminiKey) {
      return NextResponse.json({ error: "API Keys Missing. Please save them in the Settings tab." }, { status: 400 });
    }

    const platform = detectPlatform(videoUrl);
    
    // 1. Scrape using Apify (native fetch)
    let metrics = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
    let transcript = "";
    let title = "";
    let thumbnailUrl = "";

    console.log(`[Track-Video] Scraping ${platform} URL: ${videoUrl}`);

    if (platform === "Instagram") {
      // Standard apify~instagram-scraper (included in plan, no rental needed)
      const apifyUrl = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${apifyToken}`;

      const apifyRes = await fetch(apifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directUrls: [videoUrl],
          resultsType: "details",
          searchType: "hashtag",
          searchLimit: 1,
          proxyConfiguration: { useApifyProxy: true }
        }),
        cache: "no-store"
      });

      const items = await apifyRes.json();

      // 🔥 FORCE TERMINAL LOG
      console.log("🔥 APIFY RAW DATA 🔥:", JSON.stringify(items[0] || items).substring(0, 500));

      if (!items || items.length === 0) {
        console.error("❌ APIFY FAILED: Returned empty array. URL might be invalid or private.");
      }

      const item = items[0] || {};

      // Check for restricted/login-required error
      const isRestricted = (items as any).error === 'restricted_page' || item.error === 'restricted_page';

      thumbnailUrl = isRestricted ? "" : (item.displayUrl || item.thumbnailUrl || item.resources?.[0]?.src || "");
      transcript = isRestricted
        ? "Instagram blocked access. This video requires Apify session cookies to scrape."
        : (item.caption || "");
      title = isRestricted
        ? "⚠️ LOGIN REQUIRED — Instagram blocked scrape"
        : (item.caption ? item.caption.substring(0, 50) + "..." : "Instagram Post");
      metrics = {
        views: item.videoPlayCount || item.viewCount || item.playCount || 0,
        likes: item.likesCount || item.edge_liked_by?.count || 0,
        comments: item.commentsCount || item.edge_media_to_comment?.count || 0,
        shares: 0,
        saves: 0
      };
    } else if (platform === "YouTube") {
      const input = {
        startUrls: [{ url: videoUrl }],
        max_results: 1,
        scrape_shorts: true
      };
      const apifyRes = await fetch(
        `https://api.apify.com/v2/acts/apify~youtube-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" }
      );
      if (!apifyRes.ok) throw new Error(`Apify API Error: ${await apifyRes.text()}`);
      const items: any[] = await apifyRes.json();

      if (items && items.length > 0) {
        const post = items[0] as any;
        metrics = {
          views: post.viewCount || 0,
          likes: post.likeCount || 0,
          comments: post.commentCount || 0,
          shares: 0,
          saves: 0
        };
        transcript = post.text || post.description || post.title || "";
        title = post.title || "YouTube Short";
        thumbnailUrl = post.thumbnailUrl || "";
      } else {
        throw new Error("YouTube scraper returned no results.");
      }
    } else {
      return NextResponse.json({ error: "Platform not fully supported for track-video yet." }, { status: 400 });
    }

    // 2. Deep Analysis with Gemini
    const selectedModel = "gemini-2.5-flash";
    console.log(`[Track-Video] Generating Deep Analysis with model: ${selectedModel}`);
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: selectedModel });

    const prompt = `You are an elite video content analyst. Analyze the following video transcript/caption and return a strict JSON object with this exact structure:
{
  "narrative": { "topic": "...", "seed": "...", "substance": "...", "storyStructure": "..." },
  "hooks": { "spokenHook": "...", "visualHook": "...", "textHook": "...", "hookType": "..." },
  "architecture": { "visualLayout": "...", "visualElements": "...", "keyVisuals": "...", "audio": "..." },
  "conversion": { "cta": "..." }
}

STRICT RULE for hookType: Must be EXACTLY one of ["Secret Reveal", "Contrarian", "Problem Hook", "Question Hook", "Value Proposition", "Story/Anecdote", "Pattern Interrupt", "Negative Hook/Warning", "Action/Demonstration", "Myth-Bust"].
STRICT RULE for storyStructure: Must be EXACTLY one of ["Listicle", "Step-by-Step", "Storytelling", "Myth vs Fact", "Problem/Agitation/Solution", "Before & After", "Breakdown/Analysis"].

Transcript/Caption:
${transcript.slice(0, 5000)}

Return ONLY valid JSON. No markdown formatting blocks.`;

    const result = await model.generateContent(prompt);
    let analysisOutput = null;
    try {
      let text = result.response.text().trim();
      text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
      analysisOutput = JSON.parse(text);
    } catch (e) {
      console.warn("Failed to parse Deep Analysis JSON. Using generic fallback.");
      analysisOutput = {
        narrative: { topic: "Unknown", seed: "Unknown", substance: transcript.substring(0, 100), storyStructure: "Storytelling" },
        hooks: { spokenHook: "Unknown", visualHook: "", textHook: "", hookType: "Contrarian" },
        architecture: { visualLayout: "Unknown", visualElements: "", keyVisuals: "", audio: "" },
        conversion: { cta: "" }
      };
    }

    // 3. Save to database
    console.log(`[Track-Video] Saving tracked video to client DB...`);
    const db = readDB();
    const clientIndex = db.clients.findIndex((c: any) => c.id === clientId);
    if (clientIndex === -1) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const newVideo = {
      id: crypto.randomUUID(),
      url: videoUrl,
      platform,
      thumbnailUrl,
      title,
      metrics,
      analysis: analysisOutput,
      addedAt: new Date().toISOString(),
      lastRefreshed: new Date().toISOString()
    };

    if (!db.clients[clientIndex].trackedVideos) {
      db.clients[clientIndex].trackedVideos = [];
    }
    db.clients[clientIndex].trackedVideos.push(newVideo);
    
    writeDB(db);

    return NextResponse.json(newVideo);
  } catch (error: any) {
    console.error("Track Video API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to track video" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get("videoId");
    const clientId = params.id;

    if (!videoId) {
      return NextResponse.json({ error: "Missing videoId parameter." }, { status: 400 });
    }

    const db = readDB();
    const clientIndex = db.clients.findIndex((c: any) => c.id === clientId);
    if (clientIndex === -1) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }

    const before = (db.clients[clientIndex].trackedVideos || []).length;
    db.clients[clientIndex].trackedVideos = (db.clients[clientIndex].trackedVideos || []).filter(
      (v: any) => v.id !== videoId
    );

    if (db.clients[clientIndex].trackedVideos.length === before) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    writeDB(db);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete Video API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete video." }, { status: 500 });
  }
}
