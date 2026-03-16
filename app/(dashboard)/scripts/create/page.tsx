"use client";

import { Bot, Check, ChevronRight, Eye, Loader2, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  CREATIVE_ENGINE_OPTIONS,
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_SETTINGS_KEY,
  type CreativeEngine,
  type LocalSettings,
  parseLocalSettings,
} from "@/lib/client-settings";
import CanvasEditor from "@/app/components/CanvasEditor";

type WizardStep = 1 | 2 | 3 | 4;

const navItems: Array<{ label: string; step: WizardStep }> = [
  { label: "Topic", step: 1 },
  { label: "Research", step: 1 },
  { label: "Hook", step: 2 },
  { label: "Style", step: 3 },
  { label: "Script", step: 4 },
];

const hookOptions = [
  {
    id: "question-is-it-me",
    title: "Question | Is it Just Me?",
    teaser: "Open with a relatable, curiosity-heavy question.",
    views: "1.2M views",
    gradient: "from-blue-600/60 via-indigo-600/30 to-slate-900",
  },
  {
    id: "bold-statement",
    title: "Bold Statement",
    teaser: "Start with a confident claim and back it quickly.",
    views: "930K views",
    gradient: "from-cyan-600/50 via-sky-500/30 to-slate-900",
  },
  {
    id: "storytime",
    title: "Storytime",
    teaser: "Lead with a short narrative moment and payoff.",
    views: "710K views",
    gradient: "from-fuchsia-600/50 via-violet-600/30 to-slate-900",
  },
  {
    id: "contrarian",
    title: "Contrarian Take",
    teaser: "Challenge a common belief in the first sentence.",
    views: "1.6M views",
    gradient: "from-emerald-600/50 via-teal-600/30 to-slate-900",
  },
];

const styleOptions = [
  {
    id: "listicle",
    title: "Listicle (5 Steps)",
    teaser: "Fast, skimmable, point-by-point delivery.",
    views: "840K avg",
    gradient: "from-blue-500/50 via-slate-800 to-black",
  },
  {
    id: "long-tutorial",
    title: "Long Tutorial",
    teaser: "Deep context with paced explanation.",
    views: "530K avg",
    gradient: "from-amber-500/50 via-slate-800 to-black",
  },
  {
    id: "rapid-tutorial",
    title: "Rapid Tutorial",
    teaser: "Quick steps with high-energy pacing.",
    views: "1.1M avg",
    gradient: "from-cyan-500/50 via-slate-800 to-black",
  },
  {
    id: "problem-solution",
    title: "Problem & Solution",
    teaser: "Present pain clearly, then clear fix.",
    views: "960K avg",
    gradient: "from-purple-500/50 via-slate-800 to-black",
  },
  {
    id: "breakdown",
    title: "Breakdown",
    teaser: "Deconstruct what worked and why.",
    views: "1.3M avg",
    gradient: "from-emerald-500/50 via-slate-800 to-black",
  },
];

function buildDraftScript(topic: string, hookTitle: string, styleTitle: string): string {
  return [
    `${hookTitle} Here is the thing most creators miss when they talk about ${topic.toLowerCase()}.`,
    "",
    "People do not drop off because your topic is boring, they drop off because the promise is unclear.",
    "",
    "So start with one sharp claim, show one concrete example, and move fast to the payoff.",
    "",
    `Use a ${styleTitle.toLowerCase()} flow: quick setup, clear value, and one direct CTA tied to saves or follows.`,
    "",
    "If someone can repeat your core idea in one sentence after watching, your script is working.",
  ].join("\n");
}

function CreateWizardContent() {
  const searchParams = useSearchParams();
  const sourceId = searchParams.get("source") ?? "";

  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [creativeEngine, setCreativeEngine] = useState<CreativeEngine>(DEFAULT_LOCAL_SETTINGS.defaultCreativeEngine);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generationError, setGenerationError] = useState("");

  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [topic, setTopic] = useState(
    sourceId
      ? `Remix the key idea from video ${sourceId}: explain why this post format became an outlier and how to replicate it.`
      : "Explain how creators can identify outlier reels and turn those patterns into repeatable scripts.",
  );
  const [executiveSummary, setExecutiveSummary] = useState(
    "Outlier posts typically combine a strong first-second hook, one central promise, and clear CTA alignment with audience intent.",
  );
  const [keyContext, setKeyContext] = useState(
    "Audience is curious but busy. They reward fast clarity, practical examples, and zero filler.",
  );
  const [selectedHookId, setSelectedHookId] = useState(hookOptions[0].id);
  const [selectedStyleId, setSelectedStyleId] = useState(styleOptions[0].id);
  const [scriptText, setScriptText] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const parsed = parseLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY));
    setSettings(parsed);
    setCreativeEngine(parsed.defaultCreativeEngine);
  }, []);

  const selectedHook = useMemo(
    () => (Array.isArray(hookOptions) ? hookOptions : []).find((item) => item.id === selectedHookId) ?? hookOptions[0],
    [selectedHookId],
  );

  const selectedStyle = useMemo(
    () => (Array.isArray(styleOptions) ? styleOptions : []).find((item) => item.id === selectedStyleId) ?? styleOptions[0],
    [selectedStyleId],
  );

  async function handleGenerateScript() {
    setGenerationError("");
    setIsGeneratingScript(true);

    const openaiApiKey = settings.openaiApiKey || settings.aiKeys.openai;
    const geminiApiKey = settings.geminiApiKey || settings.aiKeys.gemini;
    const anthropicApiKey = settings.anthropicApiKey || settings.aiKeys.claude;

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
          topic,
          executiveSummary,
          keyContext,
          hookTitle: selectedHook.title,
          hookTeaser: selectedHook.teaser,
          styleTitle: selectedStyle.title,
          styleTeaser: selectedStyle.teaser,
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
      if (!script) {
        throw new Error("Script generation returned empty text");
      }

      setScriptText(script);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Failed to generate script");
    } finally {
      setIsGeneratingScript(false);
    }
  }

  function handleContinue() {
    if (currentStep === 1) {
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      setCurrentStep(3);
      return;
    }

    if (currentStep === 3) {
      setScriptText(buildDraftScript(topic, selectedHook.title, selectedStyle.title));
      setCurrentStep(4);
    }
  }

  function stepChipClass(step: WizardStep): string {
    if (step < currentStep) {
      return "border-blue-900/60 bg-blue-900/20 text-blue-300";
    }

    if (step === currentStep) {
      return "border-blue-700 bg-blue-700/20 text-white";
    }

    return "border-[#2c2c2e] bg-[#1c1c1e] text-gray-400";
  }

  return (
    <section className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10">
      <div className="mx-auto w-full p-[32px]">
        <header className="mb-[32px]">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <div className="w-[16px] h-[1px] bg-[#3BFFC8]"></div>
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#3BFFC8]">
              {sourceId ? `Source: ${sourceId}` : "Script Creation"}
            </span>
          </div>
          <h1 className="font-['Syne'] font-[800] text-[clamp(28px,4vw,40px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7] mb-[10px]">
            Remix <span className="text-[#3BFFC8]">Idea</span>
          </h1>
          <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65] mb-[28px]">
            Build your script in structured steps inspired by the analyzed video.
          </p>
        </header>

        <div className="sticky top-0 z-30 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017]/95 px-4 py-3 backdrop-blur mb-[16px]">
          <div className="flex flex-wrap items-center gap-2">
            {(Array.isArray(navItems) ? navItems : []).map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (item.step <= currentStep) setCurrentStep(item.step);
                  }}
                  disabled={item.step > currentStep}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${stepChipClass(item.step)} ${item.step > currentStep ? "cursor-not-allowed" : "hover:border-blue-700/70"
                    }`}
                >
                  {item.step < currentStep ? <Check className="h-3.5 w-3.5" /> : null}
                  {item.label}
                </button>
                {index < navItems.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-gray-600" /> : null}
              </div>
            ))}

            <div className="ml-auto flex items-center gap-2 rounded-xl border border-[#2c2c2e] bg-[#1c1c1e] px-3 py-2">
              <Bot className="h-4 w-4 text-cyan-400" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Creative Engine</p>
                <select
                  value={creativeEngine}
                  onChange={(event) => setCreativeEngine(event.target.value as CreativeEngine)}
                  className="bg-transparent text-xs text-gray-200 outline-none"
                >
                  {(Array.isArray(CREATIVE_ENGINE_OPTIONS) ? CREATIVE_ENGINE_OPTIONS : []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] p-5 sm:p-6 mb-[16px]">
          {currentStep === 1 ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5">
                <h2 className="text-lg font-semibold text-white">Describe your topic</h2>
                <p className="mt-1 text-sm text-gray-400">Summarize what this remix script should communicate.</p>
                <textarea
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className="mt-4 h-40 w-full rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-4 text-sm text-gray-100 outline-none ring-blue-500 transition focus:ring-2"
                />
              </div>

              <div className="rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-5">
                <h2 className="text-lg font-semibold text-white">Review the research</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Executive Summary</p>
                    <textarea
                      value={executiveSummary}
                      onChange={(event) => setExecutiveSummary(event.target.value)}
                      className="mt-2 h-24 w-full resize-none bg-transparent text-sm text-gray-200 outline-none"
                    />
                  </div>
                  <div className="rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Key Context</p>
                    <textarea
                      value={keyContext}
                      onChange={(event) => setKeyContext(event.target.value)}
                      className="mt-2 h-24 w-full resize-none bg-transparent text-sm text-gray-200 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Pick your favorite hook</h2>
                <p className="text-sm text-gray-400">Choose the opening framework with the strongest retention profile.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(Array.isArray(hookOptions) ? hookOptions : []).map((hook) => {
                  const selected = selectedHookId === hook.id;
                  return (
                    <button
                      key={hook.id}
                      type="button"
                      onClick={() => setSelectedHookId(hook.id)}
                      className={`rounded-2xl border bg-[#1c1c1e] p-3 text-left transition ${selected ? "border-blue-500 ring-2 ring-blue-500/60" : "border-[#2c2c2e] hover:border-blue-900/60"
                        }`}
                    >
                      <div className={`relative aspect-[9/14] w-full overflow-hidden rounded-xl bg-gradient-to-b ${hook.gradient}`}>
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-blue-600/90 px-2 py-1 text-[10px] font-semibold text-white">
                          <Eye className="h-3 w-3" />
                          {hook.views}
                        </span>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                          <p className="text-xs font-semibold text-white">{hook.title}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-gray-400">{hook.teaser}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Choose a style</h2>
                <p className="text-sm text-gray-400">Select the format pacing and delivery style for final script generation.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(Array.isArray(styleOptions) ? styleOptions : []).map((style) => {
                  const selected = selectedStyleId === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedStyleId(style.id)}
                      className={`rounded-2xl border bg-[#1c1c1e] p-3 text-left transition ${selected ? "border-blue-500 ring-2 ring-blue-500/60" : "border-[#2c2c2e] hover:border-blue-900/60"
                        }`}
                    >
                      <div className={`relative aspect-[9/14] w-full overflow-hidden rounded-xl bg-gradient-to-b ${style.gradient}`}>
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-blue-600/90 px-2 py-1 text-[10px] font-semibold text-white">
                          <Sparkles className="h-3 w-3" />
                          {style.views}
                        </span>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                          <p className="text-xs font-semibold text-white">{style.title}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-gray-400">{style.teaser}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2c2c2e] bg-[#1c1c1e] p-4">
                <div className="space-y-1">
                  <p className="text-sm text-gray-400">Hook: {selectedHook.title}</p>
                  <p className="text-sm text-gray-400">Style: {selectedStyle.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleGenerateScript()}
                  disabled={isGeneratingScript}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isGeneratingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  Generate
                </button>
              </div>

              {generationError ? (
                <p className="rounded-xl border border-rose-900/60 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">{generationError}</p>
              ) : null}

              <CanvasEditor
                initialText={scriptText || buildDraftScript(topic, selectedHook.title, selectedStyle.title)}
                onChange={setScriptText}
                onAskAI={(selection, instruction) => `${selection} (${instruction})`}
              />
            </div>
          ) : null}
        </div>

        {currentStep < 4 ? (
          <div className="sticky bottom-4 z-20 flex justify-end">
            <button
              type="button"
              onClick={handleContinue}
              className="inline-flex h-12 items-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Save & Continue
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CreateWizardFallback() {
  return (
    <section className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10">
      <div className="mx-auto w-full p-[32px]">
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] p-6">
          <p className="font-['DM_Sans'] text-sm text-[#8892A4]">Loading remix wizard...</p>
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
