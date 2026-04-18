"use client";

import { useEffect, useState } from "react";
import { 
  ArrowLeft, 
  Edit2, 
  FileText, 
  History, 
  Plus, 
  Sparkles, 
  Target, 
  Mic2, 
  Zap, 
  Eye, 
  Copy,
  AlertTriangle,
  Fingerprint,
  RefreshCw,
  Search,
  BarChart2,
  TrendingUp,
  Trash2,
  Image as ImageIcon,
  User,
  Activity,
  Gamepad2,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/app/components/UI/Toast";

import { ClientTrackedVideo } from "@/lib/types";
import { LOCAL_SETTINGS_KEY, parseLocalSettings } from "@/lib/client-settings";
import SignalStack from "@/app/components/clients/SignalStack";
import ProfileAuditTab from "@/app/components/clients/ProfileAuditTab";
import StrategyAudit from "@/app/components/clients/StrategyAudit";

type StyleDNA = {
  tone?: string;
  sentenceLength?: string;
  vocabularyLevel?: string;
  emotionUsed?: string;
  pacing?: string;
  hookPattern?: string;
  ctaPattern?: string;
  repeatedPhrases?: string[];
  doubleDownStrategy?: string;
};

type Client = {
  id: string;
  name: string;
  niche: string;
  platform: string;
  language: string;
  duration: string;
  targetAudience: string;
  // Support both old field names and new API field names
  tone?: string;
  tonePersona?: string;
  vocabulary?: string;
  vocabularyLevel?: string;
  topics?: string;
  preferredTopics?: string;
  avoidTopics: string;
  ctaStyle: string;
  customInstructions?: string;
  /** Full per-client script / remix framework (markdown). Injected when this client is selected in Script Studio. */
  scriptMasterGuide?: string | null;
  preferredHooks: string[];
  winningScripts?: any[];
  examples?: any[];
  trackedVideos: ClientTrackedVideo[];
  styleDNA: StyleDNA;
  gameMode?: string;
  profileData?: Record<string, unknown>;
  pcrAudit?: Record<string, unknown>;
  strategyAudit?: Record<string, unknown>;
  createdAt: string;
};

export default function ClientProfileHub() {
  function collectStudioKeys() {
    if (typeof window === "undefined") {
      return { apify: "", gemini: "", openai: "", anthropic: "", activeProvider: "Gemini" };
    }
    const ls = parseLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY));
    return {
      apify: localStorage.getItem("apifyApiKey")?.trim() || ls.apifyApiKey || "",
      gemini: localStorage.getItem("geminiApiKey")?.trim() || ls.geminiApiKey || "",
      openai: localStorage.getItem("openAiApiKey")?.trim() || ls.openaiApiKey || "",
      anthropic: localStorage.getItem("anthropicApiKey")?.trim() || ls.anthropicApiKey || "",
      activeProvider: localStorage.getItem("activeProvider")?.trim() || "Gemini",
    };
  }
  const { toast } = useToast();
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<"winning" | "generated" | "scriptGuide" | "tracker" | "metrics" | "profile" | "strategy">("winning");
  const [scriptGuideDraft, setScriptGuideDraft] = useState("");
  const [isSavingScriptGuide, setIsSavingScriptGuide] = useState(false);
  const [isSavingGameMode, setIsSavingGameMode] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [isTrackLoading, setIsTrackLoading] = useState(false);
  const [isRefreshLoading, setIsRefreshLoading] = useState(false);
  // Reel Metrics state
  const [metricsInput, setMetricsInput] = useState({ views: "", likes: "", comments: "", shares: "", saves: "", watchTime: "", reachPct: "", checkpoint: "72h" });
  const [isAnalyzingMetrics, setIsAnalyzingMetrics] = useState(false);
  const [metricsAnalysis, setMetricsAnalysis] = useState<Record<string, unknown> | null>(null);

  const fetchClient = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) {
        toast("error", "API Error", "Failed to fetch clients.");
        router.push("/clients");
        return;
      }
      const clients = await res.json();
      const found = (Array.isArray(clients) ? clients : []).find((c: any) => c.id === id);
      if (found) {
        setClient(found);
      } else {
        toast("error", "Client not found", "Returning to dashboard.");
        router.push("/clients");
      }
    } catch (error) {
      toast("error", "Failed to load client", "Could not retrieve the client profile.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchClient();
  }, [id]);

  useEffect(() => {
    if (!client) return;
    setScriptGuideDraft(typeof client.scriptMasterGuide === "string" ? client.scriptMasterGuide : "");
  }, [client?.id, client?.scriptMasterGuide]);

  const handleSaveScriptGuide = async () => {
    if (!client) return;
    setIsSavingScriptGuide(true);
    try {
      const res = await fetch("/api/clients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: client.id,
          scriptMasterGuide: scriptGuideDraft.trim() ? scriptGuideDraft : null,
        }),
      });
      if (res.ok) {
        toast("success", "Saved", "Master script guide updated. Script Studio will use it when this client is selected.");
        await fetchClient();
      } else {
        const err = await res.json().catch(() => ({}));
        toast("error", "Save failed", (err as { error?: string }).error || "Could not save guide.");
      }
    } catch {
      toast("error", "Save failed", "Network error while saving.");
    } finally {
      setIsSavingScriptGuide(false);
    }
  };

  const handleAnalyzeStyle = async () => {
    const scripts = client?.examples || client?.winningScripts || [];
    
    if (!client || (Array.isArray(scripts) ? scripts : []).length === 0) {
      toast("warning", "Missing Scripts", "Please add winning scripts first to analyze style");
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/clients/analyze-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scripts: client.examples || client.winningScripts || [] }),
      });

      if (res.ok) {
        const styleDNA = await res.json();
        
        // Update client in database
        const updateRes = await fetch("/api/clients", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: client.id, styleDNA }),
        });

        if (updateRes.ok) {
          toast("success", "Analysis Complete", "AI Style DNA extracted and saved!");
          fetchClient();
        } else {
          toast("error", "Save Failed", "Extracted DNA but failed to save to database.");
        }
      } else {
        const error = await res.json();
        toast("error", "Analysis Error", error.error || "Failed to analyze style.");
      }
    } catch (error) {
      toast("error", "Process Error", "An error occurred during style analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTrackVideo = async () => {
    if (!videoUrlInput.trim()) {
      toast("warning", "Missing URL", "Please enter a valid video URL.");
      return;
    }

    // API keys are fetched from the database by the backend
    // Let the backend handle missing key validation — skip frontend pre-check blockade
    
    setIsTrackLoading(true);
    try {
      const k = collectStudioKeys();
      const res = await fetch(`/api/clients/${id}/track-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: videoUrlInput,
          apifyApiKey: k.apify || undefined,
          geminiApiKey: k.gemini || undefined,
        }),
      });
      
      if (res.ok) {
        toast("success", "Video Tracked", "Video analyzed and added to tracking.");
        setVideoUrlInput("");
        fetchClient();
      } else {
        const error = await res.json();
        toast("error", "Tracking Failed", error.error || "Failed to track video.");
      }
    } catch (error) {
      toast("error", "Process Error", "An error occurred during tracking.");
    } finally {
      setIsTrackLoading(false);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    try {
      const res = await fetch(`/api/clients/${id}/track-video?videoId=${videoId}`, { method: "DELETE" });
      if (res.ok) {
        toast("success", "Video Removed", "Tracked video deleted.");
        fetchClient();
      } else {
        const error = await res.json();
        toast("error", "Delete Failed", error.error || "Failed to delete video.");
      }
    } catch {
      toast("error", "Process Error", "An error occurred while deleting.");
    }
  };

  const handleRefreshAnalytics = async () => {
    if (!client || !Array.isArray(client.trackedVideos) || client.trackedVideos.length === 0) {
      toast("warning", "No Videos", "No tracked videos to refresh.");
      return;
    }

    // API key is managed on the backend
    
    setIsRefreshLoading(true);
    try {
      const k = collectStudioKeys();
      const res = await fetch(`/api/clients/${id}/refresh-metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apifyApiKey: k.apify || undefined }),
      });
      
      if (res.ok) {
        toast("success", "Metrics Refreshed", "All video analytics updated successfully.");
        fetchClient();
      } else {
        const error = await res.json();
        toast("error", "Refresh Failed", error.error || "Failed to refresh metrics.");
      }
    } catch (error) {
      toast("error", "Process Error", "An error occurred during refresh.");
    } finally {
      setIsRefreshLoading(false);
    }
  };

  const handleSaveGameMode = async (mode: "awareness" | "conversion") => {
    if (!client || isSavingGameMode) return;
    setIsSavingGameMode(true);
    try {
      const res = await fetch(`/api/clients/${id}/game-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameMode: mode }),
      });
      if (res.ok) {
        setClient(prev => prev ? { ...prev, gameMode: mode } : prev);
        toast("success", "Game Mode Saved", `Switched to ${mode === "awareness" ? "Awareness" : "Conversion"} game.`);
      } else {
        toast("error", "Save Failed", "Could not update game mode.");
      }
    } catch {
      toast("error", "Save Failed", "Could not update game mode.");
    } finally {
      setIsSavingGameMode(false);
    }
  };

  if (isLoading) return <div className="p-12 text-center text-[#8892A4]">Loading client...</div>;
  if (!client) return null;

  // Normalize field names to handle both old records (tone/vocabulary/topics/winningScripts)
  // and new records (tonePersona/vocabularyLevel/preferredTopics/examples)
  const clientTone = client.tonePersona || client.tone || "";
  const clientVocabulary = client.vocabularyLevel || client.vocabulary || "";
  const clientTopics = client.preferredTopics || client.topics || "";
  const clientScripts = client.examples || client.winningScripts || [];
  const clientDirectives = client.customInstructions || "";

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link 
            href="/clients"
            className="flex items-center gap-2 text-[#5A6478] hover:text-[#3BFFC8] transition-all mb-2 w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="font-['Syne'] font-[800] text-[32px] text-[#F0F2F7]">{client.name}</h1>
            <span className="px-3 py-1 rounded-full bg-[rgba(59,255,200,0.1)] border border-[rgba(59,255,200,0.2)] text-[#3BFFC8] text-[12px] font-bold uppercase tracking-wider">
              {client.niche}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link 
            href={`/clients/new?edit=${client.id}`}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-[#F0F2F7] border border-white/10 px-5 py-2.5 rounded-xl font-bold transition-all"
          >
            <Edit2 className="w-4.5 h-4.5" />
            Edit Profile
          </Link>
          <Link 
            href={`/scripts/create?clientId=${client.id}`}
            className="flex items-center gap-2 bg-[#3BFFC8] text-[#080A0F] px-6 py-2.5 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(59,255,200,0.2)] hover:shadow-[0_0_30px_rgba(59,255,200,0.3)]"
          >
            <Plus className="w-5 h-5" />
            Write New Script
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: STATIC DATA & DNA */}
        <div className="lg:col-span-5 space-y-6">
          {/* CLIENT SUMMARY */}
          <div className="glass-surface rounded-2xl p-6 space-y-4">
             <h3 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7] flex items-center gap-2 border-b border-white/5 pb-4">
                <Target className="w-5 h-5 text-[#FF3B57]" />
                Target Audience
             </h3>
             <p className="text-[#8892A4] text-[14px] leading-relaxed italic border-l-2 border-[#FF3B57]/30 pl-4">
               "{client.targetAudience}"
             </p>
             <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-[#5A6478] uppercase font-bold tracking-wider mb-1">Tone</div>
                  <div className="text-[13px] text-[#F0F2F7] font-medium">{clientTone}</div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-[#5A6478] uppercase font-bold tracking-wider mb-1">Vocabulary</div>
                  <div className="text-[13px] text-[#F0F2F7] font-medium">{clientVocabulary}</div>
                </div>
             </div>

             {/* MASTER AI DIRECTIVES */}
             {clientDirectives && (
               <div className="mt-4 bg-black/30 border border-purple-500/20 rounded-xl p-5 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-[120px] h-[120px] bg-purple-500/5 blur-[50px] rounded-full pointer-events-none"></div>
                 <h4 className="text-white font-semibold mb-2 flex items-center gap-2 text-[13px]">
                   <span className="text-purple-400">⚡️</span>
                   Master AI Directives
                   <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-purple-400/60 bg-purple-400/10 px-2 py-1 rounded-full">God Mode</span>
                 </h4>
                 <p className="text-white/70 text-[12px] leading-relaxed whitespace-pre-wrap font-mono bg-black/20 p-3 rounded-lg border border-white/5">
                   {clientDirectives}
                 </p>
               </div>
             )}
          </div>

          {/* TOPICS & AVOID */}
          <div className="glass-surface rounded-2xl p-6 space-y-6">
             <div className="grid grid-cols-1 gap-6">
                <div className="space-y-3">
                  <h4 className="text-[12px] font-bold text-[#3BFFC8] uppercase tracking-wider flex items-center gap-2">
                    <Mic2 className="w-4 h-4" />
                    Preferred Topics
                  </h4>
                  <p className="text-[13px] text-[#8892A4] leading-relaxed">{clientTopics || "None listed."}</p>
                </div>
                <div className="space-y-3 p-4 bg-[rgba(255,59,87,0.02)] border border-[rgba(255,59,87,0.1)] rounded-xl">
                  <h4 className="text-[12px] font-bold text-[#FF3B57] uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Avoid List
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(typeof client.avoidTopics === 'string' ? client.avoidTopics.split(',') : []).map((t, i) => (
                      <span key={i} className="px-2 py-1 bg-[#FF3B57]/10 text-[#FF3B57] text-[11px] font-semibold rounded border border-[#FF3B57]/20">
                        {t.trim()}
                      </span>
                    ))}
                  </div>
                </div>
             </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TABS & SCRIPTS */}
        <div className="lg:col-span-7 space-y-6">

          {/* GAME MODE SELECTOR */}
          <div className="glass-surface rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-[#A78BFA]" />
                <span className="font-['Syne'] font-[700] text-[13px] text-[#F0F2F7]">Game Mode</span>
                <span className="text-[10px] text-[#5A6478] font-['JetBrains_Mono']">— two strategy games (not five): reach vs buyers</span>
              </div>
              <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0D1017] border border-white/5">
                <button
                  onClick={() => void handleSaveGameMode("awareness")}
                  disabled={isSavingGameMode}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-['Syne'] font-[700] transition-all ${(client.gameMode ?? "awareness") === "awareness" ? "bg-[#3BFFC8] text-[#080A0F] shadow-[0_0_12px_rgba(59,255,200,0.25)]" : "text-[#5A6478] hover:text-[#F0F2F7]"}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Awareness
                </button>
                <button
                  onClick={() => void handleSaveGameMode("conversion")}
                  disabled={isSavingGameMode}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-['Syne'] font-[700] transition-all ${client.gameMode === "conversion" ? "bg-[#A78BFA] text-[#080A0F] shadow-[0_0_12px_rgba(167,139,250,0.25)]" : "text-[#5A6478] hover:text-[#F0F2F7]"}`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Conversion
                </button>
              </div>
            </div>
            <p className="text-[11px] text-[#5A6478] mt-2 font-['DM_Sans']">
              {(client.gameMode ?? "awareness") === "awareness"
                ? "Game A — Awareness: maximize total views. Topics must be ultra-broad, hooks prioritize humor/awe/curiosity, TAM scoring rewards reach."
                : "Game B — Conversion: maximize on-target views only. Topics must be laser-narrow, hooks prioritize tactical-solve/identity, CTA drives off-platform conversion."}
            </p>
            <p className="text-[10px] text-[#5A6478]/80 mt-1 font-['JetBrains_Mono']">
              Matches “The 2 Games of Social Media” in your vault (Game A vs Game B); Part 1 of that doc lists six players, not six games.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 border-b border-white/5 pb-2">
             <button 
              onClick={() => setActiveTab("winning")}
              className={`pb-4 text-[14px] font-['Syne'] font-[700] transition-all relative ${activeTab === "winning" ? "text-[#F0F2F7]" : "text-[#5A6478] hover:text-[#8892A4]"}`}
             >
               Winning Scripts
               {activeTab === "winning" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3BFFC8]"></div>}
             </button>
             <button 
              onClick={() => setActiveTab("generated")}
              className={`pb-4 text-[14px] font-['Syne'] font-[700] transition-all relative ${activeTab === "generated" ? "text-[#F0F2F7]" : "text-[#5A6478] hover:text-[#8892A4]"}`}
             >
               Generated in Studio
               {activeTab === "generated" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3BFFC8]"></div>}
             </button>
             <button 
              onClick={() => setActiveTab("scriptGuide")}
              className={`pb-4 text-[14px] font-['Syne'] font-[700] transition-all relative flex items-center gap-2 ${activeTab === "scriptGuide" ? "text-[#F0F2F7]" : "text-[#5A6478] hover:text-[#8892A4]"}`}
             >
               <BookOpen className="w-4 h-4" />
               Script Master Guide
               {activeTab === "scriptGuide" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3BFFC8]"></div>}
             </button>
             <button 
              onClick={() => setActiveTab("tracker")}
              className={`pb-4 text-[14px] font-['Syne'] font-[700] transition-all relative flex items-center gap-2 ${activeTab === "tracker" ? "text-[#F0F2F7]" : "text-[#5A6478] hover:text-[#8892A4]"}`}
             >
               <BarChart2 className="w-4 h-4" />
               Performance Tracker
               {activeTab === "tracker" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3BFFC8]"></div>}
             </button>
             <button 
              onClick={() => setActiveTab("metrics")}
              className={`pb-4 text-[14px] font-['Syne'] font-[700] transition-all relative flex items-center gap-2 ${activeTab === "metrics" ? "text-[#F0F2F7]" : "text-[#5A6478] hover:text-[#8892A4]"}`}
             >
               <TrendingUp className="w-4 h-4" />
               Reel Metrics
               {activeTab === "metrics" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#A78BFA]"></div>}
             </button>
             <button 
              onClick={() => setActiveTab("profile")}
              className={`pb-4 text-[14px] font-['Syne'] font-[700] transition-all relative flex items-center gap-2 ${activeTab === "profile" ? "text-[#F0F2F7]" : "text-[#5A6478] hover:text-[#8892A4]"}`}
             >
               <User className="w-4 h-4" />
               Profile Audit
               {activeTab === "profile" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#F59E0B]"></div>}
             </button>
             <button 
              onClick={() => setActiveTab("strategy")}
              className={`pb-4 text-[14px] font-['Syne'] font-[700] transition-all relative flex items-center gap-2 ${activeTab === "strategy" ? "text-[#F0F2F7]" : "text-[#5A6478] hover:text-[#8892A4]"}`}
             >
               <Activity className="w-4 h-4" />
               Strategy Audit
               {activeTab === "strategy" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#EC4899]"></div>}
             </button>
          </div>

          <div className="space-y-4">
            {activeTab === "winning" ? (
              <div className="space-y-4">
                {clientScripts.length > 0 ? (
                  clientScripts.map((script: any) => (
                     <div key={script.id} className="glass-surface rounded-2xl p-6 group transition-all hover:bg-white/[0.06]">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#3BFFC8]/10 rounded-xl flex items-center justify-center">
                              <FileText className="w-5 h-5 text-[#3BFFC8]" />
                            </div>
                            <div>
                              <h4 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">{script.title}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                 {script.useAsReference && (
                                   <span className="flex items-center gap-1 text-[9px] text-[#3BFFC8] font-bold uppercase">
                                     <Zap className="w-2.5 h-2.5" /> High Signal Resource
                                   </span>
                                 )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button className="p-2 bg-white/5 rounded-lg text-[#8892A4] hover:text-[#3BFFC8] transition-all">
                                <Copy className="w-4 h-4" />
                             </button>
                             <button className="p-2 bg-white/5 rounded-lg text-[#8892A4] hover:text-blue-400 transition-all">
                                <Eye className="w-4 h-4" />
                             </button>
                          </div>
                        </div>
                        <p className="text-[#8892A4] text-[13px] leading-relaxed line-clamp-4 bg-[#080A0F]/30 p-4 rounded-xl italic">
                          "{script.content}"
                        </p>
                     </div>
                  ))
                ) : (
                  <div className="py-20 text-center glass-surface rounded-2xl border-dashed border-white/10">
                     <p className="text-[#5A6478]">No winning scripts added yet.</p>
                  </div>
                )}

                {/* AI STYLE DNA — connected to Winning Scripts */}
                <div className="glass-surface rounded-2xl p-6 space-y-6 border border-[#3BFFC8]/20 relative overflow-hidden group mt-2">
                  <div className="absolute top-[-20%] right-[-10%] w-[150px] h-[150px] bg-[#3BFFC8]/10 blur-[60px] rounded-full group-hover:bg-[#3BFFC8]/20 transition-all duration-700"></div>
                  <h3 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7] flex items-center justify-between border-b border-white/5 pb-4">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="w-5 h-5 text-[#3BFFC8]" />
                      AI Style DNA
                    </div>
                    {!client.styleDNA || Object.keys(client.styleDNA).length === 0 ? (
                      <button
                        onClick={handleAnalyzeStyle}
                        disabled={isAnalyzing}
                        className="flex items-center gap-2 text-[11px] bg-[#3BFFC8]/10 text-[#3BFFC8] px-3 py-1.5 rounded-lg font-bold border border-[#3BFFC8]/30 hover:bg-[#3BFFC8]/20 transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {isAnalyzing ? "Analyzing..." : "Analyze Style"}
                      </button>
                    ) : (
                      <button
                        onClick={handleAnalyzeStyle}
                        disabled={isAnalyzing}
                        className="text-[10px] text-[#5A6478] hover:text-[#3BFFC8] transition-colors flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3" />
                        Refresh Analysis
                      </button>
                    )}
                  </h3>
                  {client.styleDNA && Object.keys(client.styleDNA).length > 0 ? (
                    <div className="space-y-4 relative z-10">
                      <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                        {[
                          { label: "Tone", value: client.styleDNA.tone, color: "text-[#3BFFC8]" },
                          { label: "Sentence Length", value: client.styleDNA.sentenceLength, color: "text-[#FF8C42]" },
                          { label: "Vocabulary Level", value: client.styleDNA.vocabularyLevel, color: "text-[#A78BFA]" },
                          { label: "Used Emotions", value: client.styleDNA.emotionUsed, color: "text-[#FF3B57]" },
                          { label: "Pacing", value: client.styleDNA.pacing, color: "text-blue-400" },
                          { label: "Hook Pattern", value: client.styleDNA.hookPattern, color: "text-yellow-400" }
                        ].map((item, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="text-[10px] text-[#8892A4] font-bold uppercase tracking-widest">{item.label}</div>
                            <div className={`text-[13px] font-semibold ${item.color}`}>{item.value || "TBD"}</div>
                          </div>
                        ))}
                      </div>
                      <div className="pt-4 border-t border-white/5 space-y-4">
                        <div className="space-y-2">
                          <div className="text-[10px] text-[#8892A4] font-bold uppercase tracking-widest">CTA Architecture</div>
                          <div className="text-[13px] text-[#F0F2F7] leading-relaxed">{client.styleDNA.ctaPattern}</div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-[10px] text-[#8892A4] font-bold uppercase tracking-widest">Repeated Phrases</div>
                          <div className="flex flex-wrap gap-2">
                            {(Array.isArray(client.styleDNA.repeatedPhrases) ? client.styleDNA.repeatedPhrases : []).map((phrase, i) => (
                              <span key={i} className="text-[11px] bg-white/5 border border-white/10 px-2 py-1 rounded text-[#8892A4]">
                                "{phrase}"
                              </span>
                            ))}
                          </div>
                        </div>
                        {client.styleDNA.doubleDownStrategy && (
                          <div className="pt-4 mt-4 border-t border-[#3BFFC8]/20 bg-[#3BFFC8]/5 p-4 rounded-xl relative overflow-hidden group/strategy">
                            <div className="absolute top-0 left-0 w-1 h-full bg-[#3BFFC8]"></div>
                            <h4 className="text-[10px] font-bold text-[#3BFFC8] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                              <Zap size={12} className="fill-[#3BFFC8]" />
                              Double Down Strategy
                            </h4>
                            <p className="text-[13px] text-[#F0F2F7] font-medium leading-relaxed">
                              {client.styleDNA.doubleDownStrategy}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center space-y-4">
                      <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto text-[#5A6478]">
                        <Fingerprint className="w-6 h-6" />
                      </div>
                      <div className="max-w-[200px] mx-auto">
                        <p className="text-[12px] text-[#5A6478] leading-relaxed">
                          Analyze winning scripts to extract this client's unique content DNA.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === "generated" ? (
              <div className="flex flex-col items-center justify-center py-20 text-center glass-surface rounded-2xl">
                 <History className="w-12 h-12 text-[#5A6478] mb-4" />
                 <h4 className="font-bold text-[#F0F2F7]">Script History Empty</h4>
                 <p className="text-[#8892A4] text-sm mt-2 max-w-[280px]">
                   Generate scripts using the Script Studio to see them appear here.
                 </p>
                 <Link 
                    href={`/scripts/create?clientId=${client.id}`}
                    className="mt-6 text-[12px] font-bold text-[#3BFFC8] underline underline-offset-4"
                  >
                    Start Writing →
                  </Link>
              </div>
            ) : activeTab === "scriptGuide" ? (
              <div className="glass-surface rounded-2xl p-6 space-y-4 border border-[rgba(59,255,200,0.12)]">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-[#3BFFC8]/10 rounded-xl flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-[#3BFFC8]" />
                  </div>
                  <div>
                    <h3 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">Per-client master guide</h3>
                    <p className="text-[12px] text-[#8892A4] font-['DM_Sans'] leading-relaxed mt-1 max-w-[640px]">
                      Paste the full text of your script-writing framework for this account (markdown is fine). When you select this client in Script Studio, remix and scratch generation automatically append this guide so you do not have to repeat instructions each session.
                    </p>
                  </div>
                </div>
                <textarea
                  value={scriptGuideDraft}
                  onChange={(e) => setScriptGuideDraft(e.target.value)}
                  placeholder="Paste framework: voice rules, taboos, CTA patterns, Hold-4-Twist-1 preferences, example hooks, etc."
                  rows={18}
                  className="w-full bg-[#080A0F]/60 border border-white/10 rounded-xl px-4 py-3 text-[13px] text-[#F0F2F7] font-['DM_Sans'] leading-relaxed placeholder:text-[#5A6478] focus:border-[#3BFFC8]/50 focus:ring-1 focus:ring-[#3BFFC8]/20 outline-none resize-y min-h-[280px]"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#5A6478]">{scriptGuideDraft.length} characters</span>
                  <button
                    type="button"
                    onClick={() => void handleSaveScriptGuide()}
                    disabled={isSavingScriptGuide}
                    className="px-5 py-2.5 rounded-xl bg-[#3BFFC8] text-[#080A0F] font-['Syne'] font-[700] text-[13px] hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_4px_14px_rgba(59,255,200,0.2)]"
                  >
                    {isSavingScriptGuide ? "Saving…" : "Save master guide"}
                  </button>
                </div>
              </div>
            ) : activeTab === "tracker" ? (
               <div className="space-y-6 animate-fade-in">
                  {/* Signal Stack — shows above the video grid when there are tracked videos */}
                  {client.trackedVideos && client.trackedVideos.length > 0 && (
                    <SignalStack
                      trackedVideos={client.trackedVideos as ClientTrackedVideo[]}
                      clientNiche={client.niche ?? ""}
                      gameMode={client.gameMode ?? "awareness"}
                      clientId={String(id)}
                    />
                  )}

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 glass-surface rounded-2xl border border-white/5 shadow-lg">
                    <div className="flex-1 w-full relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5A6478]">
                        <Search className="w-4 h-4" />
                      </div>
                      <input 
                        type="url"
                        placeholder="Paste Client Video URL (IG/TikTok/YT)"
                        value={videoUrlInput}
                        onChange={(e) => setVideoUrlInput(e.target.value)}
                        className="w-full bg-[#080A0F] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-[13px] text-[#F0F2F7] placeholder-[#5A6478] focus:border-[#3BFFC8]/50 focus:ring-1 focus:ring-[#3BFFC8]/20 transition-all outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button 
                        onClick={handleTrackVideo}
                        disabled={isTrackLoading || !videoUrlInput.trim()}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#3BFFC8] text-[#080A0F] px-5 py-3 rounded-xl font-bold text-[13px] transition-all hover:bg-[#3BFFC8]/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(59,255,200,0.2)]"
                      >
                        {isTrackLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Track & Analyze
                          </>
                        )}
                      </button>
                      <button 
                        onClick={handleRefreshAnalytics}
                        disabled={isRefreshLoading || (client.trackedVideos || []).length === 0}
                        title="Refresh All Analytics"
                        className="p-3 bg-white/5 text-[#F0F2F7] border border-white/10 rounded-xl hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                      >
                         <RefreshCw className={`w-4 h-4 ${isRefreshLoading ? 'animate-spin text-[#3BFFC8]' : 'text-[#8892A4] group-hover:text-[#F0F2F7]'}`} />
                      </button>
                    </div>
                  </div>

                  {client.trackedVideos && client.trackedVideos.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                      {(Array.isArray(client.trackedVideos) ? [...client.trackedVideos] : []).sort((a,b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()).map((video, _idx) => {
                        const fmtNum = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short" }).format(n);
                        const views = video.metrics?.views ? fmtNum(video.metrics.views) : "N/A";
                        const likes = video.metrics?.likes ? fmtNum(video.metrics.likes) : "N/A";
                        const strategy = video.analysis?.hooks?.hookType || video.analysis?.narrative?.storyStructure || "Reel";
                        const thumb = (video.thumbnailUrl && video.thumbnailUrl !== "undefined") ? video.thumbnailUrl : (video as any).displayUrl;
                        return (
                          <div key={video.id} className="relative aspect-[9/16] w-full rounded-2xl overflow-hidden group border border-white/5 shadow-2xl bg-[#0f0f11] transition-all hover:border-white/10">
                              {thumb ? (
                                <img src={thumb} alt="Video Thumbnail" className="absolute inset-0 w-full h-full object-cover" />
                              ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                                  <span className="text-white/20 text-5xl mb-3">📱</span>
                                  <span className="text-xs text-white/40 font-mono">Apify Scrape Failed</span>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
                              <div className="absolute top-4 left-4">
                                <span className="bg-black/40 backdrop-blur-md border border-white/10 text-emerald-400 text-[10px] px-2.5 py-1 rounded font-semibold tracking-wider uppercase">
                                  {strategy}
                                </span>
                              </div>
                              <button onClick={() => handleDeleteVideo(video.id)} className="absolute top-4 right-4 w-8 h-8 bg-black/40 backdrop-blur-md hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 rounded-full flex items-center justify-center text-white/70 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100">
                                ✕
                              </button>
                              <div className="absolute bottom-4 left-4">
                                <div className="bg-black/60 backdrop-blur-md border border-white/5 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                                  <span className="text-[12px]">👁️</span>
                                  <span className="text-xs font-bold text-white tracking-wide">{views}</span>
                                </div>
                              </div>
                              <div className="absolute bottom-4 right-4">
                                <div className="bg-cyan-500/20 border border-cyan-500/30 px-2 py-1 rounded-md">
                                  <span className="text-xs font-bold text-cyan-400 tracking-wide">❤️ {likes}</span>
                                </div>
                              </div>
                              <a href={video.url} target="_blank" rel="noreferrer" className="absolute inset-0 z-0" />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-20 text-center glass-surface rounded-2xl border-dashed border-white/10">
                       <BarChart2 className="w-10 h-10 text-[#5A6478] mx-auto mb-3" />
                       <p className="text-[#F0F2F7] font-semibold text-[14px]">No tracked performance data yet.</p>
                       <p className="text-[#8892A4] text-[12px] mt-1">Paste a video URL above to see analytics and AI insights.</p>
                    </div>
                  )}
               </div>
            ) : activeTab === "profile" ? (
              <ProfileAuditTab
                clientId={String(id)}
                clientName={client.name}
                clientNiche={client.niche ?? ""}
                gameMode={client.gameMode ?? "awareness"}
                recentContentTitles={(client.trackedVideos as ClientTrackedVideo[] ?? []).slice(0, 10).map((v) => (v as any).analysis?.hooks?.hookTitle ?? v.url ?? "")}
                initialProfileData={client.profileData as any}
                initialPcrAudit={client.pcrAudit as any}
                onSaved={(profileData, pcrAudit) => setClient(prev => prev ? { ...prev, profileData: profileData as unknown as Record<string, unknown>, pcrAudit: pcrAudit as unknown as Record<string, unknown> } : prev)}
              />
            ) : activeTab === "strategy" ? (
              <StrategyAudit
                clientId={String(id)}
                clientName={client.name}
                clientNiche={client.niche ?? ""}
                platform={client.platform ?? "Instagram"}
                gameMode={client.gameMode ?? "awareness"}
                currentContentTitles={(client.trackedVideos as ClientTrackedVideo[] ?? []).map((v) => (v as any).analysis?.hooks?.hookTitle ?? "")}
                initialAudit={client.strategyAudit as any}
                onSaved={(audit) => setClient(prev => prev ? { ...prev, strategyAudit: audit } : prev)}
              />
            ) : null}

            {/* REEL METRICS TAB */}
            {activeTab === "metrics" && (
              <div className="space-y-6">
                <div className="glass-surface rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-[#A78BFA]/10 rounded-xl flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-[#A78BFA]" />
                    </div>
                    <div>
                      <h3 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">Reel Metrics Analyzer</h3>
                      <p className="text-[11px] text-[#8892A4]">Based on the 4-checkpoint lifecycle (2h → 24h → 72h → 7d)</p>
                    </div>
                  </div>

                  {/* Lifecycle education */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {[
                      { stage: "Stage 1", time: "0–2 hours", label: "Seed Test", desc: "Algorithm tests with small audience. Early signals decide push." },
                      { stage: "Stage 2", time: "6–12 hours", label: "Peak Push", desc: "If seed succeeds, Instagram expands rapidly." },
                      { stage: "Stage 3", time: "24–72 hours", label: "Main Window", desc: "~50% of total views happen in Day 1." },
                      { stage: "Stage 4", time: "Day 3–30+", label: "Long Tail", desc: "Evergreen content gains from trending sounds, search, shares." },
                    ].map(s => (
                      <div key={s.stage} className="rounded-[10px] bg-[rgba(167,139,250,0.04)] border border-[rgba(167,139,250,0.12)] p-3">
                        <p className="font-['JetBrains_Mono'] text-[8px] text-[#A78BFA] uppercase mb-1">{s.stage} · {s.time}</p>
                        <p className="font-['Syne'] font-[700] text-[12px] text-[#F0F2F7] mb-1">{s.label}</p>
                        <p className="font-['DM_Sans'] text-[10px] text-[#8892A4] leading-[1.4]">{s.desc}</p>
                      </div>
                    ))}
                  </div>

                  {/* Metrics input */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <label className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.1em] text-[#5A6478]">Checkpoint</label>
                      {["2h", "24h", "72h", "7d"].map(cp => (
                        <button key={cp} onClick={() => setMetricsInput(p => ({ ...p, checkpoint: cp }))}
                          className={`px-[10px] py-[4px] rounded-[6px] font-['JetBrains_Mono'] text-[10px] font-[600] transition-all ${metricsInput.checkpoint === cp ? "bg-[#A78BFA] text-[#080A0F]" : "bg-[#111620] text-[#8892A4] border border-[rgba(255,255,255,0.07)] hover:text-[#A78BFA]"}`}>
                          {cp}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { key: "views", label: "Views", placeholder: "e.g. 12500" },
                        { key: "likes", label: "Likes", placeholder: "e.g. 820" },
                        { key: "comments", label: "Comments", placeholder: "e.g. 45" },
                        { key: "shares", label: "Shares", placeholder: "e.g. 120" },
                        { key: "saves", label: "Saves", placeholder: "e.g. 340" },
                        { key: "watchTime", label: "Avg Watch Time (s)", placeholder: "e.g. 18" },
                      ].map(field => (
                        <div key={field.key}>
                          <label className="text-[10px] text-[#8892A4] block mb-1">{field.label}</label>
                          <input
                            type="number"
                            placeholder={field.placeholder}
                            value={(metricsInput as Record<string, string>)[field.key]}
                            onChange={(e) => setMetricsInput(p => ({ ...p, [field.key]: e.target.value }))}
                            className="w-full bg-[#111620] border border-[rgba(255,255,255,0.07)] rounded-[8px] px-3 py-2 text-sm text-white outline-none focus:border-[#A78BFA] transition"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        setIsAnalyzingMetrics(true);
                        setMetricsAnalysis(null);
                        try {
                          const content = `Reel Metrics at ${metricsInput.checkpoint} checkpoint:
Views: ${metricsInput.views || "unknown"}
Likes: ${metricsInput.likes || "unknown"}
Comments: ${metricsInput.comments || "unknown"}
Shares: ${metricsInput.shares || "unknown"}
Saves: ${metricsInput.saves || "unknown"}
Avg Watch Time: ${metricsInput.watchTime || "unknown"}s
Client niche: ${client?.niche || "general"}

Analyze this reel's performance based on the checkpoint system (2h/24h/72h/7d). 
Calculate engagement rate = (likes+comments+shares+saves)/views*100.
Benchmark shares+saves vs views (target: >2%).
Diagnose if the algorithm will push this further.
Give verdict (Push/Hold/Repost) and 3 specific actionable recommendations.`;

                          const res = await fetch("/api/analyze", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ mode: "script", content, model: "gemini-3-flash-preview" }),
                          });
                          const data = await res.json() as { analysis?: Record<string, unknown> };
                          setMetricsAnalysis(data.analysis ?? { summary: "Analysis complete. Check raw data." });
                        } catch { setMetricsAnalysis({ error: "Analysis failed. Try again." }); }
                        finally { setIsAnalyzingMetrics(false); }
                      }}
                      disabled={isAnalyzingMetrics || !metricsInput.views}
                      className="w-full py-3 rounded-xl bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.3)] text-[#A78BFA] font-['DM_Sans'] font-[600] text-sm hover:bg-[rgba(167,139,250,0.2)] transition disabled:opacity-50"
                    >
                      {isAnalyzingMetrics ? "Analyzing metrics..." : "📊 Analyze Reel Performance"}
                    </button>
                  </div>

                  {/* Metrics result */}
                  {metricsAnalysis && !isAnalyzingMetrics && (
                    <div className="mt-6 rounded-[12px] border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.04)] p-5">
                      <h4 className="font-['Syne'] font-[700] text-[14px] text-[#A78BFA] mb-4">Analysis Results</h4>
                      {metricsAnalysis.error ? (
                        <p className="text-red-400 text-sm">{String(metricsAnalysis.error)}</p>
                      ) : (
                        <div className="space-y-3">
                          {Boolean(metricsAnalysis.final_score) && (
                            <div className="flex items-center gap-3">
                              <span className="text-[28px] font-['Syne'] font-[800] text-[#A78BFA]">{Number(metricsAnalysis.final_score)}/10</span>
                              <span className="font-['JetBrains_Mono'] text-[11px] text-[#A78BFA]">{String(metricsAnalysis.readiness)}</span>
                            </div>
                          )}
                          {Boolean(metricsAnalysis.key_strength) && (
                            <div className="rounded-[8px] bg-[rgba(59,255,200,0.05)] border border-[rgba(59,255,200,0.15)] p-3">
                              <p className="font-['JetBrains_Mono'] text-[9px] text-[#3BFFC8] uppercase mb-2">✅ Strength</p>
                              <p className="font-['DM_Sans'] text-[12px] text-[#F0F2F7]">{String(metricsAnalysis.key_strength)}</p>
                            </div>
                          )}
                          {Array.isArray(metricsAnalysis.top_3_fixes) && (
                            <div className="space-y-2">
                              {(metricsAnalysis.top_3_fixes as Array<{pillar: string; fix: string}>).map((fix, i) => (
                                <div key={i} className="rounded-[8px] bg-[rgba(245,166,35,0.05)] border border-[rgba(245,166,35,0.15)] p-3">
                                  <p className="font-['JetBrains_Mono'] text-[9px] text-[#f5a623] uppercase mb-1">#{i+1} {fix.pillar}</p>
                                  <p className="font-['DM_Sans'] text-[11px] text-[#F0F2F7]">{fix.fix}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {!metricsAnalysis.final_score && !metricsAnalysis.key_strength && (
                            <pre className="text-[10px] text-[#8892A4] whitespace-pre-wrap font-['DM_Sans'] leading-[1.5]">{JSON.stringify(metricsAnalysis, null, 2)}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
