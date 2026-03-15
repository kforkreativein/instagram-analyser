import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { NamedWatchlist, WatchlistChannel } from "../../../lib/types";
import { getWatchlists, saveWatchlist, updateWatchlist, deleteWatchlist } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const watchlists = getWatchlists();
  if (id) {
    const found = watchlists.find((w) => w.id === id) ?? null;
    return NextResponse.json(found ? { watchlist: found } : { error: "Not found" }, { status: found ? 200 : 404 });
  }
  return NextResponse.json({ watchlists });
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      name?: string;
      profiles?: WatchlistChannel[];
      id?: string;
    };

    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "A watchlist name is required." }, { status: 400 });
    }

    const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];

    const newWatchlist: NamedWatchlist = {
      id: typeof payload.id === "string" && payload.id ? payload.id : Date.now().toString(),
      name,
      profiles,
      createdAt: new Date().toISOString(),
    };

    const watchlists = saveWatchlist(newWatchlist);

    revalidatePath("/channels");

    return NextResponse.json({ success: true, watchlist: newWatchlist, watchlists });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save watchlist." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      profiles?: WatchlistChannel[];
    };

    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "A watchlist name is required." }, { status: 400 });

    const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];

    const updated: NamedWatchlist = {
      id,
      name,
      profiles,
      createdAt: new Date().toISOString(),
    };

    const watchlists = updateWatchlist(updated);
    revalidatePath("/channels");

    return NextResponse.json({ success: true, watchlist: updated, watchlists });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update watchlist." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { id?: string };
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const watchlists = deleteWatchlist(id);
    revalidatePath("/channels");

    return NextResponse.json({ success: true, watchlists });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete watchlist." },
      { status: 500 },
    );
  }
}
