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

    const body = await request.json() as Record<string, unknown>;
    const allowed = [
      "geminiApiKey", "openaiApiKey", "anthropicApiKey", "apifyApiKey", 
      "elevenlabsApiKey", "sarvamApiKey", "agencyName", "agencyLogo",
      "activeProvider", "activeModel"
    ];
    const update: Record<string, string | null> = {};

    for (const key of allowed) {
      if (typeof body[key] === "string") {
        const val = (body[key] as string).trim();
        // Only update the key if the user provided a non-empty value
        // (empty string means "don't change" since we never send keys back)
        if (val) update[key] = val;
      } else if (body[key] === null) {
        update[key] = null;
      }
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
