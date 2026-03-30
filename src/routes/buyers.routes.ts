import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { shortlistBuyerService } from '../services/automail/shortlist-buyer.service';
import { emailOutreachService } from '../services/automail/email-outreach.service';
import { chatWithFallback } from '../services/orchestrator/tier-router';
import logger from '../utils/logger';

const router = Router();

// ── Buyer list (paginated, filtered) ──────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      country, category, lead_priority, intent_priority,
      hasEmail, min_lead_score, min_trade_volume, hs_code,
      search, limit, skip, sort, sortDir, type,
    } = req.query as Record<string, string>;

    const result = await shortlistBuyerService.listBuyers({
      type: (type as any) || 'buyer',
      country,
      category,
      lead_priority,
      intent_priority,
      hasEmail: hasEmail === 'true' ? true : hasEmail === 'false' ? false : undefined,
      min_lead_score: min_lead_score ? parseInt(min_lead_score, 10) : undefined,
      min_trade_volume: min_trade_volume ? parseFloat(min_trade_volume) : undefined,
      hs_code,
      search,
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
      sort: (sort as any) || 'totalAmount',
      sortDir: sortDir === '1' ? 1 : -1,
    });

    // Attach extracted contact info to each buyer
    const enrichedBuyers = result.buyers.map((b) => ({
      ...b,
      primaryEmail: shortlistBuyerService.extractPrimaryEmail(b),
      allExtractedEmails: shortlistBuyerService.extractAllEmails(b),
      allExtractedPhones: shortlistBuyerService.extractAllPhones(b),
      contactPersonName: shortlistBuyerService.extractContactPersonName(b),
      // Pass TT pipeline contact_details directly so frontend can show them
      contact_details: b.contact_details || [],
      enrichment_status: b.enrichment_status || null,
    }));

    res.json({ buyers: enrichedBuyers, total: result.total });
  } catch (error) {
    logger.error('GET /buyers failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Filter options ─────────────────────────────────────────────────────
router.get('/filters', async (_req: Request, res: Response) => {
  try {
    const [countries, categories] = await Promise.all([
      shortlistBuyerService.getCountries(),
      shortlistBuyerService.getCategories(),
    ]);
    res.json({ countries, categories });
  } catch (error) {
    logger.error('GET /buyers/filters failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Get single buyer ──────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const buyer = await shortlistBuyerService.getBuyerById(req.params.id);
    if (!buyer) {
      res.status(404).json({ error: 'Buyer not found' });
      return;
    }
    const primary_email = shortlistBuyerService.extractPrimaryEmail(buyer);
    const all_emails    = shortlistBuyerService.extractAllEmails(buyer);
    const all_phones    = shortlistBuyerService.extractAllPhones(buyer);
    const contact_name  = shortlistBuyerService.extractContactPersonName(buyer);
    const memory        = await emailOutreachService.getBuyerMemory(buyer._id);
    const conversation  = await emailOutreachService.getBuyerConversation(buyer._id);
    res.json({
      buyer: {
        ...buyer,
        contact_details: buyer.contact_details || [],
        enrichment_status: buyer.enrichment_status || null,
      },
      primary_email,
      all_emails,
      all_phones,
      contact_name,
      memory,
      conversation,
    });
  } catch (error) {
    logger.error('GET /buyers/:id failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Preview social message (LinkedIn / WhatsApp — generate only, no send) ────
router.post('/:id/preview-message', async (req: Request, res: Response) => {
  try {
    const channel = (req.query.channel as string) || 'linkedin';
    if (!['linkedin', 'whatsapp'].includes(channel)) {
      res.status(400).json({ error: 'channel must be linkedin or whatsapp' }); return;
    }
    const buyer = await shortlistBuyerService.getBuyerById(req.params.id);
    if (!buyer) { res.status(404).json({ error: 'Buyer not found' }); return; }

    // Load the channel-specific prompt guide
    const promptFile = path.join(__dirname, '..', 'prompts', `channel-${channel}.md`);
    const channelGuide = fs.existsSync(promptFile) ? fs.readFileSync(promptFile, 'utf-8') : '';

    const products = buyer.products.slice(0, 5).map((p: string) =>
      p.replace(/^RAW MATERIALS FOR[^:]+:/i, '').replace(/^[A-Z\s]+:\s*/i, '').replace(/ITEM CODE:.*/i, '').trim()
    ).filter(Boolean);

    const contactName = shortlistBuyerService.extractContactPersonName(buyer);
    const allPhones = shortlistBuyerService.extractAllPhones(buyer);
    const allLinkedins = (buyer.contact_details || [])
      .filter((c: any) => c.linkedin)
      .map((c: any) => c.linkedin as string);

    const buyerContext = `
BUYER PROFILE:
- Company: ${buyer.name}
- Country: ${buyer.country}
- Contact Person: ${contactName || 'Procurement Team'}
- HS Code: ${(buyer.hsCodes || []).slice(0, 3).join(', ') || 'N/A'}
- Trade Volume: $${(buyer.totalAmount || 0).toLocaleString()} across ${buyer.transactionCount || 0} shipments
- Products imported: ${products.slice(0, 4).join('; ') || 'general goods'}
- Lead Priority: ${buyer.lead_priority || 'standard'}
${allPhones.length ? `- Phone: ${allPhones[0]}` : ''}
${allLinkedins.length ? `- LinkedIn: ${allLinkedins[0]}` : ''}`.trim();

    let systemPrompt: string;
    let userPrompt: string;

    if (channel === 'linkedin') {
      systemPrompt = `You are Arjun Sharma, Senior International Trade Consultant at Aaziko — India's leading B2B sourcing platform.

CHANNEL GUIDE:
${channelGuide}

${buyerContext}

IDENTITY: You are Arjun Sharma. Sign off as Arjun when relevant.
OUTPUT FORMAT: Return a JSON object with exactly these fields:
{
  "connection_request": "...",
  "message_step1": "...",
  "message_step2": "...",
  "message_step3": "..."
}
No markdown, no explanation — pure JSON only.`;
      userPrompt = `Generate a 3-step LinkedIn outreach sequence for ${buyer.name} from ${buyer.country} who imports ${products[0] || 'goods'}.`;
    } else {
      systemPrompt = `You are Arjun Sharma, Senior International Trade Consultant at Aaziko — India's leading B2B sourcing platform.

CHANNEL GUIDE:
${channelGuide}

${buyerContext}

OUTPUT FORMAT: Return a JSON object with exactly these fields:
{
  "message": "...",
  "message2": "..."
}
"message2" is only for a natural split (see channel guide). If the message works as one, set "message2" to null.
No markdown, no explanation — pure JSON only.`;
      userPrompt = `Generate a WhatsApp opening message for ${buyer.name} from ${buyer.country} who imports ${products[0] || 'goods'}.`;
    }

    const { response } = await chatWithFallback(
      'premium',
      systemPrompt,
      [{ role: 'user', content: userPrompt }]
    );

    // Parse JSON from AI response
    let parsed: any = {};
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = channel === 'linkedin'
        ? { connection_request: response, message_step1: '', message_step2: '', message_step3: '' }
        : { message: response, message2: null };
    }

    res.json({
      success: true,
      channel,
      buyer_name: buyer.name,
      contact_name: contactName,
      phone: allPhones[0] || null,
      linkedin_url: allLinkedins[0] || null,
      ...parsed,
    });
  } catch (error) {
    logger.error('POST /buyers/:id/preview-message failed', { error });
    res.status(500).json({ error: (error as Error).message });
  }
});

// ── Preview email (generate without sending) ──────────────────────────
router.post('/:id/preview-email', async (req: Request, res: Response) => {
  try {
    const buyer = await shortlistBuyerService.getBuyerById(req.params.id);
    if (!buyer) { res.status(404).json({ error: 'Buyer not found' }); return; }
    const preview = await emailOutreachService.previewEmail(buyer);
    res.json({ success: true, ...preview });
  } catch (error) {
    logger.error('POST /buyers/:id/preview-email failed', { error });
    res.status(500).json({ error: (error as Error).message });
  }
});

// ── Send custom (edited) email ─────────────────────────────────────────
router.post('/:id/send-custom', async (req: Request, res: Response) => {
  try {
    const { subject, body } = req.body;
    if (!subject || !body) { res.status(400).json({ error: 'subject and body required' }); return; }
    const buyer = await shortlistBuyerService.getBuyerById(req.params.id);
    if (!buyer) { res.status(404).json({ error: 'Buyer not found' }); return; }
    const record = await emailOutreachService.sendCustomEmail(buyer, subject, body);
    res.json({ success: true, record });
  } catch (error) {
    logger.error('POST /buyers/:id/send-custom failed', { error });
    res.status(400).json({ error: (error as Error).message });
  }
});

// ── Get sent emails for buyer ─────────────────────────────────────────
router.get('/:id/emails', async (req: Request, res: Response) => {
  try {
    const emails = await emailOutreachService.getBuyerEmails(req.params.id);
    res.json({ emails });
  } catch (error) {
    logger.error('GET /buyers/:id/emails failed', { error });
    res.status(500).json({ error: (error as Error).message });
  }
});

// ── Send email to single buyer ────────────────────────────────────────
router.post('/:id/send-email', async (req: Request, res: Response) => {
  try {
    const buyer = await shortlistBuyerService.getBuyerById(req.params.id);
    if (!buyer) {
      res.status(404).json({ error: 'Buyer not found' });
      return;
    }
    const record = await emailOutreachService.sendInitialEmail(buyer);
    res.json({ success: true, record });
  } catch (error) {
    const msg = (error as Error).message;
    logger.error('POST /buyers/:id/send-email failed', { error });
    res.status(400).json({ error: msg });
  }
});

// ── Bulk send email to selected buyers ────────────────────────────────
const bulkSendSchema = z.object({
  buyer_ids: z.array(z.string()).min(1).max(100),
});

router.post('/bulk-send', async (req: Request, res: Response) => {
  try {
    const { buyer_ids } = bulkSendSchema.parse(req.body);
    const result = await emailOutreachService.sendBulkEmails(buyer_ids);
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    logger.error('POST /buyers/bulk-send failed', { error });
    res.status(500).json({ error: (error as Error).message });
  }
});

// ── Outreach log ──────────────────────────────────────────────────────
router.get('/outreach/list', async (req: Request, res: Response) => {
  try {
    const { status, stage, limit, skip } = req.query as Record<string, string>;
    const result = await emailOutreachService.getOutreachList({
      status: status as any,
      stage: stage as any,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
    res.json(result);
  } catch (error) {
    logger.error('GET /buyers/outreach/list failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/outreach/summary', async (_req: Request, res: Response) => {
  try {
    const summary = await emailOutreachService.getOutreachSummary();
    res.json(summary);
  } catch (error) {
    logger.error('GET /buyers/outreach/summary failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Process follow-ups (manual trigger) ──────────────────────────────
router.post('/outreach/process-followups', async (_req: Request, res: Response) => {
  try {
    const result = await emailOutreachService.processFollowUps();
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('POST /buyers/outreach/process-followups failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Buyer conversation + memory ───────────────────────────────────────
router.get('/:id/conversation', async (req: Request, res: Response) => {
  try {
    const conversation = await emailOutreachService.getBuyerConversation(req.params.id);
    const memory = await emailOutreachService.getBuyerMemory(req.params.id);
    res.json({ conversation, memory });
  } catch (error) {
    logger.error('GET /buyers/:id/conversation failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
