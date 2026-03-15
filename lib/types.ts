export const METRIC_KEYS = ["views", "likes", "comments", "saves", "shares"] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export type DateRangeOption = "1M" | "3M" | "12M";
export type DateRangeInput = DateRangeOption | "Past 1 Month" | "Past 3 Months" | "Past 12 Months";

export const DATE_RANGE_TO_MONTHS: Record<DateRangeOption, number> = {
  "1M": 1,
  "3M": 3,
  "12M": 12,
};

export const DATE_RANGE_LABELS: Record<DateRangeOption, string> = {
  "1M": "Past 1 Month",
  "3M": "Past 3 Months",
  "12M": "Past 12 Months",
};

export type InstagramPostFormat = "REEL" | "CAROUSEL" | "IMAGE" | "SHORTS" | "TIKTOK" | "YOUTUBE" | "UNKNOWN";

export interface PostMetrics {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export type ZScoreMap = Record<MetricKey, number>;

export interface InstagramPost {
  id: string;
  username: string;
  followersCount?: number;
  authorAverageViews?: number;
  shortcode?: string;
  permalink: string;
  caption: string;
  mediaType: InstagramPostFormat;
  isVideo: boolean;
  displayUrl?: string;
  videoUrl?: string;
  coverUrl?: string;
  thumbnailUrl?: string;
  postedAt: string;
  metrics: PostMetrics;
  engagementCount: number;
  engagementRate: number;
  zScores: ZScoreMap;
  outlierScore: number;
  isOutlier: boolean;
  calculatedMetrics?: {
    outlierScore: number;
    engagementRate: number;
  };
}

export interface ClientTrackedVideo {
  id: string;
  url: string;
  platform: string;
  thumbnailUrl?: string; // Adding for UI
  title?: string;        // Adding for UI
  metrics: PostMetrics;
  analysis: DeepAnalysis | null;
  addedAt: string;
  lastRefreshed: string;
}

export type StyleDNA = {
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

export type Client = {
  id: string;
  name: string;
  niche: string;
  platform: string;
  language: string;
  duration: string;
  targetAudience: string;
  // Audience & Voice
  tonePersona: string;
  vocabularyLevel: string;
  // Topics & Interaction
  preferredTopics: string;
  avoidTopics: string;
  ctaStyle: string;
  // Backward-compat aliases (kept for existing data)
  tone?: string;
  vocabulary?: string;
  topics?: string;
  preferredHooks: string[];
  // Winning Scripts — stored as `examples` (few-shot for AI)
  examples: WinningScriptExample[];
  /** @deprecated use examples */
  winningScripts?: any[];
  customInstructions: string;
  trackedVideos: ClientTrackedVideo[];
  styleDNA: StyleDNA;
  createdAt: string;
};

export type WinningScriptExample = {
  id: string;
  title: string;
  content: string;
  signal: string;
  useAsReference: boolean;
};

export interface MetricStats {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
}

export type MetricStatsMap = Record<MetricKey, MetricStats>;

export interface FormatShowdownEntry {
  format: Exclude<InstagramPostFormat, "UNKNOWN">;
  postCount: number;
  averageViews: number;
  averageEngagementCount: number;
  averageEngagementRate: number;
}

export interface InstagramOutlierResponse {
  username: string;
  dateRange: DateRangeOption;
  outlierThreshold: number;
  totalPosts: number;
  filteredPosts: number;
  metricStats: MetricStatsMap;
  formatShowdown: FormatShowdownEntry[];
  outliers: InstagramPost[];
  posts: InstagramPost[];
  source: "apify" | "mock";
  warnings: string[];
}

export interface WatchlistChannel {
  username: string;
  platform: string;
  url?: string;
  followers?: number | string | null;
  miningQuadrant?: string;
  profilePicUrl?: string;
  isVerified?: boolean;
  biography?: string;
}

export interface NamedWatchlist {
  id: string;
  name: string;
  profiles: WatchlistChannel[];
  createdAt: string;
}

export interface HookAnalysis {
  type: string;
  description: string;
  frameworks: string[];
  justification: string;
  visual_hook?: string;
}

export interface StructureAnalysis {
  type: string;
  description: string;
  bestFor: string;
  justification: string;
}

export interface StyleAnalysis {
  tone: string;
  voice: string;
  wordChoice: string;
  pacing: string;
}

export interface BreakdownBlocks {
  hook: string;
  cta: string;
  targetAudienceAndTone: string;
  problemAndSolution: string;
  audioAndAtmosphere: string;
  audioVibe?: string;
  keyVisuals?: string;
  keyTakeaways: string[];
}

export interface ContentSummary {
  coreIdea: string;
  outlierPotential: string;
  actionableImprovements: string[];
}

export interface DeepAnalysis {
  narrative: {
    topic: string;
    seed: string;
    substance: string;
    storyStructure: string;
  };
  hooks: {
    spokenHook: string;
    visualHook: string;
    textHook: string;
    hookType: string;
  };
  architecture: {
    visualLayout: string;
    visualElements: string;
    keyVisuals: string;
    audio: string;
  };
  conversion: {
    cta: string;
  };
}

export interface AIAnalysis {
  hookAnalysis: HookAnalysis;
  structureAnalysis: StructureAnalysis;
  styleAnalysis: StyleAnalysis;
  breakdownBlocks: BreakdownBlocks;
  summary: ContentSummary;
  deepAnalysis?: DeepAnalysis;
  vision_patterns?: {
    lighting: string;
    setting: string;
    format: string;
  };
  firstFrameThumbnail?: string;
  outlierScore?: number;
}

export interface ScriptWorkflowPayload {
  sourcePost: Pick<InstagramPost, "id" | "username" | "caption" | "permalink" | "postedAt" | "metrics">;
  analysis: AIAnalysis;
  transcript: string;
  generatedAt: string;
}

export type RepurposeType = "youtube_script" | "linkedin_post" | "twitter_thread";

export interface RepurposedContent {
  type: RepurposeType;
  language: string;
  content: string;
}

export interface AnalyzeRequestBody {
  post: {
    id?: string;
    caption?: string;
    transcript?: string;
    mediaType?: InstagramPostFormat;
    permalink?: string;
    metrics?: Partial<PostMetrics>;
    displayUrl?: string;
    authorAverageViews?: number;
  };
  language?: string;
  outputType?: "analysis" | RepurposeType;
  engine?: "openai_gpt4o" | "gemini_1_5_pro";
  openaiApiKey?: string;
  geminiApiKey?: string;
  platform?: "instagram" | "youtube";
}

export interface AnalyzeResponse {
  analysis: AIAnalysis;
  repurposedContent?: RepurposedContent;
  source: "openai" | "gemini" | "anthropic" | "mock";
  model: string;
  generatedAt: string;
}
