/**
 * HOW THIS FILE WORKS
 *   1. On construction, build the Google provider and read the model id from config.
 *   2. Render each {sender, content} row into one transcript line.
 *   3. Join the lines into a single string.
 *   4. Send it to Gemini with the standing system prompt.
 *   5. Trim and return the text.
 *
 * Owns HOW the call is made; ai.constants.ts owns WHAT the model is asked. Errors are not caught
 * here on purpose — a failed call must reach BullMQ so the job retries.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProvider,
} from '@ai-sdk/google';
import { generateText } from 'ai';

import {
  SUMMARY_SYSTEM_PROMPT,
  summaryUserPrompt,
  transcriptLine,
} from './ai.constants';

/**
 * Thin wrapper over the Vercel AI SDK's Google provider (free AI Studio / Generative Language API).
 * The vendor lives behind this one method so the job never touches the SDK directly, and tests mock
 * `ai`/`@ai-sdk/google` instead of calling the network.
 *
 * What the model is ASKED is deliberately not here — the prompts live in ai.constants.ts, so this
 * file is only about how the call is made, not about what the product says.
 */
@Injectable()
export class AiSummaryService {
  // Annotated, not inferred: tsconfig sets noImplicitAny false, so a bare `private readonly
  // google;` is silently `any` — and every call through it (`this.google(this.model)`) loses type
  // checking without TypeScript saying a word.
  private readonly google: GoogleGenerativeAIProvider;
  // Held so summarize() does no config lookup per call.
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    // Step 1a. getOrThrow so a missing key fails at worker boot, not at the first job.
    this.google = createGoogleGenerativeAI({
      apiKey: this.config.getOrThrow<string>('GOOGLE_GENERATIVE_AI_API_KEY'),
    });
    // Step 1b. The default lives on the env schema, so it is declared in exactly one place.
    this.model = this.config.getOrThrow<string>('GEMINI_MODEL');
  }

  async summarize(
    messages: { sender: string; content: string }[],
  ): Promise<string> {
    // Steps 2-3. transcriptLine is shared with the fetch stage so the format cannot drift.
    const transcript = messages
      .map((m) => transcriptLine(m.sender, m.content))
      .join('\n');
    // Step 4. `system` is the standing instruction; `prompt` is the per-call transcript.
    const { text } = await generateText({
      model: this.google(this.model),
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: summaryUserPrompt(transcript),
    });
    // Step 5. Trim so a whitespace-only reply becomes '', which the caller treats as 'blank'.
    return text.trim();
  }
}
