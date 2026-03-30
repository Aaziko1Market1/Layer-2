import logger from '../../utils/logger';
import { EmotionState } from '../../models/types';

const EMOTION_PATTERNS: Record<EmotionState, { keywords: string[]; patterns: RegExp[] }> = {
  frustrated: {
    keywords: ['issue', 'problem', 'still waiting', 'delayed', 'disappointed', 'unacceptable', 'terrible', 'horrible', 'worst', 'angry', 'furious', 'fed up'],
    patterns: [/not\s+happy/i, /waste\s+of\s+time/i, /no\s+response/i, /still\s+no/i, /how\s+long/i],
  },
  excited: {
    keywords: ['great', 'perfect', 'amazing', 'interested', 'excellent', 'wonderful', 'fantastic', 'love', 'exactly', 'brilliant'],
    patterns: [/!{2,}/, /can't wait/i, /very\s+interested/i, /sounds\s+good/i, /let'?s\s+do/i],
  },
  urgent: {
    keywords: ['asap', 'urgent', 'immediately', 'deadline', 'today', 'rush', 'emergency', 'critical', 'time-sensitive'],
    patterns: [/need\s+(?:it\s+)?(?:by|before)\s+/i, /as\s+soon\s+as/i, /running\s+out\s+of\s+time/i],
  },
  skeptical: {
    keywords: ['proof', 'guarantee', 'how do i know', 'are you sure', 'really', 'doubt', 'suspicious', 'scam', 'trust'],
    patterns: [/can\s+you\s+prove/i, /how\s+(?:can|do)\s+i\s+(?:know|trust|verify)/i, /sounds\s+too\s+good/i, /what'?s\s+the\s+catch/i],
  },
  confused: {
    keywords: ['confused', 'unclear', 'don\'t understand', 'what do you mean', 'explain', 'clarify'],
    patterns: [/i'?m\s+(?:not\s+sure|confused)/i, /what\s+(?:does|do)\s+(?:that|you)\s+mean/i, /can\s+you\s+(?:explain|clarify)/i, /\?{2,}/],
  },
  neutral: {
    keywords: [],
    patterns: [],
  },
};

const EMOTION_DIRECTIVES: Record<EmotionState, string> = {
  frustrated: 'The buyer sounds frustrated. Acknowledge their frustration first before offering solutions. Match their urgency. Be direct. Do not use positive or cheerful language.',
  excited: 'The buyer is excited and engaged. Match their energy. Move the conversation forward toward concrete next steps. Keep momentum.',
  urgent: 'The buyer has time pressure. Lead with the fastest solution. Give specific timelines. Skip the pleasantries and get to the point immediately.',
  skeptical: 'The buyer is skeptical. Provide specific evidence, data points, and references. Do not make claims without backing them up. Offer verifiable proof.',
  confused: 'The buyer seems confused. Simplify your language. Break down the information into smaller pieces. Ask a clarifying question to understand what they need.',
  neutral: '',
};

export class EmotionEngine {
  analyzeEmotion(message: string): EmotionState {
    const messageLower = message.toLowerCase();
    const scores: Record<EmotionState, number> = {
      frustrated: 0,
      excited: 0,
      urgent: 0,
      skeptical: 0,
      confused: 0,
      neutral: 0,
    };

    for (const [emotion, { keywords, patterns }] of Object.entries(EMOTION_PATTERNS)) {
      if (emotion === 'neutral') continue;

      for (const keyword of keywords) {
        if (messageLower.includes(keyword.toLowerCase())) {
          scores[emotion as EmotionState] += 2;
        }
      }

      for (const pattern of patterns) {
        if (pattern.test(message)) {
          scores[emotion as EmotionState] += 3;
        }
      }
    }

    // Exclamation marks boost excited or frustrated
    const exclamations = (message.match(/!/g) || []).length;
    if (exclamations >= 2) {
      scores.excited += exclamations;
    }

    // ALL CAPS detection boosts frustrated/urgent
    const capsWords = (message.match(/\b[A-Z]{3,}\b/g) || []).length;
    if (capsWords >= 2) {
      scores.frustrated += capsWords;
      scores.urgent += capsWords;
    }

    // Question marks boost confused/skeptical
    const questions = (message.match(/\?/g) || []).length;
    if (questions >= 2) {
      scores.confused += questions;
      scores.skeptical += 1;
    }

    // Find highest scoring emotion
    let maxEmotion: EmotionState = 'neutral';
    let maxScore = 0;

    for (const [emotion, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxEmotion = emotion as EmotionState;
      }
    }

    // Need minimum threshold to detect non-neutral
    if (maxScore < 2) {
      maxEmotion = 'neutral';
    }

    logger.info('Emotion analyzed', {
      detected: maxEmotion,
      score: maxScore,
      messageLength: message.length,
    });

    return maxEmotion;
  }

  getEmotionDirective(state: EmotionState): string {
    return EMOTION_DIRECTIVES[state] || '';
  }
}

export const emotionEngine = new EmotionEngine();
