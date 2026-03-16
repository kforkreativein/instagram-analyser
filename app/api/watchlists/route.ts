import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json([], { status: 200 });

    const id = request.nextUrl.searchParams.get("id");
    
    if (id) {
      const watchlist = await prisma.watchlist.findUnique({
        where: { id, userId: session.user.id }
      });
      return NextResponse.json(watchlist ? { watchlist } : { error: "Not found" }, { status: watchlist ? 200 : 404 });
    }

    const watchlists = await prisma.watchlist.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({ watchlists });
  } catch (error) {
    console.error("[WATCHLISTS_GET]", error);
    return NextResponse.json({ watchlists: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const username = typeof payload.username === "string" ? payload.username.trim() : "";
    
    if (!username) {
      return NextResponse.json({ error: "A username is required." }, { status: 400 });
    }

    const newWatchlist = await prisma.watchlist.create({
      data: {
        userId: session.user.id,
        username,
        platform: payload.platform || "Instagram",
        url: payload.url || "",
        followers: typeof payload.followers === 'number' ? payload.followers : null,
        miningQuadrant: payload.miningQuadrant || "",
        profilePicUrl: payload.profilePicUrl || "",
        isVerified: !!payload.isVerified,
      },
    });

    revalidatePath("/channels");

    return NextResponse.json({ success: true, watchlist: newWatchlist });
  } catch (error) {
    console.error("[WATCHLISTS_POST]", error);
    return NextResponse.json({ error: "Unable to save watchlist." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const { id, ...updates } = payload;

    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    const updated = await prisma.watchlist.update({
      where: { id, userId: session.user.id },
      data: updates
    });

    revalidatePath("/channels");

    return NextResponse.json({ success: true, watchlist: updated });
  } catch (error) {
    console.error("[WATCHLISTS_PUT]", error);
    return NextResponse.json({ error: "Unable to update watchlist." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    await prisma.watchlist.delete({
      where: { id, userId: session.user.id }
    });

    revalidatePath("/channels");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WATCHLISTS_DELETE]", error);
    return NextResponse.json({ error: "Unable to delete watchlist." }, { status: 500 });
  }
}
