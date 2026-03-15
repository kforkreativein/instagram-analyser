"use client";

import { BarChart3, Eye, Info, MessageCircle, MousePointerClick, ThumbsUp, TrendingUp, Users } from "lucide-react";
import type { InstagramPost } from "../../lib/types";
import { calculateOutlierScore } from "../../lib/utils";
import Skeleton from "./UI/Skeleton";

interface MetricsProps {
  post?: InstagramPost;
  channelMedianViews?: number;
  loading?: boolean;
}

function formatOneDecimal(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1).replace(/\.0$/, "")}%`;
}

function formatFollowers(value: number): string {
  if (value >= 1_000_000) {
    const compact = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
    return `${compact.toUpperCase()} followers`;
  }

  return `${value.toLocaleString()} channel followers`;
}

export default function Metrics({ post, channelMedianViews = 0, loading = false }: MetricsProps) {
  if (loading || !post) {
    return (
      <section className="bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl p-5">
        <div className="flex items-center gap-2 text-blue-400 mb-4">
          <BarChart3 size={16} />
          <h3 className="text-sm font-semibold text-white">Metrics</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl p-4 border border-white/5 bg-white/5 space-y-2">
              <Skeleton width="40%" height="10px" />
              <Skeleton width="70%" height="16px" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const views = post.metrics.views;
  const likes = post.metrics.likes;
  const comments = post.metrics.comments;
  const followersCount = typeof post.followersCount === "number" && Number.isFinite(post.followersCount) ? post.followersCount : 0;
  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
  const outlierScore = calculateOutlierScore(views, channelMedianViews);

  return (
    <section className="bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl p-5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-all duration-300">
      <div className="flex items-center gap-2 text-blue-400">
        <BarChart3 size={16} />
        <h3 className="text-sm font-semibold text-white">Metrics</h3>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="rounded-xl p-3 flex flex-col items-center justify-center gap-1 font-semibold text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} />
            <span>{outlierScore !== null ? `${formatOneDecimal(outlierScore)}x outlier score` : "N/A outlier score"}</span>
            <span title="How far this reel outperformed your baseline.">
              <Info size={14} className="opacity-50" />
            </span>
          </div>
        </div>

        <div className="rounded-xl p-3 flex flex-col items-center justify-center gap-1 font-semibold text-sm border bg-blue-500/10 border-blue-500/20 text-blue-400">
          <div className="flex items-center gap-2">
            <Eye size={16} />
            <span>{views.toLocaleString()} views</span>
          </div>
        </div>

        <div className="rounded-xl p-3 flex flex-col items-center justify-center gap-1 font-semibold text-sm border bg-orange-500/10 border-orange-500/20 text-orange-400">
          <div className="flex items-center gap-2">
            <MousePointerClick size={16} />
            <span>{formatPercent(engagementRate)} engagement rate</span>
            <span title="Calculated as (likes + comments) / views.">
              <Info size={14} className="opacity-50" />
            </span>
          </div>
        </div>

        <div className="rounded-xl p-3 flex flex-col items-center justify-center gap-1 font-semibold text-sm border bg-purple-500/10 border-purple-500/20 text-purple-400">
          <div className="flex items-center gap-2">
            <ThumbsUp size={16} />
            <span>{likes.toLocaleString()} likes</span>
          </div>
        </div>

        <div className="rounded-xl p-3 flex flex-col items-center justify-center gap-1 font-semibold text-sm border bg-yellow-500/10 border-yellow-500/20 text-yellow-400">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} />
            <span>{comments.toLocaleString()} comments</span>
          </div>
        </div>

        <div className="rounded-xl p-3 flex flex-col items-center justify-center gap-1 font-semibold text-sm border bg-gray-500/10 border-gray-500/20 text-gray-400">
          <div className="flex items-center gap-2">
            <Users size={16} />
            <span>{followersCount > 0 ? formatFollowers(followersCount) : "Followers hidden"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
