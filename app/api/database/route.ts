import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const maxDuration = 30;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ data: [] }, { status: 401 });
    }

    try {
        const history = await prisma.history.findMany({
            where: {
                userId: session.user.id
            },
            orderBy: {
                savedAt: 'desc'
            }
        });

        // Filter out manual uploads from history — those belong in /uploads
        const scraped = history.filter((entry: any) => {
            const post = entry.post as Record<string, unknown> | undefined;
            return post?.username !== "manual_upload";
        });

        return NextResponse.json({ data: scraped });
    } catch (error) {
        console.error("[DATABASE_GET]", error);
        return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const payload = (await request.json().catch(() => [])) as any[];
        const safePayload = Array.isArray(payload) ? payload : [];

        // For simplicity, we'll replace the existing history for this user
        // Note: In a larger app, you'd likely append or sync differently.
        await prisma.$transaction([
            prisma.history.deleteMany({
                where: { userId: session.user.id }
            }),
            prisma.history.createMany({
                data: safePayload.map(item => ({
                    userId: session.user.id,
                    post: item.post || {},
                    analysis: item.analysis || {},
                    savedAt: item.savedAt ? new Date(item.savedAt) : new Date()
                }))
            })
        ]);

        return NextResponse.json({ success: true, count: safePayload.length });
    } catch (error) {
        console.error("[DATABASE_POST]", error);
        return NextResponse.json(
            { error: "Write failed" },
            { status: 500 },
        );
    }
}

