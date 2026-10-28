import OpenAI, { type ClientOptions } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { type JsonRequest, type LLM, LLMError, parseJson, type TextRequest } from './types.js';

type ResponseFormat = OpenAI.Chat.ChatCompletionCreateParams['response_format'];

/**
 * GPT on Azure AI Foundry through the v1 endpoint. JSON calls use Structured Outputs (strict schema).
 * Every call is kept as a stored completion (Foundry portal -> Stored completions, ~30 days), tagged by step.
 */
export class AzureOpenAILLM implements LLM {
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
}
