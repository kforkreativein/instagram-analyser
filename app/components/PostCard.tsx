"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import type { InstagramPost } from "../../lib/types";
import Skeleton from "./UI/Skeleton";

interface PostCardProps {
  post: InstagramPost;
  onAnalyze: (post: InstagramPost) => void;
}

export default function PostCard({ post, onAnalyze }: PostCardProps) {
  const [hasAutoplayAttempted, setHasAutoplayAttempted] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const mediaImage = post.displayUrl;

  return (
    <article className="rounded-xl border border-[#2c2c2e] bg-[#111113] p-4 transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)] hover:-translate-y-[2px]">
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl border border-[#2c2c2e] bg-black">
          <div className="relative aspect-[9/16] w-full">
            {post.videoUrl ? (
              <video
                src={`${post.videoUrl}#t=0.001`}
                preload="metadata"
                playsInline
                controls
                controlsList="nodownload"
                className="h-full w-full object-cover"
                onCanPlay={(event) => {
                  if (hasAutoplayAttempted) return;

                  const video = event.currentTarget;
                  video.muted = true;
                  setHasAutoplayAttempted(true);

                  video.play().catch(() => {
                    // Ignore autoplay rejections; user can still press play with sound controls.
                  });
                }}
              />
            ) : mediaImage ? (
              <div className="relative h-full w-full">
                {mediaLoading && <Skeleton width="100%" height="100%" borderRadius="0" className="absolute inset-0 z-10" />}
                <img
                  src={mediaImage}
                  alt={post.caption || "Instagram post"}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                  onLoad={() => setMediaLoading(false)}
                />
                {!mediaLoading && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <Play className="h-14 w-14 text-white/50" fill="rgba(255,255,255,0.2)" />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid h-full w-full place-items-center text-xs text-gray-500">No media preview</div>
            )}

            {/* Glass Badge Overlay */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 z-20 pointer-events-none">
              {/* Views Badge - Bottom Left */}
              <div className="flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur-md border border-emerald-500/30 rounded-md">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-white">
                  {post.metrics.views.toLocaleString()}
                </span>
              </div>

              {/* Outlier Badge - Bottom Right */}
              <div className="flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur-md border border-rose-500/30 rounded-md">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[10px] font-bold text-white">
                  {post.outlierScore.toFixed(1)}x
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-gray-400">{post.mediaType}</p>
            <p className="text-sm text-gray-200">{post.caption || "No caption available."}</p>
            <p className="text-xs text-gray-400">
              Likes {post.metrics.likes.toLocaleString()} | Comments {post.metrics.comments.toLocaleString()}
            </p>
          </div>

          <button
            onClick={() => onAnalyze(post)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#FF3B57] px-4 text-sm font-semibold text-white transition-all duration-200 hover:shadow-[0_0_16px_rgba(255,59,87,0.3)] hover:-translate-y-[1px] active:scale-[0.98]"
          >
            Analyze Video
          </button>
        </div>
      </div>
    </article>
  );
}
