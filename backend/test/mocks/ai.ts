// Manual stub for the ESM-only 'ai' package, used only so e2e specs that boot AppModule (and
// therefore SummaryModule -> AiModule -> AiSummaryService) can be transformed by ts-jest, which
// does not transform node_modules. No e2e relies on real Gemini output — every spec that touches
// the summary flow overrides AiSummaryService directly — so this stub is defense-in-depth, not a
// behavioral dependency.
export const generateText = () => Promise.resolve({ text: 'stub summary' });
