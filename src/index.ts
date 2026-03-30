import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { Server as SocketServer } from 'socket.io';
import { env } from './config/env';
import logger from './utils/logger';

// Routes
import ragRoutes from './routes/rag.routes';
import communicateRoutes from './routes/communicate.routes';
import webhookRoutes from './routes/webhook.routes';
import dashboardRoutes from './routes/dashboard.routes';
import analyticsRoutes from './routes/analytics.routes';
import handoffRoutes from './routes/handoff.routes';
import automailRoutes from './routes/automail.routes';
import buyersRoutes from './routes/buyers.routes';

// Middleware
import { apiRateLimiter, webhookRateLimiter, communicateRateLimiter } from './middleware/rate-limiter';
import { requestLogger, webhookAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

// Services
import { retrievalService } from './services/rag/retrieval.service';
import { conversationService } from './services/orchestrator/conversation.service';
import { linkedinEngine } from './services/channels/linkedin.engine';
import { chatEngine } from './services/channels/chat.engine';
import { eventTrackerService } from './services/analytics/event-tracker.service';
import { abTestService } from './services/analytics/ab-test.service';
import { replyTrackerService } from './services/analytics/reply-tracker.service';
import { promptOptimizerService } from './services/analytics/prompt-optimizer.service';
import { abVariantEngine } from './services/human-feel/ab-variant.engine';
import { handoffService } from './services/orchestrator/handoff.service';
import { weeklyDigestService } from './services/analytics/weekly-digest.service';
import { zohoEmailEngine } from './services/channels/zoho-email.engine';
import { campaignService } from './services/automail/campaign.service';
import { buyerTrackerService } from './services/automail/buyer-tracker.service';
import { autoReplyEngine } from './services/automail/auto-reply.engine';
import { shortlistBuyerService } from './services/automail/shortlist-buyer.service';
import { emailOutreachService } from './services/automail/email-outreach.service';

const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new SocketServer(server, {
  cors: { origin: env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
});

// Middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Routes with rate limiting
app.use('/api/rag', apiRateLimiter(), ragRoutes);
app.use('/api/communicate', communicateRateLimiter(), communicateRoutes);
app.use('/api/webhooks', webhookAuth, webhookRateLimiter(), webhookRoutes);
app.use('/api/dashboard', apiRateLimiter(), dashboardRoutes);
app.use('/api/analytics', apiRateLimiter(), analyticsRoutes);
app.use('/api/dashboard/handoff-queue', apiRateLimiter(), handoffRoutes);
app.use('/api/automail', apiRateLimiter(), automailRoutes);
app.use('/api/buyers', apiRateLimiter(), buyersRoutes);

// Health check
app.get('/health', async (_req, res) => {
  try {
    const health = await retrievalService.healthCheck();
    const allHealthy = health.qdrant && health.redis && health.mongo;
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: health,
    });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

// Serve built React dashboard (production / Docker)
const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });
  console.log(`Dashboard served from ${dashboardDist}`);
}

// 404 + Error handler
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize services and start server
async function bootstrap(): Promise<void> {
  logger.info('Initializing Aaziko AI Communicator...');

  try {
    await Promise.all([
      retrievalService.initialize(),
      conversationService.initialize(),
      linkedinEngine.initialize(),
      eventTrackerService.initialize(),
      abTestService.initialize(),
      replyTrackerService.initialize(),
      promptOptimizerService.initialize(),
      abVariantEngine.initialize(),
      handoffService.initialize(),
      weeklyDigestService.initialize(),
      zohoEmailEngine.initialize(),
      campaignService.initialize(),
      buyerTrackerService.initialize(),
      autoReplyEngine.initialize(),
    ]);
    // ShortlistBuyer must be ready before EmailOutreach (getDb dependency)
    await shortlistBuyerService.initialize();
    await emailOutreachService.initialize();

    logger.info('All services initialized');
  } catch (error) {
    logger.error('Service initialization failed', { error });
    logger.warn('Server starting in degraded mode — some services may be unavailable');
  }

  // Attach chat engine to Socket.IO
  chatEngine.attachToServer(io);

  // Start scheduled jobs
  startScheduledJobs();

  const PORT = env.PORT || 3000;
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use. Kill the existing process or change PORT in .env`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Dashboard: http://localhost:${PORT}/api/dashboard/stats`);
    logger.info(`Health: http://localhost:${PORT}/health`);
  });
}

function startScheduledJobs(): void {
  // Aggregate metrics every hour
  setInterval(async () => {
    try {
      await replyTrackerService.aggregateMetrics('daily');
    } catch (error) {
      logger.error('Scheduled metrics aggregation failed', { error });
    }
  }, 3600000);

  // Weekly digest: Monday 9 AM IST (3:30 AM UTC)
  const now = new Date();
  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setUTCHours(3, 30, 0, 0); // 9 AM IST = 3:30 AM UTC
  const msUntilMonday = nextMonday.getTime() - now.getTime();

  setTimeout(() => {
    const digestAndReport = async () => {
      try {
        await promptOptimizerService.generateWeeklyReport();
        await weeklyDigestService.generateAndSend();
      } catch (error) {
        logger.error('Weekly digest/report failed', { error });
      }
    };
    digestAndReport();
    setInterval(digestAndReport, 7 * 24 * 3600000);
  }, msUntilMonday);

  // Email follow-up queue processor every 30 seconds
  setInterval(async () => {
    try {
      const { emailEngine } = await import('./services/channels/email.engine');
      await emailEngine.processFollowUpQueue();
    } catch (error) {
      logger.error('Follow-up queue processing failed', { error });
    }
  }, 30000);

  // Auto-mail campaign processor every 2 minutes
  if (env.AUTOMAIL_ENABLED) {
    setInterval(async () => {
      try {
        await campaignService.processCampaigns();
      } catch (error) {
        logger.error('Auto-mail campaign processing failed', { error });
      }
    }, 120000);

    // 5-day follow-up processor — runs every 30 minutes
    setInterval(async () => {
      try {
        const result = await emailOutreachService.processFollowUps();
        if (result.sent > 0) logger.info('Follow-ups processed', result);
      } catch (error) {
        logger.error('Follow-up processing failed', { error });
      }
    }, 30 * 60 * 1000);

    // Start Zoho IMAP inbox polling — feeds both legacy + new outreach system
    zohoEmailEngine.onInboundEmail(async (email) => {
      try {
        await emailOutreachService.handleReply(email);
        await autoReplyEngine.handleInboundEmail(email);
      } catch (error) {
        logger.error('Inbound email handling failed', { error });
      }
    });
    zohoEmailEngine.startInboxPolling().catch((error) => {
      logger.error('Zoho inbox polling start failed', { error });
    });

    logger.info('Auto-mail system started', {
      campaignProcessInterval: '2m',
      inboxPollInterval: `${env.AUTOMAIL_INBOX_POLL_SECONDS}s`,
    });
  }

  logger.info('Scheduled jobs started', {
    metricsInterval: '1h',
    nextWeeklyDigest: nextMonday.toISOString(),
    followUpQueueInterval: '30s',
    automailEnabled: env.AUTOMAIL_ENABLED,
  });
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Shutting down...');
  server.close();
  await Promise.allSettled([
    retrievalService.close(),
    conversationService.close(),
    linkedinEngine.close(),
    eventTrackerService.close(),
    abTestService.close(),
    replyTrackerService.close(),
    promptOptimizerService.close(),
    abVariantEngine.close(),
    handoffService.close(),
    weeklyDigestService.close(),
    zohoEmailEngine.close(),
    shortlistBuyerService.close(),
    campaignService.close(),
    buyerTrackerService.close(),
    autoReplyEngine.close(),
  ]);
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

bootstrap().catch((error) => {
  logger.error('Bootstrap failed', { error });
  process.exit(1);
});
