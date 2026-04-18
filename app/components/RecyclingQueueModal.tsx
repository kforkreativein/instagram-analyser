"use client";

import { useEffect, useState } from "react";
import { X, Loader2, RefreshCw, Layers, TrendingUp, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/UI/Toast";

interface TrackedVideo {
  id: string;
  url: string;
  addedAt: string;
  thumbnailUrl?: string;
  metrics?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
  };
  analysis?: {
    hooks?: { hookTitle?: string };
  };
}

interface ClientWithVideos {
  id: string;
  name: string;
  niche?: string;
  trackedVideos?: TrackedVideo[];
}

interface RecycleCandidate {
  video: TrackedVideo;
  client: ClientWithVideos;
  badge: "repost" | "shape-shift" | "upgrade";
  badgeLabel: string;
  badgeReason: string;
  signalScore: number;
  daysAgo: number;
}

function computeSignalScore(v: TrackedVideo): number {
  const m = v.metrics ?? {};
  return (Number(m.comments ?? 0) * 5) + (Number(m.shares ?? 0) * 4) +
    (Number(m.saves ?? 0) * 3) + (Number(m.likes ?? 0) * 2) + (Number(m.views ?? 0) * 0.1);
}

const BADGE_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  "repost": { bg: "bg-[#3BFFC8]/10", text: "text-[#3BFFC8]", border: "border-[#3BFFC8]/20", icon: "♻️" },
  "shape-shift": { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", icon: "🔄" },
  "upgrade": { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", icon: "⬆️" },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function RecyclingQueueModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<RecycleCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "repost" | "shape-shift" | "upgrade">("all");

  useEffect(() => {
    if (!isOpen) return;
    loadCandidates();
  }, [isOpen]);

  async function loadCandidates() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) return;
      const clients = await res.json() as ClientWithVideos[];

      const now = Date.now();
      const allCandidates: RecycleCandidate[] = [];

      for (const client of clients) {
        const videos = client.trackedVideos ?? [];
        // Sort by signal score desc
        const scored = videos
          .filter(v => Number((v.metrics ?? {}).views ?? 0) > 0)
          .map(v => ({ ...v, signalScore: computeSignalScore(v), daysAgo: Math.floor((now - new Date(v.addedAt).getTime()) / 86_400_000) }))
          .sort((a, b) => b.signalScore - a.signalScore);

        const topN = scored.slice(0, Math.ceil(scored.length * 0.5) + 1); // top 50%

        for (const v of topN) {
          if (v.daysAgo >= 60 && v.daysAgo <= 90) {
            allCandidates.push({ video: v, client, badge: "repost", badgeLabel: "Repost Ready", badgeReason: `${v.daysAgo}d old top performer — fresh cohort will see it as new`, signalScore: v.signalScore, daysAgo: v.daysAgo });
          } else if (v.daysAgo > 30 && v.daysAgo < 60) {
            allCandidates.push({ video: v, client, badge: "shape-shift", badgeLabel: "Shape-Shift", badgeReason: "Convert to Carousel — reaches a different audience pool", signalScore: v.signalScore, daysAgo: v.daysAgo });
          } else if (v.daysAgo >= 180) {
            allCandidates.push({ video: v, client, badge: "upgrade", badgeLabel: "Upgrade", badgeReason: `${v.daysAgo}d old winner — same topic, new hook, tighter structure`, signalScore: v.signalScore, daysAgo: v.daysAgo });
          }
        }
      }

      // Sort: repost first, then shape-shift, then upgrade; within each by signal score
      const order = { repost: 0, "shape-shift": 1, upgrade: 2 };
      allCandidates.sort((a, b) => (order[a.badge] - order[b.badge]) || (b.signalScore - a.signalScore));
      setCandidates(allCandidates);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleScheduleRepost(c: RecycleCandidate) {
    setActioningId(c.video.id);
    try {
      const title = c.video.analysis?.hooks?.hookTitle ?? c.video.url.slice(-40);
      const res = await fetch("/api/content-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[REPOST] ${title}`,
          type: "repost",
          status: "not_started",
          clientId: c.client.id,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast("success", "Scheduled", "Repost added to your calendar.");
      onClose();
      router.push("/calendar");
    } catch {
      toast("error", "Failed", "Could not schedule repost.");
    } finally {
      setActioningId(null);
    }
  }

  async function handleShapeShift(c: RecycleCandidate) {
    onClose();
    const topic = c.video.analysis?.hooks?.hookTitle ?? "";
    router.push(`/carousels?createTopic=${encodeURIComponent(topic)}&clientId=${c.client.id}`);
  }

  function handleUpgrade(c: RecycleCandidate) {
    onClose();
    router.push(`/scripts/create?remix=${c.video.id}&mode=upgrade&clientId=${c.client.id}`);
  }

  const filtered = filter === "all" ? candidates : candidates.filter(c => c.badge === filter);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#0D1017] rounded-2xl border border-white/8 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <h2 className="font-['Syne'] font-[800] text-[18px] text-[#F0F2F7] flex items-center gap-2">
              ♻️ Recycling Queue
            </h2>
            <p className="text-[11px] text-[#5A6478] mt-0.5">
              Zero-effort content: Repost winners · Shape-shift formats · Upgrade old hits
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[#5A6478] hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {(["all", "repost", "shape-shift", "upgrade"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all capitalize ${filter === f ? "bg-white/10 text-white" : "text-[#5A6478] hover:text-[#F0F2F7]"}`}
              >
                {f === "all" ? `All (${candidates.length})` : `${BADGE_STYLES[f].icon} ${f} (${candidates.filter(c => c.badge === f).length})`}
              </button>
            ))}
            <button onClick={loadCandidates} disabled={isLoading} className="ml-auto text-[#5A6478] hover:text-white transition-colors">
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[#8892A4]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Scanning all tracked videos…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#5A6478] text-sm">No recycling candidates yet. Add tracked videos with performance data in the client Performance Tracker.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => {
                const style = BADGE_STYLES[c.badge];
                const thumb = (c.video.thumbnailUrl && c.video.thumbnailUrl !== "undefined") ? c.video.thumbnailUrl : null;
                const isActioning = actioningId === c.video.id;
                return (
                  <div key={`${c.client.id}-${c.video.id}`} className={`rounded-xl border ${style.border} ${style.bg} overflow-hidden`}>
                    <div className="flex gap-3 p-3">
                      {/* Thumbnail */}
                      {thumb ? (
                        <img src={thumb} alt="" className="w-12 h-16 object-cover rounded-lg shrink-0" />
                      ) : (
                        <div className="w-12 h-16 bg-white/5 rounded-lg shrink-0 flex items-center justify-center text-xl">📱</div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${style.text} font-['JetBrains_Mono']`}>
                            {style.icon} {c.badgeLabel}
                          </span>
                          <span className="text-[10px] text-[#5A6478]">{c.client.name}</span>
                          <span className="text-[10px] text-[#5A6478]">{c.daysAgo}d ago</span>
                        </div>
                        <p className="text-[12px] text-[#F0F2F7] truncate">{c.video.analysis?.hooks?.hookTitle ?? c.video.url}</p>
                        <p className="text-[10px] text-[#5A6478] mt-0.5">{c.badgeReason}</p>

                        {/* Actions */}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {c.badge === "repost" && (
                            <button
                              onClick={() => void handleScheduleRepost(c)}
                              disabled={isActioning}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${style.text} border ${style.border} hover:opacity-80 transition-opacity disabled:opacity-50`}
                            >
                              {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
                              Schedule Repost
                            </button>
                          )}
                          {c.badge === "shape-shift" && (
                            <button
                              onClick={() => void handleShapeShift(c)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${style.text} border ${style.border} hover:opacity-80 transition-opacity`}
                            >
                              <Layers className="w-3 h-3" />
                              Shape-Shift to Carousel
                            </button>
                          )}
                          {c.badge === "upgrade" && (
                            <button
                              onClick={() => handleUpgrade(c)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${style.text} border ${style.border} hover:opacity-80 transition-opacity`}
                            >
                              <TrendingUp className="w-3 h-3" />
                              Upgrade in Script Wizard
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
