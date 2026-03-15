export type AIProvider = "openai" | "gemini" | "claude";
export type TranscriptionEngine = "openai_whisper" | "gemini_audio";
export type AnalysisEngine = "openai_gpt4o" | "gemini_1_5_pro";
export type CreativeEngine = "claude_3_5_sonnet" | "gpt_4o" | "gemini_1_5_pro";

export interface LocalSettings {
  apifyApiKey: string;
  aiProvider: AIProvider;
  aiKeys: Record<AIProvider, string>;
  openaiApiKey: string;
  geminiApiKey: string;
  anthropicApiKey: string;
  defaultTranscriptionEngine: TranscriptionEngine;
  defaultAnalysisEngine: AnalysisEngine;
  defaultCreativeEngine: CreativeEngine;
}

export const LOCAL_SETTINGS_KEY = "instagram_analyzer_keys";
export const POSTS_CACHE_KEY = "instagram_analyzer_posts_cache";
export const ANALYSIS_CACHE_KEY = "instagram_analyzer_analysis_cache";
export const SCRIPT_WORKFLOW_PAYLOAD_KEY = "instagram_analyzer_script_workflow_payload";

export const PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: "openai", label: "OpenAI (GPT-4o)" },
  { value: "gemini", label: "Gemini (1.5 Pro)" },
  { value: "claude", label: "Claude (3.5 Sonnet)" },
];

export const PROVIDER_PLACEHOLDERS: Record<AIProvider, string> = {
  openai: "Enter your OpenAI API Key...",
  gemini: "Enter your Gemini API Key...",
  claude: "Enter your Claude API Key...",
};

export const TRANSCRIPTION_ENGINE_OPTIONS: Array<{ value: TranscriptionEngine; label: string }> = [
  { value: "openai_whisper", label: "OpenAI Whisper" },
  { value: "gemini_audio", label: "Gemini Audio" },
];

export const ANALYSIS_ENGINE_OPTIONS: Array<{ value: AnalysisEngine; label: string }> = [
  { value: "openai_gpt4o", label: "OpenAI GPT-4o" },
  { value: "gemini_1_5_pro", label: "Gemini 1.5 Pro" },
];

export const CREATIVE_ENGINE_OPTIONS: Array<{
  value: CreativeEngine;
  label: string;
  description: string;
}> = [
  {
    value: "claude_3_5_sonnet",
    label: "Claude 3.5 Sonnet",
    description: "Best for human-like copywriting",
  },
  {
    value: "gpt_4o",
    label: "GPT-4o",
    description: "Best for structured logic",
  },
  {
    value: "gemini_1_5_pro",
    label: "Gemini 1.5 Pro",
    description: "Best for speed and context",
  },
];

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  apifyApiKey: "",
  aiProvider: "openai",
  aiKeys: {
    openai: "",
    gemini: "",
    claude: "",
  },
  openaiApiKey: "",
  geminiApiKey: "",
  anthropicApiKey: "",
  defaultTranscriptionEngine: "openai_whisper",
  defaultAnalysisEngine: "openai_gpt4o",
  defaultCreativeEngine: "claude_3_5_sonnet",
};

type UnknownRecord = Record<string, unknown>;

function parseProvider(value: unknown): AIProvider {
  if (value === "openai" || value === "gemini" || value === "claude") {
    return value;
  }

  return "openai";
}

function parseTranscriptionEngine(value: unknown): TranscriptionEngine {
  if (value === "openai_whisper" || value === "gemini_audio") {
    return value;
  }

  return DEFAULT_LOCAL_SETTINGS.defaultTranscriptionEngine;
}

function parseAnalysisEngine(value: unknown): AnalysisEngine {
  if (value === "openai_gpt4o" || value === "gemini_1_5_pro") {
    return value;
  }

  return DEFAULT_LOCAL_SETTINGS.defaultAnalysisEngine;
}

function parseCreativeEngine(value: unknown): CreativeEngine {
  if (value === "claude_3_5_sonnet" || value === "gpt_4o" || value === "gemini_1_5_pro") {
    return value;
  }

  return DEFAULT_LOCAL_SETTINGS.defaultCreativeEngine;
}

export function parseLocalSettings(raw: string | null): LocalSettings {
  if (!raw) {
    return DEFAULT_LOCAL_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as UnknownRecord;
    const aiProvider = parseProvider(parsed.aiProvider);

    const aiKeys: Record<AIProvider, string> = {
      ...DEFAULT_LOCAL_SETTINGS.aiKeys,
    };

    if (parsed.aiKeys && typeof parsed.aiKeys === "object") {
      const rawAiKeys = parsed.aiKeys as UnknownRecord;
      for (const key of Object.keys(aiKeys) as AIProvider[]) {
        aiKeys[key] = typeof rawAiKeys[key] === "string" ? (rawAiKeys[key] as string) : aiKeys[key];
      }
    }

    if (typeof parsed.openaiApiKey === "string" && !aiKeys.openai) {
      aiKeys.openai = parsed.openaiApiKey;
    }
    if (typeof parsed.geminiApiKey === "string" && !aiKeys.gemini) {
      aiKeys.gemini = parsed.geminiApiKey;
    }
    if (typeof parsed.anthropicApiKey === "string" && !aiKeys.claude) {
      aiKeys.claude = parsed.anthropicApiKey;
    }

    return {
      apifyApiKey: typeof parsed.apifyApiKey === "string" ? parsed.apifyApiKey : "",
      aiProvider,
      aiKeys,
      openaiApiKey: typeof parsed.openaiApiKey === "string" ? parsed.openaiApiKey : aiKeys.openai,
      geminiApiKey: typeof parsed.geminiApiKey === "string" ? parsed.geminiApiKey : aiKeys.gemini,
      anthropicApiKey: typeof parsed.anthropicApiKey === "string" ? parsed.anthropicApiKey : aiKeys.claude,
      defaultTranscriptionEngine:
        typeof parsed.defaultTranscriptionEngine === "string"
          ? parseTranscriptionEngine(parsed.defaultTranscriptionEngine)
          : DEFAULT_LOCAL_SETTINGS.defaultTranscriptionEngine,
      defaultAnalysisEngine:
        typeof parsed.defaultAnalysisEngine === "string"
          ? parseAnalysisEngine(parsed.defaultAnalysisEngine)
          : aiProvider === "gemini"
            ? "gemini_1_5_pro"
            : "openai_gpt4o",
      defaultCreativeEngine:
        typeof parsed.defaultCreativeEngine === "string"
          ? parseCreativeEngine(parsed.defaultCreativeEngine)
          : aiProvider === "claude"
            ? "claude_3_5_sonnet"
            : aiProvider === "gemini"
              ? "gemini_1_5_pro"
              : "gpt_4o",
    };
  } catch {
    return DEFAULT_LOCAL_SETTINGS;
  }
}
