import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
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
  private readonly google;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.google = createGoogleGenerativeAI({
      apiKey: this.config.getOrThrow<string>('GOOGLE_GENERATIVE_AI_API_KEY'),
    });
    this.model = this.config.getOrThrow<string>('GEMINI_MODEL');
  }

  async summarize(
    messages: { sender: string; content: string }[],
  ): Promise<string> {
    const transcript = messages
      .map((m) => transcriptLine(m.sender, m.content))
      .join('\n');
    const { text } = await generateText({
      model: this.google(this.model),
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: summaryUserPrompt(transcript),
    });
    return text.trim();
  }
}
