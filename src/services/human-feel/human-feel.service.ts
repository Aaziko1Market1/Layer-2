import logger from '../../utils/logger';
import { timingEngine } from './timing.engine';
import { memoryCallbackEngine } from './memory-callback.engine';
import { emotionEngine } from './emotion.engine';
import { abVariantEngine } from './ab-variant.engine';
import {
  BuyerProfile,
  Channel,
  ConversationMessage,
  EmotionState,
} from '../../models/types';

export interface EnhancedMessage {
  message: string;
  scheduledSendTime: Date;
  variant?: 'A' | 'B';
  emotionState: EmotionState;
  memoryCallback?: string;
}

export class HumanFeelService {
  async enhanceMessage(
    rawResponse: string,
    channel: Channel,
    buyerProfile: BuyerProfile,
    history: ConversationMessage[],
    incomingText?: string
  ): Promise<EnhancedMessage> {
    const startTime = Date.now();

    // 1. Emotion analysis on incoming message
    const emotionState = incomingText
      ? emotionEngine.analyzeEmotion(incomingText)
      : 'neutral' as EmotionState;

    // 2. Memory callbacks from conversation history
    const callbacks = memoryCallbackEngine.getCallbacks(history, buyerProfile);
    const memoryCallback = callbacks.length > 0 ? callbacks[0].phrase : undefined;

    // 3. Calculate timing delay
    const messageType = history.length === 0 ? 'first_reply' : 'follow_up';
    const delayMs = timingEngine.calculateDelay(
      channel,
      messageType as any,
      buyerProfile.timezone
    );
    const scheduledSendTime = new Date(Date.now() + delayMs);

    // 4. A/B variant (outbound only, not replies)
    let variant: 'A' | 'B' | undefined;
    if (history.length === 0) {
      // First contact — this is outbound
      const activeExperiment = 'default_outbound_v1';
      variant = abVariantEngine.assignVariant(
        buyerProfile.normalized_name,
        activeExperiment
      );
    }

    const elapsed = Date.now() - startTime;
    logger.info('HumanFeel enhancement', {
      buyer: buyerProfile.buyer_name,
      channel,
      emotionState,
      hasCallback: !!memoryCallback,
      variant,
      delayMs,
      elapsed,
    });

    return {
      message: rawResponse,
      scheduledSendTime,
      variant,
      emotionState,
      memoryCallback,
    };
  }
}

export const humanFeelService = new HumanFeelService();
