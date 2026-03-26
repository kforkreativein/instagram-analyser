import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pick(obj: UnknownRecord, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

export interface FetchedProfile {
  username: string;
  profilePicUrl: string | null;
  followerCount: number | null;
  isVerified: boolean;
  fullName: string;
  biography: string;
}

function normalizeProfile(raw: unknown): FetchedProfile | null {
  if (!isRecord(raw)) return null;

  const username = str(
    pick(raw, ["username", "userName", "user_name", "ownerUsername"]) ?? ""
  );
  if (!username) return null;

  const profilePicUrl =
    str(pick(raw, ["profilePicUrl", "profilePicUrlHD", "profile_pic_url", "avatarUrl", "profileImageUrl"]) ?? "") ||
    null;

  const followerCount = num(
    pick(raw, ["followersCount", "followers_count", "followers", "followersNumber"]) ?? null
  );

  const isVerified = Boolean(
    pick(raw, ["verified", "isVerified", "is_verified"])
  );

  const fullName = str(pick(raw, ["fullName", "full_name", "name", "displayName"]) ?? "");
  const biography = str(pick(raw, ["biography", "bio", "description"]) ?? "");

  return { username, profilePicUrl, followerCount, isVerified, fullName, biography };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      usernames?: string[];
    };

    const usernames = Array.isArray(body.usernames)
      ? body.usernames.map((u) => u.trim().replace(/^@+/, "")).filter(Boolean)
      : [];

    if (usernames.length === 0) {
      return NextResponse.json({ error: "At least one username is required." }, { status: 400 });
    }

    // 1. Authenticate the user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch the user's secure API key from the database
    const userSettings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
      select: { apifyApiKey: true },
    });

    // 3. Validate the key exists and isn't the frontend mask
    if (!userSettings?.apifyApiKey || userSettings.apifyApiKey === "••••••••") {
      return NextResponse.json(
        { error: "Apify API key is missing or invalid. Please update it in Settings." },
        { status: 400 }
      );
    }

    // 4. Use only the secure DB key
    const apifyToken = userSettings.apifyApiKey;

    const url = `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyToken}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Apify API Error: ${errText}`);
    }

    const items: unknown[] = await response.json();

    const profiles: FetchedProfile[] = items
      .map(normalizeProfile)
      .filter((p): p is FetchedProfile => p !== null);

    // If Apify returned nothing, return stubs so the UI still works
    if (profiles.length === 0) {
      const stubs: FetchedProfile[] = usernames.map((u) => ({
        username: u,
        profilePicUrl: null,
        followerCount: null,
        isVerified: false,
        fullName: "",
        biography: "",
      }));
      return NextResponse.json(stubs);
    }

    return NextResponse.json(profiles);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Apify request timed out." }, { status: 504 });
    }
    return NextResponse.json(
      { error: "Failed to fetch profiles." },
      { status: 500 }
    );
  }
}
