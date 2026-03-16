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
      return NextResponse.json({});
    }

    // Return actual key values so the frontend can populate form fields
    return NextResponse.json({
      geminiApiKey: settings.geminiApiKey ?? "",
      openaiApiKey: settings.openaiApiKey ?? "",
      anthropicApiKey: settings.anthropicApiKey ?? "",
      apifyApiKey: settings.apifyApiKey ?? "",
      elevenlabsApiKey: settings.elevenlabsApiKey ?? "",
      sarvamApiKey: settings.sarvamApiKey ?? "",
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
    const allowed = ["geminiApiKey", "openaiApiKey", "anthropicApiKey", "apifyApiKey", "elevenlabsApiKey", "sarvamApiKey"];
    const update: Record<string, string | null> = {};

    for (const key of allowed) {
      if (typeof body[key] === "string") {
        update[key] = (body[key] as string).trim() || null;
      } else if (body[key] === null) {
        update[key] = null;
      }
    }

    const settings = await prisma.settings.upsert({
      where: { userId: session.user.id },
      update: update,
      create: { userId: session.user.id, ...update },
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
