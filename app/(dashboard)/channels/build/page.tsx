"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WatchlistChannel } from "@/lib/types";
import type { FetchedProfile } from "@/app/api/profiles/fetch/route";

function parseManualInput(inputString: string): string[] {
  const reservedRoutes = new Set([
    "p",
    "reel",
    "reels",
    "explore",
    "stories",
    "accounts",
    "about",
    "developer",
  ]);

  const extractInstagramUsername = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    let candidate = trimmed;

    try {
      if (trimmed.includes("instagram.com")) {
        const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
        const parsedUrl = new URL(normalized);
        if (!parsedUrl.hostname.toLowerCase().includes("instagram.com")) {
          return null;
        }

        const firstSegment = parsedUrl.pathname.split("/").map((segment) => segment.trim()).filter(Boolean)[0] ?? "";
        candidate = firstSegment;
      }
    } catch {
      candidate = trimmed;
    }

    const username = candidate
      .replace(/^@+/, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/g, "")
      .trim();

    if (!username || reservedRoutes.has(username.toLowerCase())) {
      return null;
    }

    return username;
  };

  const seen = new Set<string>();
  const usernames: string[] = [];

  for (const item of inputString.split(/[\n,]/)) {
    const username = extractInstagramUsername(item);
    if (!username) continue;

    const normalizedKey = username.toLowerCase();
    if (seen.has(normalizedKey)) continue;

    seen.add(normalizedKey);
    usernames.push(username);
  }

  return usernames;
}

function buildInstagramChannel(username: string): WatchlistChannel {
  return {
    username,
    platform: "instagram",
    url: `https://www.instagram.com/${username}/`,
    followers: null,
  };
}

function formatFollowers(followers: WatchlistChannel["followers"]): string {
  if (typeof followers === "number" && Number.isFinite(followers)) {
    return `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(followers)} followers`;
  }

  if (typeof followers === "string" && followers.trim()) {
    return `${followers.trim()} followers`;
  }

  return "N/A followers";
}

export default function ChannelsBuilderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-white/40 text-sm">Loading...</div>}>
      <ChannelsBuilderContent />
    </Suspense>
  );
}

function ChannelsBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const [manualInput, setManualInput] = useState("");
  const [watchlist, setWatchlist] = useState<WatchlistChannel[]>([]);
  const [watchlistName, setWatchlistName] = useState("");
  const [isHydratingWatchlist, setIsHydratingWatchlist] = useState(!!editId);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [isSavingWatchlist, setIsSavingWatchlist] = useState(false);
  const [watchlistError, setWatchlistError] = useState("");

  // Edit mode: pre-fill name + profiles from existing watchlist
  useEffect(() => {
    if (!editId) return;
    setIsHydratingWatchlist(true);
    fetch(`/api/watchlists?id=${editId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { watchlist?: { name: string; channels?: WatchlistChannel[]; profiles?: WatchlistChannel[] } }) => {
        if (data.watchlist) {
          setWatchlistName(data.watchlist.name);
          setWatchlist(data.watchlist.channels || (data.watchlist as any).profiles || []);
        }
      })
      .catch(() => { /* ignore — fallback to empty */ })
      .finally(() => setIsHydratingWatchlist(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  async function handleAddManual() {
    const parsedUsernames = parseManualInput(manualInput);

    if (parsedUsernames.length === 0) {
      setWatchlistError("Enter at least one valid Instagram profile URL.");
      return;
    }

    setIsSubmittingManual(true);
    setWatchlistError("");

    try {
      const apifyKey = (() => {
        try { const v = localStorage.getItem("APIFY_API_KEY"); return v && v !== "undefined" ? v.trim() : ""; } catch { return ""; }
      })();

      const fetchRes = await fetch("/api/profiles/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: parsedUsernames, apifyApiKey: apifyKey }),
      });

      if (!fetchRes.ok) {
        const errData = (await fetchRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Failed to fetch profiles from Apify.");
      }

      const fetchedProfiles = (await fetchRes.json()) as FetchedProfile[];

      const newChannels: WatchlistChannel[] = fetchedProfiles.map((p) => ({
        username: p.username,
        platform: "instagram",
        url: `https://www.instagram.com/${p.username}/`,
        followers: p.followerCount,
        ...(p.profilePicUrl ? { profilePicUrl: p.profilePicUrl } : {}),
        ...(p.isVerified ? { isVerified: p.isVerified } : {}),
        ...(p.biography ? { biography: p.biography } : {}),
      }));

      setWatchlist((prev) => {
        const existing = new Set(prev.map((c) => c.username.toLowerCase()));
        const fresh = newChannels.filter((c) => !existing.has(c.username.toLowerCase()));
        return [...prev, ...fresh];
      });
      setManualInput("");
    } catch (error) {
      setWatchlistError(error instanceof Error ? error.message : "Failed to update watchlist.");
    } finally {
      setIsSubmittingManual(false);
    }
  }

  function handleRemoveFromWatchlist(username: string) {
    setWatchlist((prev) => prev.filter((c) => c.username.toLowerCase() !== username.toLowerCase()));
  }

  function handleRemoveAll() {
    if (!watchlist.length || !confirm("Remove all channels from the watchlist?")) return;
    setWatchlist([]);
  }

  async function handleSaveWatchlist() {
    const name = watchlistName.trim();
    if (!name) {
      setWatchlistError("Please enter a name for this watchlist.");
      return;
    }
    if (watchlist.length === 0) {
      setWatchlistError("Add at least one channel before saving.");
      return;
    }

    setIsSavingWatchlist(true);
    setWatchlistError("");

    try {
      const method = editId ? "PUT" : "POST";
      const body = editId
        ? { id: editId, name, profiles: watchlist }
        : { name, profiles: watchlist };

      const response = await fetch("/api/watchlists", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save watchlist.");
      }

      router.push("/channels");
      router.refresh();
      // Force browser to show latest data after redirect
      setTimeout(() => { window.location.href = "/channels"; }, 100);
    } catch (error) {
      setWatchlistError(error instanceof Error ? error.message : "Failed to save watchlist.");
    } finally {
      setIsSavingWatchlist(false);
    }
  }

  function handlePrimaryAction() {
    void handleAddManual();
  }

  return (
    <section className="flex w-full min-h-screen text-[var(--text)] flex-col relative z-10 bg-transparent">
      <div className="w-full">
        {/* BACK BUTTON ROW */}
        <div className="mb-[24px]">
          <Link
            href="/channels"
            className="inline-block bg-transparent border border-[rgba(255,255,255,0.12)] text-[#8892A4] p-[7px_14px] rounded-[7px] font-['DM_Sans'] text-[12.5px] font-[500] cursor-pointer transition-colors hover:bg-[#111620] hover:text-[#F0F2F7]"
          >
            ← Back
          </Link>
        </div>

        {/* PAGE HEADER */}
        <header className="mb-[28px]">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <div className="w-[16px] h-[1px] bg-[#FF3B57]"></div>
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#FF3B57]">
              Watchlist Builder
            </span>
          </div>
          <h1 className="font-['Syne'] font-[800] text-[clamp(28px,4vw,40px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7] mb-[10px]">
            Build Your<br />
            <span className="text-[#3BFFC8]">Watchlist</span>
          </h1>
          <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65] mb-[28px]">
            Find the best channels to use as inspiration for your content
          </p>
          {/* WATCHLIST NAME INPUT */}
          <input
            type="text"
            value={watchlistName}
            onChange={(e) => setWatchlistName(e.target.value)}
            placeholder="Name this Watchlist (e.g., Tech Competitors)"
            className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl p-4 text-white text-lg font-semibold mb-6 focus:border-cyan-500 outline-none transition placeholder:text-white/30"
          />
        </header>

        {/* INPUT AREA */}
        <div className="bg-[#0D1017] border border-[rgba(255,255,255,0.06)] rounded-[14px] p-[20px] mb-[20px]">
          <textarea
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleAddManual(); }}
            placeholder="Paste Instagram URLs or usernames, separated by commas or new lines&#10;e.g. @cristiano, https://instagram.com/nasa, garyvee"
            className="w-full bg-[#111620] border border-[rgba(255,255,255,0.08)] rounded-[10px] p-[14px] font-['DM_Sans'] text-[13.5px] text-[#8892A4] resize-none min-h-[120px] outline-none leading-[1.6] transition placeholder:text-[#5A6478] focus:border-[rgba(59,255,200,0.3)] focus:shadow-[0_0_0_3px_rgba(59,255,200,0.06)]"
          />
          <div className="mt-[14px] flex justify-end">
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={isSubmittingManual}
              className="bg-[#3BFFC8] text-[#080A0F] p-[10px_28px] rounded-[8px] font-['DM_Sans'] text-[13px] font-[700] cursor-pointer border-none shadow-[0_0_16px_rgba(59,255,200,0.25)] transition duration-150 hover:shadow-[0_0_24px_rgba(59,255,200,0.4)] hover:-translate-y-[1px] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_16px_rgba(59,255,200,0.25)]"
            >
              {isSubmittingManual ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin inline-block" />
                  Extracting Data...
                </span>
              ) : "+ Add to Watchlist"}
            </button>
          </div>
        </div>

        {/* INCLUDED CHANNELS PANEL */}
        <div className="bg-[#0D1017] border border-[rgba(255,255,255,0.06)] rounded-[14px] overflow-hidden flex flex-col">
          <div className="p-[16px_18px] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7] flex items-center gap-[8px]">
              Included <span className="font-['JetBrains_Mono'] text-[10px] text-[#5A6478] font-[500] uppercase">({watchlist.length} channels)</span>
            </h2>
          </div>
          <div className="min-h-[280px] p-[16px]">
            {isHydratingWatchlist ? (
              <div className="flex items-center justify-center h-[280px] text-white/40 text-sm">Loading watchlist...</div>
            ) : watchlist && watchlist.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4 overflow-y-auto max-h-[600px] pr-2">
                {watchlist.map((channel, idx) => (
                  <div
                    key={`${channel.platform}-${channel.username}-${idx}`}
                    className="bg-[#1A1A1A] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors relative group flex flex-col h-full"
                  >
                    {/* Remove Button (Appears on Hover) */}
                    <button
                      type="button"
                      onClick={() => void handleRemoveFromWatchlist(channel.username)}
                      className="absolute top-3 right-3 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>

                    {/* Header: Avatar & Info */}
                    <div className="flex items-center gap-3 mb-3">
                      {channel.profilePicUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={channel.profilePicUrl}
                          alt={channel.username}
                          className="w-12 h-12 rounded-full border border-white/10 object-cover flex-shrink-0"
                          onError={(e) => { e.currentTarget.style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.classList.remove("hidden"); }}
                        />
                      ) : null}
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center font-bold text-lg flex-shrink-0${channel.profilePicUrl ? " hidden" : ""}`}>
                        {channel.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-white/90 text-sm flex items-center gap-1 truncate">
                          {channel.username}
                          {channel.isVerified && (
                            <svg className="w-3.5 h-3.5 flex-shrink-0 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </h4>
                        <p className="text-[11px] text-white/40 font-medium tracking-wide uppercase truncate">
                          {formatFollowers(channel.followers)}
                        </p>
                      </div>
                    </div>

                    {/* Body: Biography */}
                    {channel.biography ? (
                      <div className="mt-auto pt-3 border-t border-white/5">
                        <p className="text-xs text-white/50 leading-relaxed line-clamp-3">
                          {channel.biography}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : isSubmittingManual ? (
              /* Skeleton pulse cards while Apify is fetching */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-[#1A1A1A] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-white/10 rounded w-3/4" />
                        <div className="h-2.5 bg-white/5 rounded w-1/2" />
                      </div>
                    </div>
                    <div className="pt-3 border-t border-white/5 space-y-2">
                      <div className="h-2 bg-white/5 rounded w-full" />
                      <div className="h-2 bg-white/5 rounded w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[280px] gap-[8px]">
                <span className="text-white/40 text-sm">No channels added yet</span>
                <span className="text-[#5A6478] text-xs">Paste URLs above and click &quot;Add to Watchlist&quot;</span>
              </div>
            )}
          </div>
          <div className="p-[12px_18px] border-t border-[rgba(255,255,255,0.06)] bg-[#111620] flex items-center justify-end">
            <button
              type="button"
              onClick={() => void handleSaveWatchlist()}
              disabled={isSavingWatchlist || watchlist.length === 0}
              className="bg-[#3BFFC8] text-[#080A0F] p-[8px_20px] rounded-[8px] font-['DM_Sans'] text-[13px] font-[700] border-none shadow-[0_0_16px_rgba(59,255,200,0.3)] transition duration-150 hover:shadow-[0_0_24px_rgba(59,255,200,0.5)] hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {isSavingWatchlist ? "Saving..." : editId ? "💾 Update Watchlist" : "💾 Save Watchlist"}
            </button>
          </div>
        </div>

        {watchlistError ? (
          <p className="mt-[16px] text-[12px] font-['DM_Sans'] text-[#FF3B57]">{watchlistError}</p>
        ) : null}
      </div>
    </section>
  );
}
