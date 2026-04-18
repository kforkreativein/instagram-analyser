"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Lightbulb,
  Plus,
  Sparkles,
  X,
  Loader2,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Star,
} from "lucide-react";
import {
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_SETTINGS_KEY,
  parseLocalSettings,
} from "@/lib/client-settings";

interface Idea {
  id: string;
  title: string;
  seed: string;
  substance?: string | null;
  angles?: MatrixItem[] | null;
  client?: { id: string; name: string } | null;
  createdAt: string;
}

interface MatrixItem {
  angle: string;
  hookFormat: string;
  contentFormat: string;
  audienceSlice: string;
  title: string;
  oneLineHook: string;
  viralScore: number;
  reason: string;
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [multiplyingId, setMultiplyingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [newIdea, setNewIdea] = useState({ title: "", seed: "", substance: "" });

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ideas");
      if (res.ok) setIdeas(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  const handleAdd = async () => {
    if (!newIdea.title || !newIdea.seed) return;
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newIdea),
    });
    if (res.ok) { await fetchIdeas(); setShowAddModal(false); setNewIdea({ title: "", seed: "", substance: "" }); }
  };

  const handleDelete = async (id: string) => {
    setIdeas((p) => p.filter((i) => i.id !== id));
    await fetch("/api/ideas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  };

  const handleMultiply = async (idea: Idea) => {
    setMultiplyingId(idea.id);
    setExpandedId(idea.id);
    setSelectedItems(new Set());
    try {
      const settings = parseLocalSettings(typeof window !== "undefined" ? localStorage.getItem(LOCAL_SETTINGS_KEY) : null);
      const apiKey = settings.geminiApiKey || settings.openaiApiKey || settings.anthropicApiKey || settings.aiKeys?.gemini || settings.aiKeys?.openai || settings.aiKeys?.claude || "";
      const res = await fetch(`/api/ideas/${idea.id}/multiply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: settings.defaultCreativeEngine?.includes("gpt") ? "OpenAI" : settings.defaultCreativeEngine?.includes("claude") ? "Anthropic" : "Gemini", apiKey }),
      });
      if (res.ok) { await fetchIdeas(); }
    } finally {
      setMultiplyingId(null);
    }
  };

  const handleSendToCalendar = async (idea: Idea) => {
    if (!idea.angles) return;
    setSendingId(idea.id);
    const matrix = idea.angles as MatrixItem[];
    const chosen = selectedItems.size > 0 ? matrix.filter((_, i) => selectedItems.has(i)) : matrix.slice(0, 5);
    try {
      await fetch(`/api/ideas/${idea.id}/send-to-calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosen.map((m) => ({ title: m.title, type: m.contentFormat.toLowerCase().includes("carousel") ? "carousel" : m.contentFormat.toLowerCase().includes("long") ? "long" : "reel" })) }),
      });
      alert(`${chosen.length} items added to calendar!`);
    } finally {
      setSendingId(null);
    }
  };

  const toggleSelect = (i: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <section className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10">
      <div className="mx-auto w-full p-[32px]">
        <header className="mb-[28px]">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <div className="w-[16px] h-[1px] bg-[#3BFFC8]" />
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#3BFFC8]">
              Idea Engine
            </span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-['Syne'] font-[800] text-[clamp(24px,3.5vw,36px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7]">
                Idea <span className="text-[#3BFFC8]">Multiplication</span>
              </h1>
              <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] mt-1">
                Turn one idea into 20+ angles × hook formats × content formats.
              </p>
            </div>
            <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
              <Plus className="w-4 h-4" /> New Idea
            </button>
          </div>
        </header>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-[#1c1c1e] animate-pulse" />)}
          </div>
        ) : ideas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Lightbulb className="w-12 h-12 text-gray-600 mb-4" />
            <p className="text-lg font-semibold text-gray-400">No ideas yet</p>
            <p className="text-sm text-gray-600 mt-1 max-w-xs">Add your first idea and multiply it into dozens of content angles, hook formats, and formats.</p>
            <button onClick={() => setShowAddModal(true)} className="mt-6 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition">
              <Plus className="w-4 h-4" /> Add First Idea
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {ideas.map((idea) => {
              const matrix = (idea.angles as MatrixItem[] | null) ?? null;
              const isExpanded = expandedId === idea.id;
              const isMultiplying = multiplyingId === idea.id;
              const isSending = sendingId === idea.id;

              return (
                <div key={idea.id} className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600/40 to-cyan-600/20 border border-blue-700/30 flex items-center justify-center shrink-0 mt-0.5">
                        <Lightbulb className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-['Syne'] font-bold text-base text-white">{idea.title}</h3>
                        <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{idea.seed}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {idea.client && <span className="text-[10px] text-gray-500 bg-[#1c1c1e] px-2 py-0.5 rounded-full">{idea.client.name}</span>}
                          {matrix && <span className="text-[10px] text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 px-2 py-0.5 rounded-full">{matrix.length} angles generated</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleMultiply(idea)}
                          disabled={isMultiplying}
                          className="inline-flex items-center gap-1.5 bg-[#1c1c1e] border border-[#2c2c2e] hover:border-blue-700 text-sm text-gray-300 hover:text-white px-3 py-2 rounded-xl transition disabled:opacity-60"
                        >
                          {isMultiplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-blue-400" />}
                          {matrix ? "Re-multiply" : "Multiply"}
                        </button>
                        {matrix && (
                          <button onClick={() => setExpandedId(isExpanded ? null : idea.id)} className="p-2 border border-[#2c2c2e] rounded-xl text-gray-400 hover:text-white transition">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                        <button onClick={() => handleDelete(idea.id)} className="text-gray-600 hover:text-rose-400 transition p-1">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && matrix && (
                    <div className="border-t border-[rgba(255,255,255,0.06)] bg-[#080a0f] p-5">
                      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{matrix.length} Content Variations</p>
                          <p className="text-xs text-gray-500">Select angles to send to Calendar</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedItems(selectedItems.size === matrix.length ? new Set() : new Set(matrix.map((_, i) => i)))} className="text-xs text-gray-400 border border-[#2c2c2e] px-3 py-1.5 rounded-lg hover:text-white transition">
                            {selectedItems.size === matrix.length ? "Deselect All" : "Select All"}
                          </button>
                          <button
                            onClick={() => handleSendToCalendar(idea)}
                            disabled={isSending}
                            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-60"
                          >
                            {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />}
                            Send {selectedItems.size > 0 ? selectedItems.size : matrix.length} to Calendar
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {matrix.map((item, i) => {
                          const isSelected = selectedItems.has(i);
                          return (
                            <button
                              key={i}
                              onClick={() => toggleSelect(i)}
                              className={`text-left p-4 rounded-xl border transition group ${isSelected ? "border-blue-600 bg-blue-900/20" : "border-[#2c2c2e] bg-[#1c1c1e] hover:border-blue-900/50"}`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded">{item.angle}</span>
                                  <span className="text-[10px] bg-fuchsia-900/30 text-fuchsia-300 px-1.5 py-0.5 rounded">{item.hookFormat}</span>
                                  <span className="text-[10px] bg-amber-900/30 text-amber-300 px-1.5 py-0.5 rounded">{item.contentFormat}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Star className={`w-3 h-3 ${item.viralScore >= 80 ? "text-yellow-400" : "text-gray-600"}`} />
                                  <span className="text-[11px] text-gray-400">{item.viralScore}</span>
                                </div>
                              </div>
                              <p className="text-sm font-semibold text-white leading-snug">{item.title}</p>
                              <p className="text-xs text-gray-400 mt-1 italic line-clamp-2">"{item.oneLineHook}"</p>
                              <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
                                <ArrowRight className="w-3 h-3" /> {item.audienceSlice}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0D1017] border border-[rgba(255,255,255,0.1)] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-['Syne'] font-bold text-lg text-white">New Idea</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-white transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Title</label>
                <input value={newIdea.title} onChange={(e) => setNewIdea((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Why Most Creators Fail in the First 30 Days" className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Seed / Core Premise</label>
                <textarea value={newIdea.seed} onChange={(e) => setNewIdea((p) => ({ ...p, seed: e.target.value }))} rows={3} placeholder="The one contrarian take or key insight that anchors this idea..." className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition resize-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Substance (optional)</label>
                <textarea value={newIdea.substance} onChange={(e) => setNewIdea((p) => ({ ...p, substance: e.target.value }))} rows={2} placeholder="Key facts, examples, data points..." className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-400 border border-[#2c2c2e] rounded-xl hover:text-white transition">Cancel</button>
              <button onClick={handleAdd} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition">Create Idea</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
