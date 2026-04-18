"use client";

import { useState } from "react";
import { Loader2, Sparkles, ChevronDown, Check } from "lucide-react";

export interface PackagingLens {
  lens: string;
  fitScore: number;
  reason: string;
  bestHookFormat: string;
  microSkeleton: string[];
}

interface Props {
  topic: string;
  executiveSummary: string;
  keyContext: string;
  clientProfile?: string;
  selectedLens: string;
  onSelect: (lens: string) => void;
  settings: { geminiApiKey?: string; openaiApiKey?: string; anthropicApiKey?: string; aiKeys?: Record<string, string> };
  gameMode?: string;
}

const LENS_COLORS: Record<string, string> = {
  Comparison: "from-blue-600/40 via-blue-800/20",
  Contrarian: "from-rose-600/40 via-rose-800/20",
  Challenge: "from-amber-600/40 via-amber-800/20",
  Breakdown: "from-cyan-600/40 via-cyan-800/20",
  POV: "from-violet-600/40 via-violet-800/20",
  "Case Study": "from-emerald-600/40 via-emerald-800/20",
  Transformation: "from-fuchsia-600/40 via-fuchsia-800/20",
  "Myth Bust": "from-orange-600/40 via-orange-800/20",
  Tutorial: "from-teal-600/40 via-teal-800/20",
  Listicle: "from-indigo-600/40 via-indigo-800/20",
};

export default function Step2Packaging({ topic, executiveSummary, keyContext, clientProfile, selectedLens, onSelect, settings, gameMode }: Props) {
  const [loading, setLoading] = useState(false);
  const [lenses, setLenses] = useState<PackagingLens[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [expandedLens, setExpandedLens] = useState<string | null>(null);

  const apiKey = settings.geminiApiKey || settings.openaiApiKey || settings.anthropicApiKey || settings.aiKeys?.gemini || settings.aiKeys?.openai || settings.aiKeys?.claude || "";

  const handleGenerate = async () => {
    setLoading(true);
    setLenses([]);
    try {
      const res = await fetch("/api/packaging/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, executiveSummary, keyContext, clientProfile, apiKey, gameMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setLenses(data.lenses ?? []);
        if (data.lenses?.[0]) onSelect(data.lenses[0].lens);
      }
    } finally {
      setLoading(false);
    }
  };

  const visible = showAll ? lenses : lenses.slice(0, 3);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Choose a Packaging Lens</h2>
        <p className="text-sm text-gray-400 mt-1">
          Packaging is how the idea is wrapped. It determines which hooks and structures will fit. Decide this before writing anything.
        </p>
      </div>

      {lenses.length === 0 ? (
        <div className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-8 flex flex-col items-center text-center gap-4">
          <p className="text-sm text-gray-400">Get AI-ranked packaging recommendations for your topic.</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Recommend Lenses
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{lenses.length} lenses ranked · Top 3 shown</p>
            <button type="button" onClick={handleGenerate} disabled={loading} className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Re-generate
            </button>
          </div>

          <div className="grid gap-3">
            {visible.map((lens, i) => {
              const isSelected = selectedLens === lens.lens;
              const isExpanded = expandedLens === lens.lens;
              const gradient = LENS_COLORS[lens.lens] ?? "from-gray-600/30 via-gray-800/20";
              return (
                <div key={lens.lens} className={`rounded-2xl border transition cursor-pointer ${isSelected ? "border-blue-500 ring-2 ring-blue-500/30" : "border-[#2c2c2e] hover:border-blue-900/50"}`} onClick={() => { onSelect(lens.lens); setExpandedLens(isExpanded ? null : lens.lens); }}>
                  <div className={`rounded-t-2xl bg-gradient-to-r ${gradient} to-transparent p-4`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${isSelected ? "border-blue-500 bg-blue-600" : "border-[#2c2c2e] bg-[#1c1c1e]"}`}>
                        {isSelected ? <Check className="w-4 h-4 text-white" /> : <span className="text-xs text-gray-500 font-semibold">#{i + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-['Syne'] font-bold text-base text-white">{lens.lens}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{lens.reason}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-white">{lens.fitScore}</div>
                        <div className="text-[10px] text-gray-500">fit score</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] bg-black/30 text-gray-300 px-2 py-0.5 rounded-full">Best hook: {lens.bestHookFormat}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedLens(isExpanded ? null : lens.lens); }} className="ml-auto text-gray-400 hover:text-white transition">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="p-4 border-t border-[#2c2c2e] space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Script Skeleton Preview</p>
                      {lens.microSkeleton.map((line, li) => (
                        <div key={li} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-[10px] text-gray-600 mt-0.5 shrink-0">{li + 1}.</span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {lenses.length > 3 && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-2 transition">
              {showAll ? "Show less" : `Show ${lenses.length - 3} more lenses`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
