// Manual stub for the ESM-only '@ai-sdk/google' package. See ai.ts for why this exists.
// Shape-compatible with real usage in AiSummaryService: createGoogleGenerativeAI({ apiKey }) is
// called once in the constructor and returns a callable that AiSummaryService invokes with a
// model id (this.google(model)) to get the model object passed to generateText.
export const createGoogleGenerativeAI = () => (model: string) => ({ model });
