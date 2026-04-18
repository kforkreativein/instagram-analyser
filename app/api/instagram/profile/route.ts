import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/lib/db";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getSettings(session.user.id);
  const apifyKey = dbSettings.apifyApiKey;
  if (!apifyKey) {
    return NextResponse.json({ error: "No Apify API key configured" }, { status: 400 });
  }

  const body = await req.json() as { username?: string };
  const username = (body.username ?? "").trim().replace(/^@+/, "");
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  try {
    const endpoint = `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyKey}&timeout=50`;
    const apifyRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username] }),
      signal: AbortSignal.timeout(52_000),
    });

    if (!apifyRes.ok) {
      const msg = await apifyRes.text();
      console.error("Apify profile error:", msg);
      return NextResponse.json({ error: "Apify request failed" }, { status: 502 });
    }

    const raw = await apifyRes.json() as unknown[];
    const profile = Array.isArray(raw) ? raw[0] : raw;

    if (!profile || typeof profile !== "object") {
      return NextResponse.json({ error: "No profile data returned" }, { status: 404 });
    }

    const p = profile as Record<string, unknown>;

    return NextResponse.json({
      handle: String(p.username ?? p.login ?? username),
      displayName: String(p.fullName ?? p.full_name ?? ""),
      bio: String(p.biography ?? p.bio ?? ""),
      followers: Number(p.followersCount ?? p.followers_count ?? p.followersNumber ?? 0),
      picUrl: String(p.profilePicUrl ?? p.profile_pic_url ?? p.profilePicUrlHD ?? ""),
    });
  } catch (err) {
    console.error("Instagram profile fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
