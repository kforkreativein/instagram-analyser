/**
 * Game Theory Mode — per the "Game Theory.md" vault document
 * Instagram is two completely separate games; mixing them kills both.
 *
 * Game A — Awareness:  maximize total views, broad TAM, humor/awe/curiosity hooks
 * Game B — Conversion: maximize on-target views, narrow TAM, tactical-solve hooks, DM/sales CTA
 */

export type GameMode = "awareness" | "conversion";

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  awareness: "Awareness",
  conversion: "Conversion",
};

export const GAME_MODE_DESCRIPTIONS: Record<GameMode, string> = {
  awareness:
    "Maximize total views. Broad topic TAM, humor/awe/curiosity hooks, brand-deal CTA.",
  conversion:
    "Maximize on-target views only. Narrow TAM, tactical-solve hooks, off-platform CTA (DMs/sales).",
};

/** System-prompt fragments injected into each AI call */
export const GAME_MODE_PROMPTS: Record<GameMode, {
  packaging: string;
  script: string;
  hook: string;
  viralScore: string;
  carousel: string;
}> = {
  awareness: {
    packaging: `
GAME MODE: AWARENESS
The client is playing the Awareness Game — maximise total reach.
- Favour packaging lenses with the widest possible TAM (Total Addressable Market).
- Prioritise entertainment, curiosity, and awe-based angles.
- Rank lenses that attract passive scrollers and general audiences higher.
- Penalise lenses that are niche, professional, or require prior knowledge to engage.`,

    script: `
GAME MODE: AWARENESS
This script is for the Awareness Game — maximise total views and reach.
- Open with a broad, universally relatable hook (humor, shock, curiosity, awe).
- Avoid jargon, niche vocabulary, or insider references that exclude casual viewers.
- CTA should be brand/awareness-focused (follow, share, explore) — NOT a sales pitch.
- Keep the TAM wide: anyone could watch this and get value.`,

    hook: `
GAME MODE: AWARENESS
Prioritise hooks that maximise curiosity, humor, shock, or awe.
- Best mechanisms: Curiosity Gap, Shock Value, Relatable Observation, Entertainment.
- Avoid hooks that gate entry (only people with X problem will click).
- The hook should work for a passive scroller with no prior knowledge of the niche.`,

    viralScore: `
GAME MODE: AWARENESS
When scoring virality, reward:
- Large TAM (topic appeals to a broad audience)
- High shareability potential
- Strong curiosity/entertainment pull
Penalise heavy niche specificity or conversion-first framing.`,

    carousel: `
GAME MODE: AWARENESS
Design carousel slides for maximum share and save.
- Cover slide hook should be universally relatable.
- Content should feel educational and broadly valuable.
- CTA should encourage following/sharing, not off-platform conversion.`,
  },

  conversion: {
    packaging: `
GAME MODE: CONVERSION
The client is playing the Conversion Game — maximise on-target views that lead to DMs/sales.
- Favour packaging lenses that speak to active buyers with a specific pain point.
- Deliberately NARROW the TAM — broader audiences diluting conversion metrics is harmful.
- Reject entertainment-first or humor-only lenses; they attract wrong-fit followers.
- Rank lenses that trigger "this is exactly my problem" recognition.`,

    script: `
GAME MODE: CONVERSION
This script is for the Conversion Game — maximise on-target views that convert.
- Open with a pain-specific hook that qualifies the viewer immediately.
- Include a TACTICAL, NON-OBVIOUS SOLVE — something the viewer could not Google easily.
- CTA must be conversion-oriented: direct to DMs, booking link, or off-platform purchase.
- Deliberately narrow TAM: losing passive viewers is acceptable; only keep ideal buyers.
- Structure: Problem → Tactical Solve → Proof/Credibility → Conversion CTA.`,

    hook: `
GAME MODE: CONVERSION
Prioritise hooks that qualify buyers and trigger identity/pain recognition.
- Best mechanisms: Identity Trigger, Specific Pain Point, Social Proof, Polarising Statement.
- The hook should pre-qualify the viewer (ideal buyers self-select in; others opt out).
- Avoid broad humor/entertainment hooks — they attract the wrong audience.`,

    viralScore: `
GAME MODE: CONVERSION
When scoring virality, reward:
- Specificity of pain point addressed
- Presence of a tactical non-obvious solve
- Conversion-oriented CTA clarity
- Identity/authority signals
Penalise broad TAM framing and entertainment-only hooks.`,

    carousel: `
GAME MODE: CONVERSION
Design carousel slides as a lead-generation asset.
- Cover: specific problem statement that qualifies the viewer.
- Body slides: tactical solve, proof, credibility.
- Final CTA: direct conversion action (DM "word", book a call, link in bio).`,
  },
};

/**
 * Returns the game-mode prompt fragment for a given feature area,
 * or empty string if gameMode is undefined/null.
 */
export function getGameModePrompt(
  gameMode: string | null | undefined,
  area: keyof (typeof GAME_MODE_PROMPTS)[GameMode]
): string {
  if (!gameMode || (gameMode !== "awareness" && gameMode !== "conversion")) {
    return "";
  }
  return GAME_MODE_PROMPTS[gameMode as GameMode][area];
}
