"use client";

import { useRouter } from "next/navigation";
import { Search, FileEdit, Plus, Trash2 } from "lucide-react";
import EmptyState from "@/app/components/UI/EmptyState";
import { useState, useEffect } from "react";

export default function ScriptsDashboardPage() {
  const router = useRouter();
  const [scripts, setScripts] = useState<any[]>([]);

  useEffect(() => {
    async function loadScripts() {
      try {
        const res = await fetch("/api/scripts/load");
        const { data } = await res.json();
        setScripts(data.scripts || []);
      } catch (err) {
        // Fallback to localStorage if API fails
        const raw = localStorage.getItem("scripts_history");
        if (raw) {
          try {
            setScripts(JSON.parse(raw));
          } catch {
            setScripts([]);
          }
        }
      }
    }
    void loadScripts();
  }, []);

  const handleDeleteScript = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent navigating to the editor

    // Optimistic UI Update
    const previousScripts = [...scripts];
    setScripts((scripts || []).filter(s => s.id !== id));

    try {
      const response = await fetch("/api/scripts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }
    } catch (err) {
      console.error("Failed to delete script:", err);
      // Rollback on failure
      setScripts(previousScripts);
      alert("Failed to delete script. Please try again.");
    }
  };

  return (
    <div className="flex w-full min-h-screen text-[var(--text)] flex-col relative z-10 pb-[60px]">
      <div className="w-full flex-shrink-0 p-0">
        <div className="mx-auto w-full">

          {/* HEADER SECTION */}
          <header className="mb-[32px] mt-[10px]">
            <div className="flex items-center gap-[8px] mb-[12px]">
              <div className="w-[16px] h-[1px] bg-[#10b981]"></div>
              <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#10b981]">
                Content Creation
              </span>
              <div className="w-[16px] h-[1px] bg-[#10b981]"></div>
            </div>
            <h1 className="font-['Syne'] font-[800] text-[clamp(28px,4vw,40px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7] mb-[10px]">
              Script<br />
              <span className="text-[#3BFFC8]">Studio</span>
            </h1>
            <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65]">
              Write high-performing scripts backed by proven storytelling frameworks.
            </p>
          </header>

          {/* ACTIONS ROW */}
          <div className="flex items-center flex-wrap gap-[10px] mb-[24px]">
            <div className="flex items-center gap-[8px]">
              <h2 className="font-['Syne'] font-[700] text-[14px] text-[#F0F2F7]">Your Scripts</h2>
              <span className="bg-[#111620] text-[#8892A4] border border-[rgba(255,255,255,0.06)] px-[8px] py-[2px] rounded-full font-['JetBrains_Mono'] text-[10px]">{scripts.length} {scripts.length === 1 ? 'script' : 'scripts'}</span>
            </div>

            <button
              type="button"
              onClick={() => router.push("/scripts/editor")}
              className="ml-auto bg-pink-500/10 text-pink-400 border border-pink-500/35 p-[9px_18px] rounded-[8px] font-['DM_Sans'] text-[13px] font-[600] shadow-[0_0_16px_rgba(236,72,153,0.25)] transition-all pointer-events-auto hover:bg-pink-500 hover:text-white hover:shadow-[0_0_24px_rgba(236,72,153,0.45)] hover:-translate-y-[1px] cursor-pointer"
            >
              ✦ New Script
            </button>
          </div>

          {/* SEARCH + FILTER ROW */}
          <div className="flex items-center gap-[10px] mb-[20px]">
            <div className="flex-1 relative flex items-center">
              <span className="absolute left-[16px] text-[#5A6478]">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search scripts by title or content..."
                className="w-full bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-[10px] p-[10px_16px_10px_40px] font-['DM_Sans'] text-[13px] text-[#F0F2F7] outline-none transition duration-150 focus:border-[rgba(59,255,200,0.4)] focus:shadow-[0_0_14px_rgba(59,255,200,0.12)] placeholder:text-[#5A6478]"
              />
            </div>
            <select className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-[10px] p-[10px_16px] font-['DM_Sans'] text-[13px] text-[#F0F2F7] outline-none transition duration-150 focus:border-[rgba(59,255,200,0.35)] hover:border-white/[0.1] cursor-pointer min-w-[130px]">
              <option>All Types</option>
              <option>Remix</option>
              <option>Original</option>
              <option>Manual</option>
            </select>
            <select className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-[10px] p-[10px_16px] font-['DM_Sans'] text-[13px] text-[#F0F2F7] outline-none transition duration-150 focus:border-[rgba(59,255,200,0.35)] hover:border-white/[0.1] cursor-pointer min-w-[150px]">
              <option>Newest First</option>
              <option>Oldest First</option>
              <option>Most Recent Edit</option>
            </select>
          </div>

          {/* SCRIPTS TABLE */}
          <div className="glass-surface glow-green rounded-[14px] overflow-hidden">
            {/* Table Header Row */}
            <div className="grid grid-cols-[minmax(0,1fr)_100px_140px_120px] p-[10px_20px] border-b border-white/[0.05] bg-white/[0.02]">
              <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-[#5A6478]">NAME</span>
              <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-[#5A6478]">TYPE</span>
              <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-[#5A6478]">CREATED</span>
              <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-[#5A6478] text-right">ACTIONS</span>
            </div>

            {/* Data Rows (Mocked for now) */}
            <div className="flex flex-col">
              {scripts.length === 0 ? (
                <EmptyState
                  icon={<FileEdit size={36} />}
                  title="No scripts found"
                  description="You haven't created any scripts yet. Start by remixing a viral video or writing from scratch."
                  action={
                    <button
                      onClick={() => router.push("/scripts/editor")}
                      className="inline-flex items-center gap-2 bg-pink-500/10 text-pink-400 border border-pink-500/35 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-pink-500 hover:text-white hover:shadow-[0_0_16px_rgba(236,72,153,0.4)] transition-all"
                    >
                      <Plus size={16} />
                      Create First Script
                    </button>
                  }
                  className="py-[60px]"
                />
              ) : (
                scripts.map((script, idx) => (
                  <div
                    key={script.id || idx}
                    onClick={() => router.push(`/scripts/editor?id=${script.id}`)}
                    className="grid grid-cols-[minmax(0,1fr)_100px_140px_120px] p-[14px_20px] border-b border-white/[0.03] items-center cursor-pointer transition-all duration-150 hover:bg-white/[0.03] hover:shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] group"
                  >
                    <div className="flex flex-col min-w-0 pr-[16px]">
                      <span className="font-['DM_Sans'] font-[600] text-[14px] text-[#F0F2F7] mb-[2px] truncate group-hover:text-[#3BFFC8] transition-colors">
                        {script.title || "Untitled Script"}
                      </span>
                      <span className="font-['DM_Sans'] text-[11.5px] text-[#5A6478] truncate">
                        {script.content?.substring(0, 100) || "No content..."}
                      </span>
                    </div>
                    <div>
                      <span className="inline-block bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.22)] text-[#A78BFA] p-[3px_9px] rounded-[20px] font-['DM_Sans'] text-[11px] font-[500]">
                        {script.type || 'Original'}
                      </span>
                    </div>
                    <div className="font-['JetBrains_Mono'] text-[11px] text-[#5A6478]">
                      {script.createdAt ? new Date(script.createdAt).toLocaleDateString() : 'Today'}
                    </div>
                    <div className="flex gap-[6px] justify-end">
                      <button className="bg-transparent border border-white/[0.08] text-[#8892A4] p-[4px_10px] text-[11px] rounded-[6px] font-['JetBrains_Mono'] hover:text-[#3BFFC8] hover:border-[rgba(59,255,200,0.35)] hover:shadow-[0_0_10px_rgba(59,255,200,0.18)] transition-all cursor-pointer">
                        Open
                      </button>
                      <button
                        onClick={(e) => handleDeleteScript(e, script.id)}
                        className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                        title="Delete Script"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
