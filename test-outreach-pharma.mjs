import OpenAI from 'openai';

const KEY  = 'WsmIwf5khm7Z7RUvpjjMrWhjx3QqPUz9';
const BASE = 'https://api.deepinfra.com/v1/openai';
const ai   = new OpenAI({ baseURL: BASE, apiKey: KEY });

const MODEL    = 'Qwen/Qwen3-235B-A22B-Instruct-2507';
const INTENT_M = 'Qwen/Qwen3-32B';

// ─── REAL BUYER DATA FROM EXPORT RECORD ──────────────────────────────────────
// Source: India export data — Mylan Labs → Mylan Institutional USA
// Intelligence: This is intra-company (Mylan India → Mylan USA).
// Outreach target: OTHER US pharma institutional buyers/distributors who import
// similar HS 30049099 products but pay MORE or have fewer Indian supplier options.
// We model a comparable US institutional pharma buyer as the outreach target.

const BUYER = {
  // Real record fields
  exporter_name:    'MYLAN LABORATORIES LIMITED',
  buyer_name:       'MYLAN INSTITUTIONAL INC',
  iec:              '988008858',
  hs_code:          '30049099',
  hs_description:   'Pharmaceutical products — mixed/unmixed, for retail/institutional sale (HS 3004.90.99)',
  country:          'United States',
  foreign_port:     'Charleston, SC, USA',
  indian_port:      'Bangalore ICD',
  total_value_usd:  230030.25,
  total_quantity:   1824,
  month_year:       'May 2024',

  // Derived intelligence
  price_per_unit:   (230030.25 / 1824).toFixed(2),  // $126.11 per unit
  product_type:     'Finished pharmaceutical formulations (generic drugs / institutional packs)',
  relationship:     'Intra-company transfer (Mylan India to Mylan USA — same corporate group)',

  // Outreach target profile (comparable independent US pharma importer/distributor)
  target_company:   'MedSource Pharma Distributors Inc',
  target_contact:   'James Whitfield',
  target_title:     'VP Procurement, Generic Pharmaceuticals',
  target_location:  'Charleston, SC, USA',
  target_note:      'US institutional pharma distributor importing similar HS 30049099 products. Currently sourcing from branded manufacturers at higher cost. Ideal candidate for Indian generic pharma via Aaziko-verified FDA-approved suppliers.',
};

// ─── AAZIKO CONTEXT — PHARMA / GENERIC DRUGS ─────────────────────────────────
const AAZIKO_PHARMA = `
=== AAZIKO PLATFORM DATA — PHARMACEUTICAL EXPORTS (use ONLY this data) ===

PLATFORM: 4,800+ verified Indian exporters | 62 countries | $480M+ exports
Contact: trade@aaziko.com | WhatsApp: +91-98765-00000

PRODUCT CATEGORY: Finished Pharmaceutical Formulations (HS 3004.90.99)
- Types: Generic tablets, capsules, injectables, syrups, topical formulations
- Therapeutic areas: Antibiotics, Antivirals, Antifungals, Cardiovascular, Diabetes, Oncology support
- Pack types: Blister packs (10/14/28 tabs), bottles (30/60/90/100/500 counts), vials, ampoules
- Institutional packs: Bulk hospital packs (500–1000 units), unit-dose packs

MOQ & PRICING (FOB India):
- Small institutional trial order: 500 units → $85–$140 per unit (depending on molecule)
- Standard bulk order 1,000–5,000 units → $60–$110 per unit
- Large order 5,000–20,000 units → $35–$75 per unit
- Custom contract manufacturing (CMO): negotiated per molecule
- Reference: Mylan-class shipment (1,824 units) benchmarked at ~$126/unit CIF USA

LEAD TIME:
- Standard bulk: 30–45 days from PO confirmation
- Urgent: 20–25 days (air freight from Bangalore/Hyderabad)
- Repeat orders: 20–30 days (pre-stocked molecules)

TOP VERIFIED PHARMA SUPPLIERS (all FDA/WHO-GMP approved):
1. Bangalore BioFormulations Pvt Ltd (Bangalore, Karnataka)
   - Certifications: US FDA approved, WHO-GMP, EU-GMP, ISO 15378
   - Specialty: Oral solids, injectables, oncology generics
   - Annual capacity: 500M units | Rating: 4.9/5 | On-time: 98%
   - Exports to: USA, EU, Australia, Canada
2. Hyderabad Generic Labs (Hyderabad, Telangana)
   - Certifications: US FDA, WHO-GMP, TGA Australia, ANVISA Brazil
   - Specialty: Cardiovascular, antibiotics, antidiabetics
   - Annual capacity: 300M units | Rating: 4.8/5 | On-time: 96%
3. Ahmedabad Pharma Exports (Ahmedabad, Gujarat)
   - Certifications: WHO-GMP, ISO 9001, COPP (Certificate of Pharmaceutical Product)
   - Specialty: Generic antibiotics, antifungals, vitamins
   - Annual capacity: 200M units | Rating: 4.7/5 | On-time: 95%

REGULATORY COMPLIANCE (critical for USA buyers):
- All suppliers hold valid US FDA Drug Establishment Registration
- DUNS number available for DEA and institutional procurement
- Certificate of Analysis (CoA) provided per batch
- GMP inspection records available on request
- Controlled substance: Not applicable (HS 30049099 — non-narcotic generics)
- Import requirements USA: FDA prior notice, country of origin, CoA, BoL

SHIPPING TO USA:
- Port of origin: Bangalore ICD, Hyderabad, Mumbai
- Port of entry: Charleston SC, Newark NJ, Los Angeles, Houston
- Air freight (Hyderabad/Bangalore → Charleston): 3–5 days
- Sea freight (Mumbai → Charleston): 22–28 days
- Cold chain available for temperature-sensitive formulations (2–8°C)
- Incoterms: FOB, CIF, DDP (delivered to US warehouse), EXW

PAYMENT TERMS:
- Standard: 30% TT advance + 70% against shipping documents
- For FDA-registered buyers with credit history: 30 days net after delivery
- LC at sight accepted
- Currencies: USD only (pharma sector standard)

DOCUMENTATION PROVIDED:
- Certificate of Analysis (CoA) per batch
- GMP Compliance Certificate
- Certificate of Origin (India)
- FDA Prior Notice confirmation
- Commercial Invoice, Packing List, Airway Bill / Bill of Lading
- MSDS (Material Safety Data Sheet) where applicable

QUALITY GUARANTEE:
- Every batch tested by in-house QC lab + third-party NABL-accredited lab
- Shelf life: minimum 18 months remaining at time of shipment
- Returns/claims resolved within 45 days
- Stability data available per ICH guidelines

COMPETITIVE ADVANTAGE vs branded/US-manufactured pharma:
- Indian generic pharma is 40–80% cheaper than branded equivalents
- Same active pharmaceutical ingredient (API), same efficacy
- FDA-approved manufacturing — same standard as US plants
- India supplies ~30% of US generic drug market already
- Faster custom-formulation turnaround than EU or Chinese suppliers
=== END AAZIKO PHARMA DATA ===
`;

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const ARJUN_SYS = `You are Arjun, senior pharmaceutical trade consultant at Aaziko.com — India's verified B2B export platform connecting US institutional pharma buyers with FDA-approved Indian generic drug manufacturers.

STRICT RULES:
1. Use ONLY data from the AAZIKO PLATFORM DATA section — never invent regulatory claims or pricing
2. This is a highly regulated industry — be accurate, professional, compliance-aware
3. Never make medical claims — focus on regulatory compliance, pricing, and supply chain
4. Ask MAXIMUM ONE question per email
5. Every email needs: Subject line, greeting, body, professional signature
6. Highlight FDA approval and WHO-GMP credentials in every email — this is the #1 concern for US buyers
7. Signature: Arjun Kumar | Senior Trade Consultant — Pharmaceuticals | Aaziko.com | arjun@aaziko.com | +91-98765-43210

${AAZIKO_PHARMA}`;

const INTENT_SYS = `You are a pharma trade email intent classifier. Given a buyer's reply, output ONLY this JSON (no markdown, no explanation):
{"intent":"interested|price_negotiation|regulatory_concern|request_samples|request_documentation|not_interested|complaint|general","confidence":0.0-1.0,"urgency":"low|medium|high","emotion":"neutral|positive|frustrated|skeptical|cautious","key_ask":"one sentence: what does buyer want?"}`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function ask(system, userPrompt, history = [], maxTokens = 550) {
  const isQwen3 = MODEL.includes('Qwen3');
  const budget  = isQwen3 ? maxTokens + 900 : maxTokens;
  const msgs    = [{ role: 'system', content: system }, ...history, { role: 'user', content: userPrompt }];
  const res     = await ai.chat.completions.create({ model: MODEL, messages: msgs, max_tokens: budget, temperature: 0.70 });
  const raw     = res.choices[0].message.content.trim();
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function classify(buyerReply) {
  const res = await ai.chat.completions.create({
    model: INTENT_M,
    messages: [{ role: 'system', content: INTENT_SYS }, { role: 'user', content: buyerReply }],
    max_tokens: 1200, temperature: 0.1,
  });
  return res.choices[0].message.content.trim().replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function box(title) {
  console.log('\n' + '═'.repeat(72));
  console.log(`  ${title}`);
  console.log('═'.repeat(72));
}
function sep(title) {
  console.log('\n' + '─'.repeat(72));
  console.log(`  ${title}`);
  console.log('─'.repeat(72));
}

// ─── BUYER INTELLIGENCE PROFILE ──────────────────────────────────────────────
function printBuyerProfile() {
  box('BUYER INTELLIGENCE PROFILE — PHARMA IMPORT RECORD');
  console.log(`  Record Source  : India Export Data — HS 30049099`);
  console.log(`  Exporter       : ${BUYER.exporter_name} (Bangalore ICD)`);
  console.log(`  Buyer on Record: ${BUYER.buyer_name} (${BUYER.foreign_port})`);
  console.log(`  Relationship   : ${BUYER.relationship}`);
  console.log(`  HS Code        : ${BUYER.hs_code} — ${BUYER.hs_description}`);
  console.log(`  Shipment Date  : ${BUYER.month_year}`);
  console.log(`  Quantity       : ${BUYER.total_quantity} units`);
  console.log(`  Total Value    : $${BUYER.total_value_usd.toLocaleString()} CIF USA`);
  console.log(`  Price Per Unit : $${BUYER.price_per_unit}/unit (CIF Charleston)`);
  console.log('');
  console.log(`  ── OUTREACH TARGET (comparable independent US buyer) ──`);
  console.log(`  Target Company : ${BUYER.target_company}`);
  console.log(`  Contact        : ${BUYER.target_contact}, ${BUYER.target_title}`);
  console.log(`  Location       : ${BUYER.target_location}`);
  console.log(`  Opportunity    : Same HS 30049099 imports at $126/unit — India can do $60–110/unit`);
  console.log(`  Saving         : 15–50% per unit with FDA-approved Indian generics`);
  console.log('─'.repeat(72));
}

// ─── SCENARIO 1: 3-EMAIL OUTREACH SEQUENCE ───────────────────────────────────
async function scenario1_EmailSequence() {
  box('SCENARIO 1 — AI OUTREACH EMAIL SEQUENCE (3 Emails)');

  const emailHistory = [];

  // ── EMAIL 1: Cold outreach ────────────────────────────────────────────────
  sep('EMAIL 1 / 3 — Initial Outreach (Day 0)');
  const prompt1 = `Write a cold outreach email to this US pharma buyer based on real market intelligence:

BUYER TARGET:
- Company: ${BUYER.target_company}
- Contact: ${BUYER.target_contact}, ${BUYER.target_title}
- Location: ${BUYER.target_location}
- They import: Finished pharmaceutical formulations (HS ${BUYER.hs_code}) for institutional use
- Market benchmark: Similar US buyers are paying ~$126/unit CIF for Indian pharma (Mylan-grade)
- Aaziko can connect them to FDA-approved Indian suppliers at $60–110/unit for bulk

GOAL:
- Show market intelligence — you know they import HS 30049099 institutional pharma
- Highlight India's FDA-approved suppliers as a cost-saving alternative
- Stress FDA registration, WHO-GMP, batch CoA — US pharma buyers care deeply about this
- Give one concrete example: similar buyers saving 30–40% per unit
- End with ONE call to action (15-minute call or documentation review)`;

  const email1 = await ask(ARJUN_SYS, prompt1, [], 650);
  console.log('\n' + email1);
  emailHistory.push({ role: 'user', content: prompt1 });
  emailHistory.push({ role: 'assistant', content: email1 });

  // ── EMAIL 2: Follow-up Day 6 ──────────────────────────────────────────────
  sep('EMAIL 2 / 3 — Follow-up (Day 6 — No Reply)');
  const prompt2 = `Write follow-up email #1 to the same pharma buyer (sent 6 days after email 1, no reply yet).

Context: You emailed ${BUYER.target_contact} at ${BUYER.target_company} about Indian FDA-approved generic pharma.
No reply received. This follow-up should:
- Be shorter — 3 paragraphs max
- Lead with NEW value: Offer to send full FDA registration documents + CoA samples for review
- Mention India supplies 30% of ALL US generic drugs — credibility signal
- Mention Bangalore/Hyderabad suppliers have been FDA-inspected with zero critical observations
- ONE specific call to action — offer to share a supplier dossier for their review`;

  const email2 = await ask(ARJUN_SYS, prompt2, emailHistory, 580);
  console.log('\n' + email2);
  emailHistory.push({ role: 'user', content: prompt2 });
  emailHistory.push({ role: 'assistant', content: email2 });

  // ── EMAIL 3: Final follow-up Day 14 ──────────────────────────────────────
  sep('EMAIL 3 / 3 — Final Follow-up (Day 14 — Last Attempt)');
  const prompt3 = `Write the final follow-up email (Day 14 — last attempt) to ${BUYER.target_contact} at ${BUYER.target_company}.

Two previous emails sent, no response. Strategy:
- Very short — 3 paragraphs maximum
- Different angle: Address the #1 concern US pharma buyers have — regulatory risk
  ("I understand switching pharma suppliers feels risky — let me show you why our suppliers already meet your standards")
- Create soft urgency: Q3 allocation slots being confirmed now
- Make it extremely easy — offer just 10 minutes or ask if they want the FDA dossier forwarded
- Subject line: curiosity/concern-based, not salesy`;

  const email3 = await ask(ARJUN_SYS, prompt3, emailHistory, 520);
  console.log('\n' + email3);
}

// ─── SCENARIO 2: BUYER REPLIES — AI RESPONDS ─────────────────────────────────
async function scenario2_BuyerReplies() {
  box('SCENARIO 2 — BUYER REPLIES: AI RESPONSE SIMULATION');

  const buyerScenarios = [
    {
      label: 'SCENARIO 2A — Regulatory Concern (Skeptical Compliance Officer)',
      buyerReply: `Hi Arjun,

Thank you for reaching out. We do source institutional pharma from India already but I have a few serious concerns before we can consider any new supplier.

1. We had a supplier fail an FDA inspection last year — we cannot afford that risk again. How do we verify your suppliers' FDA status is current and not on the import alert list?

2. Our formulary committee requires a full technical dossier before approving any new source — do your suppliers have ANDA filings or at minimum a Certificate of Pharmaceutical Product (CoPP)?

3. What is your process if a batch fails our incoming QC test — who is responsible and what is the turnaround for replacement?

We are open to exploring this further if you can address these points.

Regards,
James Whitfield
VP Procurement, MedSource Pharma Distributors Inc`,
    },
    {
      label: 'SCENARIO 2B — Price-Focused, Ready to Move Fast',
      buyerReply: `Arjun,

We are definitely interested. Our current supplier just increased pricing by 18% and we are actively looking for alternatives.

Quick questions:
1. What is your best price for 5,000 units of finished oral solid generics (tablets/capsules) for institutional use — HS 30049099?
2. Can you do DDP delivery to our warehouse in Charleston, SC?
3. What is the minimum shelf life you guarantee on arrival?
4. We need first shipment within 4 weeks if possible — is that realistic?
5. Do you accept net-30 payment after delivery for approved vendors?

If the answers check out, we can move to a trial order immediately.

James
MedSource Pharma Distributors Inc`,
    },
  ];

  for (const scenario of buyerScenarios) {
    sep(scenario.label);

    console.log('\n  👤 BUYER REPLY:');
    console.log('  ' + scenario.buyerReply.replace(/\n/g, '\n  '));

    console.log('\n  🔍 INTENT ANALYSIS:');
    const intent = await classify(scenario.buyerReply);
    console.log('  ' + intent);

    console.log('\n  🤖 ARJUN\'S RESPONSE:');
    const replyPrompt = `A US pharma buyer has replied to our outreach email. Write Arjun's reply.

BUYER CONTEXT:
- Company: ${BUYER.target_company}
- Contact: ${BUYER.target_contact}, ${BUYER.target_title}
- Location: ${BUYER.target_location}
- They import institutional pharma (HS ${BUYER.hs_code}) — similar benchmark: $${BUYER.price_per_unit}/unit CIF
- This is a regulated industry — FDA compliance is the #1 priority for this buyer

BUYER'S REPLY:
${scenario.buyerReply}

RULES FOR THIS REPLY:
- Address EVERY question/concern the buyer raised — one by one if needed
- Use EXACT numbers and certifications from AAZIKO PLATFORM DATA only
- For regulatory questions: be precise about FDA registration, not vague
- For pricing: give exact ranges from the data
- Professional pharma industry tone — this is not casual B2B
- Maximum ONE question at the end
- Include Subject line`;

    const arjunReply = await ask(ARJUN_SYS, replyPrompt, [], 750);
    console.log('\n' + arjunReply.split('\n').map(l => '  ' + l).join('\n'));
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function run() {
  printBuyerProfile();
  await scenario1_EmailSequence();
  await scenario2_BuyerReplies();

  box('TEST COMPLETE — PHARMA OUTREACH');
  console.log('  ✅ Buyer intelligence extracted from real India export record');
  console.log('  ✅ Scenario 1: 3-email sequence (cold → followup → final) generated');
  console.log('  ✅ Scenario 2A: AI handled regulatory/FDA compliance objections');
  console.log('  ✅ Scenario 2B: AI responded to price-focused urgent buyer');
  console.log('  Model: Qwen3-235B (Arjun) | Qwen3-32B (Intent)');
  console.log('  Industry: Pharma — HS 30049099 | Bangalore ICD → Charleston USA');
  console.log('═'.repeat(72) + '\n');
}

run().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
