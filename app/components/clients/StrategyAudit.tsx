"use client";

import { useState } from "react";
import { Loader2, ChevronRight, ChevronLeft, ExternalLink } from "lucide-react";
import { useToast } from "@/app/components/UI/Toast";

type Step = "iva" | "platform" | "anchors" | "patterns" | "gap-report";

const STEPS: { id: Step; title: string; description: string; icon: string }[] = [
  { id: "iva", title: "IVA Definition", description: "Define your Ideal Viewer Avatar — who scrolls, stops, and follows.", icon: "👤" },
  { id: "platform", title: "Platform Confirmation", description: "Confirm primary platform and content type fit.", icon: "📱" },
  { id: "anchors", title: "Anchor Accounts", description: "Paste 3–10 competitor handles to analyze.", icon: "⚓" },
  { id: "patterns", title: "Pattern Analysis", description: "AI synthesizes winning patterns from anchor accounts.", icon: "🔍" },
  { id: "gap-report", title: "Gap Report", description: "7-variable gap analysis + prioritized fix list.", icon: "📊" },
];

interface SessionState {
  iva?: string;
  platform?: string;
  anchors?: string[];
  patterns?: string;
  gapReport?: string;
}

interface StrategyAuditProps {
  clientId: string;
  clientName: string;
  clientNiche: string;
  platform: string;
  gameMode: string;
  currentContentTitles: string[];
  initialAudit?: {
    iva?: string;
    platform?: string;
    anchors?: string[];
    patterns?: string;
    gapReport?: string;
    updatedAt?: string;
  };
  onSaved: (audit: Record<string, unknown>) => void;
}

export default function StrategyAudit({
  clientId, clientName, clientNiche, platform, gameMode,
  currentContentTitles, initialAudit, onSaved,
}: StrategyAuditProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [sessionState, setSessionState] = useState<SessionState>(initialAudit ?? {});
  const [input, setInput] = useState("");
  const [anchorsInput, setAnchorsInput] = useState((initialAudit?.anchors ?? []).join(", "));
  const [isLoading, setIsLoading] = useState(false);
  const [showReport, setShowReport] = useState(!!initialAudit?.gapReport);

  const step = STEPS[currentStep];
  const isComplete = !!sessionState.gapReport;

  async function handleNext() {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const stepId = step.id;
      const resolvedInput = stepId === "anchors"
        ? anchorsInput.split(",").map(s => s.trim()).filter(Boolean)
        : input;

      const res = await fetch("/api/client/strategy-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: stepId,
          sessionState,
          input: resolvedInput,
          clientId,
          clientNiche,
          platform,
          gameMode,
          currentContentTitles,
        }),
      });

      if (!res.ok) throw new Error("Step failed");
      const data = await res.json() as { result: string; completed?: boolean; audit?: Record<string, unknown> };
      const result = data.result;

      const newState: SessionState = { ...sessionState };
      if (stepId === "iva") newState.iva = result;
      else if (stepId === "platform") newState.platform = result;
      else if (stepId === "anchors") newState.anchors = Array.isArray(resolvedInput) ? resolvedInput : [String(resolvedInput)];
      else if (stepId === "patterns") newState.patterns = result;
      else if (stepId === "gap-report") {
        newState.gapReport = result;
        if (data.audit) onSaved(data.audit);
        toast("success", "Audit Complete!", "Growth Diagnosis Report is ready.");
        setShowReport(true);
      }

      setSessionState(newState);
      setInput("");

      if (stepId !== "gap-report" && currentStep < STEPS.length - 1) {
        setCurrentStep(p => p + 1);
      }
    } catch {
      toast("error", "Step Failed", "Could not complete this step. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (showReport && sessionState.gapReport) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="glass-surface rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7] flex items-center gap-2">
              📊 Growth Diagnosis Report
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowReport(false)}
                className="text-[11px] text-[#5A6478] hover:text-[#F0F2F7] transition-colors"
              >
                ← Edit
              </button>
              <a
                href={`/clients/${clientId}/audit/report`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-[#3BFFC8] hover:underline"
              >
                Full Report <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="bg-[#080A0F] rounded-xl border border-white/5 p-5">
            <pre className="text-[12px] text-[#8892A4] whitespace-pre-wrap font-['DM_Sans'] leading-[1.7]">
              {sessionState.gapReport}
            </pre>
          </div>
          {sessionState.iva && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sessionState.iva && (
                <div className="rounded-xl border border-[#3BFFC8]/10 bg-[#3BFFC8]/5 p-3">
                  <p className="text-[9px] font-bold text-[#3BFFC8] uppercase tracking-wider mb-1">Ideal Viewer Avatar</p>
                  <p className="text-[11px] text-[#8892A4] leading-relaxed line-clamp-4">{sessionState.iva}</p>
                </div>
              )}
              {sessionState.patterns && (
                <div className="rounded-xl border border-[#A78BFA]/10 bg-[#A78BFA]/5 p-3">
                  <p className="text-[9px] font-bold text-[#A78BFA] uppercase tracking-wider mb-1">Winning Patterns</p>
                  <p className="text-[11px] text-[#8892A4] leading-relaxed line-clamp-4">{sessionState.patterns}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Progress bar */}
      <div className="glass-surface rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Content Strategy Audit</h3>
          {isComplete && (
            <button onClick={() => setShowReport(true)} className="ml-auto text-[11px] font-semibold text-[#3BFFC8] hover:underline">
              View Report →
            </button>
          )}
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-5">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <button
                onClick={() => setCurrentStep(i)}
                disabled={i > currentStep && !sessionState[s.id === "gap-report" ? "gapReport" : s.id as keyof SessionState]}
                className={`w-full flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${i === currentStep ? "bg-[#EC4899]/10 border border-[#EC4899]/20" : i < currentStep ? "bg-white/5 border border-white/5" : "opacity-30 cursor-default"}`}
              >
                <span className="text-base">{s.icon}</span>
                <span className={`text-[9px] font-bold text-center ${i === currentStep ? "text-[#EC4899]" : "text-[#5A6478]"}`}>
                  {s.title}
                </span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-[#5A6478] shrink-0" />}
            </div>
          ))}
        </div>

        {/* Current step */}
        <div className="space-y-4">
          <div>
            <p className="text-[13px] font-semibold text-[#F0F2F7]">{step.icon} {step.title}</p>
            <p className="text-[12px] text-[#5A6478] mt-1">{step.description}</p>
          </div>

          {/* Show previous result for this step if any */}
          {(step.id === "iva" && sessionState.iva) && (
            <div className="rounded-xl bg-white/5 border border-white/5 p-4">
              <p className="text-[10px] font-bold text-[#3BFFC8] uppercase tracking-wider mb-1">Current IVA</p>
              <pre className="text-[11px] text-[#8892A4] whitespace-pre-wrap font-['DM_Sans']">{sessionState.iva}</pre>
            </div>
          )}
          {(step.id === "platform" && sessionState.platform) && (
            <div className="rounded-xl bg-white/5 border border-white/5 p-4">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Platform Analysis</p>
              <pre className="text-[11px] text-[#8892A4] whitespace-pre-wrap font-['DM_Sans']">{sessionState.platform}</pre>
            </div>
          )}
          {(step.id === "patterns" && sessionState.patterns) && (
            <div className="rounded-xl bg-white/5 border border-white/5 p-4">
              <p className="text-[10px] font-bold text-[#A78BFA] uppercase tracking-wider mb-1">Winning Patterns</p>
              <pre className="text-[11px] text-[#8892A4] whitespace-pre-wrap font-['DM_Sans']">{sessionState.patterns}</pre>
            </div>
          )}

          {/* Input area */}
          {step.id === "anchors" ? (
            <div>
              <label className="text-[10px] text-[#5A6478] uppercase tracking-wider block mb-1">
                Competitor handles (comma-separated)
              </label>
              <input
                type="text"
                value={anchorsInput}
                onChange={e => setAnchorsInput(e.target.value)}
                placeholder="@creator1, @creator2, @creator3"
                className="w-full bg-[#111620] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-[#EC4899]/50 transition"
              />
            </div>
          ) : step.id !== "patterns" && step.id !== "gap-report" ? (
            <div>
              <label className="text-[10px] text-[#5A6478] uppercase tracking-wider block mb-1">
                {step.id === "iva" ? "Add any notes (optional — AI will build the full IVA)" : "Additional context (optional)"}
              </label>
              <textarea
                rows={3}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={step.id === "iva" ? "e.g. Mostly female, 25-35, interested in fitness and self-growth..." : "Any additional context..."}
                className="w-full bg-[#111620] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-[#EC4899]/50 transition resize-none"
              />
            </div>
          ) : (
            <p className="text-[12px] text-[#5A6478]">
              {step.id === "patterns" ? "AI will synthesize patterns from anchors + IVA context." : "AI will run the 7-variable gap analysis against your current content."}
            </p>
          )}

          <button
            onClick={() => void handleNext()}
            disabled={isLoading || (step.id === "anchors" && !anchorsInput.trim())}
            className="w-full py-3 rounded-xl bg-[#EC4899]/10 border border-[#EC4899]/30 text-[#EC4899] font-['DM_Sans'] font-[600] text-[13px] hover:bg-[#EC4899]/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : step.id === "gap-report" ? "Generate Gap Report" : `Continue to ${STEPS[currentStep + 1]?.title ?? "Report"} →`}
          </button>
        </div>
      </div>
    </div>
  );
}
