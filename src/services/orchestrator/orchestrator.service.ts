import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger';
import { retrievalService } from '../rag/retrieval.service';
import { conversationService } from './conversation.service';
import { buildPrompt } from './prompt-builder/prompt-builder';
import { getModelTier, chatWithFallback, getIntentClient } from './tier-router';
import { validateResponse } from '../compliance/validator.service';
import {
  IncomingMessage,
  OutgoingMessage,
  BuyerProfile,
  IntentClassification,
  ConversationMessage,
  ComplianceInfo,
  Product,
  Message,
} from '../../models/types';

export class OrchestratorService {
  async processIncoming(message: IncomingMessage): Promise<OutgoingMessage> {
    const pipelineStart = Date.now();
    const timings: Record<string, number> = {};

    // ── Step A: PARALLEL — Intent + Buyer lookup ──
    const stepAStart = Date.now();
    const [intentResult, buyerProfile] = await Promise.all([
      this.classifyIntent(message.text),
      retrievalService.getBuyerProfile(
        message.senderName,
        message.senderCountry || ''
      ),
    ]);
    timings['stepA'] = Date.now() - stepAStart;

    logger.info('Step A complete', {
      intent: intentResult.intent,
      buyerFound: !!buyerProfile,
      tier: buyerProfile?.buyer_tier,
      elapsed: timings['stepA'],
    });

    // ── Step B: PARALLEL — Research + Products + Compliance ──
    const stepBStart = Date.now();
    const needsCompliance = [
      'product_inquiry', 'pricing_request', 'compliance_question', 'order_placement',
    ].includes(intentResult.intent);

    const [productResults, complianceData] = await Promise.all([
      retrievalService.getMatchingProducts(
        message.text,
        {
          hsCode: intentResult.entities.hsCode,
          limit: 5,
        }
      ),
      needsCompliance && (intentResult.entities.hsCode || buyerProfile?.hs_codes?.[0])
        ? retrievalService.getComplianceData(
            intentResult.entities.hsCode || buyerProfile?.hs_codes?.[0] || '',
            intentResult.entities.country || buyerProfile?.country || ''
          )
        : Promise.resolve(null),
    ]);
    timings['stepB'] = Date.now() - stepBStart;

    // ── Step C: SEQUENTIAL — AI Response Generation ──
    const stepCStart = Date.now();
    const effectiveProfile = buyerProfile || this.createDefaultProfile(message);
    const tier = getModelTier(buyerProfile);
    const conversationHistory = await conversationService.getRecentMessages(
      message.senderName
    );

    const systemPrompt = buildPrompt({
      channel: message.channel,
      buyerProfile: effectiveProfile,
      conversationHistory,
      tradeIntelligence: complianceData,
      matchingProducts: productResults.results,
    });

    const messages: Message[] = [
      ...conversationHistory.map((m) => ({
        role: (m.role === 'buyer' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message.text },
    ];

    const { response: aiResponse, tierUsed } = await chatWithFallback(
      tier,
      systemPrompt,
      messages
    );
    timings['stepC'] = Date.now() - stepCStart;

    logger.info('Step C complete', {
      tier,
      tierUsed,
      responseLength: aiResponse.length,
      elapsed: timings['stepC'],
    });

    // ── Step D: SEQUENTIAL — Compliance validation ──
    const stepDStart = Date.now();
    const validation = validateResponse(aiResponse, complianceData);
    const finalResponse = validation.editedResponse || aiResponse;
    timings['stepD'] = Date.now() - stepDStart;

    // ── Step E: PARALLEL fire-and-forget — Store + Emit ──
    const outgoingMessage: OutgoingMessage = {
      id: uuidv4(),
      channel: message.channel,
      recipientId: message.senderName,
      text: finalResponse,
      modelTierUsed: tierUsed,
      complianceFlags: validation.flaggedClaims,
      metadata: {
        intent: intentResult.intent,
        entities: intentResult.entities,
        timings,
        humanReviewNeeded: validation.humanReviewNeeded,
      },
    };

    // Fire and forget
    this.storeConversationTurn(message, outgoingMessage, tierUsed).catch((err) =>
      logger.error('Failed to store conversation turn', { error: err })
    );

    const totalTime = Date.now() - pipelineStart;
    logger.info('Pipeline complete', {
      messageId: outgoingMessage.id,
      buyer: message.senderName,
      channel: message.channel,
      intent: intentResult.intent,
      tier: tierUsed,
      totalTime,
      timings,
      complianceFlags: validation.flaggedClaims.length,
      humanReviewNeeded: validation.humanReviewNeeded,
    });

    return outgoingMessage;
  }

  private async classifyIntent(text: string): Promise<IntentClassification> {
    try {
      const client = getIntentClient();
      const systemPrompt = `You are an intent classifier for a B2B trade platform. Classify the buyer's message into one of these intents: product_inquiry, pricing_request, compliance_question, order_placement, sample_request, factory_visit, general_question, complaint, follow_up, meeting_request, unknown.

Also extract entities: hsCode (if any HS code mentioned), country (if any country mentioned), product (product name), quantity (number), priceRange (min/max).

Respond in JSON only: {"intent": "...", "confidence": 0.0-1.0, "entities": {"hsCode": "", "country": "", "product": "", "quantity": null, "priceRange": null}}`;

      const response = await client.chat(systemPrompt, [
        { role: 'user', content: text },
      ], { temperature: 0.1, maxTokens: 256 });

      const parsed = JSON.parse(response.trim());
      return {
        intent: parsed.intent || 'unknown',
        confidence: parsed.confidence || 0.5,
        entities: parsed.entities || {},
      };
    } catch (error) {
      logger.warn('Intent classification failed, defaulting to unknown', { error });
      return {
        intent: 'unknown',
        confidence: 0,
        entities: {},
      };
    }
  }

  private createDefaultProfile(message: IncomingMessage): BuyerProfile {
    return {
      normalized_name: message.senderName.toLowerCase(),
      buyer_name: message.senderName,
      country: message.senderCountry || 'Unknown',
      hs_codes: [],
      product_categories: [],
      total_trade_volume_usd: 0,
      total_quantity: 0,
      avg_unit_price_usd: 0,
      trade_count: 0,
      first_trade_date: new Date(),
      last_trade_date: new Date(),
      trade_frequency_per_month: 0,
      ports_used: [],
      indian_suppliers: [],
      top_supplier: '',
      buyer_addresses: [],
      buyer_tier: 'bronze',
      communication_model_tier: 'mid',
      last_updated: new Date(),
    };
  }

  private async storeConversationTurn(
    incoming: IncomingMessage,
    outgoing: OutgoingMessage,
    tierUsed: string
  ): Promise<void> {
    const buyerMessage: ConversationMessage = {
      role: 'buyer',
      content: incoming.text,
      channel: incoming.channel,
      timestamp: incoming.timestamp,
    };

    const agentMessage: ConversationMessage = {
      role: 'agent',
      content: outgoing.text,
      channel: outgoing.channel,
      timestamp: new Date(),
      model_used: tierUsed,
    };

    await conversationService.addMessage(
      incoming.senderName,
      buyerMessage,
      incoming.channel,
      outgoing.modelTierUsed,
      []
    );

    await conversationService.addMessage(
      incoming.senderName,
      agentMessage,
      incoming.channel,
      outgoing.modelTierUsed,
      outgoing.complianceFlags
    );
  }
}

export const orchestratorService = new OrchestratorService();
