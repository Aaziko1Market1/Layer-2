import { Router, Request, Response } from 'express';
import { channelRouter } from '../services/channels/channel-router';
import { emailEngine } from '../services/channels/email.engine';
import { zohoEmailEngine } from '../services/channels/zoho-email.engine';
import { whatsappEngine } from '../services/channels/whatsapp.engine';
import { autoReplyEngine } from '../services/automail/auto-reply.engine';
import logger from '../utils/logger';

const router = Router();

router.post('/email/inbound', async (req: Request, res: Response) => {
  try {
    const response = await channelRouter.routeIncoming('email', req.body);
    res.json({ success: true, messageId: response?.id });
  } catch (error) {
    logger.error('Email inbound webhook failed', { error });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.post('/email/events', async (req: Request, res: Response) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    for (const event of events) {
      await emailEngine.handleEvent(event);
    }
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Email event webhook failed', { error });
    res.status(500).json({ error: 'Event processing failed' });
  }
});

router.post('/zoho/inbound', async (req: Request, res: Response) => {
  try {
    const email = req.body;
    await autoReplyEngine.handleInboundEmail(email);
    res.json({ success: true });
  } catch (error) {
    logger.error('Zoho inbound webhook failed', { error });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    // WhatsApp verification challenge
    if (req.query['hub.mode'] === 'subscribe') {
      const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'aaziko-verify';
      if (req.query['hub.verify_token'] === verifyToken) {
        res.status(200).send(req.query['hub.challenge']);
        return;
      }
      res.status(403).send('Verification failed');
      return;
    }

    // Status updates
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    if (change?.value?.statuses) {
      await whatsappEngine.handleStatusWebhook(req.body);
      res.status(200).send('OK');
      return;
    }

    // Incoming message
    if (change?.value?.messages) {
      const response = await channelRouter.routeIncoming('whatsapp', req.body);
      res.json({ success: true, messageId: response?.id });
      return;
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('WhatsApp webhook failed', { error });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.get('/whatsapp', (req: Request, res: Response) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'aaziko-verify';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    res.status(200).send(req.query['hub.challenge']);
    return;
  }
  res.status(403).send('Verification failed');
});

router.post('/linkedin/status', async (req: Request, res: Response) => {
  try {
    const response = await channelRouter.routeIncoming('linkedin', req.body);
    res.json({ success: true, messageId: response?.id });
  } catch (error) {
    logger.error('LinkedIn webhook failed', { error });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
