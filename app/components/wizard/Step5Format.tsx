"use client";

import { Check, GalleryHorizontal, PlayCircle, FileText } from "lucide-react";

export type ContentFormat = "reel" | "carousel" | "long";

interface CarouselFormatOption {
  id: string;
  name: string;
  slidePattern: string;
  color: string;
}

const CAROUSEL_FORMATS: CarouselFormatOption[] = [
  { id: "tutorial-angle", name: "Tutorial Angle", slidePattern: "Hook → Steps → CTA", color: "from-blue-600/30" },
  { id: "do-vs-dont", name: "Do vs Don't", slidePattern: "Hook → Do/Don't pairs → CTA", color: "from-rose-600/30" },
  { id: "educational-tips", name: "Educational Tips", slidePattern: "Hook → Tips with visuals → CTA", color: "from-amber-600/30" },
  { id: "storytelling", name: "Storytelling", slidePattern: "Hook → Story slides → CTA", color: "from-fuchsia-600/30" },
  { id: "transformation", name: "Transformation", slidePattern: "Hook (before/after) → Steps → CTA", color: "from-emerald-600/30" },
  { id: "problem-solution", name: "Problem/Solution", slidePattern: "Hook → Problem+Solution pairs → CTA", color: "from-orange-600/30" },
  { id: "listicle", name: "List Style", slidePattern: "Hook → Points with breakdown → CTA", color: "from-cyan-600/30" },
  { id: "types-carousel", name: "Types Carousel", slidePattern: "Hook → Types with visuals → CTA", color: "from-violet-600/30" },
];

interface Props {
  selectedFormat: ContentFormat;
  selectedCarouselFormat: string;
  onFormatChange: (format: ContentFormat) => void;
  onCarouselFormatChange: (format: string) => void;
}

const FORMAT_OPTIONS = [
  {
    id: "reel" as ContentFormat,
    label: "Reel / Short-form",
    description: "60-90 second vertical video script. Spoken, linear, with visual cues.",
    icon: PlayCircle,
    gradient: "from-blue-600/30 via-blue-800/20",
  },
  {
    id: "carousel" as ContentFormat,
    label: "Carousel",
    description: "Slide-by-slide Instagram post with text, visuals, and a CTA on the last slide.",
    icon: GalleryHorizontal,
    gradient: "from-fuchsia-600/30 via-fuchsia-800/20",
  },
  {
    id: "long" as ContentFormat,
    label: "Long-form",
    description: "3-5 minute video script with deeper storytelling and educational depth.",
    icon: FileText,
    gradient: "from-amber-600/30 via-amber-800/20",
  },
];

export default function Step5Format({ selectedFormat, selectedCarouselFormat, onFormatChange, onCarouselFormatChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Choose a Format</h2>
        <p className="text-sm text-gray-400 mt-1">Select how this content will be delivered.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {FORMAT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selectedFormat === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onFormatChange(opt.id)}
              className={`text-left rounded-2xl border p-5 transition ${isSelected ? "border-blue-500 ring-2 ring-blue-500/20" : "border-[#2c2c2e] bg-[#1c1c1e] hover:border-blue-900/50"}`}
            >
              <div className={`relative aspect-[9/6] rounded-xl bg-gradient-to-br ${opt.gradient} to-transparent border border-white/5 flex items-center justify-center mb-4`}>
                <Icon className="w-8 h-8 text-white/60" />
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className="font-semibold text-sm text-white">{opt.label}</p>
              <p className="text-xs text-gray-400 mt-1">{opt.description}</p>
            </button>
          );
        })}
      </div>

      {/* Carousel format selector */}
      {selectedFormat === "carousel" && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">Carousel Format</p>
          <p className="text-xs text-gray-400">Choose the proven carousel type for your content.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {CAROUSEL_FORMATS.map((fmt) => {
              const isSelected = selectedCarouselFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => onCarouselFormatChange(fmt.id)}
                  className={`text-left p-3 rounded-xl border transition ${isSelected ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-900/10" : "border-[#2c2c2e] bg-[#1c1c1e] hover:border-blue-900/40"}`}
                >
                  <div className={`h-10 rounded-lg bg-gradient-to-br ${fmt.color} to-transparent border border-white/5 mb-2 flex items-center justify-center`}>
                    {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                  </div>
                  <p className="text-xs font-semibold text-white">{fmt.name}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{fmt.slidePattern}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
