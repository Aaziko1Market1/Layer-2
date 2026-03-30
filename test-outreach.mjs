import OpenAI from 'openai';

const KEY  = 'WsmIwf5khm7Z7RUvpjjMrWhjx3QqPUz9';
const BASE = 'https://api.deepinfra.com/v1/openai';
const ai   = new OpenAI({ baseURL: BASE, apiKey: KEY });

const MODEL = 'Qwen/Qwen3-235B-A22B-Instruct-2507';

// ─── REAL BUYER DATA FROM IMPORT RECORD ─────────────────────────────────────
const BUYER = {
  company:          'DECOFINO S.R.L',
  country:          'Bolivia',
  importer_id:      '346521028',
  product:          'Ceramic floor tiles (BALDOSA CERAMICA MARCA: ALBERDI 62×62)',
  hs_code:          '6907.21.00.900',
  hs_description:   'Ceramic flags and paving, hearth or wall tiles (glazed)',
  origin_country:   'Argentina',
  import_date:      '2017-11-25',
  cif_value_usd:    81195,
  fob_value_usd:    10456.86,
  quantity_m2:      1382.4,
  packages:         720,
  weight_kg:        25488,
  operation_number: '2017/641/C-1011',
  // Derived intelligence
  price_per_m2_cif:  (81195 / 1382.4).toFixed(2),   // ~$58.74/m2
  price_per_m2_fob:  (10456.86 / 1382.4).toFixed(2), // ~$7.56/m2
  current_supplier:  'Argentina (Alberdi brand)',
  notes: `Large importer of premium ceramic tiles. Buying 1382m2 per shipment.
Currently sourcing from Argentina at $7.56/m2 FOB. India can offer same quality
at $4.50–6.50/m2 FOB — 15–40% cheaper. Bolivia is landlocked so uses road freight
via Argentina border or air. High-value buyer worth targeting for Indian tiles.`,
};

// ─── AAZIKO CONTEXT (Indian ceramic tile suppliers) ───────────────────────────
const AAZIKO_TILES = `
=== AAZIKO PLATFORM DATA — CERAMIC TILES ===

PLATFORM: 4,800 verified Indian exporters | 62 countries | $480M+ exports

PRODUCT: Ceramic Floor Tiles (HS 6907.21)
- Types: Vitrified, Glazed, Porcelain, Digital print tiles
- Sizes: 60×60, 60×120, 80×80, 30×60, 30×30 cm
- Finish: Matt, Glossy, Satin, Anti-skid
- MOQ: 500 m² (sample order) | 2,000 m² (bulk)
- FOB India Pricing:
    500–2,000 m²   → $5.50–7.00 per m²
    2,001–5,000 m² → $4.50–5.50 per m²
    5,001–10,000 m²→ $3.80–4.50 per m²
    10,000+ m²     → $3.20–3.80 per m²
- Lead time: Samples 7–10 days | Bulk 20–30 days
- Certifications: ISO 9001, CE Mark, PGBP, Indian Standard IS 13755
- Top manufacturing hubs: Morbi (Gujarat) — world's 2nd largest tile hub

TOP VERIFIED SUPPLIERS:
1. Morbi Ceramic Industries (Morbi, Gujarat)
   - Certs: ISO 9001, CE, IS 13755 | Rating: 4.8/5 | On-time: 97%
   - Exports to: Europe, Middle East, Latin America
2. Gujarat Vitrified Pvt Ltd (Morbi, Gujarat)
   - Certs: ISO 9001, IS 13755 | Rating: 4.7/5 | On-time: 95%
   - Speciality: 60×60 and 60×120 large-format tiles

SHIPPING TO BOLIVIA (landlocked):
- Route: FOB Mumbai/Mundra → CIF Buenos Aires → Road to Bolivia
- Sea transit Mumbai → Buenos Aires: 25–32 days
- Road Buenos Aires → Santa Cruz/La Paz: 5–7 days
- Total door-to-door: ~35–45 days
- Alternative: FOB → CIF Arica (Chile) → Road: 30–38 days
- Incoterms: FOB, CIF, CFR

PAYMENT: 30% TT advance + 70% against BL copy | LC at sight available
SAMPLES: $50–80/box + $35–50 DHL | 7–10 days | Deductible from bulk

COMPETITIVE ADVANTAGE vs ARGENTINA:
- India FOB: $3.80–6.50/m² vs Argentina $7.56/m² (buyer's current cost)
- Same or better quality: Morbi tiles export to Germany, Italy, USA
- More size/design variety: 200+ SKUs vs typical Argentine range
- Faster reorder cycles: 20–30 day lead time
=== END AAZIKO DATA ===
`;

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const ARJUN_SYS = `You are Arjun, senior trade consultant at Aaziko.com — India's verified B2B export platform.

STRICT RULES:
1. Use ONLY the AAZIKO PLATFORM DATA provided — never invent prices or specs
2. Write like a real human trade professional — warm, specific, confident
3. Use real data from the buyer's import record to personalize every message
4. Ask MAXIMUM ONE question per email
5. Emails must have: Subject line, greeting, body, signature
6. Arjun Kumar | Senior Trade Consultant | Aaziko.com | arjun@aaziko.com | +91-98765-43210

${AAZIKO_TILES}`;

const INTENT_SYS = `You are a trade email intent classifier. Given a buyer's reply email, output ONLY this JSON:
{"intent":"interested|price_negotiation|objection|request_samples|request_more_info|not_interested|complaint|general","confidence":0.0-1.0,"urgency":"low|medium|high","emotion":"neutral|positive|frustrated|skeptical|excited","key_ask":"one sentence: what does buyer want?"}`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function ask(system, userPrompt, history = [], maxTokens = 500) {
  const isQwen3 = MODEL.includes('Qwen3');
  const budget  = isQwen3 ? maxTokens + 900 : maxTokens;
  const msgs    = [{ role: 'system', content: system }, ...history, { role: 'user', content: userPrompt }];
  const res     = await ai.chat.completions.create({ model: MODEL, messages: msgs, max_tokens: budget, temperature: 0.72 });
  const raw     = res.choices[0].message.content.trim();
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function classify(buyerReply) {
  const res = await ai.chat.completions.create({
    model: 'Qwen/Qwen3-32B',
    messages: [{ role: 'system', content: INTENT_SYS }, { role: 'user', content: buyerReply }],
    max_tokens: 1200, temperature: 0.1,
  });
  const raw = res.choices[0].message.content.trim().replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return raw;
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

// ─── BUYER PROFILE SUMMARY ────────────────────────────────────────────────────
function printBuyerProfile() {
  box('BUYER INTELLIGENCE PROFILE');
  console.log(`  Company      : ${BUYER.company}`);
  console.log(`  Country      : ${BUYER.country} (landlocked — routes via Argentina/Chile)`);
  console.log(`  Product      : ${BUYER.product}`);
  console.log(`  HS Code      : ${BUYER.hs_code} — ${BUYER.hs_description}`);
  console.log(`  Last Import  : ${BUYER.import_date}`);
  console.log(`  Quantity     : ${BUYER.quantity_m2} m² | ${BUYER.packages} packages | ${BUYER.weight_kg} kg`);
  console.log(`  FOB Value    : $${BUYER.fob_value_usd.toLocaleString()} (FOB Argentina)`);
  console.log(`  CIF Value    : $${BUYER.cif_value_usd.toLocaleString()} (CIF Bolivia)`);
  console.log(`  FOB per m²   : $${BUYER.price_per_m2_fob} (current Argentina price)`);
  console.log(`  Current Src  : ${BUYER.current_supplier}`);
  console.log(`  Opportunity  : India can offer $3.80–5.50/m² FOB — 30–50% cheaper`);
  console.log('─'.repeat(72));
}

// ─── SCENARIO 1: 3-EMAIL OUTREACH SEQUENCE ───────────────────────────────────
async function scenario1_EmailSequence() {
  box('SCENARIO 1 — AI OUTREACH EMAIL SEQUENCE (3 Emails)');

  const emailHistory = [];

  // ── EMAIL 1: Initial cold outreach ──────────────────────────────────────────
  sep('EMAIL 1 / 3 — Initial Outreach');
  const prompt1 = `Write a cold outreach email to this buyer based on their real import data:

BUYER DETAILS FROM IMPORT RECORD:
- Company: ${BUYER.company}
- Country: ${BUYER.country}
- Product they import: ${BUYER.product}
- HS Code: ${BUYER.hs_code}
- Current supplier country: ${BUYER.current_supplier}
- Their last import: ${BUYER.quantity_m2} m² at $${BUYER.price_per_m2_fob}/m² FOB (from Argentina)
- Shipment value: $${BUYER.fob_value_usd} FOB / $${BUYER.cif_value_usd} CIF

GOAL: Introduce Aaziko and Indian tile suppliers as a better alternative to Argentina.
Show you know their business — mention specific product, quantity, price comparison.
Be specific: show India FOB price vs their current $${BUYER.price_per_m2_fob}/m² Argentine price.
End with ONE specific call to action.`;

  const email1 = await ask(ARJUN_SYS, prompt1, [], 600);
  console.log('\n' + email1);
  emailHistory.push({ role: 'user', content: prompt1 });
  emailHistory.push({ role: 'assistant', content: email1 });

  // ── EMAIL 2: Follow-up (no reply after 5 days) ───────────────────────────────
  sep('EMAIL 2 / 3 — Follow-up (Day 5 — No Reply)');
  const prompt2 = `Write follow-up email #1 (sent 5 days after first email, no reply received yet).

Context: You already sent Email 1 introducing Aaziko and Indian ceramic tiles.
The buyer ${BUYER.company} from ${BUYER.country} has not replied yet.

Strategy for this email:
- Shorter than Email 1 — 3–4 short paragraphs maximum
- Add new VALUE: mention Morbi, Gujarat is world's 2nd largest tile hub
- Offer something new: free sample box to test quality before committing
- Refer back to Email 1 briefly but don't repeat everything
- ONE call to action at the end`;

  const email2 = await ask(ARJUN_SYS, prompt2, emailHistory, 550);
  console.log('\n' + email2);
  emailHistory.push({ role: 'user', content: prompt2 });
  emailHistory.push({ role: 'assistant', content: email2 });

  // ── EMAIL 3: Final follow-up (Day 12) ───────────────────────────────────────
  sep('EMAIL 3 / 3 — Final Follow-up (Day 12 — Last Attempt)');
  const prompt3 = `Write the final follow-up email #2 (sent Day 12, this is the last attempt).

Context: Sent two emails, no reply from ${BUYER.company} yet.
Strategy:
- Short, direct — max 3 paragraphs
- Create mild urgency: mention you have 2 slots for new Bolivia clients this quarter
- Make it easy to say yes: offer a 15-minute call OR just reply with their WhatsApp
- Leave the door open — no pressure, respectful close
- Subject line should be different — try curiosity angle`;

  const email3 = await ask(ARJUN_SYS, prompt3, emailHistory, 500);
  console.log('\n' + email3);
}

// ─── SCENARIO 2: BUYER REPLIES — AI RESPONDS ─────────────────────────────────
async function scenario2_BuyerReplies() {
  box('SCENARIO 2 — BUYER REPLIES: AI RESPONSE SIMULATION');

  // Two realistic buyer reply scenarios
  const buyerScenarios = [
    {
      label: 'SCENARIO 2A — Buyer is Interested but Skeptical',
      buyerReply: `Hi Arjun,

Thank you for your email. We did receive your earlier message.

We are currently satisfied with our Argentine supplier but I must admit the price difference you mentioned is interesting. We import around 1,400 m² every few months for our showroom and retail projects in Santa Cruz and La Paz.

A few concerns:
1. How do Indian tiles compare in quality to Argentine brands like Alberdi?
2. Shipping to Bolivia is complicated — we've had bad experiences with delays before
3. What guarantee do we have on quality once goods arrive?

If you can address these, I am open to a conversation.

Best regards,
Miguel Fernandez
Procurement Manager, DECOFINO S.R.L`,
    },
    {
      label: 'SCENARIO 2B — Buyer Wants Price & Sample',
      buyerReply: `Arjun,

OK we are interested. We need the following:
- Price list for 60x60 and 60x120 glazed vitrified tiles (matt and glossy finish)
- Minimum order quantity
- Shipping cost to Santa Cruz, Bolivia (CIF if possible)
- Can you send samples? We want to see the quality before we decide.
- We usually pay 30 days after delivery — is that possible?

We can place an order of around 2,000 m² if the quality and price is right.

Miguel
DECOFINO S.R.L`,
    },
  ];

  for (const scenario of buyerScenarios) {
    sep(scenario.label);

    // Step 1: Classify buyer intent
    console.log('\n  👤 BUYER REPLY:');
    console.log('  ' + scenario.buyerReply.replace(/\n/g, '\n  '));

    console.log('\n  🔍 INTENT ANALYSIS:');
    const intent = await classify(scenario.buyerReply);
    console.log('  ' + intent);

    // Step 2: Arjun responds based on buyer's message + full context
    console.log('\n  🤖 ARJUN\'S RESPONSE:');
    const replyPrompt = `A buyer has replied to our outreach email. Write Arjun's reply to this buyer response.

BUYER CONTEXT:
- Company: ${BUYER.company}, ${BUYER.country}
- Product: Ceramic tiles (HS ${BUYER.hs_code})
- They currently buy from: ${BUYER.current_supplier} at $${BUYER.price_per_m2_fob}/m² FOB
- Their typical volume: ~${BUYER.quantity_m2} m² per shipment
- Bolivia is landlocked — ships via Buenos Aires or Arica port

BUYER'S REPLY:
${scenario.buyerReply}

RULES FOR THIS REPLY:
- Address EVERY concern or question the buyer raised, specifically
- Use exact numbers from the AAZIKO PLATFORM DATA
- Be warm and build trust — this is a sales conversion email
- Maximum ONE question at the end
- Include Subject line`;

    const arjunReply = await ask(ARJUN_SYS, replyPrompt, [], 700);
    console.log('\n' + arjunReply.split('\n').map(l => '  ' + l).join('\n'));
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function run() {
  printBuyerProfile();
  await scenario1_EmailSequence();
  await scenario2_BuyerReplies();

  box('TEST COMPLETE');
  console.log('  ✅ Scenario 1: 3-email outreach sequence generated from real import data');
  console.log('  ✅ Scenario 2A: AI responded to skeptical buyer with objection handling');
  console.log('  ✅ Scenario 2B: AI responded to interested buyer with pricing + samples');
  console.log('  Model: Qwen3-235B (Arjun replies) | Qwen3-32B (Intent classification)');
  console.log('  Buyer data source: Real Bolivia import record — DECOFINO S.R.L');
  console.log('═'.repeat(72) + '\n');
}

run().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
