"use client";

import { useState } from "react";
import { Loader2, Sparkles, Star, Eye, Bookmark, BookmarkCheck, Filter, X } from "lucide-react";
import HookBuilder from "@/app/components/HookBuilder";
import { type LocalSettings } from "@/lib/client-settings";

export interface HookVariant {
  format: string;
  angle: string;
  trigger: string;
  verbal: string;
  visual: string;
  text: string;
  specificityNote: string;
  stopRateScore: number;
  retentionFitScore: number;
  id?: string;
  savedAt?: string;
}

interface BankEntry extends HookVariant {
  id: string;
  savedAt: string;
}

type ActiveTab = "generated" | "bank" | "filters";

interface Props {
  topic: string;
  executiveSummary: string;
  keyContext: string;
  clientProfile?: string;
  clientId?: string;
  targetLanguage?: string;
  selectedHook: HookVariant | null;
  onSelect: (hook: HookVariant) => void;
  settings: LocalSettings;
  gameMode?: string;
}

const TRIGGER_COLORS: Record<string, string> = {
  curiosity: "bg-blue-900/30 text-blue-300",
  contrarian: "bg-rose-900/30 text-rose-300",
  desire: "bg-fuchsia-900/30 text-fuchsia-300",
  blueball: "bg-amber-900/30 text-amber-300",
  FOMO: "bg-orange-900/30 text-orange-300",
  social_proof: "bg-emerald-900/30 text-emerald-300",
};

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-[#1c1c1e] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-7 text-right">{score}</span>
    </div>
  );
}

function HookCard({ hook, isSelected, onSelect, onSave, isSaved }: {
  hook: HookVariant;
  isSelected: boolean;
  onSelect: () => void;
  onSave: () => void;
  isSaved: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className={`rounded-xl border p-4 transition cursor-pointer ${isSelected ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-900/10" : "border-[#2c2c2e] bg-[#1c1c1e] hover:border-blue-900/50"}`} onClick={onSelect}>
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0 flex flex-wrap gap-1">
          <span className="text-[10px] bg-[#2c2c2e] text-gray-300 px-1.5 py-0.5 rounded">{hook.format}</span>
          <span className="text-[10px] bg-[#2c2c2e] text-gray-300 px-1.5 py-0.5 rounded">{hook.angle}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${TRIGGER_COLORS[hook.trigger] ?? "bg-gray-800 text-gray-400"}`}>{hook.trigger}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }} className="text-gray-500 hover:text-white transition p-0.5">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onSave(); }} className={`transition p-0.5 ${isSaved ? "text-yellow-400" : "text-gray-500 hover:text-yellow-400"}`}>
            {isSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <p className="text-sm font-semibold text-white leading-snug mb-3">"{hook.verbal}"</p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500">Stop-rate</span>
          <ScoreBar score={hook.stopRateScore} color="bg-blue-500" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500">Retention fit</span>
          <ScoreBar score={hook.retentionFitScore} color="bg-emerald-500" />
        </div>
      </div>

      {showDetails && (
        <div className="mt-3 pt-3 border-t border-[#2c2c2e] space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#0f0f10] border border-[#2c2c2e] p-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-600 mb-1">Visual</p>
              <p className="text-[11px] text-gray-300">{hook.visual}</p>
            </div>
            <div className="rounded-lg bg-[#0f0f10] border border-[#2c2c2e] p-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-600 mb-1">Text Overlay</p>
              <p className="text-[11px] text-gray-300">{hook.text}</p>
            </div>
          </div>
          {hook.specificityNote && (
            <div className="rounded-lg bg-amber-900/10 border border-amber-800/30 p-2">
              <p className="text-[9px] uppercase tracking-wide text-amber-600 mb-0.5">Specificity tip</p>
              <p className="text-[11px] text-amber-300">{hook.specificityNote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Step3HookLab({ topic, executiveSummary, keyContext, clientProfile, clientId, targetLanguage, selectedHook, onSelect, settings, gameMode }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("generated");
  const [loading, setLoading] = useState(false);
  const [hooks, setHooks] = useState<HookVariant[]>([]);
  const [bankHooks, setBankHooks] = useState<BankEntry[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [filterFormat, setFilterFormat] = useState("");
  const [filterTrigger, setFilterTrigger] = useState("");

  const apiKey = settings.geminiApiKey || settings.openaiApiKey || settings.anthropicApiKey || settings.aiKeys?.gemini || settings.aiKeys?.openai || settings.aiKeys?.claude || "";

  const handleGenerate = async () => {
    setLoading(true);
    setHooks([]);
    setSavedIds(new Set());
    try {
      const res = await fetch("/api/hook-lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, executiveSummary, keyContext, clientProfile, targetLanguage, count: 12, apiKey, gameMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setHooks(data.hooks ?? []);
        if (data.hooks?.[0]) onSelect(data.hooks[0]);
        setActiveTab("generated");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadBank = async () => {
    if (!clientId) return;
    setLoadingBank(true);
    try {
      const res = await fetch(`/api/hook-lab/bank?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setBankHooks(data.bank ?? []);
      }
    } finally {
      setLoadingBank(false);
    }
  };

  const saveToBank = async (hook: HookVariant, i: number) => {
    if (!clientId) { alert("Select a client first to save to their hook bank."); return; }
    const res = await fetch("/api/hook-lab/bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, hook }),
    });
    if (res.ok) setSavedIds((prev) => new Set([...prev, i]));
  };

  const FORMATS = ["Fortune Teller", "Experimenter", "Teacher", "Magician", "Investigator", "Contrarian"];
  const TRIGGERS = ["curiosity", "contrarian", "desire", "blueball", "FOMO", "social_proof"];

  const filtered = hooks.filter((h) => (!filterFormat || h.format === filterFormat) && (!filterTrigger || h.trigger === filterTrigger));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Hook Lab</h2>
        <p className="text-sm text-gray-400 mt-1">
          Generate 12 framework-aware hook variants. Each has Visual + Verbal + Text layers and predicted scores.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#2c2c2e] pb-3">
        {(["generated", "bank", "filters"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => { setActiveTab(tab); if (tab === "bank" && bankHooks.length === 0) loadBank(); }}
            className={`text-sm px-3 py-1.5 rounded-lg transition capitalize ${activeTab === tab ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            {tab === "generated" ? `Generated (${hooks.length})` : tab === "bank" ? `My Winners` : "Filters"}
          </button>
        ))}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !topic.trim()}
          className="ml-auto inline-flex items-center gap-2 bg-[#1c1c1e] border border-[#2c2c2e] hover:border-blue-700 text-sm text-gray-300 hover:text-white px-3 py-1.5 rounded-xl transition disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-blue-400" />}
          {hooks.length > 0 ? "Re-generate" : "Generate Hooks"}
        </button>
      </div>

      {/* Filters tab */}
      {activeTab === "filters" && (
        <div className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Hook Format</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setFilterFormat("")} className={`text-xs px-3 py-1.5 rounded-lg border transition ${!filterFormat ? "border-blue-500 bg-blue-900/20 text-white" : "border-[#2c2c2e] text-gray-400 hover:text-white"}`}>All</button>
              {FORMATS.map((f) => (
                <button key={f} type="button" onClick={() => setFilterFormat(filterFormat === f ? "" : f)} className={`text-xs px-3 py-1.5 rounded-lg border transition ${filterFormat === f ? "border-blue-500 bg-blue-900/20 text-white" : "border-[#2c2c2e] text-gray-400 hover:text-white"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Trigger</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setFilterTrigger("")} className={`text-xs px-3 py-1.5 rounded-lg border transition ${!filterTrigger ? "border-blue-500 bg-blue-900/20 text-white" : "border-[#2c2c2e] text-gray-400 hover:text-white"}`}>All</button>
              {TRIGGERS.map((t) => (
                <button key={t} type="button" onClick={() => setFilterTrigger(filterTrigger === t ? "" : t)} className={`text-xs px-3 py-1.5 rounded-lg border transition ${filterTrigger === t ? "border-blue-500 bg-blue-900/20 text-white" : "border-[#2c2c2e] text-gray-400 hover:text-white"}`}>{t}</button>
              ))}
            </div>
          </div>
          {(filterFormat || filterTrigger) && (
            <button type="button" onClick={() => { setFilterFormat(""); setFilterTrigger(""); }} className="text-xs text-rose-400 flex items-center gap-1">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* Generated tab */}
      {activeTab === "generated" && (
        <>
          {hooks.length === 0 && !loading ? (
            <div className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-10 flex flex-col items-center text-center gap-3">
              <Star className="w-10 h-10 text-gray-600" />
              <p className="text-sm text-gray-400">Generate hooks to see 12 framework-tagged variants with trifecta layers and scores.</p>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 rounded-xl bg-[#1c1c1e] animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((hook, i) => (
                <HookCard
                  key={i}
                  hook={hook}
                  isSelected={selectedHook?.verbal === hook.verbal}
                  onSelect={() => onSelect(hook)}
                  onSave={() => saveToBank(hook, i)}
                  isSaved={savedIds.has(i)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Bank tab */}
      {activeTab === "bank" && (
        <>
          {!clientId ? (
            <p className="text-sm text-gray-500 text-center py-8">Select a client in the wizard to access their Hook Bank.</p>
          ) : loadingBank ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-[#1c1c1e] animate-pulse" />)}
            </div>
          ) : bankHooks.length === 0 ? (
            <div className="text-center py-10">
              <Bookmark className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No saved hooks yet. Generate hooks and save winners to build the bank.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {bankHooks.map((hook, i) => (
                <HookCard
                  key={hook.id}
                  hook={hook}
                  isSelected={selectedHook?.verbal === hook.verbal}
                  onSelect={() => onSelect(hook)}
                  onSave={() => {}}
                  isSaved={true}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Hook Builder — power words panel */}
      <div className="mt-6">
        <HookBuilder
          topic={topic}
          angle={executiveSummary}
          clientProfile={clientProfile ?? keyContext}
          gameMode={gameMode}
          settings={settings}
          onInsert={(hook) => {
            onSelect({
              format: "Builder",
              angle: "Hook Builder",
              trigger: "custom",
              verbal: hook,
              visual: "",
              text: hook,
              specificityNote: "Generated via Hook Builder",
              stopRateScore: 80,
              retentionFitScore: 80,
            });
          }}
        />
      </div>
    </div>
  );
}
