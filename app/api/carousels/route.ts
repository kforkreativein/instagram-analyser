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

  const carousels = await prisma.carousel.findMany({
    where: {
      userId: session.user.id,
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, name: true } } },
  });

  return NextResponse.json(carousels);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, format, slides, clientId, contentItemId } = body;

  if (!title || !format || !slides) return NextResponse.json({ error: "title, format, slides required" }, { status: 400 });

  const carousel = await prisma.carousel.create({
    data: {
      userId: session.user.id,
      title,
      format,
      slides,
      clientId: clientId ?? null,
      contentItemId: contentItemId ?? null,
    },
  });

  // If a contentItemId was linked, mark it in_progress
  if (contentItemId) {
    await prisma.contentItem.updateMany({
      where: { id: contentItemId, userId: session.user.id },
      data: { status: "in_progress", carouselId: carousel.id },
    });
  }

  return NextResponse.json(carousel);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, title, format, slides, contentItemId } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.carousel.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.carousel.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(format !== undefined ? { format } : {}),
      ...(slides !== undefined ? { slides } : {}),
      ...(contentItemId !== undefined ? { contentItemId } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.carousel.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.carousel.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
