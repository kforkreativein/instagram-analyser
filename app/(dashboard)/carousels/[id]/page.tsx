"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, GripVertical, Plus, Trash2, Eye } from "lucide-react";
import Link from "next/link";

interface Slide {
  index: number;
  role: "hook" | "body" | "cta";
  text: string;
  visualDirection: string;
  caption?: string;
}

interface Carousel {
  id: string;
  title: string;
  format: string;
  slides: Slide[];
  client?: { id: string; name: string } | null;
}

const ROLE_COLORS = {
  hook: "bg-blue-900/30 text-blue-300 border-blue-800/40",
  body: "bg-gray-800/40 text-gray-300 border-gray-700",
  cta: "bg-purple-900/30 text-purple-300 border-purple-800/40",
};

export default function CarouselEditorPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSlide, setActiveSlide] = useState(0);

  const fetchCarousel = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/carousels/${id}`);
      if (res.ok) {
        const data: Carousel = await res.json();
        setCarousel(data);
        setTitle(data.title);
        setSlides(data.slides as Slide[]);
      } else {
        router.push("/carousels");
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchCarousel(); }, [fetchCarousel]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/carousels/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slides: slides.map((s, i) => ({ ...s, index: i })) }),
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSlide = (i: number, field: keyof Slide, value: string) => {
    setSlides((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  const addSlide = (afterIndex: number) => {
    const newSlide: Slide = { index: afterIndex + 1, role: "body", text: "", visualDirection: "", caption: "" };
    setSlides((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newSlide);
      return next.map((s, i) => ({ ...s, index: i }));
    });
    setActiveSlide(afterIndex + 1);
  };

  const removeSlide = (i: number) => {
    if (slides.length <= 2) return;
    setSlides((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, index: idx })));
    setActiveSlide(Math.max(0, i - 1));
  };

  if (loading) return (
    <section className="w-full min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
    </section>
  );

  if (!carousel) return null;

  const active = slides[activeSlide];

  return (
    <section className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10">
      <div className="mx-auto w-full p-[32px]">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <Link href="/carousels" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 bg-transparent text-xl font-['Syne'] font-bold text-white outline-none border-b border-transparent focus:border-blue-600 transition min-w-0"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 bg-[#1c1c1e] border border-[#2c2c2e] px-3 py-1.5 rounded-lg">
              {carousel.format.replace(/-/g, " ")}
            </span>
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6">
          {/* Slide rail */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{slides.length} Slides</p>
            {slides.map((slide, i) => (
              <div key={i} className="group">
                <button
                  onClick={() => setActiveSlide(i)}
                  className={`w-full text-left p-3 rounded-xl border transition ${activeSlide === i ? "border-blue-600 bg-blue-900/20" : "border-[#2c2c2e] bg-[#1c1c1e] hover:border-blue-900/40"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <GripVertical className="w-3 h-3 text-gray-600 shrink-0" />
                    <span className="text-[10px] font-semibold text-gray-500">#{i + 1}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ROLE_COLORS[slide.role]}`}>{slide.role}</span>
                    {slides.length > 2 && (
                      <button onClick={(e) => { e.stopPropagation(); removeSlide(i); }} className="ml-auto opacity-0 group-hover:opacity-100 text-gray-600 hover:text-rose-400 transition">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-white line-clamp-2 font-medium">{slide.text || <span className="text-gray-600 italic">Empty slide</span>}</p>
                </button>
                <button onClick={() => addSlide(i)} className="w-full text-center py-1 opacity-0 group-hover:opacity-100 text-[10px] text-gray-600 hover:text-blue-400 transition">
                  <Plus className="w-3 h-3 inline-block" />
                </button>
              </div>
            ))}
          </div>

          {/* Slide editor */}
          {active && (
            <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-sm font-semibold text-gray-300">Slide {activeSlide + 1}</span>
                <div className="flex gap-1.5">
                  {(["hook", "body", "cta"] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() => updateSlide(activeSlide, "role", role)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${active.role === role ? ROLE_COLORS[role] : "border-[#2c2c2e] text-gray-500 hover:text-gray-300"}`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Preview card */}
                <div className="aspect-square rounded-2xl bg-gradient-to-br from-[#1a1f2e] to-[#0d1017] border border-[#2c2c2e] flex flex-col items-center justify-center p-8 text-center">
                  <p className="font-['Syne'] font-bold text-xl text-white leading-tight mb-3">{active.text || <span className="text-gray-600 italic text-base">Main text goes here</span>}</p>
                  {active.caption && <p className="text-sm text-gray-400">{active.caption}</p>}
                  <div className="absolute bottom-4 right-4 text-gray-600">
                    <Eye className="w-4 h-4" />
                  </div>
                </div>

                {/* Edit fields */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Main Text <span className="text-gray-600">(under 20 words)</span></label>
                    <textarea
                      value={active.text}
                      onChange={(e) => updateSlide(activeSlide, "text", e.target.value)}
                      rows={3}
                      placeholder="Bold punchy text for this slide..."
                      className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-600 transition resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Visual Direction</label>
                    <textarea
                      value={active.visualDirection}
                      onChange={(e) => updateSlide(activeSlide, "visualDirection", e.target.value)}
                      rows={2}
                      placeholder="Describe the image, graphic, or icon to show..."
                      className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-600 transition resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Sub-caption <span className="text-gray-600">(optional)</span></label>
                    <input
                      value={active.caption ?? ""}
                      onChange={(e) => updateSlide(activeSlide, "caption", e.target.value)}
                      placeholder="Supporting text under the main text..."
                      className="w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-600 transition"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
