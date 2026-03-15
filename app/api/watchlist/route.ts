import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import type { WatchlistChannel } from "../../../lib/types";

export const maxDuration = 30;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dbPath = path.join(process.cwd(), "database.json");

type AppDatabase = {
    history: unknown[];
    watchlist: WatchlistChannel[];
};

function sanitizeChannel(payload: unknown): WatchlistChannel | null {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const rawUsername = typeof record.username === "string" ? record.username.trim() : "";
    const username = rawUsername.replace(/^@+/, "").replace(/\/+$/g, "");

    if (!username) {
        return null;
    }

    const platform = typeof record.platform === "string" && record.platform.trim()
        ? record.platform.trim().toLowerCase()
        : "instagram";

    const followers = typeof record.followers === "number"
        ? (Number.isFinite(record.followers) ? record.followers : null)
        : typeof record.followers === "string" && record.followers.trim()
            ? record.followers.trim()
            : null;

    const url = typeof record.url === "string" && record.url.trim()
        ? record.url.trim()
        : platform === "instagram"
            ? `https://www.instagram.com/${username}/`
            : undefined;

    const miningQuadrant = typeof record.miningQuadrant === "string" ? record.miningQuadrant.trim() : undefined;
    const profilePicUrl = typeof record.profilePicUrl === "string" && record.profilePicUrl.trim() ? record.profilePicUrl.trim() : undefined;
    const isVerified = typeof record.isVerified === "boolean" ? record.isVerified : undefined;

    return {
        username,
        platform,
        url,
        followers,
        miningQuadrant,
        ...(profilePicUrl ? { profilePicUrl } : {}),
        ...(isVerified != null ? { isVerified } : {}),
    };
}

function normalizeWatchlist(payload: unknown): WatchlistChannel[] {
    if (!Array.isArray(payload)) {
        return [];
    }

    const seen = new Set<string>();
    const watchlist: WatchlistChannel[] = [];

    for (const item of payload) {
        const channel = sanitizeChannel(item);
        if (!channel) {
            continue;
        }

        const dedupeKey = `${channel.platform}:${channel.username.toLowerCase()}`;
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        watchlist.push(channel);
    }

    return watchlist;
}

function normalizeDatabase(payload: unknown): AppDatabase {
    if (Array.isArray(payload)) {
        return { history: payload, watchlist: [] };
    }

    if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        const history = Array.isArray(record.history)
            ? record.history
            : Array.isArray(record.data)
                ? record.data
                : [];

        return {
            history,
            watchlist: normalizeWatchlist(record.watchlist),
        };
    }

    return { history: [], watchlist: [] };
}

async function readDatabase(): Promise<AppDatabase> {
    try {
        await fs.access(dbPath);
    } catch {
        return { history: [], watchlist: [] };
    }

    try {
        const fileData = await fs.readFile(dbPath, "utf8");
        const parsed = JSON.parse(fileData) as unknown;
        return normalizeDatabase(parsed);
    } catch {
        return { history: [], watchlist: [] };
    }
}

async function writeDatabase(database: AppDatabase) {
    await fs.writeFile(dbPath, JSON.stringify(database, null, 2), "utf8");
}

export async function GET() {
    const database = await readDatabase();
    return NextResponse.json({ watchlist: database.watchlist || [] });
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json().catch(() => ({}));
        const channel = sanitizeChannel(payload);

        if (!channel) {
            return NextResponse.json({ error: "A valid username is required." }, { status: 400 });
        }

        const database = await readDatabase();
        const alreadyExists = database.watchlist.some((item) => {
            return item.platform.toLowerCase() === channel.platform.toLowerCase()
                && item.username.toLowerCase() === channel.username.toLowerCase();
        });

        if (alreadyExists) {
            return NextResponse.json({ success: true, duplicate: true, watchlist: database.watchlist });
        }

        const watchlist = [...database.watchlist, channel];
        await writeDatabase({ ...database, watchlist });

        return NextResponse.json({ success: true, duplicate: false, watchlist });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unable to save watchlist." },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const payload = await request.json().catch(() => ({})) as { username?: string; clearAll?: boolean };
        const database = await readDatabase();

        if (payload.clearAll) {
            await writeDatabase({ ...database, watchlist: [] });
            return NextResponse.json({ success: true, watchlist: [] });
        }

        const username = typeof payload.username === "string" ? payload.username.trim().replace(/^@+/, "") : "";
        if (!username) {
            return NextResponse.json({ error: "username is required." }, { status: 400 });
        }

        const watchlist = database.watchlist.filter((channel) => channel.username.toLowerCase() !== username.toLowerCase());
        await writeDatabase({ ...database, watchlist });

        return NextResponse.json({ success: true, watchlist });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unable to update watchlist." },
            { status: 500 },
        );
    }
}