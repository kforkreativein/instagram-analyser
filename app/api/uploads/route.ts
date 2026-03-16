import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ uploads: [] }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ uploads: [] });

    const uploads = await prisma.upload.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, analysis: true, transcript: true, createdAt: true },
    });

    const formatted = uploads.map((u) => ({
      id: u.id,
      fileName: u.fileName,
      analysis: u.analysis,
      transcript: u.transcript ?? "",
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json({ uploads: formatted });
  } catch {
    return NextResponse.json({ uploads: [] });
  }
}
