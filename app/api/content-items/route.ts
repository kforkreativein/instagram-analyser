import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const pillar = searchParams.get("pillar") ?? undefined;

  const items = await prisma.contentItem.findMany({
    where: {
      userId: session.user.id,
      ...(clientId ? { clientId } : {}),
      ...(status ? { status } : {}),
      ...(pillar ? { pillar } : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, type = "reel", status = "not_started", clientId, pillar, scheduledAt, ideaId, scriptId, carouselId } = body;

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const item = await prisma.contentItem.create({
    data: {
      userId: session.user.id,
      title,
      type,
      status,
      clientId: clientId ?? null,
      pillar: pillar ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      ideaId: ideaId ?? null,
      scriptId: scriptId ?? null,
      carouselId: carouselId ?? null,
    },
  });

  return NextResponse.json(item);
}
