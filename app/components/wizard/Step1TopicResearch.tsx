"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Search, Loader2, ArrowRight, Plus, CalendarPlus } from "lucide-react";

export interface Step1Data {
  topic: string;
  executiveSummary: string;
  keyContext: string;
}

interface SEOKeyword {
  keyword: string;
  packagingLens: string;
  hookAngle: string;
}

interface SEOResult {
  questions: string[];
  prepositions: string[];
  comparisons: string[];
  alphabeticals: string[];
  related: string[];
  problemStatements: SEOKeyword[];
  source?: string;
}

interface Props {
  data: Step1Data;
  onChange: (data: Step1Data) => void;
  settings: { geminiApiKey?: string; openaiApiKey?: string; anthropicApiKey?: string; aiKeys?: Record<string, string> };
}

export default function Step1TopicResearch({ data, onChange, settings }: Props) {
  const [showSEO, setShowSEO] = useState(false);
  const [seoSeed, setSeoSeed] = useState("");
  const [loadingSEO, setLoadingSEO] = useState(false);
  const [seoResult, setSeoResult] = useState<SEOResult | null>(null);
  const [addedToCalendar, setAddedToCalendar] = useState<Set<string>>(new Set());
  const [multiplyOpen, setMultiplyOpen] = useState(false);
  const [multiplyIdea, setMultiplyIdea] = useState("");
  const [savingIdea, setSavingIdea] = useState(false);

  const apiKey = settings.geminiApiKey || settings.openaiApiKey || settings.anthropicApiKey || settings.aiKeys?.gemini || settings.aiKeys?.openai || settings.aiKeys?.claude || "";

  const handleSEOSearch = async () => {
    if (!seoSeed.trim()) return;
    setLoadingSEO(true);
    setSeoResult(null);
    try {
      const res = await fetch("/api/seo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: seoSeed, apiKey }),
      });
      if (res.ok) setSeoResult(await res.json());
    } finally {
      setLoadingSEO(false);
    }
  };

  const useAsTopic = (keyword: string) => {
    onChange({ ...data, topic: keyword });
  };

  const addToCalendar = async (keyword: string) => {
    const res = await fetch("/api/content-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: keyword, type: "reel", status: "not_started" }),
    });
    if (res.ok) setAddedToCalendar((prev) => new Set([...prev, keyword]));
  };

  const handleSaveIdea = async () => {
    if (!multiplyIdea.trim()) return;
    setSavingIdea(true);
    try {
      await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: multiplyIdea, seed: data.topic || multiplyIdea }),
      });
      setMultiplyOpen(false);
      setMultiplyIdea("");
    } finally {
      setSavingIdea(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5">
        <h2 className="text-lg font-semibold text-white">Describe your topic</h2>
        <p className="mt-1 text-sm text-gray-400">Summarize what this script should communicate.</p>
        <textarea
          value={data.topic}
          onChange={(e) => onChange({ ...data, topic: e.target.value })}
          className="mt-4 h-40 w-full rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-4 text-sm text-gray-100 outline-none ring-blue-500 transition focus:ring-2 resize-none"
          placeholder="e.g. Why most creators fail with Instagram hooks and how to fix it in 5 steps..."
        />
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => setMultiplyOpen(!multiplyOpen)}
            className="text-xs text-blue-400 border border-blue-800/40 bg-blue-900/10 hover:bg-blue-900/20 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> Save as Idea to Multiply
          </button>
        </div>
        {multiplyOpen && (
          <div className="mt-3 p-3 rounded-xl bg-[#0f0f10] border border-[#2c2c2e] space-y-2">
            <input
              value={multiplyIdea}
              onChange={(e) => setMultiplyIdea(e.target.value)}
              placeholder="Idea title (will use current topic as seed)..."
              className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-600 transition"
            />
            <div className="flex gap-2">
              <button onClick={() => { setMultiplyIdea(data.topic.split(" ").slice(0, 8).join(" ")); }} className="text-xs text-gray-400 border border-[#2c2c2e] px-2 py-1 rounded-lg hover:text-white transition">Use topic as title</button>
              <button onClick={handleSaveIdea} disabled={savingIdea} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-lg transition disabled:opacity-60 flex items-center gap-1">
                {savingIdea ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Save to Ideas
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5">
        <h2 className="text-lg font-semibold text-white">Review the research</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Executive Summary</p>
            <textarea
              value={data.executiveSummary}
              onChange={(e) => onChange({ ...data, executiveSummary: e.target.value })}
              className="mt-2 h-24 w-full resize-none bg-transparent text-sm text-gray-200 outline-none"
              placeholder="Core thesis in 2 sentences..."
            />
          </div>
          <div className="rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Key Context</p>
            <textarea
              value={data.keyContext}
              onChange={(e) => onChange({ ...data, keyContext: e.target.value })}
              className="mt-2 h-24 w-full resize-none bg-transparent text-sm text-gray-200 outline-none"
              placeholder="Audience insight, niche context, tone..."
            />
          </div>
        </div>
      </div>

      {/* SEO Panel */}
      <div className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSEO(!showSEO)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-cyan-400" /> SEO Keyword Planner
              <span className="text-[10px] bg-cyan-900/30 text-cyan-400 border border-cyan-800/40 px-1.5 py-0.5 rounded-full">Instagram Search</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Find real search phrases people type into Instagram Search for your niche.</p>
          </div>
          {showSEO ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showSEO && (
          <div className="border-t border-[#2c2c2e] p-5 space-y-4">
            <div className="flex gap-2">
              <input
                value={seoSeed}
                onChange={(e) => setSeoSeed(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSEOSearch(); }}
                placeholder="e.g. instagram growth, hook writing, reels strategy..."
                className="flex-1 bg-[#0f0f10] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition"
              />
              <button onClick={handleSEOSearch} disabled={loadingSEO} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition disabled:opacity-60">
                {loadingSEO ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>

            {seoResult && (
              <div className="space-y-3">
                {seoResult.source === "llm" && (
                  <p className="text-[10px] text-amber-400 bg-amber-900/20 border border-amber-800/30 px-3 py-1.5 rounded-lg">LLM-generated keywords (add Apify key in Settings for real search data)</p>
                )}
                {([["Questions", seoResult.questions], ["Related", seoResult.related], ["Prepositions", seoResult.prepositions], ["Comparisons", seoResult.comparisons]] as [string, string[]][])
                  .filter(([, kws]) => kws?.length > 0)
                  .map(([label, kws]) => (
                    <div key={label}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label} ({kws.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {kws.slice(0, 8).map((kw) => {
                          const ps = seoResult.problemStatements.find((p) => p.keyword === kw);
                          const isAdded = addedToCalendar.has(kw);
                          return (
                            <div key={kw} className="flex items-center gap-1 bg-[#0f0f10] border border-[#2c2c2e] rounded-lg px-2 py-1.5 group hover:border-blue-800/50 transition">
                              <span className="text-xs text-gray-300">{kw}</span>
                              {ps && <span className="text-[9px] text-gray-600 ml-1">{ps.hookAngle}</span>}
                              <button onClick={() => useAsTopic(kw)} className="ml-1.5 opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 transition" title="Use as topic">
                                <ArrowRight className="w-3 h-3" />
                              </button>
                              <button onClick={() => addToCalendar(kw)} disabled={isAdded} className={`opacity-0 group-hover:opacity-100 transition ${isAdded ? "text-emerald-400" : "text-gray-500 hover:text-emerald-400"}`} title="Add to Calendar">
                                <CalendarPlus className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
