import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json([], { status: 200 });
    }

    const leads = await prisma.lead.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(leads);
  } catch (error) {
    console.error("[LEADS_GET]", error);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const newLead = await prisma.lead.create({
      data: {
        userId: session.user.id,
        handle: body.handle || "",
        niche: body.niche || null,
        followers: body.followers || null,
        templateId: body.templateId || null,
        notes: body.notes || null,
        status: body.status || "Prospect",
        lastUpdated: new Date(),
      },
    });

    return NextResponse.json(newLead);
  } catch (error) {
    console.error("[LEADS_POST]", error);
    return NextResponse.json(
      { error: "Failed to create lead" },
      { status: 500 }
    );
  }
}
