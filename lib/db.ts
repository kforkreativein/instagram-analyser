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

// ── Watchlist persistence ──────────────────────────────

export async function getWatchlists(userId: string): Promise<NamedWatchlist[]> {
    const groups = await prisma.watchlistGroup.findMany({
        where: { userId },
        include: { channels: true },
        orderBy: { createdAt: 'desc' }
    });
    
    return groups.map(g => ({
        id: g.id,
        name: g.name,
        channels: g.channels.map(c => c.username)
    })) as any;
}

export async function saveWatchlist(userId: string, watchlist: any): Promise<void> {
    const groupName = watchlist.name || watchlist.username || "Saved Watchlist";
    
    const channelList = Array.isArray(watchlist.channels) 
      ? watchlist.channels 
      : [watchlist.username || "unknown"];

    await prisma.watchlistGroup.create({
        data: {
            userId,
            name: groupName,
            channels: {
                create: channelList.map((ch: any) => ({
                    username: typeof ch === 'string' ? ch : (ch.username || "unknown"),
                    platform: watchlist.platform || "Instagram",
                    url: watchlist.url,
                    followers: watchlist.followers,
                }))
            }
        }
    });
}

// ... other functions omitted or adapted as needed ...
