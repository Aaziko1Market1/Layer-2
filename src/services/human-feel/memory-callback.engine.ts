import logger from '../../utils/logger';
import { ConversationMessage, BuyerProfile, MemoryCallback } from '../../models/types';

const usedCallbacks = new Map<string, Set<string>>();

export class MemoryCallbackEngine {
  getCallbacks(
    history: ConversationMessage[],
    buyerProfile: BuyerProfile
  ): MemoryCallback[] {
    const callbacks: MemoryCallback[] = [];
    const buyerKey = buyerProfile.normalized_name;

    if (!history || history.length < 2) return [];

    const used = usedCallbacks.get(buyerKey) || new Set<string>();

    // Scan for product references mentioned 2+ turns ago
    for (let i = 0; i < history.length - 2; i++) {
      const msg = history[i];
      if (msg.role !== 'buyer') continue;

      const productKeywords = this.extractProductKeywords(msg.content);
      for (const keyword of productKeywords) {
        const callbackKey = `product:${keyword}`;
        if (!used.has(callbackKey)) {
          callbacks.push({
            type: 'product_reference',
            phrase: `Remember the ${keyword} you asked about earlier`,
            sourceMessageIndex: i,
          });
        }
      }
    }

    // Scan for pain points
    const painPatterns = [
      { pattern: /(?:problem|issue|challenge|difficult|struggle)\s+(?:with\s+)?(.{5,40})/gi, type: 'pain_point' as const },
      { pattern: /(?:delayed|late|waiting for)\s+(.{5,30})/gi, type: 'pain_point' as const },
    ];

    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (msg.role !== 'buyer') continue;

      for (const { pattern, type } of painPatterns) {
        const matches = [...msg.content.matchAll(pattern)];
        for (const match of matches) {
          const pain = match[1]?.trim();
          if (pain && !used.has(`pain:${pain}`)) {
            callbacks.push({
              type,
              phrase: `I know you mentioned challenges with ${pain}`,
              sourceMessageIndex: i,
            });
          }
        }
      }
    }

    // Scan for personal details (expansion, project, etc.)
    const personalPatterns = [
      /(?:our|my|we're)\s+(?:new|upcoming)\s+(expansion|project|factory|warehouse|facility|office)/gi,
      /(?:planning|launching|starting)\s+(?:a\s+)?(.{5,30})/gi,
    ];

    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (msg.role !== 'buyer') continue;

      for (const pattern of personalPatterns) {
        const matches = [...msg.content.matchAll(pattern)];
        for (const match of matches) {
          const detail = match[1]?.trim();
          if (detail && !used.has(`personal:${detail}`)) {
            callbacks.push({
              type: 'personal_detail',
              phrase: `How did the ${detail} go?`,
              sourceMessageIndex: i,
            });
          }
        }
      }
    }

    // Scan for previous quotes/pricing discussions
    const pricePattern = /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:per|\/)\s*(\w+)/gi;
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (msg.role !== 'agent') continue;

      const matches = [...msg.content.matchAll(pricePattern)];
      for (const match of matches) {
        const price = match[1];
        const unit = match[2];
        const callbackKey = `quote:${price}:${unit}`;
        if (!used.has(callbackKey)) {
          // Find what product was being discussed
          const product = this.findNearbyProduct(history, i);
          callbacks.push({
            type: 'previous_quote',
            phrase: `Last time we discussed ${product || 'pricing'} at $${price} per ${unit}`,
            sourceMessageIndex: i,
          });
        }
      }
    }

    // Return max 1 callback (rule: maximum 1 callback per message)
    if (callbacks.length > 0) {
      const selected = callbacks[0];
      const selectedKey = `${selected.type}:${selected.phrase}`;
      used.add(selectedKey);
      usedCallbacks.set(buyerKey, used);

      logger.info('Memory callback selected', {
        buyer: buyerProfile.buyer_name,
        type: selected.type,
        phrase: selected.phrase.substring(0, 50),
      });

      return [selected];
    }

    return [];
  }

  private extractProductKeywords(text: string): string[] {
    const keywords: string[] = [];
    const productPatterns = [
      /(?:looking for|need|want|interested in|inquiring about)\s+(.{3,40}?)(?:\.|,|\?|$)/gi,
      /(?:cotton|steel|textile|yarn|fabric|chemical|polymer|auto part|leather|ceramic|marble|granite|rice|spice|tea|pharmaceutical)/gi,
    ];

    for (const pattern of productPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const kw = (match[1] || match[0]).trim().toLowerCase();
        if (kw.length > 2 && kw.length < 40) {
          keywords.push(kw);
        }
      }
    }

    return keywords.slice(0, 3);
  }

  private findNearbyProduct(history: ConversationMessage[], index: number): string {
    for (let i = index; i >= Math.max(0, index - 3); i--) {
      const msg = history[i];
      if (msg.role === 'buyer') {
        const products = this.extractProductKeywords(msg.content);
        if (products.length > 0) return products[0];
      }
    }
    return '';
  }
}

export const memoryCallbackEngine = new MemoryCallbackEngine();
