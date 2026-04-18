import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await prisma.contentItem.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { status, title, pillar, scheduledAt, postedAt, publishedUrl, scriptId, carouselId, ideaId } = body;

  const updated = await prisma.contentItem.update({
    where: { id: params.id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(pillar !== undefined ? { pillar } : {}),
      ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
      ...(postedAt !== undefined ? { postedAt: postedAt ? new Date(postedAt) : null } : {}),
      ...(publishedUrl !== undefined ? { publishedUrl } : {}),
      ...(scriptId !== undefined ? { scriptId } : {}),
      ...(carouselId !== undefined ? { carouselId } : {}),
      ...(ideaId !== undefined ? { ideaId } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await prisma.contentItem.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.contentItem.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
