/**
 * Normalize scripts for pacing / fluff analysis: drop structure-only lines
 * and recap labels so line counts match spoken content.
 */

const BRACKET_ONLY = /^\s*\[[^\]]+\]\s*$/;
const RECAP_OR_META = /^\s*(quick\s*recap|recap|in\s*summary|tldr|hook\s*[+/&]\s*cta|hook\s*\+\s*cta)\b/i;

export function isSpokenLineForPacing(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (BRACKET_ONLY.test(t)) return false;
  if (RECAP_OR_META.test(t)) return false;
  return true;
}

/** Lines that count as “spoken” for pacing segments (1-based indexing in prompts). */
export function getSpokenLinesForPacing(script: string): string[] {
  return script.split(/\r?\n/).filter(isSpokenLineForPacing);
}

export function buildNumberedSpokenScriptForPacing(script: string): { lines: string[]; numbered: string } {
  const lines = getSpokenLinesForPacing(script);
  const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
  return { lines, numbered };
}

/** Script for fluff highlights / visuals — one block without bracket-only lines. */
export function scriptBodyForAuxiliaryAI(script: string): string {
  return getSpokenLinesForPacing(script).join("\n");
}

export function clampPacingSegment(
  seg: { lineStart: number; lineEnd: number; status: string; note: string },
  maxLine: number,
): { lineStart: number; lineEnd: number; status: string; note: string } {
  const lo = Math.max(1, Math.min(seg.lineStart, maxLine));
  const hi = Math.max(1, Math.min(seg.lineEnd, maxLine));
  return {
    ...seg,
    lineStart: Math.min(lo, hi),
    lineEnd: Math.max(lo, hi),
  };
}
