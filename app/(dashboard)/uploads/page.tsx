"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useState, useEffect } from "react";
import type { AnalyzeResponse, InstagramPost } from "@/lib/types";
import { Upload, X, FileVideo, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { useToast } from "@/app/components/UI/Toast";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import { ANALYSIS_CACHE_KEY } from "@/lib/client-settings";

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

  useEffect(() => {
    if (!isAnalyzing) return;

    // Cycle progress label text for UX
    const states = ["Uploading...", "Processing...", "Analyzing with AI...", "Generating breakdown..."];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % states.length;
      setProgressLabel(states[i]);
    }, 4500); // Wait longer on 'Analyzing with AI'

    return () => clearInterval(interval);
  }, [isAnalyzing]);

  async function processFile(file: File, input?: HTMLInputElement) {
    if (!file || isAnalyzing) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast("error", "File Too Large", "Video exceeds 50MB limit. Please upload a smaller file.");
      if (input) input.value = "";
      return;
    }

    const allowedMimeTypes = new Set(["video/mp4", "video/quicktime", "video/mov"]);
    if (!allowedMimeTypes.has(file.type) && !file.name.match(/\.(mp4|mov)$/i)) {
      toast("error", "Invalid Format", "Unsupported file type. Please upload an MP4 or MOV file.");
      if (input) input.value = "";
      return;
    }

    setError("");
    setSelectedFile(file);
    setIsAnalyzing(true);
    setProgressLabel("Uploading...");

    const getStoredKey = (keyName: string) => {
      const val = localStorage.getItem(keyName);
      return val && val !== "undefined" && val !== "null" ? val.trim() : "";
    };

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/analyze-manual", {
        method: "POST",
        body: formData, // No Content-Type header
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Failed to analyze uploaded video.");
      }

      const analysisData = (await response.json()) as ManualAnalyzeResponse;
      const transcript = (analysisData.transcript || "").trim();
      const newId = analysisData.id || `manual-${Date.now()}`;
      const localVideoUrl = URL.createObjectURL(file);
      const nowIso = new Date().toISOString();

      const post: InstagramPost = {
        id: newId,
        username: "manual_upload",
        followersCount: 0,
        shortcode: newId,
        permalink: "#",
        caption: analysisData.analysis.summary.coreIdea || "Manual upload analysis",
        mediaType: "REEL",
        isVideo: true,
        videoUrl: localVideoUrl,
        postedAt: nowIso,
        metrics: { views: 0, likes: 0, comments: 0, saves: 0, shares: 0 },
        engagementCount: 0,
        engagementRate: 0,
        zScores: { views: 0, likes: 0, comments: 0, saves: 0, shares: 0 },
        outlierScore: analysisData.analysis.outlierScore || 0,
        isOutlier: (analysisData.analysis.outlierScore || 0) >= 2,
      };

      const analysis: AnalyzeResponse = {
        ...analysisData,
        analysis: {
          ...analysisData.analysis,
          breakdownBlocks: {
            ...analysisData.analysis.breakdownBlocks,
            problemAndSolution: transcript || analysisData.analysis.breakdownBlocks.problemAndSolution,
          },
        },
      };

      const savedVideoData: SavedVideoData = {
        savedAt: nowIso,
        post,
        analysis,
      };

      // Instant UI update — push new record to card grid
      const newDbRecord: DbUpload = { id: newId, fileName: file.name, analysis, transcript, createdAt: nowIso };
      setDbUploads(prev => [newDbRecord, ...prev]);

      // Save History to localStorage
      const rawHistory = localStorage.getItem(ANALYZED_HISTORY_KEY);
      const existing = (Array.isArray(rawHistory ? JSON.parse(rawHistory!) : [])) ? JSON.parse(rawHistory!) : [];
      localStorage.setItem(ANALYZED_HISTORY_KEY, JSON.stringify([savedVideoData, ...existing]));

      // Save Cache so refresh works
      const analysesRaw = localStorage.getItem(ANALYSIS_CACHE_KEY);
      const cachedAnalyses = analysesRaw ? JSON.parse(analysesRaw) : {};
      localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify({ ...cachedAnalyses, [newId]: analysis }));

      const postsRaw = localStorage.getItem("instagram-posts-cache");
      const cachedPosts = postsRaw ? JSON.parse(postsRaw) : {};
      localStorage.setItem("instagram-posts-cache", JSON.stringify({ ...cachedPosts, [newId]: post }));

      router.push(`/videos/${newId}`);
    } catch (uploadError) {
      toast("error", "Analysis Failed", uploadError instanceof Error ? uploadError.message : "Failed to analyze video.");
      setIsAnalyzing(false);
      setSelectedFile(null);
    } finally {
      if (input) input.value = "";
    }
  }

  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this upload?")) return;

    // Updates local state
    const updated = (Array.isArray(recentUploads) ? recentUploads : []).filter(u => u.post.id !== id);
    setRecentUploads(updated);

    // Updates localStorage
    try {
      const raw = localStorage.getItem(ANALYZED_HISTORY_KEY);
      if (raw) {
        const parsed = (Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []) as SavedVideoData[];
        const next = parsed.filter(item => item?.post?.id !== id);
        localStorage.setItem(ANALYZED_HISTORY_KEY, JSON.stringify(next));
      }

      // Also clean up cache
      const analysesRaw = localStorage.getItem(ANALYSIS_CACHE_KEY);
      if (analysesRaw) {
        const cachedAnalyses = JSON.parse(analysesRaw);
        delete cachedAnalyses[id];
        localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(cachedAnalyses));
      }

      const postsRaw = localStorage.getItem("instagram-posts-cache");
      if (postsRaw) {
        const cachedPosts = JSON.parse(postsRaw);
        delete cachedPosts[id];
        localStorage.setItem("instagram-posts-cache", JSON.stringify(cachedPosts));
      }

      toast("success", "Upload Deleted", "The video has been removed from your history.");
    } catch {
      toast("error", "Deletion Failed", "Could not remove the video from storage.");
    }
  }

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
              accept="video/mp4,video/quicktime"
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
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#5A6478]">{(selectedFile?.size ? (selectedFile.size / 1024 / 1024).toFixed(2) : "0")} MB</span>
              </div>
              <button disabled className="w-[28px] h-[28px] rounded-full border border-[rgba(255,255,255,0.08)] text-[#8892A4] flex items-center justify-center bg-transparent cursor-not-allowed opacity-50">
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {(Array.isArray(dbUploads) ? dbUploads : []).map((item) => (
                  <div key={item.id} className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.07] rounded-[16px] overflow-hidden hover:border-[rgba(255,59,87,0.35)] transition-all group">
                    {/* Top: Video Thumbnail or Placeholder */}
                    <div className="relative w-full aspect-video bg-[#0d1117] overflow-hidden">
                      {item.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.thumbnail} alt={item.fileName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0d1117] via-[#111620] to-[#0d1117]">
                          <div className="flex flex-col items-center gap-2 text-white/20">
                            <FileVideo size={32} strokeWidth={1} />
                            <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-widest">{item.fileName.replace(/\.[^.]+$/, "")}</span>
                          </div>
                        </div>
                      )}
                      <span className="absolute top-3 right-3 px-[8px] py-[3px] rounded-full font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.05em] bg-[rgba(255,59,87,0.15)] text-[#FF3B57] border border-[rgba(255,59,87,0.25)]">
                        Analyzed
                      </span>
                    </div>
                    {/* Bottom: Info + Action */}
                    <div className="p-4">
                      <p className="font-['DM_Sans'] font-[600] text-[14px] text-[#F0F2F7] truncate mb-1 group-hover:text-[#FF3B57] transition-colors">
                        {item.fileName}
                      </p>
                      <p className="font-['JetBrains_Mono'] text-[10px] text-[#5A6478] mb-4">
                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                      <button
                        onClick={() => router.push(`/videos/${item.id}`)}
                        className="w-full bg-[rgba(255,59,87,0.1)] border border-[rgba(255,59,87,0.3)] text-[#FF3B57] py-[9px] rounded-[10px] font-['DM_Sans'] text-[13px] font-[600] hover:bg-[#FF3B57] hover:text-white transition-all"
                      >
                        View Full Analysis
                      </button>
                    </div>
                  </div>
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
