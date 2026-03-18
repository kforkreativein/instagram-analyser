import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = (await request.json().catch(() => ({}))) as { id: string };

        if (!id) {
            return NextResponse.json({ error: "Script ID is required" }, { status: 400 });
        }

        const deleted = await prisma.script.delete({
            where: {
                id: id,
                userId: session.user.id // Security check
            }
        });

        return NextResponse.json({ success: true, message: "Script deleted successfully" });
    } catch (error) {
        console.error("[SCRIPTS_DELETE]", error);
        return NextResponse.json(
            { error: "Delete failed" },
            { status: 500 },
        );
    }
}
