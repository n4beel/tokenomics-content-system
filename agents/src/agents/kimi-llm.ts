/**
 * KimiLlm — a BaseLlm subclass for Kimi K2.5 via OpenAI-compatible REST API.
 *
 * ADK TypeScript only ships Gemini and Apigee connectors. This class bridges
 * Kimi's OpenAI-compatible endpoint (api.moonshot.cn/v1) into ADK's BaseLlm
 * interface.
 *
 * Registration (call once before rootAgent is imported):
 *   import { LLMRegistry } from '@google/adk';
 *   import { KimiLlm } from './kimi-llm.js';
 *   LLMRegistry.register(KimiLlm);
 */
import { BaseLlm, type LlmRequest, type LlmResponse } from '@google/adk';

export class KimiLlm extends BaseLlm {
  /** Matches any model string starting with "kimi/" */
  static override supportedModels: (string | RegExp)[] = [/kimi\/.*/];

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor({ model }: { model: string }) {
    super({ model });
    this.apiKey = process.env.OPENAI_API_KEY ?? process.env.KIMI_API_KEY ?? '';
    this.baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.moonshot.cn/v1';
    if (!this.apiKey) {
      throw new Error('KimiLlm: OPENAI_API_KEY or KIMI_API_KEY env var is required.');
    }
  }

  /** Strip "kimi/" prefix to get the real model id: "moonshot-v1-8k" */
  private get kimiModel(): string {
    return this.model.replace(/^kimi\//, '');
  }

  /**
   * Convert ADK's Gemini-style contents array to OpenAI-style messages.
   * Role "model" → "assistant".
   */
  private toOpenAIMessages(
    req: LlmRequest,
  ): { role: string; content: string }[] {
    const messages: { role: string; content: string }[] = [];

    // System instruction from config
    const sys = (req.config as any)?.systemInstruction;
    if (typeof sys === 'string' && sys.trim()) {
      messages.push({ role: 'system', content: sys });
    }

    for (const content of req.contents) {
      const text = (content.parts ?? [])
        .map((p: any) => p.text ?? '')
        .filter(Boolean)
        .join('\n');
      if (!text) continue;
      const role = content.role === 'model' ? 'assistant' : (content.role ?? 'user');
      messages.push({ role, content: text });
    }

    return messages;
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    _stream?: boolean,
  ): AsyncGenerator<LlmResponse, void, undefined> {
    this.maybeAppendUserContent(llmRequest);

    const messages = this.toOpenAIMessages(llmRequest);
    const model = (llmRequest as any).model ?? this.kimiModel;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield {
        errorCode: String(response.status),
        errorMessage: `Kimi API error ${response.status}: ${errorText}`,
      } as unknown as LlmResponse;
      return;
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[];
    };

    const text = data.choices?.[0]?.message?.content ?? '';

    yield {
      content: {
        role: 'model',
        parts: [{ text }],
      },
    } as unknown as LlmResponse;
  }

  /** Required by BaseLlm for live/streaming sessions — not used for batch. */
  async connect(_llmRequest: LlmRequest): Promise<any> {
    throw new Error('KimiLlm does not support live connections.');
  }
}
