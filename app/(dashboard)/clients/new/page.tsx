"use client";

import { useEffect, useState, Suspense } from "react";
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  User, 
  Target, 
  Mic2, 
  FileText,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/app/components/UI/Toast";

type WinningScript = {
  id: string;
  title: string;
  content: string;
  signal: string;
  useAsReference: boolean;
};

function FormContent() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!editId);

  const [formData, setFormData] = useState({
    name: "",
    niche: "",
    platform: "Instagram",
    language: "English",
    duration: "60s",
    targetAudience: "",
    tonePersona: "",
    vocabularyLevel: "",
    preferredTopics: "",
    avoidTopics: "",
    ctaStyle: "",
    customInstructions: "",
  });

  const [winningScripts, setWinningScripts] = useState<WinningScript[]>([]);
  const [newScript, setNewScript] = useState({ title: "", content: "", signal: "The Topic Resonated" });

  useEffect(() => {
    if (editId) {
      const fetchClient = async () => {
        try {
          const res = await fetch(`/api/clients`);
          if (!res.ok) {
            toast("error", "API Error", "Failed to load clients list.");
            return;
          }
          const clients = await res.json();
          const client = (Array.isArray(clients) ? clients : []).find((c: any) => c.id === editId);
          if (client) {
            setFormData({
              name: client.name,
              niche: client.niche,
              platform: client.platform,
              language: client.language,
              duration: client.duration,
              targetAudience: client.targetAudience,
              tonePersona: client.tonePersona || client.tone || "",
              vocabularyLevel: client.vocabularyLevel || client.vocabulary || "",
              preferredTopics: client.preferredTopics || client.topics || "",
              avoidTopics: client.avoidTopics,
              ctaStyle: client.ctaStyle,
              customInstructions: client.customInstructions || "",
            });
            setWinningScripts(client.examples || client.winningScripts || []);
          }
        } catch (error) {
          toast("error", "Failed to load client data", "Could not retrieve the client profile.");
        } finally {
          setIsLoading(false);
        }
      };
      fetchClient();
    }
  }, [editId]);

  const addWinningScript = () => {
    if (!newScript.title || !newScript.content) {
      toast("warning", "Missing Information", "Please provide both title and content for the script");
      return;
    }
    const script: WinningScript = {
      id: window.crypto.randomUUID(),
      title: newScript.title,
      content: newScript.content,
      signal: newScript.signal,
      useAsReference: true,
    };
    setWinningScripts([...winningScripts, script]);
    setNewScript({ title: "", content: "", signal: "The Topic Resonated" });
  };

  const removeWinningScript = (id: string) => {
    setWinningScripts((Array.isArray(winningScripts) ? winningScripts : []).filter(s => s.id !== id));
  };

  const toggleReference = (id: string) => {
    setWinningScripts((Array.isArray(winningScripts) ? winningScripts : []).map(s => 
      s.id === id ? { ...s, useAsReference: !s.useAsReference } : s
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast("error", "Client Name is required", "Please provide a name for the client profile.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        examples: winningScripts,
        ...(editId ? { id: editId } : {})
      };

      const res = await fetch("/api/clients", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast("success", editId ? "Client updated!" : "Client created!", `Profile for ${formData.name} is now live in Script Studio.`);
        router.push("/clients");
      } else {
        toast("error", "Failed to save client", "The server returned an error.");
      }
    } catch (error) {
      toast("error", "An error occurred while saving", "Failed to communicate with the server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-12 text-center text-[#8892A4]">Loading client data...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="flex items-center justify-between">
        <Link 
          href="/clients"
          className="flex items-center gap-2 text-[#8892A4] hover:text-[#F0F2F7] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <h1 className="font-['Syne'] font-[800] text-[24px] text-[#F0F2F7]">
          {editId ? "Edit Client Profile" : "Create New Client Profile"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: BASIC INFO */}
        <div className="glass-surface rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
            <User className="w-5 h-5 text-[#3BFFC8]" />
            <h2 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">Basic Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">Client Name *</label>
              <input 
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. Dr. Fitness For All"
                className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#3BFFC8]/50 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">Niche</label>
              <select 
                value={formData.niche}
                onChange={(e) => setFormData({...formData, niche: e.target.value})}
                className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#3BFFC8]/50 outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="">Select Niche</option>
                <option value="Health & Fitness">Health & Fitness</option>
                <option value="Technology">Technology</option>
                <option value="Finance">Finance</option>
                <option value="Education">Education</option>
                <option value="Lifestyle">Lifestyle</option>
                <option value="Business">Business</option>
                <option value="Entertainment">Entertainment</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">Platform</label>
              <select 
                value={formData.platform}
                onChange={(e) => setFormData({...formData, platform: e.target.value})}
                className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#3BFFC8]/50 outline-none transition-all"
              >
                <option value="Instagram">Instagram</option>
                <option value="YouTube Shorts">YouTube Shorts</option>
                <option value="TikTok">TikTok</option>
                <option value="LinkedIn">LinkedIn</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">Primary Language</label>
              <select 
                value={formData.language}
                onChange={(e) => setFormData({...formData, language: e.target.value})}
                className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#3BFFC8]/50 outline-none transition-all"
              >
                <option value="English">English</option>
                <option value="Hinglish">Hinglish</option>
                <option value="Hindi">Hindi</option>
                <option value="Gujarati">Gujarati</option>
                <option value="Marathi">Marathi</option>
                <option value="Bengali">Bengali</option>
                <option value="Tamil">Tamil</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">Typical Duration</label>
              <select 
                value={formData.duration}
                onChange={(e) => setFormData({...formData, duration: e.target.value})}
                className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#3BFFC8]/50 outline-none transition-all"
              >
                <option value="15s">15 Seconds</option>
                <option value="30s">30 Seconds</option>
                <option value="45s">45 Seconds</option>
                <option value="60s">60 Seconds</option>
                <option value="75s">75 Seconds</option>
                <option value="90s">90 Seconds</option>
                <option value="105s">105 Seconds</option>
                <option value="120s">120 Seconds</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 2: AUDIENCE & VOICE */}
        <div className="glass-surface rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
            <Target className="w-5 h-5 text-[#FF3B57]" />
            <h2 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">Audience & Voice</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">Target Audience</label>
              <textarea 
                value={formData.targetAudience}
                onChange={(e) => setFormData({...formData, targetAudience: e.target.value})}
                placeholder="Describe who this content is for..."
                rows={3}
                className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#FF3B57]/50 outline-none transition-all resize-none"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">Tone & Persona</label>
                <input 
                  type="text"
                  value={formData.tonePersona}
                  onChange={(e) => setFormData({...formData, tonePersona: e.target.value})}
                  placeholder="e.g. Authoritative yet friendly"
                  className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#FF3B57]/50 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">Vocabulary Level</label>
                <input 
                  type="text"
                  value={formData.vocabularyLevel}
                  onChange={(e) => setFormData({...formData, vocabularyLevel: e.target.value})}
                  placeholder="e.g. Simple, no jargon"
                  className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#FF3B57]/50 outline-none transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: TOPICS & CTA */}
        <div className="glass-surface rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
            <Mic2 className="w-5 h-5 text-[#A78BFA]" />
            <h2 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">Topics & Interaction</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">Preferred Topics</label>
              <textarea 
                value={formData.preferredTopics}
                onChange={(e) => setFormData({...formData, preferredTopics: e.target.value})}
                placeholder="Topics they love covering..."
                rows={4}
                className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#A78BFA]/50 outline-none transition-all resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider text-[#FF3B57]">Avoid Topics</label>
              <textarea 
                value={formData.avoidTopics}
                onChange={(e) => setFormData({...formData, avoidTopics: e.target.value})}
                placeholder="Red flags and off-limits subjects..."
                rows={4}
                className="w-full bg-[#080A0F]/50 border border-[rgba(255,59,87,0.2)] rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#FF3B57]/50 outline-none transition-all resize-none"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-[12px] font-bold text-[#5A6478] uppercase tracking-wider">CTA Style</label>
            <input 
              type="text"
              value={formData.ctaStyle}
              onChange={(e) => setFormData({...formData, ctaStyle: e.target.value})}
              placeholder="e.g. Soft landing with engagement questions"
              className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-3 text-[#F0F2F7] focus:border-[#A78BFA]/50 outline-none transition-all"
            />
          </div>
        </div>

        {/* SECTION 4: WINNING SCRIPTS */}
        <div className="glass-surface rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-2">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#3BFFC8]" />
              <h2 className="font-['Syne'] font-[700] text-[16px] text-[#F0F2F7]">Winning Scripts</h2>
            </div>
            <div className="text-[11px] text-[#5A6478] bg-white/5 px-2 py-1 rounded">
              {winningScripts.length} Added
            </div>
          </div>

          <div className="space-y-4">
            {/* SCRIPT LIST */}
            <div className="space-y-3">
              {(Array.isArray(winningScripts) ? winningScripts : []).map((script) => (
                <div key={script.id} className="p-4 bg-white/5 border border-white/10 rounded-xl relative group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-[#F0F2F7] text-[14px]">{script.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 font-bold uppercase">
                            Signal: {script.signal}
                          </span>
                          {script.useAsReference && (
                            <span className="text-[9px] bg-[#3BFFC8]/10 text-[#3BFFC8] px-1.5 py-0.5 rounded border border-[#3BFFC8]/20 font-bold uppercase">
                              Reference ON
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[12px] text-[#8892A4] mt-1 line-clamp-2">{script.content}</p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        type="button"
                        onClick={() => toggleReference(script.id)}
                        className={`p-2 rounded-lg transition-all ${script.useAsReference ? 'text-[#3BFFC8]' : 'text-[#5A6478]'}`}
                        title={script.useAsReference ? "Don't use as reference" : "Use as reference"}
                      >
                         {script.useAsReference ? <CheckCircle2 className="w-4.5 h-4.5" /> : <AlertCircle className="w-4.5 h-4.5" />}
                      </button>
                      <button 
                        type="button"
                        onClick={() => removeWinningScript(script.id)}
                        className="p-2 text-[#5A6478] hover:text-[#FF3B57] transition-all"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ADD SCRIPT FORM */}
            <div className="bg-[#080A0F]/30 p-4 rounded-xl border border-dashed border-white/10 space-y-4">
              <input 
                type="text"
                placeholder="Script Title (e.g. Viral Morning Walk Video)"
                value={newScript.title}
                onChange={(e) => setNewScript({...newScript, title: e.target.value})}
                className="w-full bg-transparent border-b border-white/10 px-0 py-2 text-[#F0F2F7] focus:border-[#3BFFC8]/50 outline-none transition-all text-sm"
              />
              <textarea 
                placeholder="Paste the script content here..."
                rows={4}
                value={newScript.content}
                onChange={(e) => setNewScript({...newScript, content: e.target.value})}
                className="w-full bg-transparent border-b border-white/10 px-0 py-2 text-[#F0F2F7] focus:border-[#3BFFC8]/50 outline-none transition-all text-sm resize-none"
              />
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#5A6478] uppercase tracking-wider">The Winning Signal *</label>
                <select 
                  value={newScript.signal}
                  onChange={(e) => setNewScript({...newScript, signal: e.target.value})}
                  className="w-full bg-[#080A0F]/50 border border-white/10 rounded-xl px-4 py-2 text-[#F0F2F7] focus:border-[#3BFFC8]/50 outline-none transition-all text-xs"
                >
                  <option value="The Topic Resonated">The Topic Resonated</option>
                  <option value="Stronger Packaging">Stronger Packaging</option>
                  <option value="Different Style/Format">Different Style/Format</option>
                  <option value="Emotional Hook">Emotional Hook</option>
                </select>
              </div>
              <button 
                type="button"
                onClick={addWinningScript}
                className="flex items-center gap-2 text-[#3BFFC8] text-[12px] font-bold hover:gap-3 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add to Winning Scripts
              </button>
            </div>
          </div>
        </div>

        {/* SECTION: GOD MODE */}
        <div className="mt-2 bg-black/20 border border-white/10 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <span className="text-purple-400">⚡️</span> Master AI Directives
            <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-purple-400/60 bg-purple-400/10 px-2 py-1 rounded-full">God Mode</span>
          </h3>
          <p className="text-white/50 text-sm mb-4">
            Paste the exact persona, strict formatting rules, or "Zero-Excuse" policies the AI must follow for this client. This overrides all default AI behaviors.
          </p>
          <textarea
            value={formData.customInstructions}
            onChange={(e) => setFormData({...formData, customInstructions: e.target.value})}
            placeholder="e.g. This GPT embodies Devi Mam AI... It speaks in gentle Hinglish... Always attach AutoDM product..."
            className="w-full bg-[#0A0A0A] border border-white/10 rounded-lg p-4 text-sm text-white/90 placeholder-white/20 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 outline-none min-h-[300px] resize-y transition-all"
          />
        </div>

        {/* SUBMIT AREA */}
        <div className="glass-surface rounded-[14px] flex items-center justify-end gap-4 p-4 mt-2">
          <button 
            type="button"
            onClick={() => router.push("/clients")}
            className="px-6 py-[9px] rounded-[8px] font-['DM_Sans'] text-[12.5px] font-[700] text-[#8892A4] bg-white/5 border border-white/10 hover:bg-white/10 hover:text-[#F0F2F7] transition-all"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 bg-[#3BFFC8] text-[#080A0F] px-8 py-[9px] rounded-[8px] font-['DM_Sans'] text-[12.5px] font-[700] shadow-[0_0_16px_rgba(59,255,200,0.25)] cursor-pointer hover:shadow-[0_0_24px_rgba(59,255,200,0.4)] transition disabled:opacity-50"
          >
            {isSubmitting ? (
              "Saving..."
            ) : (
              <>
                <Save className="w-5 h-5" />
                {editId ? "Update Client Profile" : "Save Client Profile"}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewClientPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FormContent />
    </Suspense>
  );
}
