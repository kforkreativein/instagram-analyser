import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

// POST: replace entire scripts array (legacy bulk save)
export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const payload = (await request.json().catch(() => ({}))) as any;
        const scripts = Array.isArray(payload.scripts) ? payload.scripts : [];
        
        await prisma.$transaction([
            prisma.script.deleteMany({
                where: { userId: session.user.id }
            }),
            prisma.script.createMany({
                data: scripts.map((s: any) => ({
                    userId: session.user.id,
                    clientId: s.clientId,
                    title: s.title || "Untitled",
                    content: s.content || "",
                    type: s.type || "Original",
                    hooks: s.hooks,
                    caption: s.caption,
                    repurposed: s.repurposed,
                    scriptJob: s.scriptJob,
                    directorsCut: s.directorsCut,
                    prompts: s.prompts,
                    packaging: s.packaging,
                }))
            })
        ]);

        return NextResponse.json({ success: true, count: scripts.length });
    } catch (error) {
        console.error("[SCRIPTS_SAVE_POST]", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Write failed" },
            { status: 500 },
        );
    }
}

// PUT: upsert a single script by id
export async function PUT(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const scriptData = (await request.json().catch(() => null)) as any;
        if (!scriptData || !scriptData.id) {
            return NextResponse.json({ error: "Script id is required" }, { status: 400 });
        }

        const { id, ...updates } = scriptData;

        const updated = await prisma.script.upsert({
            where: {
                id: id
            },
            update: {
                ...updates,
                updatedAt: new Date()
            },
            create: {
                id: id,
                userId: session.user.id,
                ...updates
            }
        });

        return NextResponse.json({ success: true, script: updated });
    } catch (error) {
        console.error("[SCRIPTS_SAVE_PUT]", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Save failed" },
            { status: 500 },
        );
    }
}
