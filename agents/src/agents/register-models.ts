import { LLMRegistry } from '@google/adk';
import { KimiLlm } from './kimi-llm.js';

let registered = false;

export function ensureModelRegistry(): void {
    if (registered) {
        return;
    }
    LLMRegistry.register(KimiLlm);
    registered = true;
}
