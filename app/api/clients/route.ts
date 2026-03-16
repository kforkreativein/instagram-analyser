import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // Return an empty array instead of crashing or returning 401 if session is missing
      return NextResponse.json([], { status: 200 }); 
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json([], { status: 200 });

    const clients = await prisma.client.findMany({ 
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(clients);

  } catch (error) {
    console.error("API Clients Error:", error);
    // Strict Mandate: Silent recovery returning empty array
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const body = await req.json();

    const newClient = await prisma.client.create({
      data: {
        userId: session.user.id,
        name: body.name || "Unnamed Client",
        niche: body.niche || "",
        platform: body.platform || "Instagram",
        language: body.language || "English",
        duration: body.duration || "60s",
        targetAudience: body.targetAudience || "",
        tonePersona: body.tonePersona || body.tone || "",
        vocabularyLevel: body.vocabularyLevel || body.vocabulary || "",
        preferredTopics: body.preferredTopics || body.topics || "",
        avoidTopics: body.avoidTopics || "",
        ctaStyle: body.ctaStyle || "",
        customInstructions: body.customInstructions || "",
        preferredHooks: body.preferredHooks || [],
        examples: body.examples || body.winningScripts || [],
        trackedVideos: body.trackedVideos || [],
        styleDNA: body.styleDNA || {},
      }
    });

    return NextResponse.json(newClient);
  } catch (error) {
    console.error("[CLIENTS_POST]", error);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "Client ID required" }, { status: 400 });

    const updatedClient = await prisma.client.update({
      where: {
        id,
        userId: session.user.id // Security check
      },
      data: updates
    });

    return NextResponse.json(updatedClient);
  } catch (error) {
    console.error("[CLIENTS_PUT]", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Client ID required" }, { status: 400 });

    await prisma.client.delete({
      where: {
        id,
        userId: session.user.id // Security check
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CLIENTS_DELETE]", error);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}

