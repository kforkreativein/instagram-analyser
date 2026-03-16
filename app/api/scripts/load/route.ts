import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const scripts = await prisma.script.findMany({
            where: {
                userId: session.user.id
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        return NextResponse.json({ data: { scripts } });
    } catch (error) {
        console.error("[SCRIPTS_LOAD]", error);
        return NextResponse.json({ data: { scripts: [] } });
    }
}
