"use client";

import { useEffect, useState } from "react";
import { type AIProvider, LOCAL_SETTINGS_KEY, parseLocalSettings } from "@/lib/client-settings";
import { useToast } from "@/app/components/UI/Toast";
import { Settings, User, Key, Globe, Layout, Briefcase, Eye, EyeOff } from "lucide-react";
import { useSession } from "next-auth/react";

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
  openai: ["gpt-5-mini-2025-08-07", "gpt-5.4"],
  gemini: ["gemini-3-flash-preview", "gemini-3.1-pro-preview"],
  anthropic: ["claude-4.5-haiku", "claude-4.6-sonnet"],
};

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "gemini-3-flash-preview": "Gemini 3 Flash",
  "gemini-3.1-pro-preview": "Gemini 3.1 Pro",
  "gpt-5-mini-2025-08-07": "GPT-5 Mini",
  "gpt-5.4": "GPT-5.4",
  "claude-4.5-haiku": "Claude 4.5 Haiku",
  "claude-4.6-sonnet": "Claude 4.6 Sonnet",
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
  const { data: session } = useSession();
  const [name, setName] = useState("");
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
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [agencyLogoPreview, setAgencyLogoPreview] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const toggleKey = (name: string) => setShowKeys(prev => ({ ...prev, [name]: !prev[name] }));
  const { toast } = useToast();

  const [serverSavedKeys, setServerSavedKeys] = useState<Record<string, boolean>>({});
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" });
  const [passwordStatus, setPasswordStatus] = useState({ type: "", message: "" });
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
 
    // Load UI preferences from localStorage (non-sensitive fallback)
    const storedProvider = localStorage.getItem(ACTIVE_PROVIDER_STORAGE_KEY) as ProviderOption | null;
    if (storedProvider) setActiveProvider(storedProvider);
    
    // Load all settings from server (Source of Truth)
    void fetch("/api/settings")
      .then((r) => {
        if (!r.ok) {
          console.error("API Error: Loading settings failed");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        
        // Account Info
        if (data.name) setName(data.name);
        if (data.agencyName) setAgencyName(data.agencyName);
        if (data.agencyLogo) setAgencyLogoPreview(data.agencyLogo);

        // Provider & Model
        if (data.activeProvider) setActiveProvider(data.activeProvider.toLowerCase() as ProviderOption);
        if (data.activeModel) setActiveModel(data.activeModel);

        // API keys are never returned — pre-fill with sentinel so user sees "••••••••" in the field
        const SENTINEL = "••••••••";
        if (data.geminiApiKeySet) setGeminiApiKey(SENTINEL);
        if (data.openaiApiKeySet) setOpenaiApiKey(SENTINEL);
        if (data.anthropicApiKeySet) setAnthropicApiKey(SENTINEL);
        if (data.apifyApiKeySet) setApifyApiKey(SENTINEL);
        if (data.elevenlabsApiKeySet) setElevenLabsApiKey(SENTINEL);
        if (data.sarvamApiKeySet) setSarvamApiKey(SENTINEL);

        setServerSavedKeys({
          geminiApiKey: !!data.geminiApiKeySet,
          openaiApiKey: !!data.openaiApiKeySet,
          anthropicApiKey: !!data.anthropicApiKeySet,
          apifyApiKey: !!data.apifyApiKeySet,
          elevenlabsApiKey: !!data.elevenlabsApiKeySet,
          sarvamApiKey: !!data.sarvamApiKeySet,
        });
      });
  }, []);
 
  // Sync model list when provider changes
  useEffect(() => {
    if (!MODELS_BY_PROVIDER[activeProvider].includes(activeModel)) {
      setActiveModel(MODELS_BY_PROVIDER[activeProvider][0]);
    }
  }, [activeProvider, activeModel]);
 
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new !== passwordData.confirm) {
      setPasswordStatus({ type: "error", message: "New passwords do not match." });
      return;
    }
    if (passwordData.new.length < 8) {
      setPasswordStatus({ type: "error", message: "Password must be at least 8 characters." });
      return;
    }

    setIsChanging(true);
    setPasswordStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: passwordData.current, newPassword: passwordData.new }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to change password");

      setPasswordStatus({ type: "success", message: "Password updated successfully!" });
      setPasswordData({ current: "", new: "", confirm: "" });
      setTimeout(() => setIsChangingPassword(false), 2000);
    } catch (error: any) {
      setPasswordStatus({ type: "error", message: error.message });
    } finally {
      setIsChanging(false);
    }
  };

  async function handleSave() {
    // Helper: strip out literal 'undefined' / 'null' strings before persisting
    const cleanKey = (val: string | null | undefined) =>
      val && val !== "undefined" && val !== "null" ? val.trim() : "";
 
    const payload = {
      geminiApiKey: cleanKey(geminiApiKey),
      openaiApiKey: cleanKey(openaiApiKey),
      anthropicApiKey: cleanKey(anthropicApiKey),
      apifyApiKey: cleanKey(apifyApiKey),
      elevenlabsApiKey: cleanKey(elevenLabsApiKey),
      sarvamApiKey: cleanKey(sarvamApiKey),
      agencyName: agencyName.trim(),
      agencyLogo: agencyLogoPreview,
      activeProvider: activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1),
      activeModel: activeModel,
      name: name.trim(),
    };

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setServerSavedKeys({
          geminiApiKey: !!payload.geminiApiKey,
          openaiApiKey: !!payload.openaiApiKey,
          anthropicApiKey: !!payload.anthropicApiKey,
          apifyApiKey: !!payload.apifyApiKey,
        });

        // Mirror to localStorage for legacy components that still use it
        localStorage.setItem("agencyName", payload.agencyName);
        localStorage.setItem("agencyLogo", payload.agencyLogo);
        localStorage.setItem(ACTIVE_PROVIDER_STORAGE_KEY, activeProvider);
        localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, activeModel);
        
        toast("success", "Settings Saved", "Your configuration has been updated across the app.");
        
        // Dispatch event to update Sidebar/Header in real-time
        window.dispatchEvent(new CustomEvent("settingsUpdated"));
      } else {
        toast("error", "Save Failed", "Could not save settings to server.");
      }
    } catch (error) {
      console.error("Save error:", error);
      toast("error", "Save Failed", "An unexpected error occurred.");
    }
  }
 
  function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
 
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target?.result as string;
      setAgencyLogoPreview(base64String);
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
            Manage your agency profile and encrypted API keys.
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
                <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Krish Chhatrala"
                  className={premiumFieldClassName}
                />
              </div>
              <div className="flex flex-col">
                <label className="font-['JetBrains_Mono'] text-[10px] font-[500] text-[#5A6478] tracking-[0.07em] uppercase mb-[7px]">Email Address</label>
                <input
                  type="email"
                  value={session?.user?.email || ""}
                  readOnly={true}
                  className={premiumFieldClassName + " opacity-60 cursor-not-allowed focus:border-transparent focus:ring-0"}
                />
              </div>

              <div className="mt-6 pt-4 border-t border-[rgba(255,255,255,0.05)]">
                {!isChangingPassword ? (
                  <button
                    type="button"
                    onClick={() => setIsChangingPassword(true)}
                    className="text-[12px] font-['DM_Sans'] text-[#8892A4] hover:text-white transition-colors flex items-center gap-2"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    Change Password
                  </button>
                ) : (
                  <form onSubmit={handlePasswordChange} className="flex flex-col gap-4 bg-[rgba(0,0,0,0.2)] p-4 rounded-lg border border-[rgba(255,255,255,0.05)]">
                    <h4 className="text-[13px] text-white font-medium mb-1">Update Password</h4>

                    <input
                      type="password"
                      placeholder="Current Password"
                      value={passwordData.current}
                      onChange={(e) => setPasswordData({...passwordData, current: e.target.value})}
                      className="w-full bg-[#111620] border border-[rgba(255,255,255,0.08)] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#FF3B57]"
                      required
                    />
                    <input
                      type="password"
                      placeholder="New Password"
                      value={passwordData.new}
                      onChange={(e) => setPasswordData({...passwordData, new: e.target.value})}
                      className="w-full bg-[#111620] border border-[rgba(255,255,255,0.08)] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#FF3B57]"
                      required
                    />
                    <input
                      type="password"
                      placeholder="Confirm New Password"
                      value={passwordData.confirm}
                      onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})}
                      className="w-full bg-[#111620] border border-[rgba(255,255,255,0.08)] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#FF3B57]"
                      required
                    />

                    {passwordStatus.message && (
                      <p className={`text-[12px] ${passwordStatus.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                        {passwordStatus.message}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                      <button
                        type="submit"
                        disabled={isChanging}
                        className="px-4 py-2 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-md text-[12px] text-white transition-all disabled:opacity-50"
                      >
                        {isChanging ? "Saving..." : "Save Password"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsChangingPassword(false); setPasswordStatus({ type: "", message: "" }); }}
                        className="text-[12px] text-[#8892A4] hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
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
                      onFocus={() => { if (apifyApiKey === "••••••••") setApifyApiKey(""); }}
                      onBlur={() => { if (apifyApiKey === "" && serverSavedKeys.apifyApiKey) setApifyApiKey("••••••••"); }}
                      onChange={(e) => setApifyApiKey(e.target.value)}
                      placeholder="Paste new key to update..."
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      spellCheck={false}
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
                      {(Array.isArray(PROVIDER_OPTIONS) ? PROVIDER_OPTIONS : []).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
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
                      {(Array.isArray(MODELS_BY_PROVIDER[activeProvider]) ? MODELS_BY_PROVIDER[activeProvider] : []).map(m => <option key={m} value={m}>{MODEL_DISPLAY_NAMES[m] || m}</option>)}
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
                      onFocus={() => { if (geminiApiKey === "••••••••") setGeminiApiKey(""); }}
                      onBlur={() => { if (geminiApiKey === "" && serverSavedKeys.geminiApiKey) setGeminiApiKey("••••••••"); }}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="Paste new key to update..."
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      spellCheck={false}
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
                      onFocus={() => { if (openaiApiKey === "••••••••") setOpenaiApiKey(""); }}
                      onBlur={() => { if (openaiApiKey === "" && serverSavedKeys.openaiApiKey) setOpenaiApiKey("••••••••"); }}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder="Paste new key to update..."
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      spellCheck={false}
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
                      onFocus={() => { if (anthropicApiKey === "••••••••") setAnthropicApiKey(""); }}
                      onBlur={() => { if (anthropicApiKey === "" && serverSavedKeys.anthropicApiKey) setAnthropicApiKey("••••••••"); }}
                      onChange={(e) => setAnthropicApiKey(e.target.value)}
                      placeholder="Paste new key to update..."
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      spellCheck={false}
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
                      onFocus={() => { if (elevenLabsApiKey === "••••••••") setElevenLabsApiKey(""); }}
                      onBlur={() => { if (elevenLabsApiKey === "" && serverSavedKeys.elevenlabsApiKey) setElevenLabsApiKey("••••••••"); }}
                      onChange={(e) => setElevenLabsApiKey(e.target.value)}
                      placeholder="Paste new key to update..."
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      spellCheck={false}
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
                      onFocus={() => { if (sarvamApiKey === "••••••••") setSarvamApiKey(""); }}
                      onBlur={() => { if (sarvamApiKey === "" && serverSavedKeys.sarvamApiKey) setSarvamApiKey("••••••••"); }}
                      onChange={(e) => setSarvamApiKey(e.target.value)}
                      placeholder="Paste new key to update..."
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      spellCheck={false}
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
