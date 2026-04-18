"use client";

import { useState } from "react";
import { Zap, Loader2, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { type LocalSettings } from "@/lib/client-settings";

interface HookVariant {
  id: string;
  category: string;
  mechanism: string;
  hook: string;
  anatomy: {
    subject: string;
    action: string;
    objective: string;
    contrast: string;
    proof: string | null;
    time: string | null;
  };
}

interface HookBuilderProps {
  topic: string;
  angle?: string;
  clientProfile?: string;
  gameMode?: string;
  settings: LocalSettings;
  onInsert?: (hook: string) => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Brain Hook": { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-400" },
  "Social/Status Hook": { bg: "bg-[#A78BFA]/10", border: "border-[#A78BFA]/20", text: "text-[#A78BFA]" },
  "Narrative Hook": { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400" },
};

export default function HookBuilder({ topic, angle, clientProfile, gameMode, settings, onInsert }: HookBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [variants, setVariants] = useState<HookVariant[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [localTopic, setLocalTopic] = useState(topic);
  const [localAngle, setLocalAngle] = useState(angle ?? "");

  const provider: "OpenAI" | "Anthropic" | "Gemini" =
    settings.aiProvider === "openai" ? "OpenAI" : settings.aiProvider === "claude" ? "Anthropic" : "Gemini";
  const apiKey =
    provider === "OpenAI"
      ? settings.openaiApiKey || settings.aiKeys?.openai || ""
      : provider === "Anthropic"
        ? settings.anthropicApiKey || settings.aiKeys?.claude || ""
        : settings.geminiApiKey || settings.aiKeys?.gemini || "";

  async function handleGenerate() {
    if (!localTopic.trim()) return;
    setError("");
    setIsGenerating(true);
    setVariants([]);
    try {
      const res = await fetch("/api/script/hook-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: localTopic,
          angle: localAngle,
          clientProfile: clientProfile ?? "",
          gameMode: gameMode ?? "awareness",
          provider,
          apiKey,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Generation failed");
      }
      const data = await res.json() as { variants: HookVariant[] };
      setVariants(data.variants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate hooks");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleCopy(hook: string, id: string) {
    void navigator.clipboard.writeText(hook);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const colors = (category: string) => CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Brain Hook"];

  return (
    <div className="rounded-2xl border border-[#2c2c2e] bg-[#0D1017] overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setIsOpen(p => !p)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
        type="button"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#A78BFA]/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-[#A78BFA]" />
          </div>
          <span className="font-['Syne'] font-[700] text-[13px] text-[#F0F2F7]">Hook Builder</span>
          <span className="text-[10px] font-['JetBrains_Mono'] text-[#5A6478]">6 Power Words · 3 Mechanism Types</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-[#5A6478]" /> : <ChevronDown className="w-4 h-4 text-[#5A6478]" />}
      </button>

      {isOpen && (
        <div className="border-t border-[#2c2c2e] p-4 space-y-4">
          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#5A6478] uppercase tracking-wider block mb-1">Topic</label>
              <input
                type="text"
                value={localTopic}
                onChange={e => setLocalTopic(e.target.value)}
                placeholder="e.g. How to grow on Instagram"
                className="w-full bg-[#111620] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-[#A78BFA]/50 transition"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#5A6478] uppercase tracking-wider block mb-1">Angle (optional)</label>
              <input
                type="text"
                value={localAngle}
                onChange={e => setLocalAngle(e.target.value)}
                placeholder="e.g. contrarian, inspirational"
                className="w-full bg-[#111620] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-[#A78BFA]/50 transition"
              />
            </div>
          </div>

          <button
            onClick={() => void handleGenerate()}
            disabled={isGenerating || !localTopic.trim()}
            type="button"
            className="w-full py-2.5 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-['DM_Sans'] font-[600] text-[13px] hover:bg-[#A78BFA]/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating 5 hook variants…</> : "Generate Hook Variants"}
          </button>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          {/* Variants */}
          {variants.length > 0 && (
            <div className="space-y-3 pt-1">
              {variants.map(v => {
                const c = colors(v.category);
                const isExpanded = expandedId === v.id;
                return (
                  <div key={v.id} className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${c.text} font-['JetBrains_Mono']`}>
                          {v.category}
                        </span>
                        <span className={`text-[9px] font-['JetBrains_Mono'] ${c.text} opacity-70`}>· {v.mechanism}</span>
                      </div>
                      <p className="text-[13px] text-[#F0F2F7] font-medium leading-snug mb-2">"{v.hook}"</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy(v.hook, v.id)}
                          type="button"
                          className="flex items-center gap-1 text-[10px] text-[#8892A4] hover:text-white transition-colors"
                        >
                          {copiedId === v.id ? <Check className="w-3 h-3 text-[#3BFFC8]" /> : <Copy className="w-3 h-3" />}
                          {copiedId === v.id ? "Copied" : "Copy"}
                        </button>
                        {onInsert && (
                          <button
                            onClick={() => onInsert(v.hook)}
                            type="button"
                            className={`flex items-center gap-1 text-[10px] font-semibold ${c.text} hover:opacity-80 transition-opacity`}
                          >
                            Insert into script →
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : v.id)}
                          type="button"
                          className="ml-auto flex items-center gap-1 text-[10px] text-[#5A6478] hover:text-[#8892A4] transition-colors"
                        >
                          {isExpanded ? "Hide" : "Show"} anatomy
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    {/* Anatomy breakdown */}
                    {isExpanded && (
                      <div className="border-t border-white/5 p-3 bg-[#080A0F] grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {([
                          ["Subject", v.anatomy.subject],
                          ["Action", v.anatomy.action],
                          ["Objective", v.anatomy.objective],
                          ["Contrast", v.anatomy.contrast],
                          v.anatomy.proof ? ["Proof", v.anatomy.proof] : null,
                          v.anatomy.time ? ["Time", v.anatomy.time] : null,
                        ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, value]) => (
                          <div key={label}>
                            <p className="text-[9px] font-bold text-[#5A6478] uppercase tracking-wider">{label}</p>
                            <p className="text-[11px] text-[#F0F2F7]">{value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
