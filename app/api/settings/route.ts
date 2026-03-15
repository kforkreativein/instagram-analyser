import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "Settings not found" },
        { status: 404 }
      );
    }

    // Mask keys for the response — only reveal if they are set
    return NextResponse.json({
      geminiKey: settings.geminiKey ? "***set***" : "",
      openaiKey: settings.openaiKey ? "***set***" : "",
      anthropicKey: settings.anthropicKey ? "***set***" : "",
      apifyKey: settings.apifyKey ? "***set***" : "",
      hasKeys: !!(settings.geminiKey || settings.openaiKey || settings.anthropicKey),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json() as Record<string, unknown>;
    const allowed = ["geminiKey", "openaiKey", "anthropicKey", "apifyKey"];
    const update: Record<string, string | null> = {};

    for (const key of allowed) {
      if (typeof body[key] === "string") {
        update[key] = (body[key] as string).trim() || null;
      } else if (body[key] === null) {
        update[key] = null;
      }
    }

    const settings = await prisma.settings.update({
      where: { userId: session.user.id },
      data: update,
    });

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
