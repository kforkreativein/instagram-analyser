"use client";

import { useState } from "react";
import { RefreshCw, Loader2, Edit2, CheckCircle2, AlertTriangle, User, ExternalLink } from "lucide-react";
import { useToast } from "@/app/components/UI/Toast";
import { LOCAL_SETTINGS_KEY, parseLocalSettings } from "@/lib/client-settings";

interface ProfileData {
  handle: string;
  displayName: string;
  bio: string;
  ctaLink: string;
  followers: number | string;
  picUrl: string;
  highlights: string[];
  lastFetchedAt?: string;
}

interface PcrAudit {
  score: number;
  grade: string;
  breakdown: {
    handle: { score: number; notes: string };
    bio: { score: number; notes: string };
    cta: { score: number; notes: string };
    highlights: { score: number; notes: string };
    alignment: { score: number; notes: string };
  };
  rewrites: { bioHook: string; cta: string; positioning: string };
  contentBioMisalignment: boolean;
  topPriority: string;
  notes: string;
  updatedAt?: string;
}

interface ProfileAuditTabProps {
  clientId: string;
  clientName: string;
  clientNiche: string;
  gameMode: string;
  recentContentTitles: string[];
  initialProfileData?: ProfileData;
  initialPcrAudit?: PcrAudit;
  onSaved: (profileData: ProfileData, pcrAudit: PcrAudit) => void;
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-[#3BFFC8] border-[#3BFFC8]/30 bg-[#3BFFC8]/10",
  B: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  C: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  D: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  F: "text-red-400 border-red-500/30 bg-red-500/10",
};

function ScoreBadge({ score, dim }: { score: number; dim: string }) {
  const color = score >= 16 ? "text-[#3BFFC8]" : score >= 12 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#8892A4] capitalize">{dim}</span>
      <span className={`font-['JetBrains_Mono'] font-bold text-[12px] ${color}`}>{score}/20</span>
    </div>
  );
}

export default function ProfileAuditTab({
  clientId, clientName, clientNiche, gameMode, recentContentTitles,
  initialProfileData, initialPcrAudit, onSaved,
}: ProfileAuditTabProps) {
  const { toast } = useToast();

  const [profileData, setProfileData] = useState<ProfileData>(initialProfileData ?? {
    handle: "", displayName: clientName, bio: "", ctaLink: "", followers: "",
    picUrl: "", highlights: [""],
  });
  const [audit, setAudit] = useState<PcrAudit | null>(initialPcrAudit ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isManualMode, setIsManualMode] = useState(!initialProfileData?.lastFetchedAt);
  const [isEditing, setIsEditing] = useState(false);

  async function handleRefresh() {
    const handle = profileData.handle.replace(/^@/, "");
    if (!handle) {
      setIsManualMode(true);
      toast("info", "Manual Mode", "Enter the handle to attempt an Apify refresh.");
      return;
    }
    setIsRefreshing(true);
    try {
      // Try Apify instagram profile scraper
      const res = await fetch("/api/instagram/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: handle }),
      });
      if (res.ok) {
        const data = await res.json() as { bio?: string; followers?: number; displayName?: string; picUrl?: string };
        setProfileData(prev => ({
          ...prev,
          bio: data.bio ?? prev.bio,
          followers: data.followers ?? prev.followers,
          displayName: data.displayName ?? prev.displayName,
          picUrl: data.picUrl ?? prev.picUrl,
          lastFetchedAt: new Date().toISOString(),
        }));
        toast("success", "Profile Refreshed", "Data fetched from Instagram.");
        setIsManualMode(false);
      } else {
        throw new Error("Apify unavailable");
      }
    } catch {
      setIsManualMode(true);
      toast("info", "Manual Mode", "Apify unavailable — edit the fields manually.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleRunAudit() {
    setIsAuditing(true);
    try {
      const ls = typeof window !== "undefined" ? parseLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY)) : null;
      const geminiApiKey = (typeof window !== "undefined" && localStorage.getItem("geminiApiKey")?.trim()) || ls?.geminiApiKey;
      const openaiApiKey = (typeof window !== "undefined" && localStorage.getItem("openAiApiKey")?.trim()) || ls?.openaiApiKey;
      const anthropicApiKey = (typeof window !== "undefined" && localStorage.getItem("anthropicApiKey")?.trim()) || ls?.anthropicApiKey;
      const activeProvider =
        (typeof window !== "undefined" && localStorage.getItem("activeProvider")?.trim()) || "Gemini";
      const res = await fetch("/api/client/profile-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          profileData,
          niche: clientNiche,
          gameMode,
          recentContentTitles,
          geminiApiKey: geminiApiKey || undefined,
          openaiApiKey: openaiApiKey || undefined,
          anthropicApiKey: anthropicApiKey || undefined,
          activeProvider,
        }),
      });
      if (!res.ok) throw new Error("Audit failed");
      const { audit: newAudit, profileData: savedProfile } = await res.json() as { audit: PcrAudit; profileData: ProfileData | undefined };
      setAudit(newAudit);
      onSaved((savedProfile ?? profileData) as unknown as ProfileData, newAudit);
      toast("success", "Audit Complete", `PCR Score: ${newAudit.score}/100 (${newAudit.grade})`);
    } catch {
      toast("error", "Audit Failed", "Could not generate profile audit. Check your API key.");
    } finally {
      setIsAuditing(false);
    }
  }

  const gradeCls = audit ? (GRADE_COLORS[audit.grade] ?? GRADE_COLORS.C) : "";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* IG Preview Card + Edit Controls */}
      <div className="glass-surface rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7] flex items-center gap-2">
            <User className="w-5 h-5 text-[#F59E0B]" />
            Profile Preview
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[12px] text-[#8892A4] hover:text-white hover:bg-white/10 transition-all"
            >
              {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {isRefreshing ? "Fetching…" : "Refresh from Instagram"}
            </button>
            <button
              onClick={() => setIsEditing(p => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[12px] text-[#8892A4] hover:text-white hover:bg-white/10 transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" />
              {isEditing ? "Done Editing" : "Edit Manually"}
            </button>
          </div>
        </div>

        {/* Instagram-like preview */}
        <div className="flex flex-col sm:flex-row gap-6 p-5 rounded-2xl bg-[#080A0F] border border-white/5">
          {/* Profile pic */}
          <div className="shrink-0">
            {profileData.picUrl ? (
              <img src={profileData.picUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-[#3BFFC8]/30" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#1c1c1e] border-2 border-white/10 flex items-center justify-center text-3xl">
                {clientName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Profile info */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-[#F0F2F7] text-[16px]">{profileData.handle ? `@${profileData.handle.replace(/^@/, "")}` : "@handle"}</span>
              {profileData.displayName && <span className="text-[14px] text-[#8892A4]">{profileData.displayName}</span>}
            </div>
            <div className="flex items-center gap-4 text-[13px]">
              <span><strong className="text-[#F0F2F7]">{profileData.followers ? Number(profileData.followers).toLocaleString() : "—"}</strong> <span className="text-[#5A6478]">followers</span></span>
            </div>
            <p className="text-[13px] text-[#8892A4] whitespace-pre-line leading-relaxed max-w-md">
              {profileData.bio || <span className="italic text-[#5A6478]">No bio yet</span>}
            </p>
            {profileData.ctaLink && (
              <div className="flex items-center gap-1.5 text-[12px] text-[#3BFFC8]">
                <ExternalLink className="w-3 h-3" />
                <span>{profileData.ctaLink}</span>
              </div>
            )}
            {profileData.highlights?.filter(Boolean).length > 0 && (
              <div className="flex gap-2 flex-wrap mt-1">
                {profileData.highlights.filter(Boolean).map((h, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] text-[#8892A4]">{h}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Manual edit form */}
        {isEditing && (
          <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: "handle", label: "Instagram Handle" },
                { key: "displayName", label: "Display Name" },
                { key: "followers", label: "Followers" },
                { key: "picUrl", label: "Profile Pic URL" },
                { key: "ctaLink", label: "CTA Link / URL in Bio" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[10px] text-[#5A6478] uppercase tracking-wider block mb-1">{label}</label>
                  <input
                    type="text"
                    value={((profileData as unknown) as Record<string, string>)[key] ?? ""}
                    onChange={e => setProfileData(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full bg-[#111620] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-[#F59E0B]/50 transition"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="text-[10px] text-[#5A6478] uppercase tracking-wider block mb-1">Bio</label>
              <textarea
                rows={3}
                value={profileData.bio}
                onChange={e => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                className="w-full bg-[#111620] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-[#F59E0B]/50 transition resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#5A6478] uppercase tracking-wider block mb-1">Highlights (comma-separated)</label>
              <input
                type="text"
                value={(profileData.highlights ?? []).join(", ")}
                onChange={e => setProfileData(prev => ({ ...prev, highlights: e.target.value.split(",").map(s => s.trim()) }))}
                className="w-full bg-[#111620] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-[#F59E0B]/50 transition"
              />
            </div>
          </div>
        )}

        <button
          onClick={handleRunAudit}
          disabled={isAuditing || !profileData.bio}
          className="mt-4 w-full py-3 rounded-xl font-['DM_Sans'] font-[600] text-[13px] bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] hover:bg-[#F59E0B]/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isAuditing ? <><Loader2 className="w-4 h-4 animate-spin" /> Running PCR Audit…</> : "Run Profile Audit (PCR Score)"}
        </button>
        {!profileData.bio && <p className="text-[11px] text-[#5A6478] text-center mt-1">Add bio text first (refresh or edit manually)</p>}
      </div>

      {/* Audit Results */}
      {audit && (
        <div className="glass-surface rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`rounded-2xl border px-5 py-3 flex flex-col items-center ${gradeCls}`}>
                <span className="font-['JetBrains_Mono'] font-bold text-[32px]">{audit.score}</span>
                <span className="text-[10px] uppercase tracking-wider">/100</span>
              </div>
              <div>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-bold text-[13px] mb-1 ${gradeCls}`}>
                  Grade {audit.grade}
                </div>
                <p className="text-[11px] text-[#8892A4]">PCR (Profile Conversion Rate) Score</p>
              </div>
            </div>
            {audit.contentBioMisalignment && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] text-amber-400 font-semibold">Content–Bio Misalignment</span>
              </div>
            )}
          </div>

          {/* 5-dimension breakdown */}
          <div className="space-y-2.5 rounded-xl bg-[#080A0F] p-4 border border-white/5">
            <p className="text-[10px] font-bold text-[#5A6478] uppercase tracking-wider mb-3">Score Breakdown</p>
            {Object.entries(audit.breakdown).map(([dim, v]) => (
              <div key={dim}>
                <ScoreBadge score={v.score} dim={dim} />
                <p className="text-[10px] text-[#5A6478] mt-0.5 ml-1">{v.notes}</p>
              </div>
            ))}
          </div>

          {/* Top Priority */}
          {audit.topPriority && (
            <div className="rounded-xl bg-[#F59E0B]/5 border border-[#F59E0B]/20 p-4">
              <p className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-wider mb-1">Top Priority Fix</p>
              <p className="text-[13px] text-[#F0F2F7]">{audit.topPriority}</p>
            </div>
          )}

          {/* Rewrite suggestions */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-[#5A6478] uppercase tracking-wider">AI Rewrite Suggestions</p>
            {[
              { label: "Bio Hook Line", value: audit.rewrites.bioHook, color: "border-[#3BFFC8]/20 bg-[#3BFFC8]/5" },
              { label: "CTA", value: audit.rewrites.cta, color: "border-blue-500/20 bg-blue-500/5" },
              { label: "Positioning Statement", value: audit.rewrites.positioning, color: "border-[#A78BFA]/20 bg-[#A78BFA]/5" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl border p-4 ${color}`}>
                <p className="text-[10px] font-bold text-[#8892A4] uppercase mb-1">{label}</p>
                <p className="text-[13px] text-[#F0F2F7] italic">"{value}"</p>
              </div>
            ))}
          </div>

          {audit.notes && (
            <p className="text-[12px] text-[#8892A4] border-t border-white/5 pt-3">{audit.notes}</p>
          )}
          {audit.updatedAt && (
            <p className="text-[10px] text-[#5A6478]">Last audited: {new Date(audit.updatedAt).toLocaleString()}</p>
          )}
        </div>
      )}
    </div>
  );
}
