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
    
    // Handle both formats: single username or { name, profiles }
    const profilesToSave = Array.isArray(payload.profiles) 
      ? payload.profiles 
      : payload.username 
        ? [payload] 
        : [];

    if (profilesToSave.length === 0) {
      return NextResponse.json({ error: "At least one profile is required." }, { status: 400 });
    }

    const savedItems = [];

    // Use transaction or separate upserts to satisfy the single-record schema
    for (const profile of profilesToSave) {
      const username = typeof profile.username === "string" ? profile.username.trim().replace(/^@+/, "") : "";
      if (!username) continue;

      const saved = await prisma.watchlist.upsert({
        where: {
          userId_username: {
            userId: session.user.id,
            username: username
          }
        },
        update: {
          platform: profile.platform || "Instagram",
          url: profile.url || `https://www.instagram.com/${username}/`,
          followers: typeof profile.followers === 'number' ? profile.followers : null,
          miningQuadrant: profile.miningQuadrant || payload.miningQuadrant || "",
          profilePicUrl: profile.profilePicUrl || "",
          isVerified: !!profile.isVerified,
        },
        create: {
          userId: session.user.id,
          username,
          platform: profile.platform || "Instagram",
          url: profile.url || `https://www.instagram.com/${username}/`,
          followers: typeof profile.followers === 'number' ? profile.followers : null,
          miningQuadrant: profile.miningQuadrant || payload.miningQuadrant || "",
          profilePicUrl: profile.profilePicUrl || "",
          isVerified: !!profile.isVerified,
        }
      });
      savedItems.push(saved);
    }

    revalidatePath("/channels");

    return NextResponse.json({ 
      success: true, 
      count: savedItems.length,
      watchlist: savedItems[0] // Return at least one for compatibility
    });
  } catch (error) {
    console.error("[WATCHLISTS_POST]", error);
    return NextResponse.json({ error: "Unable to save watchlist items." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const { id, name, profiles, ...updates } = payload;

    if (!id && !profiles) return NextResponse.json({ error: "id or profiles required." }, { status: 400 });

    const results = [];

    if (Array.isArray(profiles)) {
      for (const profile of profiles) {
        const username = typeof profile.username === "string" ? profile.username.trim().replace(/^@+/, "") : "";
        if (!username) continue;

        const saved = await prisma.watchlist.upsert({
          where: {
            userId_username: {
              userId: session.user.id,
              username: username
            }
          },
          update: {
            platform: profile.platform || "Instagram",
            url: profile.url || `https://www.instagram.com/${username}/`,
            followers: typeof profile.followers === 'number' ? profile.followers : null,
            miningQuadrant: profile.miningQuadrant || payload.miningQuadrant || "",
            profilePicUrl: profile.profilePicUrl || "",
            isVerified: !!profile.isVerified,
          },
          create: {
            userId: session.user.id,
            username,
            platform: profile.platform || "Instagram",
            url: profile.url || `https://www.instagram.com/${username}/`,
            followers: typeof profile.followers === 'number' ? profile.followers : null,
            miningQuadrant: profile.miningQuadrant || payload.miningQuadrant || "",
            profilePicUrl: profile.profilePicUrl || "",
            isVerified: !!profile.isVerified,
          }
        });
        results.push(saved);
      }
    } else if (id) {
       const updated = await prisma.watchlist.update({
        where: { id, userId: session.user.id },
        data: updates
      });
      results.push(updated);
    }

    revalidatePath("/channels");

    return NextResponse.json({ success: true, count: results.length, watchlist: results[0] });
  } catch (error) {
    console.error("[WATCHLISTS_PUT]", error);
    return NextResponse.json({ error: "Unable to update watchlist items." }, { status: 500 });
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
