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
    if (!session?.user?.id) return NextResponse.json({ watchlists: [] }, { status: 200 });

    const id = request.nextUrl.searchParams.get("id");
    
    if (id) {
      const group = await prisma.watchlistGroup.findUnique({
        where: { id, userId: session.user.id },
        include: { channels: true }
      });
      return NextResponse.json(group ? { watchlist: group } : { error: "Not found" }, { status: group ? 200 : 404 });
    }

    const groups = await prisma.watchlistGroup.findMany({
      where: { userId: session.user.id },
      include: { channels: true },
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({ watchlists: groups });
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
    const { name, profiles } = payload;

    if (!name) return NextResponse.json({ error: "Group name is required." }, { status: 400 });

    // Create the group and nested channels
    const group = await prisma.watchlistGroup.create({
      data: {
        userId: session.user.id,
        name: name,
        channels: {
          create: (profiles || []).map((p: any) => ({
            username: p.username.replace(/^@+/, ""),
            platform: p.platform || "Instagram",
            url: p.url || `https://www.instagram.com/${p.username.replace(/^@+/, "")}/`,
            followers: typeof p.followers === 'number' ? p.followers : null,
            miningQuadrant: p.miningQuadrant || "",
            profilePicUrl: p.profilePicUrl || "",
            isVerified: !!p.isVerified,
          }))
        }
      },
      include: { channels: true }
    });

    revalidatePath("/channels");

    return NextResponse.json({ 
      success: true, 
      watchlist: group 
    });
  } catch (error) {
    console.error("[WATCHLISTS_POST]", error);
    return NextResponse.json({ error: "Unable to create watchlist group." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const { id, name, profiles } = payload;

    if (!id) return NextResponse.json({ error: "Group ID is required." }, { status: 400 });

    // Update the group and its channels
    const updatedGroup = await prisma.watchlistGroup.update({
      where: { id, userId: session.user.id },
      data: {
        ...(name ? { name } : {}),
        ...(profiles ? {
          channels: {
            deleteMany: {}, // Simplest way to sync: delete all and recreate
            create: profiles.map((p: any) => ({
              username: p.username.replace(/^@+/, ""),
              platform: p.platform || "Instagram",
              url: p.url || `https://www.instagram.com/${p.username.replace(/^@+/, "")}/`,
              followers: typeof p.followers === 'number' ? p.followers : null,
              miningQuadrant: p.miningQuadrant || "",
              profilePicUrl: p.profilePicUrl || "",
              isVerified: !!p.isVerified,
            }))
          }
        } : {})
      },
      include: { channels: true }
    });

    revalidatePath("/channels");

    return NextResponse.json({ success: true, watchlist: updatedGroup });
  } catch (error) {
    console.error("[WATCHLISTS_PUT]", error);
    return NextResponse.json({ error: "Unable to update watchlist group." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    await prisma.watchlistGroup.delete({
      where: { id, userId: session.user.id }
    });

    revalidatePath("/channels");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WATCHLISTS_DELETE]", error);
    return NextResponse.json({ error: "Unable to delete watchlist group." }, { status: 500 });
  }
}
