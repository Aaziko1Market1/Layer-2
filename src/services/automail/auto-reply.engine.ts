import { MongoClient, Db, ObjectId } from 'mongodb';
import { env } from '../../config/env';
import logger from '../../utils/logger';
import { zohoEmailEngine } from '../channels/zoho-email.engine';
import { chatWithFallback, getModelTier } from '../orchestrator/tier-router';
import { retrievalService } from '../rag/retrieval.service';
import { conversationService } from '../orchestrator/conversation.service';
import { buyerTrackerService } from './buyer-tracker.service';
import {
  BuyerOutreach,
  BuyerProfile,
  InboundEmailParsed,
  BuyerResponseStatus,
} from '../../models/types';

export class AutoReplyEngine {
  private mongo!: Db;
  private mongoClient: MongoClient;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    logger.info('AutoReplyEngine initialized');
  }

  async handleInboundEmail(email: InboundEmailParsed): Promise<void> {
    await buyerTrackerService.processInboundEmail(email);

    const outreach = await this.mongo
      .collection('buyer_outreach')
      .findOne({
        buyer_email: { $regex: new RegExp(`^${email.from_email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      }) as unknown as BuyerOutreach | null;

    if (!outreach) {
      logger.info('No outreach record for inbound email — skipping auto-reply', {
        from: email.from_email,
      });
      return;
    }

    const status = outreach.response_status;

    if (status === 'not_interested') {
      logger.info('Buyer marked not interested — no auto-reply', {
        buyer: outreach.buyer_name,
      });
      return;
    }

    if (status === 'question' || status === 'interested' || status === 'replied') {
      await this.generateAndSendReply(email, outreach);
    }
  }

  private async generateAndSendReply(
    email: InboundEmailParsed,
    outreach: BuyerOutreach
  ): Promise<void> {
    const buyerProfile = await retrievalService.getBuyerProfile(
      outreach.buyer_name,
      outreach.buyer_country
    );

    const conversationHistory = await conversationService.getRecentMessages(
      outreach.buyer_name
    );

    const previousEmails = outreach.emails_sent
      .map((e) => {
        let entry = `[SENT - ${e.stage}] Subject: ${e.subject}\n${e.body_text}`;
        if (e.reply_text) {
          entry += `\n\n[BUYER REPLY]\n${e.reply_text}`;
        }
        return entry;
      })
      .join('\n\n---\n\n');

    const productResults = await retrievalService.getMatchingProducts(
      email.text_body,
      { limit: 3 }
    );

    const productContext = productResults.results
      .map((p) =>
        `- ${p.product_name} (${p.category}) by ${p.seller_name} — $${p.price_range_usd.min}-$${p.price_range_usd.max}, MOQ: ${p.moq}`
      )
      .join('\n');

    const buyerContext = buyerProfile
      ? `
Buyer: ${buyerProfile.buyer_name}
Company: ${buyerProfile.company || 'N/A'}
Country: ${buyerProfile.country}
Tier: ${buyerProfile.buyer_tier}
Products: ${buyerProfile.product_categories.join(', ')}
Trade Volume: $${buyerProfile.total_trade_volume_usd.toLocaleString()}
      `.trim()
      : `Buyer: ${outreach.buyer_name}, Country: ${outreach.buyer_country}`;

    const systemPrompt = `You are ${env.ZOHO_FROM_NAME || 'Arjun'}, a senior trade consultant at Aaziko — India's premier B2B trade platform.

You are replying to a buyer's email. This is part of an ongoing conversation.

BUYER PROFILE:
${buyerContext}

EMAIL THREAD:
${previousEmails}

BUYER'S LATEST EMAIL:
Subject: ${email.subject}
${email.text_body}

${productContext ? `RELEVANT PRODUCTS AVAILABLE:\n${productContext}\n` : ''}
CLASSIFICATION: ${outreach.response_status}

Rules:
- Reply naturally and helpfully to the buyer's question or interest
- Reference their specific trade data when relevant
- If they asked about products, include specific product recommendations with pricing
- If they expressed interest, propose concrete next steps (samples, meeting, quotation)
- Keep it concise and professional (150-300 words)
- Do NOT include "Subject:" line
- Do NOT use placeholder brackets
    - Sign off as ${env.ZOHO_FROM_NAME || 'Arjun'} from Aaziko`;

    const tier = getModelTier(buyerProfile);
    const { response } = await chatWithFallback(
      tier,
      systemPrompt,
      [{ role: 'user', content: 'Generate the reply email' }]
    );

    const replySubject = email.subject.startsWith('Re:')
      ? email.subject
      : `Re: ${email.subject}`;

    const result = await zohoEmailEngine.sendMessage(email.from_email, {
      text: response.trim(),
      subject: replySubject,
    });

    if (result.success) {
      await this.mongo.collection('buyer_outreach').updateOne(
        { _id: new ObjectId((outreach as any)._id) },
        {
          $push: {
            emails_sent: {
              message_id: result.messageId,
              stage: outreach.current_stage,
              subject: replySubject,
              body_text: response.trim(),
              sent_at: new Date(),
            } as any,
          },
          $set: {
            last_email_sent_at: new Date(),
            updated_at: new Date(),
          },
        }
      );

      // Store in conversation service for continuity
      await conversationService.addMessage(
        outreach.buyer_name,
        {
          role: 'buyer',
          content: email.text_body,
          channel: 'email',
          timestamp: email.date,
        },
        'email',
        tier,
        []
      );

      await conversationService.addMessage(
        outreach.buyer_name,
        {
          role: 'agent',
          content: response.trim(),
          channel: 'email',
          timestamp: new Date(),
          model_used: tier,
        },
        'email',
        tier,
        []
      );

      logger.info('Auto-reply sent', {
        buyer: outreach.buyer_name,
        to: email.from_email,
        messageId: result.messageId,
      });
    } else {
      logger.error('Auto-reply send failed', {
        buyer: outreach.buyer_name,
        error: result.error,
      });
    }
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}

export const autoReplyEngine = new AutoReplyEngine();
