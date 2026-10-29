import OpenAI, { type ClientOptions } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { type JsonRequest, LLMError, parseJson, type TextRequest, type ToolChatLLM, type ToolChatRequest, type ToolChatTurn } from './types.js';

type ResponseFormat = OpenAI.Chat.ChatCompletionCreateParams['response_format'];

/**
 * GPT on Azure AI Foundry through the v1 endpoint. JSON calls use Structured Outputs (strict schema).
 * json and text calls (the intake) are kept as stored completions (Foundry portal -> Stored completions, ~30 days), tagged
 * by step; toolChat (the D10 assistant) is not stored.
 */
export class AzureOpenAILLM implements ToolChatLLM {
  readonly name = 'azure-openai';
  private readonly client: OpenAI;

  constructor(endpoint: string, apiKey: string, private readonly deployment: string,
    options: Pick<ClientOptions, 'fetch' | 'maxRetries'> = {}) {
    this.client = new OpenAI({ baseURL: endpoint, apiKey, ...options });
  }

  private async complete({ system, user, tag }: TextRequest, responseFormat?: ResponseFormat): Promise<string> {
    let res: OpenAI.Chat.ChatCompletion;
    try {
      res = await this.client.chat.completions.create({
        model: this.deployment,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        store: true,
        metadata: { app: 'latelens', step: tag ?? 'untagged' },
        reasoning_effort: 'low',
        max_completion_tokens: 4000,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      });
    } catch (err) {
      // Azure's content filter (including Prompt Shields) rejects a flagged prompt with HTTP 400, code content_filter.
      if (err instanceof OpenAI.APIError && err.code === 'content_filter') throw new LLMError('blocked by the Azure content filter', 'refusal');
      throw new LLMError(err instanceof Error ? err.message : String(err), 'transport');
    }
    const choice = res.choices[0];
    if (choice?.finish_reason === 'content_filter' || choice?.message.refusal) throw new LLMError('model declined the request', 'refusal');
    if (choice?.finish_reason === 'length') throw new LLMError('output cut off: raise max_completion_tokens', 'invalid');
    return choice?.message.content ?? '';
  }

  async json<T>(req: JsonRequest<T>): Promise<T> {
    return parseJson(await this.complete(req, zodResponseFormat(req.schema, 'output')), req.schema);
  }

  async text(req: TextRequest): Promise<string> {
    return (await this.complete(req)).trim();
  }

  /**
   * D10 assistant (SPEC §5.16): one model turn with tools. `store: false` (SEC-ASK-03, PC-04): unlike the intake steps,
   * assistant questions are never kept as stored completions. Arguments come back raw; the caller validates them.
   */
  async toolChat(req: ToolChatRequest): Promise<ToolChatTurn> {
    if (req.messages.some((m) => m.role === 'tool' && !m.toolCallId)) throw new LLMError('a tool result has no tool call id', 'invalid');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: req.system }, ...req.messages.map(
      (m): OpenAI.Chat.ChatCompletionMessageParam => m.role === 'tool'
        ? { role: 'tool', tool_call_id: m.toolCallId!, content: m.content }
        : m.role === 'assistant' && m.toolCalls?.length
          ? { role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((c) =>
            ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })) }
          : { role: m.role as 'user' | 'assistant', content: m.content })];
    let res: OpenAI.Chat.ChatCompletion;
    try {
      res = await this.client.chat.completions.create({
        model: this.deployment, messages, store: false, reasoning_effort: 'low', max_completion_tokens: 4000,
        // An empty tools list is a 400 from the API: a role with no tools sends none.
        ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> } })) } : {}),
        ...(req.answerSchema ? { response_format: zodResponseFormat(req.answerSchema, 'answer') } : {}),
      });
    } catch (err) {
      if (err instanceof OpenAI.APIError && err.code === 'content_filter') throw new LLMError('blocked by the Azure content filter', 'refusal');
      throw new LLMError(err instanceof Error ? err.message : String(err), 'transport');
    }
    const choice = res.choices[0];
    if (choice?.finish_reason === 'content_filter' || choice?.message.refusal) throw new LLMError('model declined the request', 'refusal');
    if (choice?.finish_reason === 'length') throw new LLMError('output cut off: raise max_completion_tokens', 'invalid');
    const calls = (choice?.message.tool_calls ?? []).flatMap((c) => c.type === 'function'
      ? [{ id: c.id, name: c.function.name, arguments: c.function.arguments }] : []);
    return calls.length ? { kind: 'tool_calls', calls } : { kind: 'final', content: choice?.message.content ?? '' };
  }
}
