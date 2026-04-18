"use client";

import { useState } from "react";
import { X, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

const CAROUSEL_FORMATS = [
  {
    id: "tutorial-angle",
    name: "Tutorial Angle",
    icon: "📚",
    description: "Step-by-step how-to. Hook → Problem → Fix → Steps → CTA",
    bestFor: "Educational content, how-to guides",
  },
  {
    id: "do-vs-dont",
    name: "Do vs Don't",
    icon: "⚖️",
    description: "Comparison slides. Wrong way vs right way. Bold contrast.",
    bestFor: "Common mistakes, best practices",
  },
  {
    id: "educational-tips",
    name: "Educational Tips & Hacks",
    icon: "💡",
    description: "Numbered tips with depth. Hook → Tips 1–5 → Bonus → CTA",
    bestFor: "Knowledge sharing, tips content",
  },
  {
    id: "storytelling",
    name: "Storytelling",
    icon: "📖",
    description: "Narrative arc. Drama → Context → Conflict → Lesson → CTA",
    bestFor: "Personal stories, case studies",
  },
  {
    id: "transformation",
    name: "Transformation (Before/After)",
    icon: "🔄",
    description: "Journey from X to Y. Before → Changes → After → CTA",
    bestFor: "Results, progress, lifestyle change",
  },
  {
    id: "problem-solution",
    name: "Problem/Solution",
    icon: "🎯",
    description: "Pain → Solutions. Hook → Problem depth → 3 solutions → Proof → CTA",
    bestFor: "Pain points, solutions, fixes",
  },
  {
    id: "listicle",
    name: "Listicle",
    icon: "📋",
    description: "Numbered list with depth. Curiosity hook → Items → Surprise → CTA",
    bestFor: "Lists, reasons, resources",
  },
  {
    id: "types-carousel",
    name: "Types Carousel",
    icon: "🗂️",
    description: "Categorization. 'Which type are you?' → Types 1–4 → Decision guide → CTA",
    bestFor: "Frameworks, categories, archetypes",
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prefillTopic?: string;
  prefillHook?: string;
  gameMode?: string;
}

export default function CreateCarouselModal({ isOpen, onClose, prefillTopic, prefillHook, gameMode }: Props) {
  const router = useRouter();
  const [topic, setTopic] = useState(prefillTopic ?? "");
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleGenerate() {
    if (!topic.trim() || !selectedFormat) return;
    setError("");
    setIsGenerating(true);
    try {
      const res = await fetch("/api/carousel/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          hook: prefillHook ?? "",
          carouselFormat: selectedFormat,
          clientProfile: "",
          gameMode: gameMode ?? "awareness",
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json() as { title?: string; slides?: unknown[] };

      // Save carousel
      const saveRes = await fetch("/api/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title ?? topic.slice(0, 60),
          format: selectedFormat,
          slides: data.slides ?? [],
        }),
      });
      if (!saveRes.ok) throw new Error("Failed to save");
      const saved = await saveRes.json() as { id: string };

      onClose();
      router.push(`/carousels/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#0D1017] rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <h2 className="font-['Syne'] font-[800] text-[18px] text-[#F0F2F7]">Create Carousel</h2>
            <p className="text-[12px] text-[#5A6478] mt-0.5">Choose a format, enter your topic, generate.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[#5A6478] hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Topic input */}
          <div>
            <label className="text-[10px] text-[#5A6478] uppercase tracking-wider block mb-1.5">Topic / Idea</label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. 5 mistakes new creators make on Instagram"
              className="w-full bg-[#111620] border border-white/10 rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-[#3BFFC8]/50 transition"
            />
          </div>

          {/* Format grid */}
          <div>
            <label className="text-[10px] text-[#5A6478] uppercase tracking-wider block mb-2">Format (choose one)</label>
            <div className="grid grid-cols-2 gap-2.5">
              {CAROUSEL_FORMATS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFormat(f.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${selectedFormat === f.id ? "border-[#3BFFC8]/40 bg-[#3BFFC8]/5" : "border-white/5 bg-white/[0.02] hover:border-white/10"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{f.icon}</span>
                    <span className={`font-['Syne'] font-[700] text-[12px] ${selectedFormat === f.id ? "text-[#3BFFC8]" : "text-[#F0F2F7]"}`}>{f.name}</span>
                  </div>
                  <p className="text-[10px] text-[#5A6478] leading-relaxed">{f.description}</p>
                  <p className="text-[10px] text-[#3BFFC8]/60 mt-1">Best for: {f.bestFor}</p>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>}

          {/* CTA */}
          <button
            onClick={() => void handleGenerate()}
            disabled={isGenerating || !topic.trim() || !selectedFormat}
            type="button"
            className="w-full py-3.5 rounded-xl bg-[#3BFFC8] text-[#080A0F] font-['DM_Sans'] font-[700] text-[14px] transition hover:bg-[#3BFFC8]/90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(59,255,200,0.15)]"
          >
            {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating carousel…</> : <><Sparkles className="w-4 h-4" /> Generate Carousel</>}
          </button>
        </div>
      </div>
    </div>
  );
}
