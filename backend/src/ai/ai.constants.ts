/**
 * The AI summarizer's prompt surface and call policy.
 *
 * The prompt IS the behaviour of this feature — it is what decides whether a digest is useful,
 * neutral, and the right length. Leaving it inline in AiSummaryService buried a *product* decision
 * inside a *transport* wrapper: to change what summaries say you had to open the file that knows
 * about the Vercel AI SDK, and a prompt edit showed up in review looking like a code change.
 *
 * Everything the model is shown is now defined here, in one readable block:
 *   SUMMARY_SYSTEM_PROMPT   — the standing instruction (role, tone, shape)
 *   summaryUserPrompt()     — the per-call instruction that wraps the transcript
 *   transcriptLine()        — how a single message is rendered for the model
 *   TRANSCRIPT_UNKNOWN_SENDER — what a deleted/system author is called in that transcript
 *
 * The transcript format is split across two processes: the fetch stage builds the rows (worker),
 * the AI stage joins and sends them. Both now name the same constants, so the shape the model sees
 * cannot drift between them.
 */

/**
 * Standing instruction sent as the `system` message on every summary call.
 *
 * The constraints are deliberate and each is defensible: "2-4 sentences" bounds output tokens (and
 * therefore free-tier cost); "neutral and factual" keeps a system-authored message from editorial-
 * ising a user's conversation; the final clause exists so an idle-but-not-empty window produces a
 * short honest line instead of the model inventing significance.
 */
export const SUMMARY_SYSTEM_PROMPT =
  'You summarize a group chat from the last day. Produce a concise digest (2-4 sentences) ' +
  'covering the key topics, any decisions, and open questions or action items. ' +
  'Be neutral and factual. If there is nothing substantive, say so briefly.';

/** Shown as the author of a message whose sender row is gone (deleted user) or system-authored. */
export const TRANSCRIPT_UNKNOWN_SENDER = 'Unknown';

/** One transcript line as the model sees it. */
export const transcriptLine = (sender: string, content: string): string =>
  `${sender}: ${content}`;

/** The per-call instruction wrapping the joined transcript. */
export const summaryUserPrompt = (transcript: string): string =>
  `Summarize this conversation:\n\n${transcript}`;

/**
 * Redis-coordinated global cap on Gemini calls, applied by the ai-queue's BullMQ limiter.
 *
 * This is NOT the same knob as worker concurrency. Concurrency bounds parallel jobs per PROCESS,
 * so scaling to N ai-workers would still allow N x concurrency simultaneous Gemini calls. The
 * limiter is coordinated through Redis and therefore caps the rate across every instance — it is
 * what actually protects the free AI Studio tier.
 *
 * 10/minute is a free-tier figure. A paid key wants a different one; see the note in the README
 * about promoting this to env when that happens.
 */
export const AI_RATE_LIMIT = { max: 10, durationMs: 60_000 } as const;
