import fs from 'fs';
import path from 'path';
import logger from '../../../utils/logger';
import {
  BuyerProfile,
  ComplianceInfo,
  Product,
  Channel,
  ConversationMessage,
} from '../../../models/types';

const promptCache = new Map<string, string>();

function loadPrompt(filename: string): string {
  if (promptCache.has(filename)) {
    return promptCache.get(filename)!;
  }
  const filePath = path.resolve(__dirname, '../../../prompts', filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  promptCache.set(filename, content);
  return content;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || 'N/A');
  }
  return result;
}

function formatConversationHistory(messages: ConversationMessage[]): string {
  if (!messages || messages.length === 0) return 'No previous conversation.';
  const last10 = messages.slice(-10);
  return last10
    .map((m) => `${m.role === 'buyer' ? 'Buyer' : 'Arjun'}: ${m.content}`)
    .join('\n');
}

function formatMatchingSellers(products: Product[]): string {
  if (!products || products.length === 0) return 'No matching sellers found.';
  return products
    .slice(0, 5)
    .map((p) => {
      const verified = p.seller_verified ? 'Yes' : 'No';
      const price = p.price_range_usd
        ? `$${p.price_range_usd.min}-${p.price_range_usd.max}/unit`
        : 'Price on request';
      const certs = p.certifications?.join(', ') || 'None listed';
      return `- ${p.seller_name} in ${p.seller_location}: ${p.product_name}, ${price}, MOQ: ${p.moq}, Certifications: ${certs}, Verified: ${verified}`;
    })
    .join('\n');
}

export interface PromptBuilderParams {
  channel: Channel;
  buyerProfile: BuyerProfile;
  conversationHistory: ConversationMessage[];
  tradeIntelligence: ComplianceInfo | null;
  matchingProducts: Product[];
  emotionDirective?: string;
}

export function buildPrompt(params: PromptBuilderParams): string {
  const startTime = Date.now();

  // Layer 1: Identity (static, cached)
  const layer1 = loadPrompt('arjun-identity.md');

  // Layer 2: Channel-specific (cached per channel)
  const channelFile = `channel-${params.channel}.md`;
  const layer2 = loadPrompt(channelFile);

  // Layer 3: Buyer memory injection
  const layer3Template = loadPrompt('layer3-buyer-template.md');
  const bp = params.buyerProfile;
  const layer3 = fillTemplate(layer3Template, {
    buyer_name: bp.buyer_name || bp.normalized_name,
    company: bp.company || bp.buyer_name,
    country: bp.country,
    product_categories: bp.product_categories?.slice(0, 5).join(', ') || 'Unknown',
    hs_codes: bp.hs_codes?.slice(0, 5).join(', ') || 'Unknown',
    total_volume_usd: bp.total_trade_volume_usd?.toLocaleString() || '0',
    trade_count: String(bp.trade_count || 0),
    tier: bp.buyer_tier,
    last_trade_date: bp.last_trade_date
      ? new Date(bp.last_trade_date).toISOString().split('T')[0]
      : 'Unknown',
    indian_suppliers: bp.indian_suppliers?.slice(0, 3).join(', ') || 'None known',
    avg_unit_price: bp.avg_unit_price_usd?.toFixed(2) || '0',
    last_10_messages: formatConversationHistory(params.conversationHistory),
  });

  // Layer 4: Trade intelligence injection
  let layer4 = '';
  if (params.tradeIntelligence) {
    const ti = params.tradeIntelligence;
    const layer4Template = loadPrompt('layer4-trade-intel-template.md');

    const confScore = ti.data_confidence_score;
    const confLabel = confScore >= 0.85 ? 'HIGH' : confScore >= 0.6 ? 'APPROXIMATE' : 'LOW';

    if (confScore >= 0.6) {
      layer4 = fillTemplate(layer4Template, {
        hs_code: ti.hs_code,
        country: ti.country,
        duty_rate: confScore < 0.85
          ? `~${ti.import_duty_rate} (approximate)`
          : String(ti.import_duty_rate),
        conf: `${Math.round(confScore * 100)}% - ${confLabel}`,
        vat_rate: String(ti.vat_rate || 0),
        additional: ti.excise_rate ? `Excise: ${ti.excise_rate}%` : 'None',
        antidumping: ti.anti_dumping_duty
          ? `${ti.anti_dumping_duty}%`
          : 'None applicable',
        certs: ti.required_certifications?.join(', ') || 'None specified',
        docs: ti.required_documents?.join(', ') || 'Standard import docs',
        ntm_codes: ti.ntm_codes?.join(', ') || 'None',
        volume: 'See buyer profile data',
        low: '0',
        high: '0',
        unit: 'unit',
      });
    } else {
      layer4 = `## Trade Intelligence\nCompliance data for HS ${ti.hs_code} into ${ti.country} has LOW confidence (${Math.round(confScore * 100)}%). Do NOT state any duty rates or regulatory requirements as fact. Say "let me verify this with our compliance team" for any compliance questions.\n[REDACTED - LOW CONF]`;
    }
  }

  // Layer 5: Matching sellers
  const layer5Template = loadPrompt('layer5-products-template.md');
  const layer5 = fillTemplate(layer5Template, {
    matching_sellers: formatMatchingSellers(params.matchingProducts),
  });

  // Emotion directive (optional, prepended to identity)
  const emotionPrefix = params.emotionDirective
    ? `EMOTIONAL CONTEXT: ${params.emotionDirective}\n\n`
    : '';

  const fullPrompt = [
    emotionPrefix + layer1,
    layer2,
    layer3,
    layer4,
    layer5,
  ]
    .filter((l) => l.trim())
    .join('\n\n---\n\n');

  const elapsed = Date.now() - startTime;
  logger.info('buildPrompt', {
    channel: params.channel,
    buyer: bp.buyer_name,
    promptLength: fullPrompt.length,
    elapsed,
    hasTradeIntel: !!params.tradeIntelligence,
    matchingProducts: params.matchingProducts.length,
  });

  return fullPrompt;
}
