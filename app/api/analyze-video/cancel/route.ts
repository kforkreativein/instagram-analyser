import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDbUserForSession } from "@/lib/session-user";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id && !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await getDbUserForSession(session);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { jobId } = await req.json() as { jobId?: string };
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    // Find the upload job
    const upload = await prisma.upload.findUnique({
      where: { jobId },
    });

    if (!upload) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify ownership
    if (upload.userId !== dbUser.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update status to CANCELLED (or FAILED)
    await prisma.upload.update({
      where: { jobId },
      data: { 
        status: "FAILED",
        errorMessage: "Cancelled by user",
      },
    });

    console.log(`[Cancel] Job ${jobId} cancelled by user ${dbUser.id}`);

    return NextResponse.json({ ok: true, message: "Job cancelled" });
  } catch (error) {
    console.error("[Cancel] Error:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }
}
