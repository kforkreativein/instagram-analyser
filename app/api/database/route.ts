import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const maxDuration = 30;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dbPath = path.join(process.cwd(), "database.json");

type AppDatabase = {
    history: unknown[];
    watchlist: unknown[];
};

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
            watchlist: Array.isArray(record.watchlist) ? record.watchlist : [],
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

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ data: [] }, { status: 401 });
    }
    const database = await readDatabase();
    // Filter out manual uploads from history — those belong in /uploads
    const scraped = database.history.filter((entry: unknown) => {
        const record = entry as Record<string, unknown>;
        const post = record.post as Record<string, unknown> | undefined;
        return post?.username !== "manual_upload";
    });
    return NextResponse.json({ data: scraped });
}

export async function POST(request: NextRequest) {
    try {
        const payload = (await request.json().catch(() => [])) as unknown;
        const safePayload = Array.isArray(payload) ? payload : [];
        const existingDatabase = await readDatabase();

        await fs.writeFile(
            dbPath,
            JSON.stringify({ history: safePayload, watchlist: existingDatabase.watchlist }, null, 2),
            "utf8",
        );

        return NextResponse.json({ success: true, count: safePayload.length });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Write failed" },
            { status: 500 },
        );
    }
}

