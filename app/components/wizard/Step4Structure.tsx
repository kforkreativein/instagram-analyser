"use client";

import { useState } from "react";
import { Loader2, Sparkles, Check, ChevronDown } from "lucide-react";

interface StructureRecommendation {
  structureId: string;
  name: string;
  fitScore: number;
  reason: string;
  slots: string[];
  slotFills: Record<string, string>;
}

interface AllStructure {
  id: string;
  name: string;
  slots: string[];
}

const GROUPS = [
  {
    label: "Story Arcs",
    ids: ["heros-journey", "man-in-a-hole", "breakthrough", "challenge-to-victory", "transformation-snapshot", "one-decision-story", "x-to-y-journey"],
  },
  {
    label: "Reveal & Shift",
    ids: ["big-reveal", "mistake-and-fix", "failure-restart", "lesson-from-others", "one-thing-i-wish"],
  },
  {
    label: "Educational Frameworks",
    ids: ["arc-formula", "5-line-method", "5-part-arc", "pov-formula", "dopamine-ladder"],
  },
];

interface Props {
  topic: string;
  packagingLens: string;
  hookVerbal: string;
  clientProfile?: string;
  selectedStructureId: string;
  onSelect: (id: string, name: string, slots: string[]) => void;
  settings: { geminiApiKey?: string; openaiApiKey?: string; anthropicApiKey?: string; aiKeys?: Record<string, string> };
}

export default function Step4Structure({ topic, packagingLens, hookVerbal, clientProfile, selectedStructureId, onSelect, settings }: Props) {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<StructureRecommendation[]>([]);
  const [allStructures, setAllStructures] = useState<AllStructure[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const apiKey = settings.geminiApiKey || settings.openaiApiKey || settings.anthropicApiKey || settings.aiKeys?.gemini || settings.aiKeys?.openai || settings.aiKeys?.claude || "";

  const handleRecommend = async () => {
    setLoading(true);
    setRecommendations([]);
    try {
      const res = await fetch("/api/structure/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, packagingLens, hook: hookVerbal, clientProfile, apiKey }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations ?? []);
        setAllStructures(data.allStructures ?? []);
        if (data.recommendations?.[0]) {
          const r = data.recommendations[0];
          onSelect(r.structureId, r.name, r.slots);
          setExpandedId(r.structureId);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const grouped = GROUPS.map((g) => ({
    ...g,
    structures: allStructures.filter((s) => g.ids.includes(s.id)),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Story Structure</h2>
        <p className="text-sm text-gray-400 mt-1">
          Choose a narrative framework from 16 proven viral structures. The AI will fill each slot with your topic.
        </p>
      </div>

      {recommendations.length === 0 ? (
        <div className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-8 flex flex-col items-center text-center gap-4">
          <p className="text-sm text-gray-400">Get top-3 structure recommendations based on your topic and packaging lens.</p>
          <button
            type="button"
            onClick={handleRecommend}
            disabled={loading || !topic.trim()}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Recommend Structures
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* AI Recommendations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-300">AI Recommendations</p>
              <button type="button" onClick={handleRecommend} disabled={loading} className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Re-recommend
              </button>
            </div>
            <div className="space-y-3">
              {recommendations.map((rec, i) => {
                const isSelected = selectedStructureId === rec.structureId;
                const isExpanded = expandedId === rec.structureId;
                return (
                  <div key={rec.structureId} className={`rounded-xl border transition ${isSelected ? "border-blue-500 ring-2 ring-blue-500/20" : "border-[#2c2c2e] hover:border-blue-900/40"}`}>
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => { onSelect(rec.structureId, rec.name, rec.slots); setExpandedId(isExpanded ? null : rec.structureId); }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 text-xs font-bold ${isSelected ? "border-blue-500 bg-blue-600 text-white" : "border-[#2c2c2e] text-gray-500"}`}>
                          {isSelected ? <Check className="w-3.5 h-3.5" /> : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-white">{rec.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{rec.reason}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold text-white">{rec.fitScore}</span>
                          <span className="text-[10px] text-gray-500 block">fit</span>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : rec.structureId); }}>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-[#2c2c2e] p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Slot-by-slot outline</p>
                        <div className="space-y-2">
                          {rec.slots.map((slot) => (
                            <div key={slot} className="flex items-start gap-3">
                              <span className="text-[10px] bg-blue-900/30 text-blue-300 border border-blue-800/30 px-2 py-0.5 rounded shrink-0 mt-0.5">{slot}</span>
                              <p className="text-xs text-gray-300">{rec.slotFills[slot] ?? <span className="text-gray-600 italic">–</span>}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Full library */}
          <div>
            <button type="button" onClick={() => setShowLibrary(!showLibrary)} className="w-full text-xs text-gray-500 hover:text-gray-300 transition flex items-center justify-center gap-1 py-2">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showLibrary ? "rotate-180" : ""}`} />
              {showLibrary ? "Hide" : "Browse all 16 structures"}
            </button>

            {showLibrary && (
              <div className="mt-3 space-y-4">
                {grouped.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group.label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {group.structures.map((s) => {
                        const isSelected = selectedStructureId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => onSelect(s.id, s.name, s.slots)}
                            className={`text-left p-3 rounded-xl border transition ${isSelected ? "border-blue-500 bg-blue-900/10" : "border-[#2c2c2e] bg-[#1c1c1e] hover:border-blue-900/40"}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-semibold text-white">{s.name}</p>
                              {isSelected && <Check className="w-3 h-3 text-blue-400" />}
                            </div>
                            <p className="text-[10px] text-gray-500">{s.slots.join(" → ")}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
