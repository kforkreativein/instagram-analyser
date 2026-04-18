"use client";

import { useEffect, useState, useCallback } from "react";
import { GalleryHorizontal, Plus, X, ArrowRight, Layers } from "lucide-react";
import Link from "next/link";
import CreateCarouselModal from "@/app/components/CreateCarouselModal";

interface Carousel {
  id: string;
  title: string;
  format: string;
  slides: Slide[];
  client?: { id: string; name: string } | null;
  createdAt: string;
}

interface Slide {
  index: number;
  role: "hook" | "body" | "cta";
  text: string;
  visualDirection: string;
  caption?: string;
}

export default function CarouselsPage() {
  const [carousels, setCarousels] = useState<Carousel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchCarousels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/carousels");
      if (res.ok) setCarousels(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCarousels(); }, [fetchCarousels]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this carousel?")) return;
    setCarousels((p) => p.filter((c) => c.id !== id));
    await fetch(`/api/carousels/${id}`, { method: "DELETE" });
  };

  const FORMAT_COLORS: Record<string, string> = {
    "tutorial-angle": "bg-blue-900/30 text-blue-300",
    "do-vs-dont": "bg-rose-900/30 text-rose-300",
    "educational-tips": "bg-amber-900/30 text-amber-300",
    "storytelling": "bg-fuchsia-900/30 text-fuchsia-300",
    "transformation": "bg-emerald-900/30 text-emerald-300",
    "problem-solution": "bg-orange-900/30 text-orange-300",
    "listicle": "bg-cyan-900/30 text-cyan-300",
    "types-carousel": "bg-violet-900/30 text-violet-300",
  };

  return (
    <section className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10">
      <div className="mx-auto w-full p-[32px]">
        <header className="mb-[28px]">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <div className="w-[16px] h-[1px] bg-[#3BFFC8]" />
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#3BFFC8]">
              Carousel Studio
            </span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-['Syne'] font-[800] text-[clamp(24px,3.5vw,36px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7]">
                Carousel <span className="text-[#3BFFC8]">Studio</span>
              </h1>
              <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] mt-1">
                Build slide-by-slide carousels from your scripts using proven viral formats.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> New Carousel
            </button>
          </div>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-48 rounded-2xl bg-[#1c1c1e] animate-pulse" />)}
          </div>
        ) : carousels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <GalleryHorizontal className="w-12 h-12 text-gray-600 mb-4" />
            <p className="text-lg font-semibold text-gray-400">No carousels yet</p>
            <p className="text-sm text-gray-600 mt-1 max-w-sm">Create a carousel by selecting a format and topic below.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-6 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> Create First Carousel
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {carousels.map((carousel) => {
              const slides = carousel.slides as Slide[];
              const hookSlide = slides.find((s) => s.role === "hook") ?? slides[0];
              const bodyCount = slides.filter((s) => s.role === "body").length;

              return (
                <div key={carousel.id} className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] overflow-hidden group">
                  {/* Slide preview strip */}
                  <div className="relative h-36 bg-gradient-to-br from-blue-900/20 to-fuchsia-900/10 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-center overflow-hidden px-4">
                    <div className="absolute inset-0 flex items-center justify-center gap-2">
                      {slides.slice(0, 5).map((_, i) => (
                        <div key={i} className={`rounded-lg border ${i === 0 ? "w-20 h-28 border-blue-600/60 bg-blue-900/20" : "w-14 h-20 border-[#2c2c2e] bg-[#1c1c1e]/80"} shrink-0 flex items-center justify-center`}>
                          <Layers className={`${i === 0 ? "w-5 h-5 text-blue-400" : "w-4 h-4 text-gray-600"}`} />
                        </div>
                      ))}
                      {slides.length > 5 && (
                        <div className="w-10 h-16 rounded-lg border border-[#2c2c2e] bg-[#1c1c1e]/60 flex items-center justify-center">
                          <span className="text-[10px] text-gray-500">+{slides.length - 5}</span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleDelete(carousel.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-rose-400 transition bg-[#0D1017]/80 rounded-lg p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-['Syne'] font-bold text-sm text-white leading-snug">{carousel.title}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${FORMAT_COLORS[carousel.format] ?? "bg-gray-800 text-gray-400"}`}>
                        {carousel.format.replace(/-/g, " ")}
                      </span>
                    </div>
                    {hookSlide && <p className="text-xs text-gray-400 italic line-clamp-2">"{hookSlide.text}"</p>}
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-[10px] text-gray-500">{slides.length} slides</span>
                      {carousel.client && <span className="text-[10px] text-gray-500">{carousel.client.name}</span>}
                      <span className="text-[10px] text-gray-600">{new Date(carousel.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </div>
                    <Link href={`/carousels/${carousel.id}`} className="mt-3 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition">
                      Edit Slides <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateCarouselModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); fetchCarousels(); }}
      />
    </section>
  );
}
