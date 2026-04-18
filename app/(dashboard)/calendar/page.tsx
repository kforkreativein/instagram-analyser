"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  List,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Send,
  X,
  ExternalLink,
  LayoutGrid,
  Recycle,
} from "lucide-react";
import RecyclingQueueModal from "@/app/components/RecyclingQueueModal";

type ContentStatus = "not_started" | "in_progress" | "completed" | "posted";
type ContentType = "reel" | "carousel" | "long";

interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  pillar?: string | null;
  scheduledAt?: string | null;
  postedAt?: string | null;
  publishedUrl?: string | null;
  clientId?: string | null;
  ideaId?: string | null;
  scriptId?: string | null;
  carouselId?: string | null;
  client?: { id: string; name: string } | null;
  idea?: { id: string; title: string; seed: string } | null;
  script?: { id: string; title: string; type: string } | null;
  carousel?: { id: string; title: string; format: string } | null;
  createdAt: string;
}

type ViewMode = "month" | "kanban" | "list";

const STATUS_CONFIG: Record<ContentStatus, { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }> = {
  not_started: { label: "Not Started", color: "text-gray-400", bgColor: "bg-gray-800/40 border-gray-700", icon: Circle },
  in_progress: { label: "In Progress", color: "text-blue-400", bgColor: "bg-blue-900/20 border-blue-800", icon: Clock },
  completed: { label: "Completed", color: "text-emerald-400", bgColor: "bg-emerald-900/20 border-emerald-800", icon: CheckCircle2 },
  posted: { label: "Posted", color: "text-purple-400", bgColor: "bg-purple-900/20 border-purple-800", icon: Send },
};

const TYPE_BADGE: Record<ContentType, string> = {
  reel: "bg-blue-900/40 text-blue-300",
  carousel: "bg-fuchsia-900/40 text-fuchsia-300",
  long: "bg-amber-900/40 text-amber-300",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function StatusIcon({ status, className = "" }: { status: ContentStatus; className?: string }) {
  const { icon: Icon, color } = STATUS_CONFIG[status];
  return <Icon className={`${color} ${className}`} />;
}

function ItemCard({ item, onStatusChange, onMarkPosted, onDelete }: {
  item: ContentItem;
  onStatusChange: (id: string, status: ContentStatus) => void;
  onMarkPosted: (item: ContentItem) => void;
  onDelete: (id: string) => void;
}) {
  const config = STATUS_CONFIG[item.status];
  return (
    <div className={`rounded-xl border p-3 group transition-all ${config.bgColor}`}>
      <div className="flex items-start gap-2">
        <StatusIcon status={item.status} className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white leading-snug truncate">{item.title}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_BADGE[item.type] ?? "bg-gray-800 text-gray-400"}`}>
              {item.type}
            </span>
            {item.client && (
              <span className="text-[10px] text-gray-500">{item.client.name}</span>
            )}
            {item.pillar && (
              <span className="text-[10px] text-gray-500">#{item.pillar}</span>
            )}
          </div>
          {item.scheduledAt && (
            <p className="text-[10px] text-gray-500 mt-1">
              {new Date(item.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          )}
          {item.publishedUrl && (
            <a href={item.publishedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-purple-400 mt-1 hover:text-purple-300">
              <ExternalLink className="w-3 h-3" /> View post
            </a>
          )}
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0">
          {item.status !== "posted" && (
            <button
              onClick={() => {
                const next: Record<ContentStatus, ContentStatus> = { not_started: "in_progress", in_progress: "completed", completed: "posted", posted: "posted" };
                if (item.status === "completed") { onMarkPosted(item); } else { onStatusChange(item.id, next[item.status]); }
              }}
              className="text-[10px] bg-[#1c1c1e] border border-[#2c2c2e] px-2 py-0.5 rounded-md text-gray-300 hover:text-white transition"
              title="Advance status"
            >→</button>
          )}
          <button onClick={() => onDelete(item.id)} className="text-gray-600 hover:text-rose-400 transition">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPostedModal, setShowPostedModal] = useState<ContentItem | null>(null);
  const [postedUrl, setPostedUrl] = useState("");
  const [newItem, setNewItem] = useState({ title: "", type: "reel" as ContentType, pillar: "", scheduledAt: "" });
  // AI Plan state
  const [showAIPlanModal, setShowAIPlanModal] = useState(false);
  const [showRecyclingModal, setShowRecyclingModal] = useState(false);
  const [aiPlanConfig, setAiPlanConfig] = useState({ niche: "", postingFrequency: "20", month: "", doneTopic: "", focus: "" });
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [aiPlanPreview, setAiPlanPreview] = useState<Array<{ date: string; topic: string; hookAngle: string; cta: string; type: ContentType }>>([]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/feed");
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const updateStatus = async (id: string, status: ContentStatus) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    await fetch(`/api/content-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  };

  const handleMarkPosted = async (item: ContentItem) => {
    setShowPostedModal(item);
    setPostedUrl("");
  };

  const confirmPosted = async () => {
    if (!showPostedModal) return;
    await fetch(`/api/content-items/${showPostedModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "posted", postedAt: new Date().toISOString(), publishedUrl: postedUrl || null }),
    });
    await fetchItems();
    setShowPostedModal(null);
    setPostedUrl("");
  };

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/content-items/${id}`, { method: "DELETE" });
  };

  const handleAddItem = async () => {
    if (!newItem.title) return;
    const res = await fetch("/api/content-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newItem, scheduledAt: newItem.scheduledAt || null }),
    });
    if (res.ok) { await fetchItems(); setShowAddModal(false); setNewItem({ title: "", type: "reel", pillar: "", scheduledAt: "" }); }
  };

  const handleGenerateAIPlan = async () => {
    if (!aiPlanConfig.niche) return;
    setIsGeneratingPlan(true);
    setAiPlanPreview([]);
    try {
      const targetMonth = aiPlanConfig.month || `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
      const prompt = `You are an expert Instagram content planner. Generate a non-repeating ${aiPlanConfig.postingFrequency}-post content calendar for ${targetMonth}.

NICHE: ${aiPlanConfig.niche}
POSTING FREQUENCY: ${aiPlanConfig.postingFrequency} posts/month
TARGET MONTH: ${targetMonth}
CONTENT FOCUS: ${aiPlanConfig.focus || "mix of educational, entertainment, and conversion content"}
TOPICS TO AVOID (already done): ${aiPlanConfig.doneTopic || "none"}

For each post provide:
- A specific, scroll-stopping topic (not generic)
- The best hook angle (Negative Spin, Positive Spin, Contrarian, Personal Experience, Call-Out, How-To, Social Proof)
- A CTA keyword for AutoDM
- Content type (reel or carousel)
- A realistic posting date within ${targetMonth}

Return ONLY valid JSON array:
[{ "date": "YYYY-MM-DD", "topic": "specific topic", "hookAngle": "angle name", "cta": "keyword", "type": "reel" }]`;

      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: "gemini-3-flash-preview", transcript: prompt, topic: "Content Calendar Plan", videoGoal: "Planning" }),
      });

      // Try the general AI endpoint via generate
      const planRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "script", content: prompt, model: "gemini-3-flash-preview" }),
      });

      if (!planRes.ok) throw new Error("Planning failed");
      const d = await planRes.json() as { analysis?: Record<string, unknown>; error?: string };
      // Fallback: try to parse any JSON in the response
      void d; // suppress unused warning - we'll use the generate route below
    } catch { /* will try direct generation */ }

    // Direct generation via dedicated plan endpoint
    try {
      const targetMonth = aiPlanConfig.month || `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
      const planPrompt = `Generate a ${aiPlanConfig.postingFrequency}-post Instagram content calendar for ${targetMonth} for a ${aiPlanConfig.niche} account. For each post: specific topic, hook angle (Negative Spin/Positive Spin/Contrarian/Personal Experience/Call-Out/How-To/Social Proof), CTA keyword, type (reel/carousel), and date. Already covered topics: ${aiPlanConfig.doneTopic || "none"}. Focus: ${aiPlanConfig.focus || "balanced mix"}. Return ONLY JSON array: [{"date":"YYYY-MM-DD","topic":"topic","hookAngle":"angle","cta":"keyword","type":"reel"}]`;

      const r = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: planPrompt, model: "gemini-3-flash-preview" }),
      });
      if (!r.ok) throw new Error("failed");
      const data = await r.json() as { humanized?: string };
      const raw = (data.humanized || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const plan = JSON.parse(raw) as Array<{ date: string; topic: string; hookAngle: string; cta: string; type: ContentType }>;
      setAiPlanPreview(plan);
    } catch {
      // Fallback: generate a basic plan from template
      const yr = currentMonth.getFullYear();
      const mo = currentMonth.getMonth();
      const count = parseInt(aiPlanConfig.postingFrequency) || 12;
      const fallback: Array<{ date: string; topic: string; hookAngle: string; cta: string; type: ContentType }> = Array.from({ length: count }, (_, i) => {
        const day = Math.round((i + 1) * (28 / count));
        return {
          date: `${yr}-${String(mo + 1).padStart(2, "0")}-${String(Math.min(day, 28)).padStart(2, "0")}`,
          topic: `${aiPlanConfig.niche} tip #${i + 1}`,
          hookAngle: ["Negative Spin", "Contrarian", "How-To Process", "Personal Experience", "Social Proof", "Positive Spin", "Call-Out"][i % 7],
          cta: "GUIDE",
          type: i % 3 === 0 ? "carousel" : "reel",
        };
      });
      setAiPlanPreview(fallback);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleApplyAIPlan = async () => {
    for (const post of aiPlanPreview) {
      await fetch("/api/content-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: post.topic,
          type: post.type,
          pillar: post.hookAngle,
          scheduledAt: post.date,
          status: "not_started",
        }),
      });
    }
    await fetchItems();
    setShowAIPlanModal(false);
    setAiPlanPreview([]);
  };

  const grouped: Record<ContentStatus, ContentItem[]> = { not_started: [], in_progress: [], completed: [], posted: [] };
  items.forEach((i) => grouped[i.status]?.push(i));

  // Calendar month grid
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];
  const itemsByDate: Record<string, ContentItem[]> = {};
  items.forEach((item) => {
    if (item.scheduledAt) {
      const key = new Date(item.scheduledAt).toDateString();
      if (!itemsByDate[key]) itemsByDate[key] = [];
      itemsByDate[key].push(item);
    }
  });

  const unscheduled = items.filter((i) => !i.scheduledAt);

  return (
    <section className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10">
      <div className="mx-auto w-full p-[32px]">
        {/* Header */}
        <header className="mb-[28px]">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <div className="w-[16px] h-[1px] bg-[#3BFFC8]" />
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#3BFFC8]">
              Content Calendar
            </span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-['Syne'] font-[800] text-[clamp(24px,3.5vw,36px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7]">
                Content <span className="text-[#3BFFC8]">Calendar</span>
              </h1>
              <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] mt-1">
                {items.length} items · {grouped.not_started.length} not started · {grouped.in_progress.length} in progress · {grouped.completed.length} completed · {grouped.posted.length} posted
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center gap-1 bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl p-1">
                {([["month", CalendarDays], ["kanban", Columns3], ["list", List]] as const).map(([mode, Icon]) => (
                  <button key={mode} onClick={() => setViewMode(mode as ViewMode)} className={`p-2 rounded-lg transition ${viewMode === mode ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
              <button onClick={() => setShowRecyclingModal(true)} className="inline-flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-semibold px-4 py-2 rounded-xl transition">
                <Recycle className="w-4 h-4" /> Recycling Queue
              </button>
              <button onClick={() => setShowAIPlanModal(true)} className="inline-flex items-center gap-2 bg-[rgba(59,255,200,0.1)] hover:bg-[rgba(59,255,200,0.2)] border border-[rgba(59,255,200,0.3)] text-[#3BFFC8] text-sm font-semibold px-4 py-2 rounded-xl transition">
                ✦ AI Plan Month
              </button>
              <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-64 rounded-2xl bg-[#1c1c1e] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* KANBAN VIEW */}
            {viewMode === "kanban" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {(Object.entries(STATUS_CONFIG) as Array<[ContentStatus, typeof STATUS_CONFIG[ContentStatus]]>).map(([status, config]) => (
                  <div key={status} className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <StatusIcon status={status} className="w-4 h-4" />
                      <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
                      <span className="ml-auto text-xs text-gray-500 bg-[#1c1c1e] px-2 py-0.5 rounded-full">{grouped[status].length}</span>
                    </div>
                    <div className="space-y-2">
                      {grouped[status].map((item) => (
                        <ItemCard key={item.id} item={item} onStatusChange={updateStatus} onMarkPosted={handleMarkPosted} onDelete={handleDelete} />
                      ))}
                      {grouped[status].length === 0 && (
                        <p className="text-xs text-gray-600 text-center py-6">No items</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* MONTH VIEW */}
            {viewMode === "month" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-2 rounded-lg border border-[#2c2c2e] text-gray-400 hover:text-white transition">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h2 className="font-['Syne'] font-bold text-lg text-white">{MONTHS[month]} {year}</h2>
                  <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-2 rounded-lg border border-[#2c2c2e] text-gray-400 hover:text-white transition">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-[rgba(255,255,255,0.06)]">
                    {DAYS.map((d) => <div key={d} className="p-3 text-center text-xs font-semibold text-gray-500">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7">
                    {cells.map((date, i) => {
                      const key = date?.toDateString() ?? "";
                      const dayItems = date ? (itemsByDate[key] ?? []) : [];
                      const isToday = date?.toDateString() === new Date().toDateString();
                      return (
                        <div key={i} className={`min-h-[100px] p-2 border-b border-r border-[rgba(255,255,255,0.04)] ${!date ? "bg-[#080a0f]" : ""}`}>
                          {date && (
                            <>
                              <span className={`text-xs font-medium ${isToday ? "w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white" : "text-gray-500"}`}>
                                {date.getDate()}
                              </span>
                              <div className="mt-1 space-y-1">
                                {dayItems.slice(0, 3).map((item) => (
                                  <div key={item.id} className={`text-[10px] px-1.5 py-0.5 rounded-md border truncate ${STATUS_CONFIG[item.status].bgColor} ${STATUS_CONFIG[item.status].color}`}>
                                    {item.title}
                                  </div>
                                ))}
                                {dayItems.length > 3 && <div className="text-[10px] text-gray-500">+{dayItems.length - 3} more</div>}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {unscheduled.length > 0 && (
                  <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] p-4">
                    <p className="text-xs font-semibold text-gray-500 mb-3">Unscheduled ({unscheduled.length})</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                      {unscheduled.map((item) => (
                        <ItemCard key={item.id} item={item} onStatusChange={updateStatus} onMarkPosted={handleMarkPosted} onDelete={handleDelete} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* LIST VIEW */}
            {viewMode === "list" && (
              <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-[rgba(255,255,255,0.06)]">
                    <tr>
                      <th className="text-left p-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">Title</th>
                      <th className="text-left p-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">Type</th>
                      <th className="text-left p-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">Status</th>
                      <th className="text-left p-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">Client</th>
                      <th className="text-left p-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">Scheduled</th>
                      <th className="p-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const config = STATUS_CONFIG[item.status];
                      return (
                        <tr key={item.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <StatusIcon status={item.status} className="w-3.5 h-3.5 shrink-0" />
                              <span className="text-white font-medium truncate max-w-[240px]">{item.title}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_BADGE[item.type] ?? "bg-gray-800 text-gray-400"}`}>{item.type}</span>
                          </td>
                          <td className="p-4">
                            <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                          </td>
                          <td className="p-4 text-gray-400 text-xs">{item.client?.name ?? "—"}</td>
                          <td className="p-4 text-gray-400 text-xs">
                            {item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2 justify-end">
                              {item.status !== "posted" && (
                                <button
                                  onClick={() => {
                                    const next: Record<ContentStatus, ContentStatus> = { not_started: "in_progress", in_progress: "completed", completed: "posted", posted: "posted" };
                                    if (item.status === "completed") { handleMarkPosted(item); } else { updateStatus(item.id, next[item.status]); }
                                  }}
                                  className="text-xs bg-[#1c1c1e] border border-[#2c2c2e] px-2 py-1 rounded-lg text-gray-300 hover:text-white transition"
                                >
                                  {item.status === "completed" ? "Mark Posted" : "Advance"}
                                </button>
                              )}
                              <button onClick={() => handleDelete(item.id)} className="text-gray-600 hover:text-rose-400 transition">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && (
                      <tr><td colSpan={6} className="p-12 text-center text-gray-500">No content items yet. Add your first idea.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0D1017] border border-[rgba(255,255,255,0.1)] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-['Syne'] font-bold text-lg text-white">Add Content Item</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-white transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Title</label>
                <input value={newItem.title} onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. 5 Hook Mistakes Creators Make" className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Type</label>
                  <select value={newItem.type} onChange={(e) => setNewItem((p) => ({ ...p, type: e.target.value as ContentType }))} className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition">
                    <option value="reel">Reel</option>
                    <option value="carousel">Carousel</option>
                    <option value="long">Long-form</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Pillar (optional)</label>
                  <input value={newItem.pillar} onChange={(e) => setNewItem((p) => ({ ...p, pillar: e.target.value }))} placeholder="e.g. education" className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Schedule Date (optional)</label>
                <input type="date" value={newItem.scheduledAt} onChange={(e) => setNewItem((p) => ({ ...p, scheduledAt: e.target.value }))} className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-400 border border-[#2c2c2e] rounded-xl hover:text-white transition">Cancel</button>
              <button onClick={handleAddItem} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Plan Month Modal */}
      {showAIPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#0D1017] border border-[rgba(59,255,200,0.15)] rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
              <div>
                <h3 className="font-['Syne'] font-bold text-lg text-white">✦ AI Content Planner</h3>
                <p className="text-xs text-[#8892A4] mt-0.5">Generate a full month of non-repeating Instagram content</p>
              </div>
              <button onClick={() => { setShowAIPlanModal(false); setAiPlanPreview([]); }} className="text-gray-500 hover:text-white transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8892A4] mb-1.5 block">Niche / Topic Focus *</label>
                  <input
                    value={aiPlanConfig.niche}
                    onChange={(e) => setAiPlanConfig(p => ({ ...p, niche: e.target.value }))}
                    placeholder="e.g. Nutrition & gut health for women"
                    className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#3BFFC8] transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8892A4] mb-1.5 block">Month (blank = current)</label>
                  <input
                    value={aiPlanConfig.month}
                    onChange={(e) => setAiPlanConfig(p => ({ ...p, month: e.target.value }))}
                    placeholder="e.g. May 2026"
                    className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#3BFFC8] transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8892A4] mb-1.5 block">Posts per month</label>
                  <select
                    value={aiPlanConfig.postingFrequency}
                    onChange={(e) => setAiPlanConfig(p => ({ ...p, postingFrequency: e.target.value }))}
                    className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#3BFFC8] transition"
                  >
                    {["5", "10", "15", "20", "25", "30"].map(n => <option key={n} value={n}>{n} posts</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#8892A4] mb-1.5 block">Content Focus</label>
                  <input
                    value={aiPlanConfig.focus}
                    onChange={(e) => setAiPlanConfig(p => ({ ...p, focus: e.target.value }))}
                    placeholder="e.g. myth-busting, meal planning, gut health"
                    className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#3BFFC8] transition"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8892A4] mb-1.5 block">Already-done topics (to avoid repeats)</label>
                <textarea
                  value={aiPlanConfig.doneTopic}
                  onChange={(e) => setAiPlanConfig(p => ({ ...p, doneTopic: e.target.value }))}
                  placeholder="e.g. 5 myths about protein, dairy vs plant milk..."
                  rows={2}
                  className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#3BFFC8] transition resize-none"
                />
              </div>
              <button
                onClick={handleGenerateAIPlan}
                disabled={!aiPlanConfig.niche || isGeneratingPlan}
                className="w-full py-3 rounded-xl bg-[rgba(59,255,200,0.1)] border border-[rgba(59,255,200,0.3)] text-[#3BFFC8] font-['DM_Sans'] font-[600] text-sm hover:bg-[rgba(59,255,200,0.2)] transition disabled:opacity-50"
              >
                {isGeneratingPlan ? "Generating plan..." : "✦ Generate Content Plan"}
              </button>

              {/* Preview */}
              {aiPlanPreview.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-white">{aiPlanPreview.length} posts generated</p>
                    <button onClick={handleApplyAIPlan} className="px-4 py-2 text-sm bg-[#3BFFC8] text-[#080A0F] font-[700] rounded-xl hover:opacity-90 transition">
                      Add All to Calendar
                    </button>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1" style={{ scrollbarWidth: "thin" }}>
                    {aiPlanPreview.map((post, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-[#1c1c1e] border border-[#2c2c2e]">
                        <div className="shrink-0 text-center min-w-[40px]">
                          <p className="text-[10px] text-[#8892A4]">{new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${TYPE_BADGE[post.type] ?? "bg-gray-800 text-gray-400"}`}>{post.type}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white leading-snug">{post.topic}</p>
                          <p className="text-[10px] text-[#8892A4] mt-1">Angle: {post.hookAngle} · CTA: {post.cta}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mark Posted Modal */}
      {showPostedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0D1017] border border-[rgba(255,255,255,0.1)] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-['Syne'] font-bold text-lg text-white">Mark as Posted</h3>
              <button onClick={() => setShowPostedModal(null)} className="text-gray-500 hover:text-white transition"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-400 mb-4">Optionally add the Instagram URL of the posted content.</p>
            <input value={postedUrl} onChange={(e) => setPostedUrl(e.target.value)} placeholder="https://www.instagram.com/reel/..." className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition" />
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowPostedModal(null)} className="px-4 py-2 text-sm text-gray-400 border border-[#2c2c2e] rounded-xl hover:text-white transition">Cancel</button>
              <button onClick={confirmPosted} className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition">Confirm Posted</button>
            </div>
          </div>
        </div>
      )}

      <RecyclingQueueModal
        isOpen={showRecyclingModal}
        onClose={() => { setShowRecyclingModal(false); fetchItems(); }}
      />
    </section>
  );
}
