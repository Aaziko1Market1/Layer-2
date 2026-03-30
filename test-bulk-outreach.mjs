import OpenAI from 'openai';
import fs from 'fs';

// ─── API CONFIG (from .env tiered model logic) ────────────────────────────────
const API_KEY = 'WsmIwf5khm7Z7RUvpjjMrWhjx3QqPUz9';
const BASE_URL = 'https://api.deepinfra.com/v1/openai';

// Model tier mapping: B4=premium, B3=premium, B2=mid, B1=local
const MODELS = {
  PREMIUM: 'Qwen/Qwen3-235B-A22B-Instruct-2507', // B3, B4
  MID:     'Qwen/Qwen3-32B',                       // B2
  LOCAL:   'Qwen/Qwen3-30B-A3B',                   // B1
};

const ai = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY });

// ─── 4 BUYER PROFILES ────────────────────────────────────────────────────────
const BUYERS = [
  {
    id:          'XXUU844769',
    name:        'KESANG TSHONGKHANG',
    category:    'B1',
    country:     'BHUTAN',
    address:     'SAMDRUP JONGKHAR, BHUTAN',
    totalAmount: 9628.92,
    txCount:     7,
    hsCodes:     ['11081200 (Starch)', '17049020/90 (Sugar confectionery)', '19059040/30 (Biscuits/bakery)', '25010020 (Salt)', '10063090/99 (Rice)'],
    products:    'Food staples — starch, rice, biscuits, confectionery, salt',
    leadScore:   44,
    intentScore: 0,
    priority:    'medium',
    model:       MODELS.LOCAL,
    tier:        'B1 — Small repeat buyer, food staples, Bhutan',
    persona:     'Small regional distributor/trader. 7 transactions, modest volume. Likely buying for local market. Warm, relationship-first approach. Simple language.',
  },
  {
    id:          'AEAP328476',
    name:        'DOW EUROPE GMBH',
    category:    'B2',
    country:     'UNITED ARAB EMIRATES',
    address:     'ANTWERPEN ANTWERP, VOPAK EUROTANK, C/O DOW EUROPE GMBH',
    totalAmount: 14624.79,
    txCount:     1,
    hsCodes:     ['38249900 (Chemical preparations / miscellaneous chemical products)'],
    products:    'Miscellaneous chemical preparations (HS 38249900)',
    leadScore:   35,
    intentScore: 0,
    priority:    'medium',
    model:       MODELS.MID,
    tier:        'B2 — Single transaction, large global chemicals company',
    persona:     'Corporate procurement / logistics arm of Dow Europe. One transaction only — likely testing or spot buy. Very professional, formal tone. Focus on compliance, documentation, and reliability.',
  },
  {
    id:          'XXVL035791',
    name:        'SOHAR PORCELAIN',
    category:    'B3',
    country:     'OMAN',
    address:     'N/A',
    totalAmount: 68127.11,
    txCount:     18,
    hsCodes:     ['32072010 (Ceramic colour frits / ceramic pigments)'],
    products:    'Ceramic colour frits and pigments (HS 32072010)',
    leadScore:   51,
    intentScore: 15,
    priority:    'medium',
    model:       MODELS.PREMIUM,
    tier:        'B3 — Active repeat buyer, ceramic raw materials, Oman',
    persona:     'Industrial buyer for a porcelain manufacturer. 18 transactions, $68K total — consistent sourcing of ceramic pigments. Likely production-critical input. Focus on quality consistency, supply reliability, technical specs.',
  },
  {
    id:          'USCJ053308',
    name:        '5 STAR APPAREL LLC',
    category:    'B4',
    country:     'UNITED STATES',
    address:     '31 WEST 34TH STREET, NEW YORK, NY 10001, USA',
    totalAmount: 2225802.49,
    txCount:     468,
    hsCodes:     ['61091000 (Cotton T-shirts, knitted)', '62034290 (Men\'s trousers, woven)'],
    products:    'Cotton T-shirts (knitted) and men\'s woven trousers — apparel, New York',
    leadScore:   68,
    intentScore: 25,
    priority:    'high',
    model:       MODELS.PREMIUM,
    tier:        'B4 — High-value volume buyer, apparel, USA',
    persona:     'Major US apparel importer / distributor. 468 transactions, $2.2M+ total. Based on 34th Street NYC. High-volume, price-sensitive, compliance-critical (US customs, labeling, fiber content). Needs reliability above all.',
  },
];

// ─── SHARED AAZIKO KB (condensed for outreach context) ────────────────────────
const AAZIKO_KB = `
AAZIKO CONTEXT (use naturally in emails — don't dump as list):
- Aaziko is a cross-border B2B trade platform connecting global buyers with 4,800+ verified Indian suppliers
- 62 countries served | $480M+ exports
- Aaziko 100% Assurance: every order — quality/quantity/packing matches contract, production photos/videos, inspection (Aaziko/SGS/BV/Intertek/buyer's own), goods sealed before shipping, 30% advance + 70% after inspection
- Incoterms: EXW, FOB, CIF, DDP supported
- Modules live: Marketplace, Customs Intelligence, Logistics, Inspection & QA, Trade Agreement Intel

GUARDRAILS:
- Never say "guaranteed customs clearance", "lowest price guaranteed", "Aaziko handles everything"
- Max 1 follow-up question per email
- No desperate or pushy tone
- Sound like an experienced sourcing partner, not a salesperson
`;

// ─── SYSTEM PROMPT BUILDER ────────────────────────────────────────────────────
function buildSystem(buyer) {
  return `You are Arjun, senior trade consultant at Aaziko.com — Global Buyer Success Agent.
You are writing a professional B2B outreach email to a real buyer.

BUYER PROFILE:
- Company: ${buyer.name}
- Country: ${buyer.country}
- Tier: ${buyer.tier}
- Persona: ${buyer.persona}
- Products sourced: ${buyer.products}
- HS Codes: ${buyer.hsCodes.join(', ')}
- Total trade value: $${buyer.totalAmount.toLocaleString()}
- Transaction count: ${buyer.txCount}
- Lead score: ${buyer.leadScore}/100 | Intent score: ${buyer.intentScore}/100
- Lead priority: ${buyer.priority}

${AAZIKO_KB}

EMAIL RULES:
- Subject line: specific, non-generic, references their actual product/category
- Opening: reference their actual trade activity — show you know them
- Body: max 3 short paragraphs — no bullet dumps, no walls of text
- Value proposition: relevant to their specific product/HS code and trade pattern
- CTA: ONE clear low-friction next step only
- Closing: professional, warm
- Tone: match buyer persona (small trader = warm/simple | corporate = formal/precise | industrial = technical/reliable | volume apparel = commercial/structured)
- No fake urgency. No "kindly revert". No "best quality guaranteed".
- Length: 150–220 words for email body`;
}

// ─── EMAIL GENERATORS ────────────────────────────────────────────────────────
async function generateEmail(buyer, prompt, maxTokens = 800) {
  const res = await ai.chat.completions.create({
    model: buyer.model,
    messages: [
      { role: 'system', content: buildSystem(buyer) },
      { role: 'user',   content: prompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  });
  return res.choices[0].message.content.trim().replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// ─── PROMPTS ──────────────────────────────────────────────────────────────────
const INITIAL_PROMPT = (buyer) =>
  `Write the INITIAL outreach email to ${buyer.name} (${buyer.country}).
This is the first email they will receive from Aaziko.
Goal: introduce Aaziko as a relevant sourcing partner for their specific products (${buyer.products}).
Reference their import history naturally — show you understand their business.
End with ONE low-friction next step (not "place order" — something easy like "Would you like us to share 2–3 matched supplier profiles?").`;

const FOLLOWUP_PROMPTS = [
  (buyer) =>
    `Write FOLLOW-UP EMAIL #1 (sent 4 days after initial — no reply received).
Buyer: ${buyer.name} (${buyer.country}).
Strategy: gentle nudge — add one new piece of value. Reference a specific sourcing challenge relevant to their product (${buyer.products}).
Do NOT repeat the initial email. New angle: emphasize Aaziko's inspection + quality assurance process.
Keep it shorter than the initial email (100–150 words). Acknowledge they may be busy.`,

  (buyer) =>
    `Write FOLLOW-UP EMAIL #2 (sent 8 days after initial — still no reply).
Buyer: ${buyer.name} (${buyer.country}).
Strategy: offer something concrete — a sourcing comparison, sample offer, or relevant market insight for their HS code (${buyer.hsCodes[0]}).
Shift the angle: focus on a specific supply risk or cost-saving angle relevant to their category.
Keep it 90–130 words. No pressure. End with an easy yes/no question.`,

  (buyer) =>
    `Write FOLLOW-UP EMAIL #3 (sent 14 days after initial — final follow-up in this sequence).
Buyer: ${buyer.name} (${buyer.country}).
Strategy: graceful close — acknowledge they may not need this now, leave the door open professionally.
Reference their specific trade scale ($${buyer.totalAmount.toLocaleString()}, ${buyer.txCount} transactions) to show Aaziko understands their level.
Keep it 80–110 words. Make it easy to re-engage later without pressure.`,
];

const REPLY_PROMPTS = [
  {
    scenario: 'Buyer asks about pricing and MOQ',
    reply:    (buyer) => `${buyer.name} has replied to the initial email. Their response is:
"Thank you for reaching out. Can you tell me more about your pricing and minimum order quantities for the products we buy?"

Write Arjun's professional reply.
- Acknowledge their response warmly
- Explain that pricing depends on specification, quantity, and supplier — but offer to get them a comparison
- Explain MOQ concept briefly — and that first orders can sometimes be negotiated
- End with: ask them to share their current specification or a recent order detail so Aaziko can prepare relevant options
- Keep it 150–180 words`,
  },
  {
    scenario: 'Buyer is skeptical — already has suppliers',
    reply:    (buyer) => `${buyer.name} has replied with skepticism:
"We already have suppliers we work with. Why would we change?"

Write Arjun's professional objection-handling reply.
- Do NOT be defensive or pushy
- Acknowledge they have working relationships — that is smart business
- Position Aaziko as a backup / comparison / second source — not a replacement
- Highlight one specific value relevant to their product category (${buyer.products}): e.g. inspection layer, documentation support, or supply risk mitigation
- End with a low-pressure question
- Keep it 140–170 words`,
  },
];

// ─── OUTPUT COLLECTOR ─────────────────────────────────────────────────────────
const results = [];

function addResult(buyer, section, label, content) {
  results.push({ buyer: buyer.name, category: buyer.category, country: buyer.country, section, label, content });
}

// ─── MAIN TEST ────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n' + '█'.repeat(70));
  console.log('  AAZIKO BULK EMAIL OUTREACH TEST — 4 BUYERS × 2 SCENARIOS');
  console.log('  Scenario A: No Reply → 3 Follow-up Sequence');
  console.log('  Scenario B: Buyer Replies → 2 Response Types');
  console.log('█'.repeat(70));

  for (const buyer of BUYERS) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  BUYER: ${buyer.name} | ${buyer.category} | ${buyer.country}`);
    console.log(`  Model: ${buyer.model.split('/')[1]} | Lead: ${buyer.leadScore} | Intent: ${buyer.intentScore}`);
    console.log('═'.repeat(70));

    // ── SCENARIO A: NO REPLY SEQUENCE ────────────────────────────────────────
    console.log(`\n  ── SCENARIO A: Initial + 3 Follow-ups (no reply) ──`);

    // Initial email
    console.log(`  Generating: Initial email...`);
    const initial = await generateEmail(buyer, INITIAL_PROMPT(buyer));
    addResult(buyer, 'SCENARIO_A', 'Initial Email', initial);
    console.log(`  ✅ Initial email done`);

    // 3 follow-ups
    for (let i = 0; i < FOLLOWUP_PROMPTS.length; i++) {
      console.log(`  Generating: Follow-up ${i + 1}...`);
      const fu = await generateEmail(buyer, FOLLOWUP_PROMPTS[i](buyer), 600);
      addResult(buyer, 'SCENARIO_A', `Follow-up Email ${i + 1} (Day ${[4, 8, 14][i]})`, fu);
      console.log(`  ✅ Follow-up ${i + 1} done`);
    }

    // ── SCENARIO B: BUYER REPLIED ─────────────────────────────────────────────
    console.log(`\n  ── SCENARIO B: Buyer Reply Handling ──`);

    for (const rp of REPLY_PROMPTS) {
      console.log(`  Generating: Reply handler — "${rp.scenario}"...`);
      const reply = await generateEmail(buyer, rp.reply(buyer), 700);
      addResult(buyer, 'SCENARIO_B', `Reply: "${rp.scenario}"`, reply);
      console.log(`  ✅ Reply handler done`);
    }
  }

  // ── WRITE MD FILE ──────────────────────────────────────────────────────────
  await writeMD();
  console.log('\n' + '█'.repeat(70));
  console.log('  ✅ ALL TESTS COMPLETE — Output: TEST-BULK-OUTREACH-RESULTS.md');
  console.log('█'.repeat(70) + '\n');
}

// ─── MD WRITER ────────────────────────────────────────────────────────────────
async function writeMD() {
  const lines = [];
  const now = new Date().toISOString().slice(0, 10);

  lines.push(`# AAZIKO BULK EMAIL OUTREACH — TEST RESULTS`);
  lines.push(`**Date:** ${now} | **Buyers Tested:** 4 | **Emails Generated:** ${results.length}`);
  lines.push(`**Scenarios:** A = No Reply Sequence (Initial + 3 Follow-ups) | B = Buyer Reply Handling`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## BUYER OVERVIEW');
  lines.push('');
  lines.push('| # | Buyer | Category | Country | Total Value | Transactions | Lead Score | Intent | Model Tier |');
  lines.push('|---|-------|----------|---------|-------------|-------------|-----------|--------|-----------|');
  for (const b of BUYERS) {
    lines.push(`| ${b.category} | **${b.name}** | ${b.category} | ${b.country} | $${b.totalAmount.toLocaleString()} | ${b.txCount} | ${b.leadScore}/100 | ${b.intentScore}/100 | ${b.model.split('/')[1].split('-').slice(0,3).join('-')} |`);
  }
  lines.push('');
  lines.push('---');

  // Group by buyer
  for (const buyer of BUYERS) {
    const buyerResults = results.filter(r => r.buyer === buyer.name);
    lines.push('');
    lines.push(`---`);
    lines.push('');
    lines.push(`## ${buyer.category} — ${buyer.name} (${buyer.country})`);
    lines.push('');
    lines.push(`**Products:** ${buyer.products}`);
    lines.push(`**HS Codes:** ${buyer.hsCodes.join(' | ')}`);
    lines.push(`**Trade Value:** $${buyer.totalAmount.toLocaleString()} across ${buyer.txCount} transactions`);
    lines.push(`**Lead Score:** ${buyer.leadScore}/100 | **Intent Score:** ${buyer.intentScore}/100 | **Priority:** ${buyer.priority}`);
    lines.push(`**AI Model Used:** ${buyer.model}`);
    lines.push(`**Buyer Persona:** ${buyer.persona}`);
    lines.push('');

    // Scenario A
    const scenA = buyerResults.filter(r => r.section === 'SCENARIO_A');
    lines.push(`### SCENARIO A — No Reply Sequence`);
    lines.push('');
    lines.push('> **Strategy:** Initial email → wait 4 days → Follow-up 1 → wait 4 days → Follow-up 2 → wait 6 days → Follow-up 3 (final)');
    lines.push('');
    for (const r of scenA) {
      lines.push(`#### ${r.label}`);
      lines.push('');
      lines.push('```');
      lines.push(r.content);
      lines.push('```');
      lines.push('');
    }

    // Scenario B
    const scenB = buyerResults.filter(r => r.section === 'SCENARIO_B');
    lines.push(`### SCENARIO B — Buyer Replied`);
    lines.push('');
    lines.push('> **Strategy:** Buyer responds to initial email. Two reply scenarios tested: (1) Price/MOQ enquiry, (2) Already-has-suppliers objection.');
    lines.push('');
    for (const r of scenB) {
      lines.push(`#### ${r.label}`);
      lines.push('');
      lines.push('```');
      lines.push(r.content);
      lines.push('```');
      lines.push('');
    }
  }

  // Summary
  lines.push('---');
  lines.push('');
  lines.push('## SYSTEM ANALYSIS SUMMARY');
  lines.push('');
  lines.push('### Model Routing Verified');
  lines.push('| Buyer Tier | Model Used | Reasoning |');
  lines.push('|-----------|-----------|-----------|');
  lines.push('| B1 — Small trader (Bhutan) | Qwen3-30B-A3B (LOCAL) | Low value, low intent — cost-efficient model |');
  lines.push('| B2 — Corporate single-buy (UAE) | Qwen3-32B (MID) | One transaction, testing — mid-tier appropriate |');
  lines.push('| B3 — Active industrial (Oman) | Qwen3-235B (PREMIUM) | 18 transactions, $68K — high quality reply needed |');
  lines.push('| B4 — Volume apparel (USA) | Qwen3-235B (PREMIUM) | $2.2M, 468 txns — highest priority, premium model |');
  lines.push('');
  lines.push('### Email Tone Differentiation');
  lines.push('| Buyer | Expected Tone | Why |');
  lines.push('|-------|--------------|-----|');
  lines.push('| KESANG TSHONGKHANG | Warm, simple, relationship-first | Small regional trader, 7 txns, food staples |');
  lines.push('| DOW EUROPE GMBH | Formal, precise, compliance-focused | Global chemicals giant, corporate procurement |');
  lines.push('| SOHAR PORCELAIN | Technical, reliability-focused | Industrial buyer, production-critical ceramic pigments |');
  lines.push('| 5 STAR APPAREL LLC | Commercial, structured, NYC-smart | Major volume apparel importer, 468 transactions |');
  lines.push('');
  lines.push('### Follow-up Sequence Logic');
  lines.push('| Email | Timing | Strategy |');
  lines.push('|-------|--------|---------|');
  lines.push('| Initial | Day 0 | Introduce Aaziko, reference buyer\'s actual trade activity, soft CTA |');
  lines.push('| Follow-up 1 | Day 4 | New angle — quality assurance / inspection process value |');
  lines.push('| Follow-up 2 | Day 8 | Concrete offer — comparison, sample, or market insight for their HS code |');
  lines.push('| Follow-up 3 | Day 14 | Graceful close — leave door open, no pressure, acknowledge timing |');
  lines.push('');
  lines.push('### Reply Handling Logic');
  lines.push('| Reply Type | Arjun\'s Approach |');
  lines.push('|-----------|----------------|');
  lines.push('| Price & MOQ question | Explain pricing depends on spec/qty/supplier — offer comparison, ask for specs |');
  lines.push('| Already has suppliers (skeptical) | Don\'t replace — offer as second source / backup / comparison layer |');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by: \`test-bulk-outreach.mjs\` | Model config from \`.env\` tiered architecture*`);

  fs.writeFileSync('./TEST-BULK-OUTREACH-RESULTS.md', lines.join('\n'), 'utf8');
  console.log('\n  📄 MD file written: TEST-BULK-OUTREACH-RESULTS.md');
}

run().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
