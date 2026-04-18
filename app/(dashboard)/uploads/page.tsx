"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useState, useEffect } from "react";
import { upload } from '@vercel/blob/client';
import type { AnalyzeResponse, InstagramPost } from "@/lib/types";
import { Upload, X, FileVideo, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { useToast } from "@/app/components/UI/Toast";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import { ANALYSIS_CACHE_KEY, LOCAL_SETTINGS_KEY, parseLocalSettings } from "@/lib/client-settings";

type SavedVideoData = {
  savedAt: string;
  post: InstagramPost;
  analysis: AnalyzeResponse;
};

type DbUpload = {
  id: string;
  fileName: string;
  analysis: AnalyzeResponse;
  transcript?: string;
  thumbnail?: string | null;
  createdAt: string;
};

type ManualAnalyzeResponse = AnalyzeResponse & {
  id?: string;
  transcript?: string;
};

const ANALYZED_HISTORY_KEY = "analyzed_history";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export default function UploadsPage() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progressLabel, setProgressLabel] = useState("Uploading...");
  const [recentUploads, setRecentUploads] = useState<SavedVideoData[]>([]);
  const [dbUploads, setDbUploads] = useState<DbUpload[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    // Load from DB (persisted server-side)
    fetch("/api/uploads")
      .then((r) => {
        if (!r.ok) {
          setDbUploads([]);
          return { uploads: [] };
        }
        return r.json();
      })
      .then((data: { uploads?: DbUpload[] }) => setDbUploads(Array.isArray(data.uploads) ? data.uploads : []))
      .catch(() => { setDbUploads([]); });

    // Also load localStorage history
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(ANALYZED_HISTORY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SavedVideoData[];
          const manual = (Array.isArray(parsed) ? parsed : []).filter(item => item?.post?.username === "manual_upload");
          setRecentUploads(manual);
        }
      } catch { }
    }
  }, []);

  const PROGRESS_STATES = ["Uploading to cloud...", "Queuing analysis job...", "Transcribing speech...", "Analyzing with AI...", "Generating breakdown..."];

  useEffect(() => {
    if (!isAnalyzing) return;
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % PROGRESS_STATES.length;
      setProgressLabel(PROGRESS_STATES[i]);
    }, 4500);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // Poll for job completion with timeout
  useEffect(() => {
    if (!activeJobId || !activeUploadId) return;

    const MAX_POLL_ATTEMPTS = 100; // 5 minutes (100 * 3s)
    let attempts = 0;

    const pollInterval = setInterval(async () => {
      attempts++;
      setPollAttempts(attempts);

      // Timeout after max attempts
      if (attempts > MAX_POLL_ATTEMPTS) {
        clearInterval(pollInterval);
        setActiveJobId(null);
        setActiveUploadId(null);
        setIsAnalyzing(false);
        setSelectedFile(null);
        setPollAttempts(0);
        toast("error", "Analysis Timeout", "Processing took too long. This may be due to Vercel's 10-second function limit on Free tier. Try a shorter video or upgrade your plan.");
        
        // Mark job as failed in database
        fetch(`/api/analyze-video/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: activeJobId }),
        }).catch(() => {});
        return;
      }

      try {
        const res = await fetch(`/api/analyze-video/status?jobId=${activeJobId}`);
        if (!res.ok) {
          console.error(`[Polling] Status check failed: ${res.status}`);
          return;
        }
        
        const data = await res.json() as { status: string; id: string; error?: string };

        if (data.status === "COMPLETED") {
          clearInterval(pollInterval);
          setActiveJobId(null);
          setActiveUploadId(null);
          setIsAnalyzing(false);
          setSelectedFile(null);
          setPollAttempts(0);
          
          // Refresh upload list then navigate
          fetch("/api/uploads")
            .then(r => r.json())
            .then((d: { uploads?: DbUpload[] }) => { if (Array.isArray(d.uploads)) setDbUploads(d.uploads); })
            .catch(() => {});
          
          toast("success", "Analysis Complete", "Your video has been analyzed successfully!");
          router.push(`/videos/${data.id}`);
        } else if (data.status === "FAILED") {
          clearInterval(pollInterval);
          setActiveJobId(null);
          setActiveUploadId(null);
          setIsAnalyzing(false);
          setSelectedFile(null);
          setPollAttempts(0);
          
          const errorMsg = data.error || "The AI pipeline encountered an error. Check your API keys in Settings.";
          toast("error", "Analysis Failed", errorMsg);
        }
      } catch (err) {
        console.error("[Polling] Error:", err);
        // Non-fatal polling error — keep trying unless max attempts reached
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [activeJobId, activeUploadId, router, toast]);

  async function processFile(file: File, input?: HTMLInputElement) {
    if (!file || isAnalyzing) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast("error", "File Too Large", "Video exceeds 50MB limit. Please upload a smaller file.");
      if (input) input.value = "";
      return;
    }

    const allowedMimeTypes = new Set(["video/mp4", "video/quicktime", "video/mov", "video/x-msvideo", ""]);
    if (!allowedMimeTypes.has(file.type) && !file.name.match(/\.(mp4|mov|avi)$/i)) {
      toast("error", "Invalid Format", "Unsupported file type. Please upload an MP4, MOV, or AVI file.");
      if (input) input.value = "";
      return;
    }

    // Estimate processing time based on file size
    const fileSizeMB = file.size / 1024 / 1024;
    const estimatedSeconds = Math.ceil(30 + (fileSizeMB * 2)); // Base 30s + 2s per MB
    setEstimatedTime(`~${estimatedSeconds}s`);

    setError("");
    setSelectedFile(file);
    setIsAnalyzing(true);
    setPollAttempts(0);
    setProgressLabel("Uploading to cloud...");

    let queuedJobId: string | null = null;

    try {
      // 1. Upload directly to Vercel Blob
      const newBlob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      });

      setProgressLabel("Queuing analysis job...");

      // 2. Register the job (creates DB record, returns jobId immediately)
      const startRes = await fetch("/api/analyze-video/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: newBlob.url, fileName: file.name }),
      });

      if (!startRes.ok) {
        const errData = (await startRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Failed to queue analysis job.");
      }

      const { jobId, uploadId } = await startRes.json() as { jobId: string; uploadId: string };
      queuedJobId = jobId;

      setProgressLabel("Transcribing & analyzing (1–4 min for typical shorts)…");

      const ls = typeof window !== "undefined" ? parseLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY)) : null;
      const geminiApiKey =
        (typeof window !== "undefined" && localStorage.getItem("geminiApiKey")?.trim()) || ls?.geminiApiKey || "";
      const openaiApiKey =
        (typeof window !== "undefined" && localStorage.getItem("openAiApiKey")?.trim()) || ls?.openaiApiKey || "";
      const anthropicApiKey =
        (typeof window !== "undefined" && localStorage.getItem("anthropicApiKey")?.trim()) || ls?.anthropicApiKey || "";
      const activeProvider =
        (typeof window !== "undefined" && localStorage.getItem("activeProvider")?.trim()) || "Gemini";

      // 3. Run worker and wait — avoids infinite spinner when the job never flips to COMPLETED (e.g. missing keys, timeouts).
      const workerRes = await fetch("/api/analyze-video/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          videoUrl: newBlob.url,
          fileName: file.name,
          geminiApiKey: geminiApiKey || undefined,
          openaiApiKey: openaiApiKey || undefined,
          anthropicApiKey: anthropicApiKey || undefined,
          activeProvider,
        }),
      });

      if (!workerRes.ok) {
        const errData = (await workerRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Analysis failed. Check API keys and try a shorter/smaller clip.");
      }

      setActiveJobId(null);
      setActiveUploadId(null);
      setIsAnalyzing(false);
      setSelectedFile(null);
      setPollAttempts(0);

      void fetch("/api/uploads")
        .then((r) => r.json())
        .then((d: { uploads?: DbUpload[] }) => {
          if (Array.isArray(d.uploads)) setDbUploads(d.uploads);
        })
        .catch(() => {});

      toast("success", "Analysis Complete", "Opening your breakdown…");
      router.push(`/videos/${uploadId}`);
    } catch (uploadError) {
      const errorMsg = uploadError instanceof Error ? uploadError.message : "Failed to start analysis.";
      console.error("[Upload] Error:", uploadError);
      if (queuedJobId) {
        void fetch("/api/analyze-video/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: queuedJobId }),
        }).catch(() => {});
      }
      setError(errorMsg);
      toast("error", "Upload Failed", errorMsg);
      setIsAnalyzing(false);
      setSelectedFile(null);
      setPollAttempts(0);
      setActiveJobId(null);
      setActiveUploadId(null);
    } finally {
      if (input) input.value = "";
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this analysis?")) return;

    try {
      const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
      if (res.ok) {
        // Remove from DB card grid
        setDbUploads(prev => prev.filter(item => item.id !== id));

        // Clean up localStorage caches
        const analysesRaw = localStorage.getItem(ANALYSIS_CACHE_KEY);
        if (analysesRaw) {
          const cached = JSON.parse(analysesRaw);
          delete cached[id];
          localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(cached));
        }
        const postsRaw = localStorage.getItem("instagram-posts-cache");
        if (postsRaw) {
          const cached = JSON.parse(postsRaw);
          delete cached[id];
          localStorage.setItem("instagram-posts-cache", JSON.stringify(cached));
        }

        toast("success", "Deleted", "Analysis removed successfully.");
      } else {
        toast("error", "Deletion Failed", "Could not delete the analysis.");
      }
    } catch {
      toast("error", "Deletion Failed", "An error occurred while deleting.");
    }
  };

  const handleCancelAnalysis = async () => {
    if (!activeJobId) return;

    if (!confirm("Are you sure you want to cancel this analysis?")) return;

    try {
      await fetch(`/api/analyze-video/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: activeJobId }),
      });

      setActiveJobId(null);
      setActiveUploadId(null);
      setIsAnalyzing(false);
      setSelectedFile(null);
      setPollAttempts(0);
      toast("info", "Cancelled", "Analysis has been cancelled.");
    } catch {
      toast("error", "Cancellation Failed", "Could not cancel the analysis.");
    }
  };

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) processFile(file, event.target);
  }

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };


  return (
    <div className="flex w-full min-h-screen text-[var(--text)] flex-col relative z-10 pb-[100px]">
      <div className="mx-auto w-full flex flex-col items-center">

        {/* HEADER SECTION */}
        <header className="mb-[32px] text-center flex flex-col items-center mt-[20px]">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <div className="w-[16px] h-[1px] bg-[#FF3B57]"></div>
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#FF3B57]">
              DIRECT IMPORT
            </span>
            <div className="w-[16px] h-[1px] bg-[#FF3B57]"></div>
          </div>
          <h1 className="font-['Syne'] font-[800] text-[clamp(28px,4vw,40px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7] mb-[10px]">
            Manual<br />
            <span className="text-[#FF3B57]">Upload</span>
          </h1>
          <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65] mb-[28px]">
            Upload a short-form video directly from your computer to generate a full AI breakdown.
          </p>
        </header>

        {/* CONDITIONAL RENDER: UPLOAD ZONE vs PROGRESS */}
        {!isAnalyzing ? (
          <div
            className={`w-full max-w-[680px] relative overflow-hidden bg-white/[0.04] backdrop-blur-3xl rounded-[18px] border-[2px] border-dashed transition-all duration-250 ease-out mb-[32px] p-[56px_40px] text-center cursor-pointer group hover:bg-[rgba(255,59,87,0.04)] hover:border-[rgba(255,59,87,0.5)] hover:shadow-[inset_0_0_40px_rgba(255,59,87,0.07),0_0_20px_rgba(236,72,153,0.1)] ${dragActive ? 'border-[rgba(255,59,87,0.6)] bg-[rgba(255,59,87,0.05)] shadow-[inset_0_0_50px_rgba(255,59,87,0.1)]' : 'border-[rgba(255,255,255,0.1)]'}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {/* Internal Layers */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(255,59,87,0.05)_0%,transparent_65%)] pointer-events-none before-glow"></div>

            <div className="relative flex flex-col items-center z-10">
              <div className={`w-[52px] h-[52px] rounded-full border-[1.5px] border-dashed flex items-center justify-center mb-[20px] transition-all duration-250 ${dragActive ? 'border-[rgba(255,59,87,0.6)] text-[#FF3B57]' : 'border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.3)] group-hover:border-[rgba(255,59,87,0.4)] group-hover:text-[#FF3B57]'}`}>
                <Upload size={22} strokeWidth={2} />
              </div>

              <h3 className="font-['Syne'] font-[700] text-[20px] text-[#F0F2F7] mb-[8px]">
                Drag and drop your video here
              </h3>

              <p className="font-['JetBrains_Mono'] text-[11px] tracking-[0.05em] text-[#5A6478] mb-[6px]">
                MP4, MOV, AVI — up to 50MB
              </p>

              <div className="flex items-center gap-[12px] my-[20px] w-full max-w-[200px]">
                <div className="flex-1 h-[1px] bg-[rgba(255,255,255,0.07)]"></div>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5A6478]">or</span>
                <div className="flex-1 h-[1px] bg-[rgba(255,255,255,0.07)]"></div>
              </div>

              <button
                disabled={isAnalyzing}
                className="bg-[#FF3B57] text-[#080A0F] p-[11px_32px] rounded-[10px] font-['DM_Sans'] text-[13px] font-[700] shadow-[0_4px_16px_rgba(255,59,87,0.2)] transition-all pointer-events-none group-hover:shadow-[0_8px_24px_rgba(255,59,87,0.35)] group-hover:-translate-y-[2px]"
              >
                Select File
              </button>
            </div>

            <input
              type="file"
              accept="video/mp4,video/quicktime,video/x-msvideo"
              onChange={handleFileUpload}
              disabled={isAnalyzing}
              title="Upload file"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-20"
            />
          </div>
        ) : (
          <div className="w-full max-w-[680px] glass-surface rounded-[18px] p-[32px] mb-[48px] mx-auto shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-white/5"></div>
            <div className="flex items-center gap-[14px]">
              <div className="w-[44px] h-[44px] bg-[#111620] border border-[rgba(255,255,255,0.08)] rounded-[10px] flex items-center justify-center text-[#F0F2F7]">
                <FileVideo size={20} strokeWidth={1.5} />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-['DM_Sans'] text-[14px] font-[600] text-[#F0F2F7] truncate">{selectedFile?.name || "Processing video..."}</span>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#5A6478]">
                  {(selectedFile?.size ? (selectedFile.size / 1024 / 1024).toFixed(2) : "0")} MB
                  {estimatedTime && ` • Est. ${estimatedTime}`}
                  {pollAttempts > 0 && ` • Attempt ${pollAttempts}/100`}
                </span>
              </div>
              <button 
                onClick={handleCancelAnalysis}
                className="w-[28px] h-[28px] rounded-full border border-[rgba(255,255,255,0.08)] text-[#8892A4] flex items-center justify-center bg-transparent hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400 transition-all cursor-pointer"
                title="Cancel analysis"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-[20px]">
              <div className="font-['JetBrains_Mono'] text-[10px] uppercase text-[#FF3B57] mb-[8px] animate-pulse">
                {progressLabel}
              </div>
              <div className="w-full h-[4px] bg-[rgba(255,255,255,0.07)] rounded-[2px] overflow-hidden relative">
                <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#FF3B57] to-[#FF3B57] rounded-[2px] animate-[loading-bar_4s_ease-in-out_infinite] w-[40%]"></div>
              </div>
              {pollAttempts > 80 && (
                <p className="font-['JetBrains_Mono'] text-[10px] text-yellow-500 mt-2">
                  ⚠️ Processing is taking longer than expected. This may timeout soon.
                </p>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-[#FF3B57] font-['DM_Sans'] text-[13px] mb-[32px]">{error}</p>}

        {/* RECENT ANALYSES CARD GRID */}
        {!isAnalyzing && (
          <div className="mt-12 pt-8 border-t border-white/10 w-full max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <h3 className="font-['Syne'] font-[700] text-[18px] text-[#F0F2F7]">Recent Analyses</h3>
              {dbUploads.length > 0 && (
                <span className="bg-[#111620] text-[#8892A4] border border-white/[0.06] px-[8px] py-[2px] rounded-full font-['JetBrains_Mono'] text-[10px]">{dbUploads.length}</span>
              )}
            </div>
            {dbUploads.length === 0 ? (
              <p className="text-white/40 text-sm font-['DM_Sans']">No videos uploaded yet. Drop a file above to start.</p>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6 w-full">
              {(Array.isArray(dbUploads) ? dbUploads : []).map((item: any) => (
                <article
                  key={item.id}
                  onClick={() => router.push(`/videos/${item.id}`)}
                  className="group relative flex flex-col justify-between aspect-[9/16] rounded-[16px] overflow-hidden cursor-pointer border border-[rgba(255,255,255,0.08)] bg-[#0D1017] transition-all duration-300 hover:border-[rgba(255,255,255,0.2)] hover:-translate-y-1 hover:shadow-2xl w-full"
                >
                  {/* FIRST FRAME VIDEO THUMBNAIL */}
                  <div className="absolute inset-0 z-0 bg-[#111620]">
                    {item.thumbnail ? (
                      <video
                        src={`${item.thumbnail}#t=0.001`}
                        preload="metadata"
                        muted
                        playsInline
                        className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-300"
                        onLoadedMetadata={(e) => {
                          e.currentTarget.currentTime = 0.001;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/10">No Media</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0D1017] via-[#0D1017]/40 to-transparent"></div>
                  </div>

                  {/* DELETE BUTTON */}
                  <button
                    onClick={(e) => handleDelete(e, item.id)}
                    className="absolute top-3 left-3 z-30 bg-black/60 backdrop-blur-md border border-white/10 rounded-md p-1.5 text-gray-400 hover:bg-red-500/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                    title="Delete Analysis"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                  </button>

                  {/* TOP DATE BADGE */}
                  <div className="absolute top-3 right-3 z-20 bg-black/60 backdrop-blur-md border border-white/10 rounded-md px-2 py-1 font-['JetBrains_Mono'] text-[10px] text-gray-300 pointer-events-none">
                    Saved {new Date(item.createdAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>

                  {/* BOTTOM INFO & BUTTON */}
                  <div className="relative z-10 p-4 w-full flex flex-col gap-3 mt-auto bg-gradient-to-t from-[#0D1017] via-[#0D1017]/90 to-transparent">
                    <h3 className="font-['DM_Sans'] text-[14px] text-white font-medium line-clamp-2 drop-shadow-md">
                      {item.fileName || "Uploaded Video"}
                    </h3>
                    <button className="w-full py-2 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white font-['DM_Sans'] text-[12px] font-medium transition-colors backdrop-blur-sm flex items-center justify-center gap-2">
                      ✦ Open Analysis
                    </button>
                  </div>
                </article>
              ))}
            </div>
            )}
          </div>
        )}

      </div>

      {/* Global CSS injected for the loading bar animation */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes loading-bar {
           0% { left: -40%; width: 40%; }
           50% { left: 100%; width: 10%; }
           100% { left: -40%; width: 40%; }
        }
      `}} />
    </div>
  );
}
