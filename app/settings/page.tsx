"use client";

import { useEffect, useState } from "react";
import { type AIProvider, LOCAL_SETTINGS_KEY, parseLocalSettings } from "../../lib/client-settings";
import { useToast } from "../components/UI/Toast";
import { Settings, User, Key, Globe, Layout, Briefcase, Eye, EyeOff } from "lucide-react";

type ProviderOption = "openai" | "gemini" | "anthropic";

const EMAIL_STORAGE_KEY = "ACCOUNT_EMAIL_ADDRESS";
const ACTIVE_PROVIDER_STORAGE_KEY = "ACTIVE_LLM_PROVIDER";
const ACTIVE_MODEL_STORAGE_KEY = "ACTIVE_LLM_MODEL";

const PROVIDER_OPTIONS: Array<{ value: ProviderOption; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "anthropic", label: "Anthropic" },
];

const MODELS_BY_PROVIDER: Record<ProviderOption, string[]> = {
  openai: ["GPT-5", "GPT-5.1", "GPT-5.2"],
  gemini: [
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
  ],
  anthropic: [
    "Claude 3.7 Sonnet",
    "Claude 4.5 Sonnet",
  ],
};

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "gemini-3-flash-preview": "Gemini 3 Flash",
  "gemini-3.1-pro-preview": "Gemini 3.1 Pro",
};

function toAiProvider(provider: ProviderOption): AIProvider {
  if (provider === "anthropic") {
    return "claude";
  }
  return provider;
}

function fromAiProvider(provider: AIProvider): ProviderOption {
  if (provider === "claude") {
    return "anthropic";
  }
  return provider;
}

function parseStoredProvider(value: string | null): ProviderOption | null {
  if (value === "openai" || value === "gemini" || value === "anthropic") {
    return value;
  }
  return null;
}

const premiumFieldClassName = "w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all";
const premiumSelectClassName = `${premiumFieldClassName} appearance-none cursor-pointer`;

export default function SettingsPage() {
  const [emailAddress, setEmailAddress] = useState("");
  const [apifyApiKey, setApifyApiKey] = useState("");
  const [activeProvider, setActiveProvider] = useState<ProviderOption>("openai");
  const [activeModel, setActiveModel] = useState(MODELS_BY_PROVIDER.openai[0]);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [ttsProvider, setTtsProvider] = useState<"ElevenLabs" | "Gemini" | "Sarvam AI" | "Google TTS">("ElevenLabs");
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
  const [sarvamApiKey, setSarvamApiKey] = useState("");
  const [storageEngine, setStorageEngine] = useState<"localstorage" | "json">("localstorage");
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [agencyLogoPreview, setAgencyLogoPreview] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const toggleKey = (name: string) => setShowKeys(prev => ({ ...prev, [name]: !prev[name] }));
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const parsed = parseLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY));
    const nextProvider = parseStoredProvider(localStorage.getItem(ACTIVE_PROVIDER_STORAGE_KEY)) || fromAiProvider(parsed.aiProvider);
    const storedModel = (localStorage.getItem(ACTIVE_MODEL_STORAGE_KEY) || "").trim();
    const nextModel = MODELS_BY_PROVIDER[nextProvider].includes(storedModel) ? storedModel : MODELS_BY_PROVIDER[nextProvider][0];

    setEmailAddress(localStorage.getItem(EMAIL_STORAGE_KEY) || "");
    setApifyApiKey(localStorage.getItem("APIFY_API_KEY") || parsed.apifyApiKey || "");
    setOpenaiApiKey(localStorage.getItem("OPENAI_API_KEY") || parsed.openaiApiKey || parsed.aiKeys.openai || "");
    setGeminiApiKey(localStorage.getItem("GEMINI_API_KEY") || parsed.geminiApiKey || parsed.aiKeys.gemini || "");
    setAnthropicApiKey(
      localStorage.getItem("ANTHROPIC_API_KEY") || parsed.anthropicApiKey || parsed.aiKeys.claude || "",
    );
    setActiveProvider(nextProvider);
    setActiveModel(nextModel);
    const storedTtsProvider = localStorage.getItem("ttsProvider") as "ElevenLabs" | "Gemini" | "Sarvam AI" | "Google TTS" | null;
    if (storedTtsProvider) {
      setTtsProvider(storedTtsProvider);
    }
    setElevenLabsApiKey(localStorage.getItem("elevenLabsApiKey") || "");
    setSarvamApiKey(localStorage.getItem("sarvamApiKey") || "");
    const storedEngine = localStorage.getItem("storageEngine");
    if (storedEngine === "json" || storedEngine === "localstorage") {
      setStorageEngine(storedEngine);
    }
    setNotionApiKey(localStorage.getItem("notionApiKey") || "");
    setNotionDatabaseId(localStorage.getItem("notionDatabaseId") || "");
    setAgencyName(localStorage.getItem("agencyName") || "");
    setAgencyLogoPreview(localStorage.getItem("agencyLogo") || "");
  }, []);

  // Removed local toast timeout effect

  useEffect(() => {
    if (!MODELS_BY_PROVIDER[activeProvider].includes(activeModel)) {
      setActiveModel(MODELS_BY_PROVIDER[activeProvider][0]);
    }
  }, [activeProvider, activeModel]);

  function handleSave() {
    const nextEmail = emailAddress.trim();
    const nextApify = apifyApiKey.trim();
    const nextOpenAi = openaiApiKey.trim();
    const nextGemini = geminiApiKey.trim();
    const nextAnthropic = anthropicApiKey.trim();
    const provider = toAiProvider(activeProvider);
    const parsed = parseLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY));

    const nextSettings = {
      ...parsed,
      apifyApiKey: nextApify,
      aiProvider: provider,
      aiKeys: {
        ...parsed.aiKeys,
        openai: nextOpenAi,
        gemini: nextGemini,
        claude: nextAnthropic,
      },
      openaiApiKey: nextOpenAi,
      geminiApiKey: nextGemini,
      anthropicApiKey: nextAnthropic,
      defaultAnalysisEngine: provider === "gemini" ? "gemini_1_5_pro" : "openai_gpt4o",
      defaultCreativeEngine:
        provider === "claude" ? "claude_3_5_sonnet" : provider === "gemini" ? "gemini_1_5_pro" : "gpt_4o",
    };

    // Helper: strip out literal 'undefined' / 'null' strings before persisting
    const cleanKey = (val: string | null | undefined) =>
      val && val !== "undefined" && val !== "null" ? val.trim() : "";

    const displayProvider =
      activeProvider === "openai" ? "OpenAI" : activeProvider === "anthropic" ? "Anthropic" : "Gemini";

    // Camelcase keys — primary keys read by page.tsx and uploads/page.tsx
    localStorage.setItem("geminiApiKey", cleanKey(nextGemini));
    localStorage.setItem("openAiApiKey", cleanKey(nextOpenAi));
    localStorage.setItem("anthropicApiKey", cleanKey(nextAnthropic));
    localStorage.setItem("activeProvider", displayProvider);
    localStorage.setItem("activeModel", activeModel || "gemini-3-flash-preview");

    // Legacy SCREAMING_CASE keys — kept for backwards compatibility
    localStorage.setItem(EMAIL_STORAGE_KEY, nextEmail);
    localStorage.setItem(ACTIVE_PROVIDER_STORAGE_KEY, activeProvider);
    localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, activeModel);
    localStorage.setItem("APIFY_API_KEY", cleanKey(nextApify));
    localStorage.setItem("OPENAI_API_KEY", cleanKey(nextOpenAi));
    localStorage.setItem("GEMINI_API_KEY", cleanKey(nextGemini));
    localStorage.setItem("ANTHROPIC_API_KEY", cleanKey(nextAnthropic));
    localStorage.setItem("analysisEngine", provider === "gemini" ? "gemini" : "openai");
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(nextSettings));
    // TTS settings
    localStorage.setItem("ttsProvider", ttsProvider);
    localStorage.setItem("elevenLabsApiKey", cleanKey(elevenLabsApiKey.trim()));
    localStorage.setItem("sarvamApiKey", cleanKey(sarvamApiKey.trim()));
    // Storage engine
    localStorage.setItem("storageEngine", storageEngine);
    // Notion integration
    localStorage.setItem("notionApiKey", cleanKey(notionApiKey.trim()));
    localStorage.setItem("notionDatabaseId", cleanKey(notionDatabaseId.trim()));
    // Agency Branding
    localStorage.setItem("agencyName", agencyName.trim());

    toast("success", "Settings Saved", "Your configuration has been updated locally.");

    // Also persist API keys to the server-side settings database
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        geminiApiKey: cleanKey(nextGemini),
        openaiApiKey: cleanKey(nextOpenAi),
        anthropicApiKey: cleanKey(nextAnthropic),
        apifyApiKey: cleanKey(nextApify),
        elevenLabsApiKey: cleanKey(elevenLabsApiKey.trim()),
        sarvamApiKey: cleanKey(sarvamApiKey.trim()),
        notionApiKey: cleanKey(notionApiKey.trim()),
        notionDatabaseId: cleanKey(notionDatabaseId.trim()),
        activeModel: activeModel || "gemini-3-flash-preview",
      }),
    });
  }

  function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target?.result as string;
      setAgencyLogoPreview(base64String);
      localStorage.setItem("agencyLogo", base64String);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10 pb-[100px]">
      <div className="mx-auto w-full max-w-[1000px] p-[32px]">

        {/* HEADER */}
        <header className="mb-[32px]">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <div className="w-[16px] h-[1px] bg-[#FF3B57]"></div>
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#5A6478]">
              Configuration
            </span>
          </div>
          <h1 className="font-['Syne'] font-[800] text-[40px] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7] mb-[10px]">
            Settings
          </h1>
          <p className="font-['DM_Sans'] text-[14.5px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.6]">
            Manage your account, branding, and API keys locally on this device.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] max-w-[960px]">

          {/* CARD 1 — AGENCY BRANDING */}
          <div className="glass-surface rounded-2xl overflow-hidden flex flex-col h-fit">
            <div className="px-6 py-5 border-b border-white/5 flex items-center gap-[9px] bg-[#111620]/30">
              <span className="text-[#FF3B57]"><Briefcase size={18} /></span>
              <h2 className="font-['Syne'] font-[700] text-[13.5px] text-[#F0F2F7]">Agency Branding</h2>
            </div>
            <div className="p-6 flex flex-col gap-[16px]">
              <div className="flex flex-col">
                <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Agency Name</label>
                <input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="e.g. Outlier Studio"
                  className={premiumFieldClassName}
                />
              </div>
              <div className="flex flex-col">
                <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Agency Logo</label>
                <div className="flex items-center gap-[12px]">
                  <div className="w-[44px] h-[44px] rounded-[9px] bg-gradient-to-br from-[#161C2A] to-[#0D1017] border border-[rgba(255,255,255,0.1)] flex items-center justify-center overflow-hidden">
                    {agencyLogoPreview ? (
                      <img src={agencyLogoPreview} className="w-full h-full object-contain p-[4px]" alt="Logo" />
                    ) : (
                      <span className="font-['Syne'] font-[800] text-[18px] text-[#FF3B57]">
                        {agencyName ? agencyName.charAt(0).toUpperCase() : "O"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-[4px] relative">
                    <button className="bg-transparent border border-[rgba(255,255,255,0.1)] rounded-[6px] p-[6px_12px] font-['DM_Sans'] text-[11.5px] text-[#F0F2F7] hover:bg-[rgba(255,255,255,0.05)] transition-all cursor-pointer">
                      Choose File
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#5A6478]">
                    {agencyLogoPreview ? "Logo loaded" : "No file chosen"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2 — ACCOUNT */}
          <div className="glass-surface rounded-2xl overflow-hidden flex flex-col h-fit">
            <div className="px-6 py-5 border-b border-white/5 flex items-center gap-[9px] bg-[#111620]/30">
              <span className="text-[#3BFFC8]"><User size={18} /></span>
              <h2 className="font-['Syne'] font-[700] text-[13.5px] text-[#F0F2F7]">Account</h2>
            </div>
            <div className="p-6 flex flex-col gap-[16px]">
              <div className="flex flex-col">
                <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Email Address</label>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="you@agency.com"
                  className={premiumFieldClassName}
                />
              </div>
              <div className="flex flex-col">
                <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Storage Engine</label>
                <div className="relative">
                  <select
                    value={storageEngine}
                    onChange={(e) => setStorageEngine(e.target.value as "localstorage" | "json")}
                    className={premiumSelectClassName}
                  >
                    <option value="localstorage">Browser (localStorage)</option>
                    <option value="json">Hard Drive (database.json)</option>
                  </select>
                  <span className="absolute right-[14px] top-1/2 -translate-y-1/2 pointer-events-none text-[#5A6478]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
                  </span>
                </div>
                <p className="font-['JetBrains_Mono'] text-[9px] text-[#5A6478] mt-[6px]">⚠ All data is stored locally on this device.</p>
              </div>
            </div>
          </div>

          {/* CARD 3 — API KEYS (FULL WIDTH) */}
          <div className="md:col-span-2 glass-surface rounded-2xl overflow-hidden flex flex-col mt-[4px]">
            <div className="px-6 py-5 border-b border-white/5 flex items-center gap-[9px] bg-[#111620]/30">
              <span className="text-[#FF8C42]"><Key size={18} /></span>
              <h2 className="font-['Syne'] font-[700] text-[13.5px] text-[#F0F2F7]">API Keys</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-[20px] gap-y-[16px]">

                <div className="flex flex-col">
                  <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Apify API Key</label>
                  <div className="relative">
                    <input
                      type={showKeys.apify ? "text" : "password"}
                      value={apifyApiKey}
                      onChange={(e) => setApifyApiKey(e.target.value)}
                      placeholder="apify_api_..."
                      className={premiumFieldClassName + " pr-10"}
                    />
                    <button type="button" onClick={() => toggleKey("apify")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6478] hover:text-[#F0F2F7] transition-colors">
                      {showKeys.apify ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col min-h-[50px] justify-center items-start bg-[rgba(59,255,200,0.03)] border border-[rgba(59,255,200,0.1)] rounded-[8px] px-[16px]">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#3BFFC8]">✓ Active Engine: {activeProvider.toUpperCase()} / {activeModel}</span>
                </div>

                <div className="flex flex-col">
                  <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Active Provider</label>
                  <div className="relative">
                    <select
                      value={activeProvider}
                      onChange={(e) => setActiveProvider(e.target.value as ProviderOption)}
                      className={premiumSelectClassName}
                    >
                      {PROVIDER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <span className="absolute right-[14px] top-1/2 -translate-y-1/2 pointer-events-none text-[#5A6478]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Active Model</label>
                  <div className="relative">
                    <select
                      value={activeModel}
                      onChange={(e) => setActiveModel(e.target.value)}
                      className={premiumSelectClassName}
                    >
                      {MODELS_BY_PROVIDER[activeProvider].map(m => <option key={m} value={m}>{MODEL_DISPLAY_NAMES[m] || m}</option>)}
                    </select>
                    <span className="absolute right-[14px] top-1/2 -translate-y-1/2 pointer-events-none text-[#5A6478]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Gemini API Key</label>
                  <div className="relative">
                    <input
                      type={showKeys.gemini ? "text" : "password"}
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      className={premiumFieldClassName + " pr-10"}
                    />
                    <button type="button" onClick={() => toggleKey("gemini")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6478] hover:text-[#F0F2F7] transition-colors">
                      {showKeys.gemini ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">OpenAI API Key</label>
                  <div className="relative">
                    <input
                      type={showKeys.openai ? "text" : "password"}
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      className={premiumFieldClassName + " pr-10"}
                    />
                    <button type="button" onClick={() => toggleKey("openai")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6478] hover:text-[#F0F2F7] transition-colors">
                      {showKeys.openai ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Anthropic API Key</label>
                  <div className="relative">
                    <input
                      type={showKeys.anthropic ? "text" : "password"}
                      value={anthropicApiKey}
                      onChange={(e) => setAnthropicApiKey(e.target.value)}
                      placeholder="Enter your Anthropic API key"
                      className={premiumFieldClassName + " pr-10"}
                    />
                    <button type="button" onClick={() => toggleKey("anthropic")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6478] hover:text-[#F0F2F7] transition-colors">
                      {showKeys.anthropic ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Active TTS Provider</label>
                  <div className="relative">
                    <select
                      value={ttsProvider}
                      onChange={(e) => setTtsProvider(e.target.value as any)}
                      className={premiumSelectClassName}
                    >
                      <option value="ElevenLabs">ElevenLabs</option>
                      <option value="Sarvam AI">Sarvam AI</option>
                      <option value="Google TTS">Google TTS</option>
                    </select>
                    <span className="absolute right-[14px] top-1/2 -translate-y-1/2 pointer-events-none text-[#5A6478]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">ElevenLabs API Key</label>
                  <div className="relative">
                    <input
                      type={showKeys.elevenlabs ? "text" : "password"}
                      value={elevenLabsApiKey}
                      onChange={(e) => setElevenLabsApiKey(e.target.value)}
                      className={premiumFieldClassName + " pr-10"}
                    />
                    <button type="button" onClick={() => toggleKey("elevenlabs")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6478] hover:text-[#F0F2F7] transition-colors">
                      {showKeys.elevenlabs ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Sarvam AI API Key</label>
                  <div className="relative">
                    <input
                      type={showKeys.sarvam ? "text" : "password"}
                      value={sarvamApiKey}
                      onChange={(e) => setSarvamApiKey(e.target.value)}
                      className={premiumFieldClassName + " pr-10"}
                    />
                    <button type="button" onClick={() => toggleKey("sarvam")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6478] hover:text-[#F0F2F7] transition-colors">
                      {showKeys.sarvam ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-[32px] flex items-center gap-[12px]">
                <button
                  onClick={handleSave}
                  className="px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg font-bold hover:bg-red-500 hover:text-white hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* TOAST NOTIFICATION */}
        {/* Removed local toast */}

      </div>
    </div>
  );
}
