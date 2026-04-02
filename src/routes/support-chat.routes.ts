import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supportChatService, UserRole } from '../services/support-chat/support-chat.service';
import logger from '../utils/logger';

const router = Router();

const chatSchema = z.object({
  sessionId: z.string().nullish(),
  message: z.string().min(1).max(2000),
  userRole: z.enum(['buyer', 'seller', 'visitor', 'admin']).optional(),
});

router.post('/message', async (req: Request, res: Response) => {
  try {
    const parsed = chatSchema.parse(req.body);
    const sessionId = parsed.sessionId ?? uuidv4();
    const userRole: UserRole = (parsed.userRole as UserRole) || 'visitor';

    const reply = await supportChatService.chat(sessionId, parsed.message, userRole);

    res.json({
      sessionId,
      reply,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
      return;
    }
    logger.error('POST /support-chat/message failed', { error });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    supportChatService.deleteSession(sessionId);
    res.json({ success: true });
  } catch (error) {
    logger.error('DELETE /support-chat/session failed', { error });
    res.status(500).json({ error: 'Failed to clear session' });
  }
});

router.get('/health', async (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    activeSessions: supportChatService.getActiveSessionCount(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
