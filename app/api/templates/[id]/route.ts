import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(
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

    const updatedTemplate = await prisma.dmTemplate.update({
      where: {
        id,
        userId: session.user.id, // Security check
      },
      data: {
        name: body.name,
        category: body.category,
        body: body.body,
      },
    });

    return NextResponse.json(updatedTemplate);
  } catch (error) {
    console.error("[TEMPLATES_PUT]", error);
    return NextResponse.json(
      { error: "Failed to update template" },
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

    await prisma.dmTemplate.delete({
      where: {
        id,
        userId: session.user.id, // Security check
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TEMPLATES_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
