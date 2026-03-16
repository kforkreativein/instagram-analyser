import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ClientTrackedVideo } from "../../../../../lib/types";
import { getSettings } from "../../../../../lib/db";

const DB_PATH = path.join(process.cwd(), "database.json");

function readDB() {
  const data = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(data);
}

function writeDB(data: any) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { apifyApiKey: bodyApifyKey } = await req.json();
    const clientId = params.id;

    // Fetch user's Apify key from database
    let apifyToken = bodyApifyKey;
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (user?.id) {
          const userSettings = await prisma.settings.findUnique({ where: { userId: user.id } });
          if (userSettings?.apifyApiKey) {
            apifyToken = userSettings.apifyApiKey;
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch user settings:", error);
    }

    // Fallback to getSettings
    const settings = getSettings();
    if (!apifyToken) {
      apifyToken = settings?.apifyApiKey;
    }

    if (!apifyToken) {
      return NextResponse.json({ error: "API Keys Missing. Please save them in the Settings tab." }, { status: 400 });
    }

    const db = readDB();
    const clientIndex = db.clients.findIndex((c: any) => c.id === clientId);
    if (clientIndex === -1) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const clientData = db.clients[clientIndex];
    if (!clientData.trackedVideos || clientData.trackedVideos.length === 0) {
      return NextResponse.json({ success: true, message: "No videos to refresh" });
    }

    // Separate URLs by platform
    const igVideos = clientData.trackedVideos.filter((v: ClientTrackedVideo) => v.platform === "Instagram");
    const ytVideos = clientData.trackedVideos.filter((v: ClientTrackedVideo) => v.platform === "YouTube");

    const refreshPromises = [];

    // Instagram Batch Scrape (native fetch)
    if (igVideos.length > 0) {
      console.log(`[Batch Refresh] Refreshing ${igVideos.length} Instagram videos...`);
      refreshPromises.push(
        (async () => {
          const input = {
            addParentData: false,
            directUrls: igVideos.map((v: ClientTrackedVideo) => v.url),
            resultsType: "details",
            searchType: "hashtag",
            resultsLimit: igVideos.length
          };
          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" }
          );
          if (!apifyRes.ok) throw new Error(`Apify IG Error: ${await apifyRes.text()}`);
          const items: any[] = await apifyRes.json();

          items.forEach((item: any) => {
            const dbVid = clientData.trackedVideos.find((v: ClientTrackedVideo) => v.url.includes(item.url) || (item.url && v.url.includes(item.shortCode)));
            if (dbVid) {
              dbVid.metrics.views = item.videoPlayCount || item.viewCount || dbVid.metrics.views;
              dbVid.metrics.likes = item.likesCount || dbVid.metrics.likes;
              dbVid.metrics.comments = item.commentsCount || dbVid.metrics.comments;
              dbVid.thumbnailUrl = item.displayUrl || item.thumbnailUrl || dbVid.thumbnailUrl;
              dbVid.lastRefreshed = new Date().toISOString();
            }
          });
        })()
      );
    }

    // YouTube Batch Scrape (native fetch)
    if (ytVideos.length > 0) {
      console.log(`[Batch Refresh] Refreshing ${ytVideos.length} YouTube videos...`);
      refreshPromises.push(
        (async () => {
          const input = {
            startUrls: ytVideos.map((v: ClientTrackedVideo) => ({ url: v.url })),
            max_results: ytVideos.length,
            scrape_shorts: true
          };
          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/apify~youtube-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" }
          );
          if (!apifyRes.ok) throw new Error(`Apify YT Error: ${await apifyRes.text()}`);
          const items: any[] = await apifyRes.json();

          items.forEach((item: any) => {
            const dbVid = clientData.trackedVideos.find((v: ClientTrackedVideo) => v.url.includes(item.id) || v.url === item.url);
            if (dbVid) {
              dbVid.metrics.views = item.viewCount || dbVid.metrics.views;
              dbVid.metrics.likes = item.likeCount || dbVid.metrics.likes;
              dbVid.metrics.comments = item.commentCount || dbVid.metrics.comments;
              dbVid.lastRefreshed = new Date().toISOString();
            }
          });
        })()
      );
    }

    // Run scrapers in parallel
    await Promise.allSettled(refreshPromises);

    console.log(`[Batch Refresh] Finished. Saving DB...`);
    writeDB(db);

    return NextResponse.json({ success: true, message: "Metrics refreshed" });
  } catch (error: any) {
    console.error("Refresh Analytics API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to refresh analytics" }, { status: 500 });
  }
}
