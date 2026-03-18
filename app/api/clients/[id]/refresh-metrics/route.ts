import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSettings } from "@/lib/db";
import { ClientTrackedVideo } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { apifyApiKey: bodyApifyKey } = await req.json().catch(() => ({}));
    const clientId = params.id;

    // Fetch user's settings (async)
    const dbSettings = await getSettings(session.user.id);
    const apifyToken = bodyApifyKey || dbSettings?.apifyApiKey;

    if (!apifyToken) {
      return NextResponse.json({ error: "API Keys Missing. Please save them in the Settings tab." }, { status: 400 });
    }

    const client = await prisma.client.findFirst({
        where: { id: clientId, userId: session.user.id }
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const trackedVideos = Array.isArray(client.trackedVideos) ? (client.trackedVideos as any[]) : [];
    if (trackedVideos.length === 0) {
      return NextResponse.json({ success: true, message: "No videos to refresh" });
    }

    // Separate URLs by platform
    const igVideos = trackedVideos.filter((v: any) => v.platform === "Instagram");
    const ytVideos = trackedVideos.filter((v: any) => v.platform === "YouTube");

    const refreshPromises = [];

    // Instagram Batch Scrape
    if (igVideos.length > 0) {
      refreshPromises.push(
        (async () => {
          const input = {
            addParentData: false,
            directUrls: igVideos.map((v: any) => v.url),
            resultsType: "details",
            searchType: "hashtag",
            resultsLimit: igVideos.length
          };
          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" }
          );
          if (!apifyRes.ok) {
            const errText = await apifyRes.text().catch(() => "");
            console.error(`[refresh-metrics] Apify IG error ${apifyRes.status}:`, errText.slice(0, 500));
            throw new Error("Instagram metrics refresh failed");
          }
          const items: any[] = await apifyRes.json();

          items.forEach((item: any) => {
            const dbVid = trackedVideos.find((v: any) => v.url.includes(item.url) || (item.url && v.url.includes(item.shortCode)));
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

    // YouTube Batch Scrape
    if (ytVideos.length > 0) {
      refreshPromises.push(
        (async () => {
          const input = {
            startUrls: ytVideos.map((v: any) => ({ url: v.url })),
            max_results: ytVideos.length,
            scrape_shorts: true
          };
          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/apify~youtube-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" }
          );
          if (!apifyRes.ok) {
            const errText = await apifyRes.text().catch(() => "");
            console.error(`[refresh-metrics] Apify YT error ${apifyRes.status}:`, errText.slice(0, 500));
            throw new Error("YouTube metrics refresh failed");
          }
          const items: any[] = await apifyRes.json();

          items.forEach((item: any) => {
            const dbVid = trackedVideos.find((v: any) => v.url.includes(item.id) || v.url === item.url);
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

    await prisma.client.update({
        where: { id: clientId },
        data: { trackedVideos }
    });

    return NextResponse.json({ success: true, message: "Metrics refreshed" });
  } catch (error: any) {
    console.error("Refresh Analytics API Error:", error);
    return NextResponse.json({ error: "Failed to refresh analytics" }, { status: 500 });
  }
}
