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

  try {
    const body = await req.json();
    const { id } = params;

    const updatedLead = await prisma.lead.update({
      where: {
        id,
        userId: session.user.id, // Security check
      },
      data: {
        ...body,
        lastUpdated: new Date(),
      },
    });

    return NextResponse.json(updatedLead);
  } catch (error) {
    console.error("[LEADS_PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = params;

    await prisma.lead.delete({
      where: {
        id,
        userId: session.user.id, // Security check
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LEADS_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete lead" },
      { status: 500 }
    );
  }
}
