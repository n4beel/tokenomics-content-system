/**
 * KimiLlm — a BaseLlm subclass for Kimi K2.5 via OpenAI-compatible REST API.
 *
 * ADK TypeScript ships Gemini connectors. This class bridges
 * Kimi's OpenAI-compatible endpoint (api.moonshot.cn/v1) into ADK's BaseLlm
 * interface, WITH full tool/function calling support.
 *
 * Registration:
 *   import { LLMRegistry } from '@google/adk';
 *   import { KimiLlm } from './kimi-llm.js';
 *   LLMRegistry.register(KimiLlm);
 *
 * Then set LLM_MODEL=kimi/kimi-k2.5 in .env
 */
import { BaseLlm, type LlmRequest, type LlmResponse } from '@google/adk';
import type { Content, Part, FunctionCall, FunctionResponse } from '@google/genai';

// ─── Types for OpenAI-compatible API ─────────────────────────────────────────

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface OpenAIChoice {
  message: OpenAIMessage;
  finish_reason: string;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ─── KimiLlm ────────────────────────────────────────────────────────────────

export class KimiLlm extends BaseLlm {
  /** Matches any model string starting with "kimi/" or "google/" (both routed via OpenRouter) */
  static override readonly supportedModels: (string | RegExp)[] = [/^kimi\/.*/, /^google\/.*/];

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor({ model }: { model: string }) {
    super({ model });
    // Priority: KIMI_API_KEY → OPENROUTER_API_KEY → OPENAI_API_KEY
    this.apiKey = process.env.KIMI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
    // Default to OpenRouter if no explicit base URL and we're using OPENROUTER key
    const defaultBaseUrl = process.env.KIMI_API_KEY
      ? 'https://api.moonshot.ai/v1'
      : 'https://openrouter.ai/api/v1';
    this.baseUrl = process.env.KIMI_BASE_URL ?? defaultBaseUrl;
    if (!this.apiKey) {
      throw new Error('KimiLlm: KIMI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY env var is required.');
    }
    console.log(`[KimiLlm] Using model=${this.kimiModel} via ${this.baseUrl}`);
  }

  /** Strip "kimi/" prefix to get the real model id */
  private get kimiModel(): string {
    return this.model.replace(/^kimi\//, '');
  }

  // ── Convert ADK Gemini-style request → OpenAI messages ──

  private toOpenAIMessages(req: LlmRequest): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [];

    // System instruction from config
    const cfg = req.config as Record<string, any> | undefined;
    const sys = cfg?.systemInstruction;
    if (typeof sys === 'string' && sys.trim()) {
      messages.push({ role: 'system', content: sys });
    } else if (sys?.parts) {
      const text = (sys.parts as any[])
        .map((p: any) => p.text ?? '')
        .filter(Boolean)
        .join('\n');
      if (text) messages.push({ role: 'system', content: text });
    }

    for (const content of req.contents) {
      const role = content.role === 'model' ? 'assistant' : (content.role ?? 'user');
      const parts = content.parts ?? [];

      // Check if this content has function calls (assistant → tool_calls)
      const functionCalls = parts.filter((p: any) => p.functionCall) as Array<Part & { functionCall: FunctionCall }>;
      if (role === 'assistant' && functionCalls.length > 0) {
        const toolCalls: OpenAIToolCall[] = functionCalls.map((p, i) => ({
          id: p.functionCall!.id || `call_${messages.length}_${i}`,
          type: 'function' as const,
          function: {
            name: String(p.functionCall!.name || '').trim(),
            arguments: JSON.stringify(p.functionCall!.args ?? {}),
          },
        }));

        // Also grab any text parts
        const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n');

        messages.push({
          role: 'assistant',
          content: textParts || null,
          tool_calls: toolCalls,
        });
        continue;
      }

      // Check for function responses (user role with functionResponse → tool role)
      const functionResponses = parts.filter((p: any) => p.functionResponse) as Array<Part & { functionResponse: FunctionResponse }>;
      if (functionResponses.length > 0) {
        for (const p of functionResponses) {
          const preferredId = (p.functionResponse as any)?.id;
          // Find matching tool_call_id from the previous assistant message.
          // Prefer the exact functionResponse.id when available.
          const toolCallId = this.findToolCallId(messages, String(p.functionResponse!.name || ''), preferredId);
          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: JSON.stringify(p.functionResponse!.response ?? {}),
          });
        }
        continue;
      }

      // Regular text content
      const text = parts
        .map((p: any) => p.text ?? '')
        .filter(Boolean)
        .join('\n');
      if (text) {
        messages.push({ role: role as 'user' | 'assistant', content: text });
      }
    }

    return messages;
  }

  /** Find tool_call_id for a function name from previous assistant messages */
  private findToolCallId(messages: OpenAIMessage[], fnName: string, preferredId?: string): string {
    if (preferredId && preferredId.trim()) {
      return preferredId.trim();
    }
    const target = fnName.trim();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.tool_calls) {
        const tc = msg.tool_calls.find(tc => tc.function.name.trim() === target);
        if (tc) return tc.id;
      }
    }
    return `call_${target || 'tool'}`;
  }

  // ── Convert ADK tool declarations → OpenAI tools format ──

  private toOpenAITools(req: LlmRequest): OpenAITool[] | undefined {
    const cfg = req.config as Record<string, any> | undefined;
    const tools = cfg?.tools;
    if (!tools || !Array.isArray(tools)) return undefined;

    const openAITools: OpenAITool[] = [];
    for (const tool of tools) {
      if (tool.functionDeclarations) {
        for (const fn of tool.functionDeclarations) {
          const name = String(fn.name || '').trim();
          if (!name) continue;

          // ADK functionDeclarations use Gemini-flavored schema types (OBJECT/STRING).
          // Convert to JSON Schema so OpenAI-compatible providers don't ignore tools.
          const parameters = fn.parameters
            ? this.geminiSchemaToJsonSchema(fn.parameters as Record<string, any>)
            : { type: 'object', properties: {} };

          openAITools.push({
            type: 'function',
            function: {
              name,
              description: fn.description ?? '',
              parameters,
            },
          });
        }
      }
    }
    return openAITools.length > 0 ? openAITools : undefined;
  }

  // ── Convert Gemini Schema → JSON Schema ──

  /**
   * Recursively convert a Gemini-style schema (with Type.STRING etc.)
   * to standard JSON Schema format for OpenAI's response_format.
   */
  private geminiSchemaToJsonSchema(geminiSchema: Record<string, any>): Record<string, any> {
    const jsonSchema: Record<string, any> = {};

    // Gemini uses Type enum values like 'STRING', 'OBJECT', 'ARRAY', etc.
    // Convert to lowercase JSON Schema types
    if (geminiSchema.type) {
      const typeStr = String(geminiSchema.type).toLowerCase();
      jsonSchema.type = typeStr;
    }

    if (geminiSchema.description) {
      jsonSchema.description = geminiSchema.description;
    }

    if (geminiSchema.enum) {
      jsonSchema.enum = geminiSchema.enum;
    }

    if (geminiSchema.nullable) {
      // JSON Schema: use oneOf with null type or simply allow null
      // For compatibility, add nullable
      jsonSchema.nullable = true;
    }

    // Object properties
    if (geminiSchema.properties) {
      jsonSchema.properties = {};
      for (const [key, val] of Object.entries(geminiSchema.properties)) {
        jsonSchema.properties[key] = this.geminiSchemaToJsonSchema(val as Record<string, any>);
      }
    }

    // Required fields
    if (geminiSchema.required) {
      jsonSchema.required = geminiSchema.required;
    }

    // Array items
    if (geminiSchema.items) {
      jsonSchema.items = this.geminiSchemaToJsonSchema(geminiSchema.items);
    }

    return jsonSchema;
  }

  // ── Convert OpenAI response → ADK LlmResponse ──

  private toAdkResponse(choice: OpenAIChoice): LlmResponse {
    const cfg = (this as any)._lastRequestConfig as Record<string, any> | undefined;
    const allowedToolNames = this.getDeclaredToolNames(cfg);

    const msg = choice.message;
    const parts: Part[] = [];

    // Text content
    if (msg.content) {
      parts.push({ text: msg.content });
    }

    // Tool calls → functionCall parts
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        const rawName = tc.function.name ?? '';
        const sanitizedName = this.resolveToolName(rawName, allowedToolNames);
        if (!sanitizedName) {
          continue;
        }

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = { raw: tc.function.arguments };
        }
        parts.push({
          functionCall: {
            name: sanitizedName,
            args,
            id: tc.id,
          },
        } as Part);
      }
    }

    // Return explicit model error if the provider yields an empty turn.
    // This prevents outputKey fields from being overwritten with empty strings.
    if (parts.length === 0) {
      return {
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: 'Empty model response from Kimi/OpenAI-compatible endpoint',
      } as LlmResponse;
    }

    return {
      content: {
        role: 'model',
        parts,
      },
    } as LlmResponse;
  }

  // ── Main generation method ──

  async *generateContentAsync(
    llmRequest: LlmRequest,
    _stream?: boolean,
  ): AsyncGenerator<LlmResponse, void, undefined> {
    this.maybeAppendUserContent(llmRequest);

    const messages = this.toOpenAIMessages(llmRequest);
    const tools = this.toOpenAITools(llmRequest);
    const model = this.kimiModel;

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    // ── Bridge ADK outputSchema → OpenAI response_format ──
    // ADK sets config.responseMimeType = 'application/json' and config.responseSchema
    // when an agent has outputSchema. Convert to OpenAI's response_format.
    const cfg = llmRequest.config as Record<string, any> | undefined;
    // Stash request config for response normalization (tool name reconciliation).
    (this as any)._lastRequestConfig = cfg;

    if (cfg?.responseMimeType === 'application/json' && cfg?.responseSchema) {
      const jsonSchema = this.geminiSchemaToJsonSchema(cfg.responseSchema);
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'agent_output',
          strict: true,
          schema: jsonSchema,
        },
      };
      console.log('[KimiLlm] Enforcing JSON schema output via response_format');
    }

    // Extract temperature from config if set
    if (cfg?.temperature !== undefined) {
      body.temperature = cfg.temperature;
    }

    const postCompletion = async (requestBody: Record<string, unknown>) =>
      fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

    let response = await postCompletion(body);

    if (!response.ok) {
      let errorText = await response.text();

      // Some models/providers reject response_format json_schema.
      // Retry once without response_format so the pipeline can still proceed.
      if (
        body.response_format &&
        [400, 422].includes(response.status) &&
        /response_format|json_schema|structured output|structured-output/i.test(errorText)
      ) {
        const fallbackBody = { ...body };
        delete fallbackBody.response_format;
        console.warn('[KimiLlm] response_format rejected by provider, retrying without schema enforcement');

        response = await postCompletion(fallbackBody);
        if (response.ok) {
          const data = (await response.json()) as OpenAIResponse;
          const choice = data.choices?.[0];
          if (!choice) {
            yield {
              content: { role: 'model', parts: [{ text: '[Kimi API Error]: No choices in response' }] },
            } as LlmResponse;
            return;
          }
          if (data.usage) {
            console.log(
              `[KimiLlm] Usage: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total tokens`,
            );
          }
          yield this.toAdkResponse(choice);
          return;
        }

        errorText = await response.text();
      }

      console.error(`[KimiLlm] API error ${response.status}: ${errorText}`);
      yield {
        content: {
          role: 'model',
          parts: [{ text: `[Kimi API Error ${response.status}]: ${errorText.slice(0, 500)}` }],
        },
      } as LlmResponse;
      return;
    }

    const data = (await response.json()) as OpenAIResponse;
    const choice = data.choices?.[0];

    if (!choice) {
      yield {
        content: { role: 'model', parts: [{ text: '[Kimi API Error]: No choices in response' }] },
      } as LlmResponse;
      return;
    }

    if (data.usage) {
      console.log(
        `[KimiLlm] Usage: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total tokens`,
      );
    }

    yield this.toAdkResponse(choice);
  }

  /** Required by BaseLlm for live/streaming sessions — not used for batch. */
  async connect(_llmRequest: LlmRequest): Promise<any> {
    throw new Error('KimiLlm does not support live connections.');
  }

  private getDeclaredToolNames(cfg?: Record<string, any>): string[] {
    const tools = cfg?.tools;
    if (!Array.isArray(tools)) return [];

    const names: string[] = [];
    for (const tool of tools) {
      if (!tool?.functionDeclarations || !Array.isArray(tool.functionDeclarations)) continue;
      for (const fn of tool.functionDeclarations) {
        const name = String(fn?.name || '').trim();
        if (name) names.push(name);
      }
    }
    return names;
  }

  private normalizeToolName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  }

  private resolveToolName(rawName: string, allowedNames: string[]): string {
    const trimmed = String(rawName || '').trim();
    if (!trimmed) return '';

    if (allowedNames.includes(trimmed)) {
      return trimmed;
    }

    const normalized = this.normalizeToolName(trimmed);
    if (!normalized) return trimmed;

    const matches = allowedNames.filter(name => this.normalizeToolName(name) === normalized);
    if (matches.length === 1) {
      return matches[0];
    }

    return trimmed;
  }
}
