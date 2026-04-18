import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const carousel = await prisma.carousel.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!carousel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(carousel);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.carousel.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { title, format, slides, contentItemId } = body;

  const updated = await prisma.carousel.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(format !== undefined ? { format } : {}),
      ...(slides !== undefined ? { slides } : {}),
      ...(contentItemId !== undefined ? { contentItemId } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.carousel.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.carousel.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
