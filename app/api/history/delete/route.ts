import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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
    return normalizeDatabase(JSON.parse(fileData));
  } catch {
    return { history: [], watchlist: [] };
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = (body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const database = await readDatabase();

    const filtered = database.history.filter((entry: unknown) => {
      const record = entry as Record<string, unknown>;
      // Support both top-level id and nested post.id shapes
      const entryId =
        typeof record.id === "string"
          ? record.id
          : (record.post as Record<string, unknown> | undefined)?.id;
      return entryId !== id;
    });

    if (filtered.length === database.history.length) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    await fs.writeFile(
      dbPath,
      JSON.stringify({ history: filtered, watchlist: database.watchlist }, null, 2),
      "utf8",
    );

    return NextResponse.json({ success: true, remaining: filtered.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 },
    );
  }
}
