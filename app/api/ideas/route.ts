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

  const ideas = await prisma.idea.findMany({
    where: {
      userId: session.user.id,
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, name: true } } },
  });

  return NextResponse.json(ideas);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, seed, substance, clientId, angles } = body;

  if (!title || !seed) return NextResponse.json({ error: "title and seed are required" }, { status: 400 });

  const idea = await prisma.idea.create({
    data: {
      userId: session.user.id,
      title,
      seed,
      substance: substance ?? null,
      clientId: clientId ?? null,
      angles: angles ?? null,
    },
  });

  return NextResponse.json(idea);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const idea = await prisma.idea.findFirst({ where: { id, userId: session.user.id } });
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.idea.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
