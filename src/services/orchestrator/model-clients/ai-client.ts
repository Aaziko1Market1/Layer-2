import OpenAI from 'openai';
import { ModelConfig } from '../../../config/models.config';
import logger from '../../../utils/logger';
import { Message } from '../../../models/types';

export class AiClient {
  private client: OpenAI;
  private model: string;
  private timeout: number;
  private maxRetries: number;
  private maxTokens: number;

  constructor(config: ModelConfig) {
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey || 'not-needed',
      timeout: config.timeout,
      maxRetries: 0, // We handle retries ourselves
    });
    this.model = config.model;
    this.timeout = config.timeout;
    this.maxRetries = config.maxRetries;
    this.maxTokens = config.maxTokens;
  }

  async chat(
    systemPrompt: string,
    messages: Message[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<string> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ];

        const isQwen3 = this.model.toLowerCase().includes('qwen3');
        const response = await (this.client.chat.completions.create as Function)({
          model: this.model,
          messages: openaiMessages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? this.maxTokens,
          stream: false,
          ...(isQwen3 && { extra_body: { chat_template_kwargs: { enable_thinking: false } } }),
        }) as OpenAI.Chat.ChatCompletion;

        const raw = response.choices[0]?.message?.content || '';
        const content = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const elapsed = Date.now() - startTime;

        logger.info('AiClient.chat success', {
          model: this.model,
          attempt,
          elapsed,
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
        });

        return content;
      } catch (error) {
        lastError = error as Error;
        const backoffMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s

        logger.warn('AiClient.chat attempt failed', {
          model: this.model,
          attempt,
          maxRetries: this.maxRetries,
          backoffMs,
          error: (error as Error).message,
        });

        if (attempt < this.maxRetries) {
          await this.sleep(backoffMs);
        }
      }
    }

    logger.error('AiClient.chat all retries exhausted', {
      model: this.model,
      error: lastError?.message,
    });
    throw lastError || new Error(`AiClient: all ${this.maxRetries} retries failed`);
  }

  async chatStream(
    systemPrompt: string,
    messages: Message[],
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ];

        const isQwen3Stream = this.model.toLowerCase().includes('qwen3');
        const stream = await (this.client.chat.completions.create as Function)({
          model: this.model,
          messages: openaiMessages,
          temperature: 0.7,
          max_tokens: this.maxTokens,
          stream: true,
          ...(isQwen3Stream && { extra_body: { chat_template_kwargs: { enable_thinking: false } } }),
        }) as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

        let fullContent = '';
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
        }

        logger.info('AiClient.chatStream success', {
          model: this.model,
          attempt,
          elapsed: Date.now() - startTime,
          contentLength: fullContent.length,
        });

        return fullContent;
      } catch (error) {
        lastError = error as Error;
        const backoffMs = Math.pow(2, attempt - 1) * 1000;

        logger.warn('AiClient.chatStream attempt failed', {
          model: this.model,
          attempt,
          backoffMs,
          error: (error as Error).message,
        });

        if (attempt < this.maxRetries) {
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError || new Error(`AiClient stream: all ${this.maxRetries} retries failed`);
  }

  getModel(): string {
    return this.model;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
