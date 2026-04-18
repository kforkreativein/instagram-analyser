/**
 * Builds a single prompt appendix from optional client fields (used by script APIs).
 */

export type ClientVoicePayload = {
  scriptMasterGuide?: string | null;
  customInstructions?: string | null;
  tonePersona?: string | null;
  niche?: string | null;
  targetAudience?: string | null;
  language?: string | null;
  avoidTopics?: string | null;
  preferredTopics?: string | null;
  ctaStyle?: string | null;
  vocabularyLevel?: string | null;
};

const MAX_MASTER = 100_000;
const MAX_CUSTOM = 20_000;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n[…truncated for model context…]`;
}

export function buildClientVoiceAppendix(c: ClientVoicePayload | null | undefined): string {
  if (!c) return "";

  const blocks: string[] = [];

  const master = clip(typeof c.scriptMasterGuide === "string" ? c.scriptMasterGuide : "", MAX_MASTER);
  const custom = clip(typeof c.customInstructions === "string" ? c.customInstructions : "", MAX_CUSTOM);

  if (master) {
    blocks.push(
      `=========================================================\nCLIENT MASTER SCRIPT GUIDE (follow for voice, structure, taboos, CTAs, and remix behavior)\n=========================================================\n${master}`,
    );
  }

  if (custom && custom !== master) {
    blocks.push(`\n--- Additional short directives ---\n${custom}`);
  }

  const tone = (c.tonePersona || "").trim();
  const niche = (c.niche || "").trim();
  const audience = (c.targetAudience || "").trim();
  const lang = (c.language || "").trim();
  const avoid = (c.avoidTopics || "").trim();
  const pref = (c.preferredTopics || "").trim();
  const cta = (c.ctaStyle || "").trim();
  const vocab = (c.vocabularyLevel || "").trim();

  const profileLines = [
    tone && `Tone / persona: ${tone}`,
    niche && `Niche: ${niche}`,
    audience && `Target audience: ${audience}`,
    lang && `Language: ${lang}`,
    vocab && `Vocabulary level: ${vocab}`,
    pref && `Preferred topics: ${pref}`,
    avoid && `Avoid: ${avoid}`,
    cta && `CTA style: ${cta}`,
  ].filter(Boolean);

  if (profileLines.length) {
    blocks.push(`\n--- Client profile (summary) ---\n${profileLines.join("\n")}`);
  }

  if (!blocks.length) return "";

  return `\n\n${blocks.join("\n")}\n\nSTRICT: When the master guide conflicts with generic advice, follow the master guide.\n`;
}
