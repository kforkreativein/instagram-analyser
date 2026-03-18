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

    const [settings, user] = await Promise.all([
      prisma.settings.findUnique({ where: { userId: session.user.id } }),
      prisma.user.findUnique({ where: { id: session.user.id } })
    ]);

    if (!settings) {
      return NextResponse.json({});
    }

    return NextResponse.json({
      name: user?.name ?? "",
      agencyName: settings?.agencyName ?? "",
      agencyLogo: settings?.agencyLogo ?? "",
      activeProvider: settings?.activeProvider ?? "Gemini",
      activeModel: settings?.activeModel ?? "Gemini 2.5 Flash",
      // API keys are never returned — only boolean presence flags
      geminiApiKeySet: !!settings?.geminiApiKey,
      openaiApiKeySet: !!settings?.openaiApiKey,
      anthropicApiKeySet: !!settings?.anthropicApiKey,
      apifyApiKeySet: !!settings?.apifyApiKey,
      elevenlabsApiKeySet: !!settings?.elevenlabsApiKey,
      sarvamApiKeySet: !!settings?.sarvamApiKey,
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

    const body = await request.json() as Record<string, string | null | undefined>;
    const SENTINEL = "••••••••";

    // Build the update object for non-key fields directly
    const update: Record<string, string | null> = {};
    for (const key of ["agencyName", "agencyLogo", "activeProvider", "activeModel"] as const) {
      if (typeof body[key] === "string") update[key] = (body[key] as string).trim() || null;
      else if (body[key] === null) update[key] = null;
    }

    // For API keys: skip entirely if absent or sentinel; allow empty string to clear
    const apiKeyFields = ["geminiApiKey", "openaiApiKey", "anthropicApiKey", "apifyApiKey", "elevenlabsApiKey", "sarvamApiKey"] as const;
    for (const key of apiKeyFields) {
      if (body[key] === undefined || body[key] === SENTINEL) continue;
      update[key] = (body[key] as string).trim() || null;
    }

    await Promise.all([
      prisma.settings.upsert({
        where: { userId: session.user.id },
        update: update,
        create: { userId: session.user.id, ...update },
      }),
      body.name !== undefined ? prisma.user.update({
        where: { id: session.user.id },
        data: { name: typeof body.name === 'string' ? body.name.trim() : null }
      }) : Promise.resolve()
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
