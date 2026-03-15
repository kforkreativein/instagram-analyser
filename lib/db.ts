import fs from "fs";
import path from "path";
import type { NamedWatchlist } from "./types";

const DB_PATH = path.join(process.cwd(), "database.json");
const WATCHLISTS_PATH = path.join(process.cwd(), "data", "watchlists.json");

export interface AppSettings {
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  apifyApiKey: string;
  elevenLabsApiKey?: string;
  sarvamApiKey?: string;
  notionApiKey?: string;
  notionDatabaseId?: string;
  activeModel?: string;
}

function readRawDB(): Record<string, unknown> {
  try {
    const data = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeRawDB(data: Record<string, unknown>): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function getSettings(): AppSettings {
  const db = readRawDB();
  const s = (db.settings || {}) as Record<string, unknown>;
  return {
    geminiApiKey: typeof s.geminiApiKey === "string" ? s.geminiApiKey : "",
    openaiApiKey: typeof s.openaiApiKey === "string" ? s.openaiApiKey : "",
    anthropicApiKey: typeof s.anthropicApiKey === "string" ? s.anthropicApiKey : "",
    apifyApiKey: typeof s.apifyApiKey === "string" ? s.apifyApiKey : "",
    elevenLabsApiKey: typeof s.elevenLabsApiKey === "string" ? s.elevenLabsApiKey : "",
    sarvamApiKey: typeof s.sarvamApiKey === "string" ? s.sarvamApiKey : "",
    notionApiKey: typeof s.notionApiKey === "string" ? s.notionApiKey : "",
    notionDatabaseId: typeof s.notionDatabaseId === "string" ? s.notionDatabaseId : "",
    activeModel: typeof s.activeModel === "string" ? s.activeModel : "",
  };
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const db = readRawDB();
  const existing = (db.settings || {}) as Record<string, unknown>;
  db.settings = { ...existing, ...settings };
  writeRawDB(db);
}

// ── Watchlist persistence (data/watchlists.json) ──────────────────────────────

export function getWatchlists(): NamedWatchlist[] {
  try {
    const raw = fs.readFileSync(WATCHLISTS_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as NamedWatchlist[]) : [];
  } catch {
    return [];
  }
}

export function saveWatchlist(watchlist: NamedWatchlist): NamedWatchlist[] {
  const list = getWatchlists();
  const updated = [...list, watchlist];
  fs.writeFileSync(WATCHLISTS_PATH, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

export function updateWatchlist(watchlist: NamedWatchlist): NamedWatchlist[] {
  const list = getWatchlists();
  const idx = list.findIndex((w) => w.id === watchlist.id);
  const updated = idx === -1 ? [...list, watchlist] : list.map((w, i) => (i === idx ? watchlist : w));
  fs.writeFileSync(WATCHLISTS_PATH, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

export function deleteWatchlist(id: string): NamedWatchlist[] {
  const list = getWatchlists();
  const updated = list.filter((w) => w.id !== id);
  fs.writeFileSync(WATCHLISTS_PATH, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}
