import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameMode } = await req.json();
  if (!gameMode || !["awareness", "conversion"].includes(gameMode)) {
    return NextResponse.json({ error: "Invalid gameMode. Must be 'awareness' or 'conversion'." }, { status: 400 });
  }

  const client = await prisma.client.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const updated = await prisma.client.update({
    where: { id: params.id },
    data: { gameMode },
  });

  return NextResponse.json({ gameMode: updated.gameMode });
}
