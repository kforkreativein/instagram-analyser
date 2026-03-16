import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = (body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Try deleting by row ID first
    try {
        await prisma.history.delete({
            where: {
                id: id,
                userId: session.user.id
            }
        });
        return NextResponse.json({ success: true, message: "History entry deleted" });
    } catch (e) {
        // If not found by row ID, it might be a nested post ID in the 'post' blob.
        const deleted = await prisma.history.deleteMany({
            where: {
                userId: session.user.id,
                post: {
                    path: ['id'],
                    equals: id
                }
            }
        });
        
        if (deleted.count > 0) {
            return NextResponse.json({ success: true, message: "History entry deleted via post ID" });
        }
        
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("[HISTORY_DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 },
    );
  }
}
