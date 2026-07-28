import { ConfigService } from '@nestjs/config';

// Mock the AI SDK so no network call happens.
const generateTextMock = jest.fn();
jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));
jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ model }),
}));

import { AiSummaryService } from './ai-summary.service';

function makeService() {
  const config = {
    getOrThrow: (k: string) =>
      k === 'GOOGLE_GENERATIVE_AI_API_KEY' ? 'key' : 'gemini-3.5-flash',
  } as unknown as ConfigService;
  return new AiSummaryService(config);
}

describe('AiSummaryService.summarize', () => {
  beforeEach(() => generateTextMock.mockReset());

  it('builds a Name: content transcript and returns the model text', async () => {
    generateTextMock.mockResolvedValue({ text: 'A concise digest.' });
    const service = makeService();

    const result = await service.summarize([
      { sender: 'Ada', content: 'ship it?' },
      { sender: 'Ben', content: 'yes' },
    ]);

    expect(result).toBe('A concise digest.');
    const arg = generateTextMock.mock.calls[0][0];
    expect(arg.prompt).toContain('Ada: ship it?');
    expect(arg.prompt).toContain('Ben: yes');
    expect(arg.system).toMatch(/summar/i);
  });
});
