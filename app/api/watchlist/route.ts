import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { WatchlistChannel } from "../../../lib/types";

export const maxDuration = 30;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
            ? parseInt(record.followers.trim().replace(/[^0-9]/g, "")) || null
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

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ watchlist: [] });
    }

    try {
        const watchlist = await prisma.watchlist.findMany({
            where: {
                userId: session.user.id
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return NextResponse.json({ watchlist });
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
        const channel = sanitizeChannel(payload);

        if (!channel) {
            return NextResponse.json({ error: "A valid username is required." }, { status: 400 });
        }

        const upserted = await prisma.watchlist.upsert({
            where: {
                userId_username: {
                    userId: session.user.id,
                    username: channel.username
                }
            },
            update: {
                platform: channel.platform,
                url: channel.url,
                followers: typeof channel.followers === 'string' ? null : channel.followers,
                miningQuadrant: channel.miningQuadrant,
                profilePicUrl: channel.profilePicUrl,
                isVerified: channel.isVerified,
            },
            create: {
                userId: session.user.id,
                username: channel.username,
                platform: channel.platform,
                url: channel.url,
                followers: typeof channel.followers === 'string' ? null : channel.followers,
                miningQuadrant: channel.miningQuadrant,
                profilePicUrl: channel.profilePicUrl,
                isVerified: channel.isVerified,
            }
        });

        // Fetch full updated watchlist
        const watchlist = await prisma.watchlist.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, duplicate: false, watchlist });
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
            await prisma.watchlist.deleteMany({
                where: { userId: session.user.id }
            });
            return NextResponse.json({ success: true, watchlist: [] });
        }

        const username = typeof payload.username === "string" ? payload.username.trim().replace(/^@+/, "") : "";
        if (!username) {
            return NextResponse.json({ error: "username is required." }, { status: 400 });
        }

        await prisma.watchlist.delete({
            where: {
                userId_username: {
                    userId: session.user.id,
                    username: username
                }
            }
        });

        const watchlist = await prisma.watchlist.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, watchlist });
    } catch (error) {
        console.error("[WATCHLIST_DELETE]", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unable to update watchlist." },
            { status: 500 },
        );
    }
}