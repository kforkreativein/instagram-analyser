/**
 * Hold 4, Twist 1 — generic short-form remix framework (no client-specific names).
 * Maps UI attributes Idea | Format | Hook | Script | Visual to five content buckets.
 */

export const REMIX_CONTENT_BUCKETS = [
  {
    id: "Format",
    label: "Format",
    description: "Video style: talking head, voiceover, reaction, B-roll heavy, cuts pace.",
  },
  {
    id: "Idea",
    label: "Idea",
    description: "Topic + angle — what the video is fundamentally about.",
  },
  {
    id: "Hook",
    label: "Hook",
    description: "First ~3 seconds: spoken line + on-screen text + opening visual.",
  },
  {
    id: "Script",
    label: "Script / structure",
    description: "Beat-by-beat pacing, sections, re-hooks, and story flow.",
  },
  {
    id: "Visual",
    label: "Visuals & edit",
    description: "B-roll, text overlays, editing energy, pattern of cuts.",
  },
] as const;

export type RemixBucketId = (typeof REMIX_CONTENT_BUCKETS)[number]["id"];

/** Default twist when the competitor is otherwise strong. */
export const DEFAULT_TWIST_BUCKET: RemixBucketId = "Hook";

const SCRIPT_JOB_GUIDANCE: Record<string, string> = {
  Views: "Maximize cold reach: broad pain, simple language, curiosity-first hook, shareable framing.",
  Followers: "Build trust: slightly deeper insight, recognizable voice, reason to follow beyond one video.",
  Leads: "Clear problem–solution; one primary CTA (e.g. comment keyword → guide); no competing asks.",
  Sales: "Conversion-aware: stronger proof, risk reversal, explicit next step — use sparingly vs organic reels.",
};

export function normalizeRemixBucket(raw: string): RemixBucketId {
  const t = raw.trim();
  const match = REMIX_CONTENT_BUCKETS.find((b) => b.id === t);
  if (match) return match.id;
  if (/visual|edit/i.test(t)) return "Visual";
  if (/format|style.*video/i.test(t)) return "Format";
  if (/hook/i.test(t)) return "Hook";
  if (/script|story|structure|flow/i.test(t)) return "Script";
  if (/idea|angle|topic/i.test(t)) return "Idea";
  return "Hook";
}

/**
 * System/user prompt fragment for LLM remix generation.
 */
export function buildHoldTwistPromptBlock(params: {
  twistBucket: string;
  videoGoal: string;
}): string {
  const twist = normalizeRemixBucket(params.twistBucket);
  const goalKey =
    Object.keys(SCRIPT_JOB_GUIDANCE).find((k) =>
      params.videoGoal.toLowerCase().includes(k.toLowerCase()),
    ) || "Views";
  const jobLine = SCRIPT_JOB_GUIDANCE[goalKey] ?? SCRIPT_JOB_GUIDANCE.Views;

  const lockList = REMIX_CONTENT_BUCKETS.filter((b) => b.id !== twist)
    .map((b) => `- **${b.label}** (${b.id}): keep aligned with the source — same role in the video, same rough pacing/weight unless a small tighten improves clarity.`)
    .join("\n");

  const twistBucketMeta = REMIX_CONTENT_BUCKETS.find((b) => b.id === twist);

  return `
=== HOLD 4, TWIST 1 (REMIX FRAMEWORK) ===
Every outlier short can be described as **five buckets**: Format, Idea, Hook, Script/structure, Visuals/edit.

**Rule:** Lock **four** buckets to match the reference transcript and analysis. Rebuild **exactly one** bucket from scratch for maximum impact.

**This run — twist only:** **${twist}** (${twistBucketMeta?.description ?? "selected bucket"}).
**Lock without re-inventing:** the other four buckets — stay faithful to the source video's job in the narrative.

${lockList}

**Before writing:** Treat the script's **job** as: **${params.videoGoal || "Views (broad appeal)"}**
${jobLine}

**Matching the original (for locked buckets):**
- Similar total length and section weight (hook vs body vs CTA) unless the twist bucket forces a small adjustment.
- Preserve psychological trigger type (curiosity, social proof, contrast, etc.) where you are *locking* — do not swap the whole video's strategy; only the twisted bucket may jump tracks.

**Twist bucket (${twist}):** Fully re-imagine this layer for the chosen hook style / structure — do not paste the original opening or original on-screen logic if this bucket is Hook or Visual.

Default industry practice when unsure: twist **Hook** first; user explicitly chose **${twist}** for this generation.
=== END HOLD 4, TWIST 1 ===
`.trim();
}
