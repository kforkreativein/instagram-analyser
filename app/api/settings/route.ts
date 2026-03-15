import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = getSettings();
    // Mask keys for the response — only reveal if they are set
    return NextResponse.json({
      geminiApiKey: settings.geminiApiKey ? "***set***" : "",
      openaiApiKey: settings.openaiApiKey ? "***set***" : "",
      anthropicApiKey: settings.anthropicApiKey ? "***set***" : "",
      apifyApiKey: settings.apifyApiKey ? "***set***" : "",
      hasKeys: !!(settings.geminiApiKey || settings.openaiApiKey || settings.anthropicApiKey),
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const allowed = ["geminiApiKey", "openaiApiKey", "anthropicApiKey", "apifyApiKey", "elevenLabsApiKey", "sarvamApiKey", "notionApiKey", "notionDatabaseId"];
    const update: Record<string, string> = {};
    for (const key of allowed) {
      if (typeof body[key] === "string") {
        update[key] = (body[key] as string).trim();
      }
    }
    saveSettings(update);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
