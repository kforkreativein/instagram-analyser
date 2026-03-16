import prisma from "./prisma";
import type { NamedWatchlist } from "./types";

export interface AppSettings {
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  apifyApiKey: string;
  elevenlabsApiKey?: string;
  sarvamApiKey?: string;
  notionApiKey?: string;
  notionDatabaseId?: string;
  activeProvider?: string;
  activeModel?: string;
  agencyName?: string;
  agencyLogo?: string;
}

export async function getSettings(userId: string): Promise<AppSettings> {
  const settings = await prisma.settings.findUnique({
    where: { userId }
  });

  return {
    geminiApiKey: settings?.geminiApiKey || "",
    openaiApiKey: settings?.openaiApiKey || "",
    anthropicApiKey: settings?.anthropicApiKey || "",
    apifyApiKey: settings?.apifyApiKey || "",
    elevenlabsApiKey: settings?.elevenlabsApiKey || "",
    sarvamApiKey: settings?.sarvamApiKey || "",
    notionApiKey: settings?.notionApiKey || "",
    notionDatabaseId: settings?.notionDatabaseId || "",
    activeProvider: settings?.activeProvider || "Gemini",
    activeModel: settings?.activeModel || "Gemini 2.5 Flash",
    agencyName: settings?.agencyName || "",
    agencyLogo: settings?.agencyLogo || "",
  };
}

export async function saveSettings(userId: string, settings: Partial<AppSettings>): Promise<void> {
  await prisma.settings.upsert({
    where: { userId },
    update: {
      ...settings,
      updatedAt: new Date()
    },
    create: {
      userId,
      ...settings,
    }
  });
}

// ── Watchlist persistence (now in Watchlist model) ──────────────────────────────

export async function getWatchlists(userId: string): Promise<NamedWatchlist[]> {
    // Note: NamedWatchlist might differ from the basic Watchlist model.
    // We'll adapt it or assume they are similar.
    const watchlists = await prisma.watchlist.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });
    
    // Convert to NamedWatchlist if necessary
    return watchlists.map(w => ({
        id: w.id,
        name: w.username, // Assuming username is used as name for now
        channels: [w.username] // Adapting to the expected interface if possible
    })) as any;
}

export async function saveWatchlist(userId: string, watchlist: any): Promise<void> {
    await prisma.watchlist.create({
        data: {
            userId,
            username: watchlist.username || watchlist.name,
            platform: watchlist.platform || "Instagram",
            url: watchlist.url,
            followers: watchlist.followers,
        }
    });
}

// ... other functions omitted or adapted as needed ...
