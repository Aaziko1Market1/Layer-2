import { AiClient } from './model-clients/ai-client';
import { ModelConfig, ModelTier, getConfigForTier, modelConfigs } from '../../config/models.config';
import logger from '../../utils/logger';
import { BuyerProfile } from '../../models/types';

const clientCache = new Map<ModelTier, AiClient>();

export function getModelTier(buyerProfile: BuyerProfile | null): ModelTier {
  if (!buyerProfile) {
    return 'mid';
  }
  const tier = buyerProfile.communication_model_tier;
  if (tier === 'premium' || tier === 'mid' || tier === 'local') {
    return tier;
  }
  return 'mid';
}

export function getClientForTier(tier: ModelTier): AiClient {
  if (clientCache.has(tier)) {
    return clientCache.get(tier)!;
  }
  const config = getConfigForTier(tier);
  const client = new AiClient(config);
  clientCache.set(tier, client);
  return client;
}

export function getResearchClient(): AiClient {
  const key = 'research' as any;
  if (clientCache.has(key)) {
    return clientCache.get(key)!;
  }
  const client = new AiClient(modelConfigs.research);
  clientCache.set(key, client);
  return client;
}

export function getIntentClient(): AiClient {
  const key = 'intent' as any;
  if (clientCache.has(key)) {
    return clientCache.get(key)!;
  }
  const client = new AiClient(modelConfigs.intent);
  clientCache.set(key, client);
  return client;
}

const FALLBACK_ORDER: ModelTier[] = ['premium', 'mid', 'local'];

export async function chatWithFallback(
  tier: ModelTier,
  systemPrompt: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
): Promise<{ response: string; tierUsed: ModelTier }> {
  const startIndex = FALLBACK_ORDER.indexOf(tier);

  for (let i = startIndex; i < FALLBACK_ORDER.length; i++) {
    const currentTier = FALLBACK_ORDER[i];
    const client = getClientForTier(currentTier);

    try {
      const response = await client.chat(systemPrompt, messages);

      if (currentTier !== tier) {
        logger.warn('Tier fallback occurred', {
          requestedTier: tier,
          usedTier: currentTier,
        });
      }

      return { response, tierUsed: currentTier };
    } catch (error) {
      logger.error('Tier failed, trying fallback', {
        failedTier: currentTier,
        error: (error as Error).message,
      });
    }
  }

  throw new Error(`All model tiers exhausted. Original tier: ${tier}`);
}
