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
  const clientId = searchParams.get("clientId");

  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, userId: session.user.id } });
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bank = (client.preferredHooks as unknown[]) ?? [];
    return NextResponse.json({ bank, clientId });
  }

  // Return all clients' banks as a map
  const clients = await prisma.client.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, preferredHooks: true },
  });

  const banks = clients.map((c) => ({ clientId: c.id, clientName: c.name, bank: (c.preferredHooks as unknown[]) ?? [] }));
  return NextResponse.json({ banks });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { clientId, hook } = body;
  if (!clientId || !hook) return NextResponse.json({ error: "clientId and hook required" }, { status: 400 });

  const client = await prisma.client.findFirst({ where: { id: clientId, userId: session.user.id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = (client.preferredHooks as unknown[]) ?? [];
  const bankEntry = { ...hook, savedAt: new Date().toISOString(), id: `hook_${Date.now()}` };
  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { preferredHooks: [...existing, bankEntry] },
  });

  return NextResponse.json({ bank: updated.preferredHooks });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { clientId, hookId } = body;
  if (!clientId || !hookId) return NextResponse.json({ error: "clientId and hookId required" }, { status: 400 });

  const client = await prisma.client.findFirst({ where: { id: clientId, userId: session.user.id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = ((client.preferredHooks as Array<{ id: string }>) ?? []).filter((h) => h.id !== hookId);
  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { preferredHooks: existing },
  });

  return NextResponse.json({ bank: updated.preferredHooks });
}
