"use client";

import { Bot, Check, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import {
  CREATIVE_ENGINE_OPTIONS,
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_SETTINGS_KEY,
  type CreativeEngine,
  type LocalSettings,
  parseLocalSettings,
} from "@/lib/client-settings";
import CanvasEditor from "@/app/components/CanvasEditor";
import Step1TopicResearch, { type Step1Data } from "@/app/components/wizard/Step1TopicResearch";
import Step2Packaging from "@/app/components/wizard/Step2Packaging";
import Step3HookLab, { type HookVariant } from "@/app/components/wizard/Step3HookLab";
import Step4Structure from "@/app/components/wizard/Step4Structure";
import Step5Format, { type ContentFormat } from "@/app/components/wizard/Step5Format";

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const NAV_ITEMS: Array<{ label: string; step: WizardStep }> = [
  { label: "Topic", step: 1 },
  { label: "Packaging", step: 2 },
  { label: "Hook", step: 3 },
  { label: "Structure", step: 4 },
  { label: "Format", step: 5 },
  { label: "Script", step: 6 },
];

function CreateWizardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sourceId = searchParams.get("source") ?? "";

  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [creativeEngine, setCreativeEngine] = useState<CreativeEngine>(DEFAULT_LOCAL_SETTINGS.defaultCreativeEngine);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [clientGameMode, setClientGameMode] = useState<string>("awareness");
  const [clientIdForMode, setClientIdForMode] = useState<string | null>(null);

  // Step 1 data
  const [step1, setStep1] = useState<Step1Data>({
    topic: sourceId
      ? `Remix the key idea from video ${sourceId}: explain why this post format became an outlier and how to replicate it.`
      : "Explain how creators can identify outlier reels and turn those patterns into repeatable scripts.",
    executiveSummary: "Outlier posts typically combine a strong first-second hook, one central promise, and clear CTA alignment with audience intent.",
    keyContext: "Audience is curious but busy. They reward fast clarity, practical examples, and zero filler.",
  });

  // Step 2 - Packaging
  const [selectedLens, setSelectedLens] = useState("");

  // Step 3 - Hook
  const [selectedHook, setSelectedHook] = useState<HookVariant | null>(null);

  // Step 4 - Structure
  const [selectedStructureId, setSelectedStructureId] = useState("");
  const [selectedStructureName, setSelectedStructureName] = useState("");
  const [selectedStructureSlots, setSelectedStructureSlots] = useState<string[]>([]);

  // Step 5 - Format
  const [contentFormat, setContentFormat] = useState<ContentFormat>("reel");
  const [carouselFormat, setCarouselFormat] = useState("tutorial-angle");

  // Step 6 - Script/Carousel output
  const [scriptText, setScriptText] = useState("");
  const [carouselData, setCarouselData] = useState<{ title: string; slides: Array<{ index: number; role: string; text: string; visualDirection: string; caption?: string }> } | null>(null);

  // Viral Score badge for step 6
  type WizardViralTier = "Low" | "Medium" | "High" | "Outlier";
  const [wizardViralScore, setWizardViralScore] = useState<{ totalScore: number; predictedViralTier: WizardViralTier } | null>(null);
  const [isScoringWizardViral, setIsScoringWizardViral] = useState(false);

  async function handleWizardViralScore(script: string) {
    if (!script.trim()) return;
    setIsScoringWizardViral(true);
    try {
      const res = await fetch("/api/script/viral-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, topic: step1.topic }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setWizardViralScore({ totalScore: data.totalScore, predictedViralTier: data.predictedViralTier });
    } catch { /* silent — badge is non-blocking */ } finally {
      setIsScoringWizardViral(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY));
    setSettings(parsed);
    setCreativeEngine(parsed.defaultCreativeEngine);

    // Load client game mode if clientId param is present
    const clientId = searchParams.get("clientId");
    if (clientId) {
      setClientIdForMode(clientId);
      fetch("/api/clients")
        .then(r => r.json())
        .then((clients: unknown[]) => {
          const found = Array.isArray(clients) ? clients.find((c: any) => c.id === clientId) : null;
          if (found && (found as any).gameMode) setClientGameMode((found as any).gameMode);
        })
        .catch(() => {});
    }
  }, []);

  const getApiKey = () =>
    settings.geminiApiKey || settings.openaiApiKey || settings.anthropicApiKey ||
    settings.aiKeys?.gemini || settings.aiKeys?.openai || settings.aiKeys?.claude || "";

  const getProvider = () => {
    if (creativeEngine?.toLowerCase().includes("gpt")) return "OpenAI";
    if (creativeEngine?.toLowerCase().includes("claude")) return "Anthropic";
    return "Gemini";
  };

  async function handleGenerateScript() {
    setGenerationError("");
    setIsGenerating(true);
    const openaiApiKey = settings.openaiApiKey || settings.aiKeys?.openai;
    const geminiApiKey = settings.geminiApiKey || settings.aiKeys?.gemini;
    const anthropicApiKey = settings.anthropicApiKey || settings.aiKeys?.claude;

    if (contentFormat === "carousel") {
      try {
        const provider = getProvider();
        const carouselApiKey =
          provider === "OpenAI"
            ? openaiApiKey || ""
            : provider === "Anthropic"
              ? anthropicApiKey || ""
              : geminiApiKey || "";
        const carouselModel =
          provider === "OpenAI"
            ? "gpt-4o-mini"
            : provider === "Anthropic"
              ? "claude-3-5-haiku-20241022"
              : "gemini-2.0-flash";
        const res = await fetch("/api/carousel/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: step1.topic,
            hook: selectedHook?.verbal ?? "",
            structureId: selectedStructureId,
            carouselFormat,
            clientProfile: step1.keyContext,
            apiKey: carouselApiKey || geminiApiKey || openaiApiKey || anthropicApiKey,
            provider,
            model: carouselModel,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(typeof errBody.error === "string" ? errBody.error : "Failed to generate carousel");
        }
        const data = await res.json();
        setCarouselData(data);

        // Save carousel to DB
        const saveRes = await fetch("/api/carousels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title ?? step1.topic.slice(0, 60),
            format: carouselFormat,
            slides: data.slides,
          }),
        });
        if (saveRes.ok) {
          const saved = await saveRes.json();
          // Create ContentItem for calendar
          await fetch("/api/content-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: data.title ?? step1.topic.slice(0, 60), type: "carousel", status: "in_progress", carouselId: saved.id }),
          });
        }
      } catch (err) {
        setGenerationError(err instanceof Error ? err.message : "Failed to generate carousel");
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // Reel / Long-form script
    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(openaiApiKey ? { "x-openai-key": openaiApiKey } : {}),
          ...(geminiApiKey ? { "x-gemini-key": geminiApiKey } : {}),
          ...(anthropicApiKey ? { "x-anthropic-key": anthropicApiKey } : {}),
        },
        body: JSON.stringify({
          engine: creativeEngine,
          topic: step1.topic,
          executiveSummary: step1.executiveSummary,
          keyContext: step1.keyContext,
          hookTitle: selectedHook?.verbal ?? "Strong hook",
          hookTeaser: selectedHook ? `${selectedHook.format} - ${selectedHook.angle} - ${selectedHook.trigger}` : "",
          styleTitle: selectedStructureName || selectedLens || "Problem & Solution",
          styleTeaser: selectedStructureSlots.length > 0 ? selectedStructureSlots.join(" → ") : "Structured viral flow",
          packagingLens: selectedLens,
          structureId: selectedStructureId,
          contentFormat,
          gameMode: clientGameMode,
          openaiApiKey,
          geminiApiKey,
          anthropicApiKey,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to generate script");
      }

      const payload = (await response.json()) as { script?: string };
      const script = (payload.script ?? "").trim();
      if (!script) throw new Error("Script generation returned empty text");
      setScriptText(script);
      void handleWizardViralScore(script);

      // Create ContentItem for calendar
      await fetch("/api/content-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: step1.topic.slice(0, 80), type: contentFormat === "long" ? "long" : "reel", status: "in_progress" }),
      });
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Failed to generate script");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleContinue() {
    if (currentStep < 6) setCurrentStep((currentStep + 1) as WizardStep);
  }

  function stepChipClass(step: WizardStep): string {
    if (step < currentStep) return "border-blue-900/60 bg-blue-900/20 text-blue-300";
    if (step === currentStep) return "border-blue-700 bg-blue-700/20 text-white";
    return "border-[#2c2c2e] bg-[#1c1c1e] text-gray-400";
  }

  const canContinue = (): boolean => {
    if (currentStep === 1) return step1.topic.trim().length > 0;
    if (currentStep === 2) return true; // packaging is optional
    if (currentStep === 3) return true; // hook is optional
    if (currentStep === 4) return true; // structure is optional
    if (currentStep === 5) return true;
    return false;
  };

  return (
    <section className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10">
      <div className="mx-auto w-full p-[32px]">
        <header className="mb-[32px]">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <div className="w-[16px] h-[1px] bg-[#3BFFC8]" />
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#3BFFC8]">
              {sourceId ? `Source: ${sourceId}` : "Script Creation"}
            </span>
          </div>
          <h1 className="font-['Syne'] font-[800] text-[clamp(28px,4vw,40px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7] mb-[10px]">
            Create <span className="text-[#3BFFC8]">Script</span>
          </h1>
          <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65] mb-[10px]">
            Framework-aware creation: Topic → Packaging → Hook Lab → Story Structure → Format → Script.
          </p>
          <p className="font-['DM_Sans'] text-[12px] text-[#5A6478] max-w-[560px] leading-[1.6] mb-[28px]">
            For a client-specific voice pack (long framework + profile fields), add a{" "}
            <Link href="/clients" className="text-[#3BFFC8] hover:underline underline-offset-2">
              Script Master Guide
            </Link>{" "}
            on their client hub, then open Script Studio with that client selected.
          </p>
        </header>

        {/* Sticky nav + engine */}
        <div className="sticky top-0 z-30 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017]/95 px-4 py-3 backdrop-blur mb-[16px]">
          <div className="flex flex-wrap items-center gap-2">
            {NAV_ITEMS.map((item, index) => (
              <div key={item.step} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { if (item.step <= currentStep) setCurrentStep(item.step); }}
                  disabled={item.step > currentStep}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${stepChipClass(item.step)} ${item.step > currentStep ? "cursor-not-allowed" : "hover:border-blue-700/70"}`}
                >
                  {item.step < currentStep ? <Check className="h-3.5 w-3.5" /> : <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[9px]">{item.step}</span>}
                  {item.label}
                </button>
                {index < NAV_ITEMS.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-gray-600 shrink-0" /> : null}
              </div>
            ))}

            <div className="ml-auto flex items-center gap-2 rounded-xl border border-[#2c2c2e] bg-[#1c1c1e] px-3 py-2 shrink-0">
              <Bot className="h-4 w-4 text-cyan-400" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Engine</p>
                <select
                  value={creativeEngine}
                  onChange={(e) => setCreativeEngine(e.target.value as CreativeEngine)}
                  className="bg-transparent text-xs text-gray-200 outline-none"
                >
                  {CREATIVE_ENGINE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] p-5 sm:p-6 mb-[16px]">
          {currentStep === 1 && (
            <Step1TopicResearch data={step1} onChange={setStep1} settings={settings} />
          )}

          {currentStep === 2 && (
            <Step2Packaging
              topic={step1.topic}
              executiveSummary={step1.executiveSummary}
              keyContext={step1.keyContext}
              selectedLens={selectedLens}
              onSelect={setSelectedLens}
              settings={settings}
              gameMode={clientGameMode}
            />
          )}

          {currentStep === 3 && (
            <Step3HookLab
              topic={step1.topic}
              executiveSummary={step1.executiveSummary}
              keyContext={step1.keyContext}
              clientProfile={step1.keyContext}
              targetLanguage="English"
              selectedHook={selectedHook}
              onSelect={setSelectedHook}
              settings={settings}
              gameMode={clientGameMode}
            />
          )}

          {currentStep === 4 && (
            <Step4Structure
              topic={step1.topic}
              packagingLens={selectedLens}
              hookVerbal={selectedHook?.verbal ?? ""}
              clientProfile={step1.keyContext}
              selectedStructureId={selectedStructureId}
              onSelect={(id, name, slots) => { setSelectedStructureId(id); setSelectedStructureName(name); setSelectedStructureSlots(slots); }}
              settings={settings}
            />
          )}

          {currentStep === 5 && (
            <Step5Format
              selectedFormat={contentFormat}
              selectedCarouselFormat={carouselFormat}
              onFormatChange={setContentFormat}
              onCarouselFormatChange={setCarouselFormat}
            />
          )}

          {currentStep === 6 && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-4">
                <div className="flex flex-wrap gap-2">
                  {clientIdForMode && (
                    <span className={`text-xs px-2 py-1 rounded-lg border ${clientGameMode === "conversion" ? "bg-purple-900/30 text-purple-300 border-purple-800/40" : "bg-teal-900/30 text-teal-300 border-teal-800/40"}`}>
                      {clientGameMode === "conversion" ? "⚡ Conversion" : "👁 Awareness"}
                    </span>
                  )}
                  {selectedLens && <span className="text-xs bg-blue-900/30 text-blue-300 border border-blue-800/40 px-2 py-1 rounded-lg">{selectedLens}</span>}
                  {selectedHook && <span className="text-xs bg-fuchsia-900/30 text-fuchsia-300 border border-fuchsia-800/40 px-2 py-1 rounded-lg">{selectedHook.format}</span>}
                  {selectedStructureName && <span className="text-xs bg-emerald-900/30 text-emerald-300 border border-emerald-800/40 px-2 py-1 rounded-lg">{selectedStructureName}</span>}
                  <span className="text-xs bg-amber-900/30 text-amber-300 border border-amber-800/40 px-2 py-1 rounded-lg capitalize">{contentFormat}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleGenerateScript()}
                  disabled={isGenerating}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate {contentFormat === "carousel" ? "Carousel" : "Script"}
                </button>
              </div>

              {generationError && (
                <p className="rounded-xl border border-rose-900/60 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">{generationError}</p>
              )}

              {/* Carousel output */}
              {contentFormat === "carousel" && carouselData && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{carouselData.title}</p>
                    <button
                      onClick={() => router.push("/carousels")}
                      className="text-xs text-blue-400 hover:text-blue-300 transition"
                    >
                      Edit in Carousel Studio →
                    </button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {carouselData.slides.map((slide, i) => (
                      <div key={i} className={`shrink-0 w-44 rounded-xl border p-3 ${slide.role === "hook" ? "border-blue-600/50 bg-blue-900/10" : slide.role === "cta" ? "border-purple-600/50 bg-purple-900/10" : "border-[#2c2c2e] bg-[#1c1c1e]"}`}>
                        <span className="text-[9px] text-gray-500 uppercase tracking-wide">{slide.role} #{i + 1}</span>
                        <p className="text-xs text-white font-semibold mt-1 line-clamp-3">{slide.text}</p>
                        {slide.visualDirection && <p className="text-[10px] text-gray-500 mt-1 line-clamp-2 italic">{slide.visualDirection}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Viral Score badge — shown after script is generated */}
              {scriptText && (
                <div className="flex items-center justify-between rounded-xl border border-[#2c2c2e] bg-[#111620] px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold font-['Syne'] text-white/50 uppercase tracking-widest">Viral Score</span>
                    {isScoringWizardViral && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#8892A4]">
                        <Loader2 className="h-3 w-3 animate-spin" /> Scoring…
                      </div>
                    )}
                    {wizardViralScore && !isScoringWizardViral && (() => {
                      const tierColors: Record<string, string> = { Low: "text-red-400 bg-red-500/10 border-red-500/20", Medium: "text-amber-400 bg-amber-500/10 border-amber-500/20", High: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", Outlier: "text-[#3BFFC8] bg-[#3BFFC8]/10 border-[#3BFFC8]/20" };
                      return (
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${tierColors[wizardViralScore.predictedViralTier]}`}>
                          <span className="text-[11px] font-bold font-['JetBrains_Mono']">{Math.round(wizardViralScore.totalScore)}</span>
                          <span className="text-[10px] font-bold">{wizardViralScore.predictedViralTier}</span>
                        </div>
                      );
                    })()}
                    {!wizardViralScore && !isScoringWizardViral && (
                      <button
                        onClick={() => void handleWizardViralScore(scriptText)}
                        className="text-[10px] text-[#8892A4] hover:text-white underline transition-colors"
                      >
                        Score script
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/scripts/editor")}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    Open in Editor → Full Quality Check
                  </button>
                </div>
              )}

              {/* Reel/Long script output */}
              {contentFormat !== "carousel" && (
                <CanvasEditor
                  initialText={scriptText}
                  onChange={setScriptText}
                  onAskAI={(selection, instruction) => `${selection} (${instruction})`}
                />
              )}
            </div>
          )}
        </div>

        {currentStep < 6 && (
          <div className="sticky bottom-4 z-20 flex justify-end">
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue()}
              className="inline-flex h-12 items-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60 gap-2"
            >
              Save & Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function CreateWizardFallback() {
  return (
    <section className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10">
      <div className="mx-auto w-full p-[32px]">
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] p-6">
          <p className="font-['DM_Sans'] text-sm text-[#8892A4]">Loading creation wizard...</p>
        </div>
      </div>
    </section>
  );
}

export default function ScriptCreatePage() {
  return (
    <Suspense fallback={<CreateWizardFallback />}>
      <CreateWizardContent />
    </Suspense>
  );
}
