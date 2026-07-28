/**
 * HOW THIS FILE WORKS
 *
 *   1. On construction, build a Google provider from the API key and read the model id — both
 *      through ConfigService, so neither is hardcoded.
 *   2. When summarize() is called, render each {sender, content} row into one transcript line.
 *   3. Join those lines into a single string.
 *   4. Send it to Gemini via the Vercel AI SDK's generateText(), with the standing system prompt.
 *   5. Trim and return the text.
 *
 * Called only by GenerateProcessor, running inside the standalone ai-worker. This file owns HOW
 * the call is made; ai.constants.ts owns WHAT the model is asked. Errors are deliberately not
 * caught here — a failed call must reach BullMQ so the job retries with backoff.
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
  // The model id string, e.g. 'gemini-3.5-flash'. Held so summarize() does no config lookup.
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    // Step 1a. getOrThrow, not get: a missing key must fail loudly at construction — i.e. at
    // worker boot — rather than at the first summary job hours later.
    this.google = createGoogleGenerativeAI({
      apiKey: this.config.getOrThrow<string>('GOOGLE_GENERATIVE_AI_API_KEY'),
    });
    // Step 1b. Same reasoning; the default lives on the env schema, not here, so every default in
    // the app is declared in exactly one place.
    this.model = this.config.getOrThrow<string>('GEMINI_MODEL');
  }

  async summarize(
    messages: { sender: string; content: string }[],
  ): Promise<string> {
    // Steps 2-3. transcriptLine is shared with the fetch stage, so the shape the model sees
    // cannot drift between the process that builds the rows and the one that sends them.
    const transcript = messages
      .map((m) => transcriptLine(m.sender, m.content))
      .join('\n');
    // Step 4. `system` carries the standing instruction (role, tone, 2-4 sentence bound); the
    // per-call `prompt` wraps the transcript. this.google(this.model) resolves the model handle.
    const { text } = await generateText({
      model: this.google(this.model),
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: summaryUserPrompt(transcript),
    });
    // Step 5. Trim so trailing whitespace never reaches the database — and so a whitespace-only
    // reply becomes '', which GenerateProcessor treats as the 'blank' skip.
    return text.trim();
  }
}
