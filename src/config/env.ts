import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  // Tiered Communication Models
  COMM_PREMIUM_BASE_URL: z.string().url().default('https://api.siliconflow.cn/v1'),
  COMM_PREMIUM_MODEL: z.string().default('Qwen/Qwen3.5-397B-A17B'),
  COMM_PREMIUM_API_KEY: z.string().default(''),

  COMM_MID_BASE_URL: z.string().url().default('https://api.siliconflow.cn/v1'),
  COMM_MID_MODEL: z.string().default('Qwen/Qwen3.5-122B-A10B'),
  COMM_MID_API_KEY: z.string().default(''),

  COMM_LOCAL_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
  COMM_LOCAL_MODEL: z.string().default('qwen3.5:9b'),

  // Buyer Research Model
  RESEARCH_BASE_URL: z.string().url().default('https://api.deepinfra.com/v1/openai'),
  RESEARCH_MODEL: z.string().default('deepseek-ai/DeepSeek-V3'),
  RESEARCH_API_KEY: z.string().default(''),

  // Intent Classifier
  INTENT_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
  INTENT_MODEL: z.string().default('qwen3-8b-aaziko:latest'),

  // Support Chat Widget (DeepInfra Qwen 2.5)
  SUPPORT_CHAT_BASE_URL: z.string().url().default('https://api.deepinfra.com/v1/openai'),
  SUPPORT_CHAT_MODEL: z.string().default('Qwen/Qwen2.5-72B-Instruct'),
  SUPPORT_CHAT_API_KEY: z.string().default(''),

  // Compliance
  COMPLIANCE_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
  COMPLIANCE_MODEL: z.string().default('qwen3-14b-compliance:latest'),
  COMPLIANCE_FALLBACK_BASE_URL: z.string().url().default('https://api.deepinfra.com/v1/openai'),
  COMPLIANCE_FALLBACK_MODEL: z.string().default('Gryphe/MythoMax-L2-13b'),

  // Infrastructure
  MONGODB_URI: z.string().default('mongodb://localhost:27017'),
  MONGODB_DB: z.string().default('common-service'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  QDRANT_URL: z.string().url().default('http://localhost:6333'),

  // Channel APIs
  SENDGRID_API_KEY: z.string().default(''),
  WHATSAPP_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),

  // Zoho Mail (SMTP + IMAP)
  ZOHO_EMAIL: z.string().default(''),
  ZOHO_APP_PASSWORD: z.string().default(''),
  ZOHO_PASSWORD: z.string().default(''),
  ZOHO_HOST: z.string().default('smtp.zoho.com'),
  ZOHO_PORT: z.string().default('587').transform(Number),
  ZOHO_FROM_NAME: z.string().default('Arjun'),
  ZOHO_IMAP_HOST: z.string().default('imap.zoho.com'),
  ZOHO_IMAP_PORT: z.string().default('993').transform(Number),
  ZOHO_REPLY_TO: z.string().default(''),

  // Auto-Mail Campaign Settings
  AUTOMAIL_ENABLED: z.string().default('true').transform((v) => v === 'true'),
  AUTOMAIL_MAX_PER_DAY: z.string().default('100').transform(Number),
  AUTOMAIL_MAX_PER_HOUR: z.string().default('20').transform(Number),
  AUTOMAIL_INBOX_POLL_SECONDS: z.string().default('60').transform(Number),
  AUTOMAIL_WORKING_HOURS_START: z.string().default('9').transform(Number),
  AUTOMAIL_WORKING_HOURS_END: z.string().default('18').transform(Number),
  AUTOMAIL_TIMEZONE: z.string().default('Asia/Kolkata'),
  AUTOMAIL_FOLLOWUP_INTERVALS: z.string().default('48,96,168,336'),

  // App
  CORS_ORIGIN: z.string().default('*'),
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Admin
  ADMIN_EMAILS: z.string().default(''),
  WEEKLY_DIGEST_ENABLED: z.string().default('true').transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
