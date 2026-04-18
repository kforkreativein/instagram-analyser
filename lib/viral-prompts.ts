/**
 * Prompt templates for the three viral quality features.
 * Grounded directly in the Social Growth vault source documents.
 */

// ── Feature N1: 9-Attribute Viral Scorer ────────────────────────────────────
// Source: 09_FRAMEWORKS & FORMULAS/The 9 Attributes That Will Change How You View Social Media.md
// Algorithm: Shares × AVD = User Minutes
// Bucket 1 (Getting Attention / Shares): TAM, Explosivity, Emotional Magnitude, Novelty
// Bucket 2 (Holding Attention / AVD): Speed to Value, Curiosity Amplitude, Absorption Rate, Rehook Rate, Stickiness

export function buildViralScorePrompt(params: {
  script: string;
  topic?: string;
  angle?: string;
  clientProfile?: string;
}): string {
  const { script, topic = "", angle = "", clientProfile = "" } = params;
  return `You are an elite social media strategist who scores scripts against the 9 Attributes framework.

FRAMEWORK CONTEXT:
The algorithm pushes videos based on: Shares × Average View Duration (AVD) = User Minutes.
To win, a script must: (1) get shared via Bucket 1 attributes, and (2) hold attention via Bucket 2 attributes.

BUCKET 1 — Getting Attention (Drives Shares):
1. TAM (Total Addressable Market) — How massive is the potential audience who cares about this topic? Tiny niche = low score. Universal pain/desire = high score.
2. Idea Explosivity (Shock Value) — Distance between baseline viewer expectation and the new take/lens introduced. "Clear contact lenses" = 10/100. "Contact lenses that give night vision" = 90/100. Larger gap = higher score.
3. Emotional Magnitude — Intensity of emotional response (humor, outrage, awe, empathy) on 0-100. People share content because they want to offer a shared experience — the deeper the emotion, the more likely the share.
4. Novelty — Is this a first-time angle? If the viewer has already seen 15 versions of this story, score = low. Completely new lens or frame = high score.

BUCKET 2 — Holding Attention (Drives AVD):
5. Speed to Value — How many words pass before the value becomes clear? Every extra second loses 5-10% of viewers. 0-2 sentences to payoff = high score. >5 sentences before payoff = low score.
6. Curiosity Amplitude — How deeply does the script open a subconscious question? Does it force the viewer to stay to close the loop? Score the intensity of the open question on 0-100.
7. Absorption Rate — How easily can a 6th-grader understand and digest this? Short sentences, visual cues implied, plain language = high. Dense jargon-heavy exposition = low.
8. Rehook Rate — Does the script create multiple curiosity loops? In short-form, a rehook is needed around the 20-25 second mark. Count how many loop resets appear (contrast words: but, however, etc.). No resets = low score.
9. Stickiness (Relevance) — Does the topic hit the viewer's #1 pain point or desire? Is this deeply relevant to the target audience? High relevance = stays watching. Low relevance = bounces.

THRESHOLD RULE: Any attribute scoring below 60 MUST receive a concrete, sentence-level rewrite suggestion — not a vague tip.

SCRIPT TO SCORE:
${script}

${topic ? `TOPIC: ${topic}` : ""}
${angle ? `ANGLE: ${angle}` : ""}
${clientProfile ? `CLIENT CONTEXT: ${clientProfile}` : ""}

INSTRUCTIONS:
- Score each of the 9 attributes from 0 to 100 based only on what is in the script.
- For attributes below 60, the "fix" field must contain a specific rewritten line or structural change — not generic advice.
- Calculate: shareScore = average of (TAM, Explosivity, EmotionalMagnitude, Novelty)
- Calculate: avdScore = average of (SpeedToValue, Curiosity, Absorption, RehookRate, Stickiness)
- Calculate: totalScore = (shareScore * 0.45) + (avdScore * 0.55)   [AVD weighted slightly higher — it's what the algorithm measures]
- predictedViralTier: totalScore < 40 = "Low", 40-59 = "Medium", 60-79 = "High", 80+ = "Outlier"
- topFixes: the 3 attributes with lowest scores, each as one actionable sentence

Return ONLY valid JSON, no markdown:
{
  "buckets": {
    "attention": {
      "tam": { "score": number, "reason": string, "fix": string },
      "explosivity": { "score": number, "reason": string, "fix": string },
      "emotionalMagnitude": { "score": number, "reason": string, "fix": string },
      "novelty": { "score": number, "reason": string, "fix": string }
    },
    "retention": {
      "speedToValue": { "score": number, "reason": string, "fix": string },
      "curiosity": { "score": number, "reason": string, "fix": string },
      "absorption": { "score": number, "reason": string, "fix": string },
      "rehookRate": { "score": number, "reason": string, "fix": string },
      "stickiness": { "score": number, "reason": string, "fix": string }
    }
  },
  "shareScore": number,
  "avdScore": number,
  "totalScore": number,
  "predictedViralTier": "Low" | "Medium" | "High" | "Outlier",
  "topFixes": [string, string, string]
}`;
}

// ── Feature N2: Story Locks Analyzer ────────────────────────────────────────
// Source: 09_FRAMEWORKS & FORMULAS/The 6 "Story Locks" to Make Your Content Addictive.md
// The 6 locks: Term Branding, Embedded Truths, Thought Narration, Negative Frames, Loop Openers, Contrast Words

export function buildStoryLocksPrompt(params: {
  script: string;
  clientProfile?: string;
}): string {
  const { script, clientProfile = "" } = params;
  return `You are a storytelling engineer who analyzes scripts for the 6 Story Locks — techniques that make content psychologically addictive.

THE 6 STORY LOCKS (from "The 6 Story Locks to Make Your Content Addictive"):

1. TERM BRANDING — Does the script give a concept or framework a specific, memorable name? (e.g., "The Value Equation", "The Hook Machine"). The labeling effect creates instant anticipation — the moment an idea has a name, viewers feel they NEED to know it. A script with no named framework or concept scores low.

2. EMBEDDED TRUTHS — Does the script frame ideas as established facts rather than possibilities? WEAK WORDS to flag: "if, maybe, might, could, probably, potentially, perhaps". These create "exit doors" where viewers stop and evaluate. They must be replaced with: "when, the reason why, once you see this, what actually happens". Scan every sentence for weak words.

3. THOUGHT NARRATION — Does the script voice what the viewer is thinking in their head? After major points, does the creator acknowledge the viewer's inner monologue? (e.g., "Now, the question you're probably thinking is…"). This creates a hypnotist effect and builds instant trust by making the video feel personalized.

4. NEGATIVE FRAMES — Is advice flipped into loss-aversion framing? Instead of "Here is how to build a personal brand" → "The worst thing you can do for your personal brand is…". Loss aversion: people are 2x more motivated to avoid pain than gain reward. Flag positive-framed advice that could be negatively reframed.

5. LOOP OPENERS — Does the script contain bridge phrases between major sections that reset the viewer's attention timer? Look for: "But actually…", "Most people stop here, but…", "That was important, but this next one is even bigger". Without these, viewers drop off after the initial hook. Flag each major section break.

6. CONTRAST WORDS — Does the script use contrast words to create narrative tension? Target words: "but, actually, instead, turns out, except, yet, however". The word "but" is the most powerful word in storytelling — it shifts from expectation A to reality B. Every major insight benefits from a contrast setup.

SCRIPT TO ANALYZE:
${script}

${clientProfile ? `CLIENT CONTEXT: ${clientProfile}` : ""}

INSTRUCTIONS:
- For each lock, detect if it is present AND assess quality (0-100).
- "evidence": quote the actual lines from the script that demonstrate the lock (empty array if absent).
- "missingIn": describe which section/part of the script is missing this lock (empty array if fully present).
- "fixLine": a ready-to-insert replacement or addition line that adds the lock. Be specific — write actual script copy, not a description of what to write.
- For Embedded Truths specifically: list every weak word found and its replacement.
- For Contrast Words specifically: flag the specific sentences that would benefit from a contrast word injection.
- overallLockScore = average of all 6 quality scores.

Return ONLY valid JSON, no markdown:
{
  "locks": [
    {
      "id": "term_branding",
      "label": "Term Branding",
      "present": boolean,
      "quality": number,
      "evidence": string[],
      "missingIn": string[],
      "fixLine": string
    },
    {
      "id": "embedded_truths",
      "label": "Embedded Truths",
      "present": boolean,
      "quality": number,
      "evidence": string[],
      "missingIn": string[],
      "fixLine": string
    },
    {
      "id": "thought_narration",
      "label": "Thought Narration",
      "present": boolean,
      "quality": number,
      "evidence": string[],
      "missingIn": string[],
      "fixLine": string
    },
    {
      "id": "negative_frames",
      "label": "Negative Frames",
      "present": boolean,
      "quality": number,
      "evidence": string[],
      "missingIn": string[],
      "fixLine": string
    },
    {
      "id": "loop_openers",
      "label": "Loop Openers",
      "present": boolean,
      "quality": number,
      "evidence": string[],
      "missingIn": string[],
      "fixLine": string
    },
    {
      "id": "contrast_words",
      "label": "Contrast Words",
      "present": boolean,
      "quality": number,
      "evidence": string[],
      "missingIn": string[],
      "fixLine": string
    }
  ],
  "overallLockScore": number
}`;
}

// ── Feature N3: Lego Brick Content Dissector (5 bricks) ─────────────────────
// Source: 09_FRAMEWORKS & FORMULAS/The Lego Brick Framework.md
// 5 Categories of Development: Format, Idea, Hook, Script, Edit

export function buildDissectBricksPrompt(params: {
  mode: "from-analysis" | "from-transcript";
  caption?: string;
  transcript?: string;
  hookAnalysis?: string;
  structureAnalysis?: string;
  styleAnalysis?: string;
  breakdownSummary?: string;
  metrics?: { views?: number; likes?: number; comments?: number; shares?: number; followers?: number };
}): string {
  const { mode, caption = "", transcript = "", hookAnalysis = "", structureAnalysis = "", styleAnalysis = "", breakdownSummary = "", metrics } = params;

  const isOutlier = metrics && metrics.views && metrics.followers
    ? metrics.views / metrics.followers >= 5
    : false;

  const metricsContext = metrics
    ? `PERFORMANCE METRICS: ${metrics.views?.toLocaleString() || "?"} views | ${metrics.likes?.toLocaleString() || "?"} likes | ${metrics.followers?.toLocaleString() || "?"} followers | 5X outlier: ${isOutlier ? "YES" : "NO"}`
    : "";

  const analysisContext = mode === "from-analysis"
    ? `
PRE-EXTRACTED ANALYSIS (use as ground truth for bricks):
Hook Analysis: ${hookAnalysis}
Story Structure: ${structureAnalysis}
Style/Visual Analysis: ${styleAnalysis}
Key Breakdown Summary: ${breakdownSummary}
`
    : "";

  return `You are a content engineer using the Lego Brick Framework to dissect and remix short-form video content.

THE 5 LEGO BRICKS (from "The Lego Brick Framework" by a top social media strategist):

Every short-form video is made of 5 categories of interchangeable bricks. Analyze each one:

1. FORMAT (The Canvas) — The overarching style/format of the video. Examples: Breakdown, Scenario, Hero's Journey, Listicle, POV, Talking Head, Documentary, Vlog, Tutorial, Hot Take, Reaction, Case Study. This is the structure type before any content decisions.

2. IDEA (The Subject) — The combined Topic (broad subject) + Seed (one-line premise) + Substance (the specific facts, takes, and examples that drive emotion). Rate whether the idea is original, explosive, or derivative.

3. HOOK (First Exposure) — The combined Text Hook (on-screen text/thumbnail text) + Visual Hook (opening visual frame/B-roll choice) + Spoken Hook (first spoken sentence). The hook is the #1 deciding factor for whether viewers stay.

4. SCRIPT (The Paint) — The Story Structure used, the CTA approach, and the retention mechanics (loop openers, re-hooks, contrast words, pacing). Does the narrative arc work? Is there a payoff?

5. EDIT (The Brush) — The visual layout, pacing, captions/text overlays, B-roll strategy, music/SFX, and any signature brand elements. Note: for transcripts-only, mark Edit as "Untested" since visual info is unavailable.

RATING SYSTEM:
- "Strong": The brick is well-executed and is clearly working or would work. ${isOutlier ? "CONFIRMED STRONG based on 5X outlier performance (views/followers ≥ 5)." : ""}
- "Weak": The brick has clear execution gaps that are hurting performance.
- "Untested": Insufficient information to evaluate (common for Edit brick when no video is available).

VIDEO CONTENT TO ANALYZE:
Caption: ${caption || "Not available"}
Transcript: ${transcript || "Not available"}
${metricsContext}
${analysisContext}

INSTRUCTIONS:
1. For each brick: identify what the brick IS in this specific video ("current"), rate it Strong/Weak/Untested, explain "reason" in 1-2 sentences, and provide 3 specific "remixSuggestions" — actual alternative versions of that brick.
2. Generate 3 "remixVariants" — each is a distinct Hold X, Tweak Y strategy:
   - Variant A: Change only the Hook (hold Format, Idea, Script, Edit)
   - Variant B: Change the Idea + Hook (hold Format, Script, Edit)
   - Variant C: Change the Format (the biggest remix — hold Idea, Script)
3. Each variant includes: holdBricks[], tweakBricks[], rationale (why this combo), generatedIdea (the new video concept), suggestedHook (the new opening line).

Return ONLY valid JSON, no markdown:
{
  "bricks": [
    {
      "id": "format",
      "label": "Format",
      "current": string,
      "rating": "Strong" | "Weak" | "Untested",
      "reason": string,
      "remixSuggestions": [string, string, string]
    },
    {
      "id": "idea",
      "label": "Idea",
      "current": string,
      "rating": "Strong" | "Weak" | "Untested",
      "reason": string,
      "remixSuggestions": [string, string, string]
    },
    {
      "id": "hook",
      "label": "Hook",
      "current": string,
      "rating": "Strong" | "Weak" | "Untested",
      "reason": string,
      "remixSuggestions": [string, string, string]
    },
    {
      "id": "script",
      "label": "Script",
      "current": string,
      "rating": "Strong" | "Weak" | "Untested",
      "reason": string,
      "remixSuggestions": [string, string, string]
    },
    {
      "id": "edit",
      "label": "Edit",
      "current": string,
      "rating": "Strong" | "Weak" | "Untested",
      "reason": string,
      "remixSuggestions": [string, string, string]
    }
  ],
  "remixVariants": [
    {
      "holdBricks": string[],
      "tweakBricks": string[],
      "rationale": string,
      "generatedIdea": string,
      "suggestedHook": string
    }
  ]
}`;
}
