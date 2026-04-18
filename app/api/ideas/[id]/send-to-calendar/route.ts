import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const idea = await prisma.idea.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { items = [], scheduledAt, pillar } = body as {
    items?: Array<{ title: string; type?: string; scheduledAt?: string; pillar?: string }>;
    scheduledAt?: string;
    pillar?: string;
  };

  // If specific items array provided (from multiplication), create one ContentItem per item
  if (items.length > 0) {
    const created = await Promise.all(
      items.map((item) =>
        prisma.contentItem.create({
          data: {
            userId: session!.user!.id,
            title: item.title,
            type: item.type ?? "reel",
            status: "not_started",
            pillar: item.pillar ?? pillar ?? null,
            scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : scheduledAt ? new Date(scheduledAt) : null,
            ideaId: idea.id,
            clientId: idea.clientId ?? null,
          },
        })
      )
    );
    return NextResponse.json({ created });
  }

  // Single item from idea
  const contentItem = await prisma.contentItem.create({
    data: {
      userId: session.user.id,
      title: idea.title,
      type: "reel",
      status: "not_started",
      pillar: pillar ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      ideaId: idea.id,
      clientId: idea.clientId ?? null,
    },
  });

  return NextResponse.json(contentItem);
}
