import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { WatchlistChannel } from "@/lib/types";

export const maxDuration = 30;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getOrCreateGeneralGroup(userId: string) {
    let group = await prisma.watchlistGroup.findFirst({
        where: { userId, name: "General" },
    });

    if (!group) {
        group = await prisma.watchlistGroup.create({
            data: { userId, name: "General" },
        });
    }

    return group;
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ watchlist: [] });
    }

    try {
        const channels = await prisma.watchlistChannel.findMany({
            where: {
                group: { userId: session.user.id }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return NextResponse.json({ watchlist: channels || [] });
    } catch (error) {
        console.error("[WATCHLIST_GET]", error);
        return NextResponse.json({ watchlist: [] });
    }
}

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const payload = await request.json().catch(() => ({}));
        const username = typeof payload.username === "string" ? payload.username.trim().replace(/^@+/, "") : "";
        
        if (!username) {
            return NextResponse.json({ error: "A valid username is required." }, { status: 400 });
        }

        const group = await getOrCreateGeneralGroup(session.user.id);

        await prisma.watchlistChannel.upsert({
            where: {
                groupId_username: {
                    groupId: group.id,
                    username: username
                }
            },
            update: {
                platform: payload.platform || "instagram",
                url: payload.url || `https://www.instagram.com/${username}/`,
                followers: typeof payload.followers === 'number' ? payload.followers : null,
                miningQuadrant: payload.miningQuadrant || "",
                profilePicUrl: payload.profilePicUrl || "",
                isVerified: !!payload.isVerified,
            },
            create: {
                groupId: group.id,
                username,
                platform: payload.platform || "instagram",
                url: payload.url || `https://www.instagram.com/${username}/`,
                followers: typeof payload.followers === 'number' ? payload.followers : null,
                miningQuadrant: payload.miningQuadrant || "",
                profilePicUrl: payload.profilePicUrl || "",
                isVerified: !!payload.isVerified,
            }
        });

        const allChannels = await prisma.watchlistChannel.findMany({
            where: { group: { userId: session.user.id } },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, watchlist: allChannels });
    } catch (error) {
        console.error("[WATCHLIST_POST]", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unable to save watchlist." },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const payload = await request.json().catch(() => ({})) as { username?: string; clearAll?: boolean };

        if (payload.clearAll) {
            await prisma.watchlistChannel.deleteMany({
                where: { group: { userId: session.user.id } }
            });
            return NextResponse.json({ success: true, watchlist: [] });
        }

        const username = typeof payload.username === "string" ? payload.username.trim().replace(/^@+/, "") : "";
        if (!username) {
            return NextResponse.json({ error: "username is required." }, { status: 400 });
        }

        await prisma.watchlistChannel.deleteMany({
            where: {
                username: username,
                group: { userId: session.user.id }
            }
        });

        const allChannels = await prisma.watchlistChannel.findMany({
            where: { group: { userId: session.user.id } },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, watchlist: allChannels });
    } catch (error) {
        console.error("[WATCHLIST_DELETE]", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unable to update watchlist." },
            { status: 500 },
        );
    }
}