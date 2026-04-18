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
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const items = await prisma.contentItem.findMany({
    where: {
      userId: session.user.id,
      ...(clientId ? { clientId } : {}),
      ...(from || to
        ? {
            OR: [
              {
                scheduledAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              },
              {
                scheduledAt: null,
              },
            ],
          }
        : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    include: {
      idea: { select: { id: true, title: true, seed: true } },
      client: { select: { id: true, name: true } },
    },
  });

  // Merge in script data for items that have scriptId
  const scriptIds = items.map((i) => i.scriptId).filter(Boolean) as string[];
  const scripts =
    scriptIds.length > 0
      ? await prisma.script.findMany({
          where: { id: { in: scriptIds }, userId: session.user.id },
          select: { id: true, title: true, type: true },
        })
      : [];
  const scriptMap = Object.fromEntries(scripts.map((s) => [s.id, s]));

  const carouselIds = items.map((i) => i.carouselId).filter(Boolean) as string[];
  const carousels =
    carouselIds.length > 0
      ? await prisma.carousel.findMany({
          where: { id: { in: carouselIds }, userId: session.user.id },
          select: { id: true, title: true, format: true },
        })
      : [];
  const carouselMap = Object.fromEntries(carousels.map((c) => [c.id, c]));

  const enriched = items.map((item) => ({
    ...item,
    script: item.scriptId ? (scriptMap[item.scriptId] ?? null) : null,
    carousel: item.carouselId ? (carouselMap[item.carouselId] ?? null) : null,
  }));

  return NextResponse.json(enriched);
}
