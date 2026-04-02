import { AiClient } from '../orchestrator/model-clients/ai-client';
import { modelConfigs } from '../../config/models.config';
import { Message } from '../../models/types';
import { SHARED_KB } from '../../data/aaziko-personas';
import { BUYER_QA } from '../../data/kb-buyer-qa';
import { SELLER_QA } from '../../data/kb-seller-qa';
import { getContextForBuyer } from '../../data/aaziko-business-data';
import { IDENTITY, MODULES, BUYER_JOURNEY, SELLER_JOURNEY, GUARDRAILS, GLOSSARY, COMM_RULES } from '../../data/aaziko-knowledge-base';
import logger from '../../utils/logger';

export type UserRole = 'buyer' | 'seller' | 'visitor' | 'admin';
type SessionMessage = { role: 'user' | 'assistant'; content: string; timestamp: number };

interface ChatSession {
  id: string;
  userRole: UserRole;
  messages: SessionMessage[];
  createdAt: number;
  lastActivity: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY_MESSAGES = 20;

class SupportChatService {
  private client: AiClient;
  private sessions: Map<string, ChatSession> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.client = new AiClient(modelConfigs.supportChat);
  }

  initialize(): void {
    this.cleanupInterval = setInterval(() => this.cleanExpiredSessions(), 5 * 60 * 1000);
    logger.info('SupportChatService initialized', { model: modelConfigs.supportChat.model });
  }

  close(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }

  async chat(sessionId: string, userMessage: string, userRole: UserRole = 'visitor'): Promise<string> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        userRole: userRole,
        messages: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      this.sessions.set(sessionId, session);
    }

    session.lastActivity = Date.now();
    session.messages.push({ role: 'user', content: userMessage, timestamp: Date.now() });

    if (session.messages.length > MAX_HISTORY_MESSAGES) {
      session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);
    }

    const systemPrompt = this.buildSystemPrompt(session.userRole, userMessage);
    const messages: Message[] = session.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await this.client.chat(systemPrompt, messages, {
        temperature: 0.6,
        maxTokens: 800,
      });

      session.messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
      return response;
    } catch (error) {
      logger.error('SupportChatService.chat failed', { sessionId, error: (error as Error).message });
      return 'I apologize, but I\'m having trouble processing your request right now. Please try again in a moment, or contact us at trade@aaziko.com for immediate assistance.';
    }
  }

  private buildSystemPrompt(userRole: UserRole, currentQuestion: string): string {
    const qaContext = this.findRelevantQA(currentQuestion);
    const productContext = getContextForBuyer();

    const roleLabel =
      userRole === 'buyer' ? 'a global buyer (importer, distributor, brand owner)' :
      userRole === 'seller' ? 'an Indian manufacturer / seller' :
      userRole === 'admin' ? 'an Aaziko platform admin / operator who manages the system' :
      'a visitor exploring the Aaziko platform';

    return `You are Aaziko Support Assistant — the official AI support agent embedded on the Aaziko.com platform.
You help ${roleLabel} get quick, accurate answers about Aaziko's services, trade processes, and platform features.

YOUR IDENTITY:
- Name: Aaziko Support Assistant
- Platform: ${IDENTITY.name} — "${IDENTITY.tagline}"
- Vision: ${IDENTITY.vision}
- Stats: ${IDENTITY.stats.verified_suppliers} verified suppliers | ${IDENTITY.stats.countries_served} countries | ${IDENTITY.stats.total_exports}

COMMUNICATION STYLE:
${COMM_RULES.style.map(s => `- ${s}`).join('\n')}
- Tone: ${COMM_RULES.tone}
- Keep responses concise (2-4 paragraphs max), helpful, and actionable
- Use bullet points for lists
- Always end with a clear next step or offer to help further

PLATFORM MODULES:
${MODULES.map(m => `- ${m.name} [${m.status}]`).join('\n')}

${userRole === 'buyer' ? `BUYER JOURNEY ON AAZIKO:
${BUYER_JOURNEY.map((step, i) => `${i + 1}. ${step}`).join('\n')}` : ''}

${userRole === 'seller' ? `SELLER JOURNEY ON AAZIKO:
${SELLER_JOURNEY.map((step, i) => `${i + 1}. ${step}`).join('\n')}` : ''}

TRADE GLOSSARY:
${Object.entries(GLOSSARY).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

GUARDRAILS — NEVER say these:
${GUARDRAILS.map(g => `- BAD: "${g.bad}" → GOOD: "${g.good}"`).join('\n')}

${SHARED_KB}

${productContext}

${qaContext ? `RELEVANT Q&A FROM KNOWLEDGE BASE:\n${qaContext}` : ''}

RULES:
1. Answer ONLY based on the knowledge provided above. Do NOT invent data, prices, or capabilities.
2. If you don't know something, say: "I don't have that specific information right now. Let me connect you with our trade team at trade@aaziko.com for a detailed answer."
3. Never promise guaranteed customs clearance, guaranteed finance, or guaranteed orders.
4. Never present IN_DEVELOPMENT modules as live features.
5. Be warm and professional — sound like a knowledgeable trade advisor, not a generic bot.
6. For pricing questions, always give ranges with the note "FOB India, subject to specs and volume."
7. If the user seems ready to take action, guide them to the relevant next step on the platform.`;
  }

  private findRelevantQA(question: string): string {
    const allQA = [...BUYER_QA, ...SELLER_QA];
    const questionLower = question.toLowerCase();
    const keywords = questionLower.split(/\s+/).filter(w => w.length > 3);

    const scored = allQA.map(qa => {
      let score = 0;
      const qLower = qa.q.toLowerCase();
      const aLower = qa.a.toLowerCase();

      for (const keyword of keywords) {
        if (qLower.includes(keyword)) score += 3;
        if (aLower.includes(keyword)) score += 1;
      }
      return { qa, score };
    });

    const relevant = scored
      .filter(s => s.score > 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (relevant.length === 0) return '';

    return relevant
      .map(r => `Q: ${r.qa.q}\nA: ${r.qa.a}`)
      .join('\n\n');
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  private cleanExpiredSessions(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug('SupportChat sessions cleaned', { cleaned, remaining: this.sessions.size });
    }
  }
}

export const supportChatService = new SupportChatService();
