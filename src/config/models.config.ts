import { env } from './env';

export interface ModelConfig {
  baseURL: string;
  model: string;
  apiKey?: string;
  timeout: number;
  maxRetries: number;
  maxTokens: number;
}

export interface ModelConfigs {
  commPremium: ModelConfig;
  commMid: ModelConfig;
  commLocal: ModelConfig;
  research: ModelConfig;
  intent: ModelConfig;
  compliance: ModelConfig;
  complianceFallback: ModelConfig;
  supportChat: ModelConfig;
}

export const modelConfigs: ModelConfigs = {
  commPremium: {
    baseURL: env.COMM_PREMIUM_BASE_URL,
    model: env.COMM_PREMIUM_MODEL,
    apiKey: env.COMM_PREMIUM_API_KEY || undefined,
    timeout: 120000,  // 120s — Qwen3-235B takes ~30s on DeepInfra
    maxRetries: 2,
    maxTokens: 2048,
  },
  commMid: {
    baseURL: env.COMM_MID_BASE_URL,
    model: env.COMM_MID_MODEL,
    apiKey: env.COMM_MID_API_KEY || undefined,
    timeout: 60000,
    maxRetries: 2,
    maxTokens: 2048,
  },
  commLocal: {
    baseURL: env.COMM_LOCAL_BASE_URL,
    model: env.COMM_LOCAL_MODEL,
    apiKey: env.COMM_MID_API_KEY || undefined,
    timeout: 60000,
    maxRetries: 2,
    maxTokens: 1536,
  },
  research: {
    baseURL: env.RESEARCH_BASE_URL,
    model: env.RESEARCH_MODEL,
    apiKey: env.RESEARCH_API_KEY || undefined,
    timeout: 90000,
    maxRetries: 2,
    maxTokens: 4096,
  },
  intent: {
    baseURL: env.INTENT_BASE_URL,
    model: env.INTENT_MODEL,
    timeout: 10000,
    maxRetries: 2,
    maxTokens: 256,
  },
  compliance: {
    baseURL: env.COMPLIANCE_BASE_URL,
    model: env.COMPLIANCE_MODEL,
    timeout: 15000,
    maxRetries: 3,
    maxTokens: 1024,
  },
  complianceFallback: {
    baseURL: env.COMPLIANCE_FALLBACK_BASE_URL,
    model: env.COMPLIANCE_FALLBACK_MODEL,
    apiKey: env.COMPLIANCE_FALLBACK_BASE_URL ? undefined : undefined,
    timeout: 20000,
    maxRetries: 3,
    maxTokens: 1024,
  },
  supportChat: {
    baseURL: env.SUPPORT_CHAT_BASE_URL,
    model: env.SUPPORT_CHAT_MODEL,
    apiKey: env.SUPPORT_CHAT_API_KEY || undefined,
    timeout: 60000,
    maxRetries: 2,
    maxTokens: 1024,
  },
};

export type ModelTier = 'premium' | 'mid' | 'local';
export type ModelRole = keyof ModelConfigs;

export function getConfigForTier(tier: ModelTier): ModelConfig {
  switch (tier) {
    case 'premium': return modelConfigs.commPremium;
    case 'mid': return modelConfigs.commMid;
    case 'local': return modelConfigs.commLocal;
  }
}

export function getConfigForRole(role: ModelRole): ModelConfig {
  return modelConfigs[role];
}
