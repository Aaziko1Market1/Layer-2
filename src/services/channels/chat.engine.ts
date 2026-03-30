import { Server as SocketServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import { IChannelEngine } from './channel.interface';
import { ChannelMessage, IncomingMessage, DeliveryResult, DeliveryStatus } from '../../models/types';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class ChatEngine implements IChannelEngine {
  private io: SocketServer | null = null;
  private redis: Redis;
  private activeSessions = new Map<string, { socket: Socket; lastActivity: number }>();

  constructor() {
    this.redis = createRedisClient('chat');
  }

  attachToServer(io: SocketServer): void {
    this.io = io;

    io.on('connection', (socket: Socket) => {
      const sessionId = socket.handshake.query.sessionId as string || uuidv4();
      logger.info('Chat session connected', { sessionId, socketId: socket.id });

      this.activeSessions.set(sessionId, { socket, lastActivity: Date.now() });

      socket.on('message', async (data: { text: string; senderName: string }) => {
        const session = this.activeSessions.get(sessionId);
        if (session) session.lastActivity = Date.now();

        socket.emit('message_received', { id: uuidv4(), timestamp: new Date() });
      });

      socket.on('disconnect', () => {
        this.activeSessions.delete(sessionId);
        logger.info('Chat session disconnected', { sessionId });
      });
    });

    // Session cleanup every minute
    setInterval(() => this.cleanupSessions(), 60000);

    logger.info('ChatEngine attached to Socket.IO server');
  }

  async sendMessage(recipient: string, message: ChannelMessage): Promise<DeliveryResult> {
    const messageId = uuidv4();
    const now = new Date();
    const session = this.activeSessions.get(recipient);

    if (!session) {
      logger.warn('Chat session not found', { recipient });
      return { success: false, messageId, channel: 'chat', timestamp: now, error: 'Session not found' };
    }

    // Simulate typing indicator (1-3s delay)
    const typingDelay = 1000 + Math.random() * 2000;
    session.socket.emit('typing', { duration: typingDelay });

    await new Promise((resolve) => setTimeout(resolve, typingDelay));

    session.socket.emit('message', {
      id: messageId,
      text: message.text,
      sender: 'agent',
      timestamp: now,
    });

    session.lastActivity = Date.now();
    logger.info('Chat message sent', { recipient, messageId });

    return { success: true, messageId, channel: 'chat', timestamp: now };
  }

  async receiveWebhook(payload: any): Promise<IncomingMessage> {
    return {
      id: payload.id || uuidv4(),
      channel: 'chat',
      senderName: payload.senderName || '',
      text: payload.text || '',
      timestamp: new Date(payload.timestamp || Date.now()),
      metadata: { sessionId: payload.sessionId },
    };
  }

  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus> {
    return { messageId, status: 'delivered', timestamp: new Date() };
  }

  formatForChannel(rawMessage: string): ChannelMessage {
    // Chat allows slightly richer formatting
    return { text: rawMessage };
  }

  emitToSession(sessionId: string, event: string, data: any): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.socket.emit(event, data);
    }
  }

  emitProductCard(sessionId: string, product: any): void {
    this.emitToSession(sessionId, 'product_card', product);
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  private cleanupSessions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
        session.socket.emit('session_expired', { reason: 'inactivity' });
        session.socket.disconnect(true);
        this.activeSessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up inactive chat sessions', { count: cleaned });
    }
  }
}

export const chatEngine = new ChatEngine();
