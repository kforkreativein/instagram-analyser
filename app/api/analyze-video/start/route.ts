import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDbUserForSession } from "@/lib/session-user";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id && !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await getDbUserForSession(session);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { videoUrl, fileName } = await req.json() as { videoUrl?: string; fileName?: string };
  if (!videoUrl) {
    return NextResponse.json({ error: "videoUrl is required" }, { status: 400 });
  }

  const jobId = crypto.randomUUID();

  const upload = await prisma.upload.create({
    data: {
      userId: dbUser.id,
      fileName: fileName || "uploaded_video.mp4",
      jobId,
      status: "PROCESSING",
    },
  });

  return NextResponse.json({ jobId, uploadId: upload.id });
}
