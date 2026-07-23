import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

const SYSTEM_PROMPT =
  'You summarize a group chat from the last day. Produce a concise digest (2-4 sentences) ' +
  'covering the key topics, any decisions, and open questions or action items. ' +
  'Be neutral and factual. If there is nothing substantive, say so briefly.';

/**
 * Thin wrapper over the Vercel AI SDK's Google provider (free AI Studio / Generative Language API).
 * The vendor lives behind this one method so the job never touches the SDK directly, and tests mock
 * `ai`/`@ai-sdk/google` instead of calling the network.
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
    const transcript = messages.map((m) => `${m.sender}: ${m.content}`).join('\n');
    const { text } = await generateText({
      model: this.google(this.model),
      system: SYSTEM_PROMPT,
      prompt: `Summarize this conversation:\n\n${transcript}`,
    });
    return text.trim();
  }
}
