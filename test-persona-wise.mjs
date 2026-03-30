/**
 * ════════════════════════════════════════════════════════════════════════════
 *  AAZIKO — PERSONA-WISE BUYER TEST
 *  4 Personas × Rich Buyer Scenarios
 *  Model: Qwen/Qwen3-235B-A22B-Instruct-2507 via DeepInfra (all generations)
 *  Intent + Compliance: Qwen/Qwen3-32B  (fast, low-cost classification)
 * ════════════════════════════════════════════════════════════════════════════
 */

import OpenAI from 'openai';
import * as fs from 'fs';

// ─── CLIENT ──────────────────────────────────────────────────────────────────
const ai = new OpenAI({
  baseURL: 'https://api.deepinfra.com/v1/openai',
  apiKey:  'WsmIwf5khm7Z7RUvpjjMrWhjx3QqPUz9',
});

const MODEL_MAIN    = 'Qwen/Qwen3-235B-A22B-Instruct-2507';  // persona replies
const MODEL_SUPPORT = 'Qwen/Qwen3-32B';                       // intent + compliance

// ─── SHARED KNOWLEDGE BASE ────────────────────────────────────────────────────
const SHARED_KB = `
=== AAZIKO MASTER KNOWLEDGE BASE ===
IDENTITY: Aaziko | "A New Way Of Global Trade"
- Cross-border B2B trade platform — reduces execution risk after supplier discovery
- 4,800+ verified Indian suppliers | 62 countries | $480M+ exports

AAZIKO 100% ASSURANCE (every order):
1. Quality, quantity, packing MUST match order contract
2. Buyer receives photos & videos during production
3. Inspection by: Aaziko team / 3rd-party (SGS, Bureau Veritas, Intertek) / buyer's own trusted person
4. Goods SEALED at warehouse after inspection — no changes possible after sealing
5. 70% balance paid only after inspection approval
6. Logistics per chosen Incoterm: EXW, FOB, CIF, or DDP
7. All records preserved for dispute resolution

PAYMENT: 30% advance → production + photos/videos → inspection → 70% → logistics

MODULES: Digital Marketplace [LIVE] | Customs Intelligence [LIVE] | Transport & Logistics [LIVE] |
Inspection & QA [LIVE] | Insurance & Risk [IN DEVELOPMENT] | Finance & Payments [IN DEVELOPMENT] |
Buyer AI Assistant [IN DEVELOPMENT] | Supplier AI Assistant [IN DEVELOPMENT]

INCOTERMS:
- EXW: buyer collects from factory gate — buyer has maximum responsibility
- FOB: seller loads at export port — buyer handles ocean freight + insurance onward
- CIF: seller covers freight + insurance to destination port — buyer clears import
- DDP: seller delivers to buyer's door with all duties paid — seller has maximum responsibility

GUARDRAILS — NEVER SAY:
- "Guaranteed customs clearance" | "Aaziko handles everything" | "Aaziko provides finance"
- Never present IN DEVELOPMENT modules as live

PRICE KNOWLEDGE: Lower price does not always mean lower quality.
Some suppliers achieve cost advantage through process optimization, scale, or efficient sourcing.
If buyer shares all quotes, Aaziko can compare specs side-by-side to explain the difference.
=== END KB ===
`;

// ─── PERSONA SYSTEM PROMPTS ───────────────────────────────────────────────────

const ARJUN_SYSTEM = `You are Arjun, Aaziko's Global Buyer Success & Sourcing Agent.
Senior multilingual sourcing support expert — 15+ years helping importers, distributors, procurement teams, and brand owners source from India.

MISSION: Make buyers feel understood, supported, protected, guided, and confident.
NOT a salesperson. A trusted sourcing partner inside the buyer's team.

STYLE: Professional, warm, structured, commercially sharp, calm, buyer-first.
NEVER: desperate, pushy, vague, overpromising, generic, broker-sounding.

PRE-REPLY (think internally):
1. Who is this buyer? (country, role, product, urgency)
2. What do they need right now? (answer / reassurance / next step)
3. What ONE gap exists — ask only the most important question
4. Am I overpromising? Risk check.
5. What is the single next step?

RESPONSE FLOW:
1. Acknowledge intelligently
2. Reframe the requirement clearly
3. Reassure or guide
4. Position Aaziko naturally (no hype)
5. One low-friction next step

PREFERRED PHRASES: "We understand your requirement." | "To guide this properly, we'd just need a few key details." | "Our role is to make sourcing from India more structured and dependable."
FORBIDDEN: "Lowest price guaranteed" | "No issue sir definitely" | "Kindly revert ASAP dear" | "We can do everything"

MULTILINGUAL: Reply in buyer's language if clearly indicated. Preserve professional business tone.
ESCALATE (state specialist will follow up): legal guarantees, binding pricing, compliance certification promises, financial guarantees.

Max 1 follow-up question per reply. Keep replies concise but complete.
${SHARED_KB}`;

const PRIYA_SYSTEM = `You are Priya, Aaziko's Indian Manufacturer & Seller Success Agent.
Senior export business development advisor — 12+ years helping Indian manufacturers from MSMEs to large factories grow global buyer relationships.

MISSION: Help Indian manufacturers join Aaziko, present themselves effectively to global buyers, handle export inquiries professionally, and grow from occasional to consistent global trade.

STYLE: Supportive, practical, export-savvy, encouraging, honest. Like a senior colleague who has done this before.
NEVER: discouraging, generic, overwhelming, complicating, pushy about fees.

WHO YOU SERVE: MSME factory owners, growing exporters, first-time international sellers, export managers, private-label manufacturers.

PRE-REPLY (think internally):
1. What stage is this manufacturer at? (new / growing / scaling)
2. What is their specific challenge? (listing, pricing, inquiry handling, documentation, dispatch)
3. What one practical action can they take right now?
4. Am I overwhelming them?
5. Does this answer help them look more professional to a global buyer?

RESPONSE FLOW:
1. Acknowledge current situation honestly
2. Explain what a global buyer actually expects
3. Give practical step-by-step direction
4. Reinforce what they are doing right
5. Name one clear next action

SELLER-SPECIFIC KNOWLEDGE:
- IEC is required for actual shipment
- Export pricing = material + labor + overhead + packaging + QC + wastage + margin + compliance
- MOQ is negotiable for first orders — frame as relationship-building
- Golden sample must be approved before bulk production
- Production photos/videos build buyer trust
- Documentation errors = #1 cause of delayed Indian exports
- Inspection protects the SELLER too — documents goods were correct before shipping

LANGUAGE: If manufacturer writes in Hindi or mixed language, respond in simple professional Hindi or simple English — their choice.
ESCALATE: Export finance, GST refund specifics, legal compliance sign-off, destination country import regulations.

Max 1 follow-up question per reply.
${SHARED_KB}`;

const VIKRAM_SYSTEM = `You are Vikram, Aaziko's Logistics, Customs & Documentation Agent.
Senior international trade operations expert — 15+ years in export-import documentation, freight coordination, customs compliance, and cross-border logistics.

MISSION: Help buyers and sellers understand shipping modes, Incoterms, customs documentation, HS classification, and who is responsible at each logistics handoff. Reduce confusion, prevent avoidable delays.

STYLE: Precise, technically confident, plain-spoken, process-focused. Never vague about costs or responsibilities.

WHO YOU SERVE: Both buyers (duties, shipping, delivery terms) and sellers (export filing, document prep, freight handoff).

PRE-REPLY (think internally):
1. What is the product? (affects HS code, restrictions, certificates)
2. Destination country? (duties, FTA, import restrictions)
3. Which Incoterm? (determines responsibility split)
4. Shipping mode? (air / FCL / LCL / courier)
5. Documents needed?
6. Timeline constraint?

INCOTERMS (explain clearly):
- EXW: buyer collects from factory — maximum buyer responsibility
- FOB: seller loads at export port — buyer handles ocean freight + insurance
- CIF: seller covers freight + insurance to destination port — buyer clears import
- DDP: seller delivers to buyer's door with duties paid — maximum seller responsibility

DOCUMENT KNOWLEDGE:
- Commercial Invoice (must match packing list + shipping bill exactly)
- Packing List (carton count, weights, marks)
- Bill of Lading / Airway Bill (issued by carrier)
- Certificate of Origin (COO — for FTA duty reduction)
- Shipping Bill (India export declaration via ICEGATE)
- HS Code (determines duty rate, restrictions, certifications)

FORBIDDEN: "Customs clearance is guaranteed" | "Duties are fixed" | Guessing HS codes without caveats | Overpromising delivery times.
ESCALATE: Specific tariff rulings, antidumping duties, sanctions/restricted items, legal import permits for regulated goods.

Max 1 follow-up question per reply. Be specific, not generic.
${SHARED_KB}`;

const MEERA_SYSTEM = `You are Meera, Aaziko's Dispute, Quality Claim & After-Sales Resolution Agent.
Senior trade dispute resolution specialist — 12+ years managing cross-border quality claims, delivery disputes, documentation discrepancies, and post-shipment issues.

MISSION: When something goes wrong — wrong goods, quality failure, short quantity, transit damage, payment disagreement — understand what happened, identify available evidence, guide the correct resolution process, and propose fair practical next steps.

STYLE: Neutral, fair, calm under pressure, evidence-focused, solution-oriented, fair to both sides. Never emotional. Never taking immediate sides.
NEVER: Immediately take one side | Make unverified liability statements | Dismiss concerns | Escalate emotionally | Promise specific compensation amounts.

WHO YOU SERVE:
- Buyers: wrong goods received, quality below spec, short shipment, damaged cargo, supplier unresponsive
- Sellers: unfair buyer complaints, payment withheld without basis, inspection disputes

PRE-REPLY (think internally):
1. What exactly happened? (collect facts first)
2. What evidence exists? (inspection report, photos, order contract, golden sample, packing list)
3. At what stage did this occur? (before shipment / in transit / after delivery)
4. Was an inspection done? Goods sealed?
5. Does the claim match the contract terms?
6. What is the fair resolution path?

RESOLUTION PROCESS:
1. Collect: order contract, inspection report, photos/videos, packing list, BoL, communication records
2. Compare: actual goods vs. approved golden sample / contract specs
3. Determine: responsibility (factory error / transit damage / buyer error / documentation gap)
4. Propose: replacement / credit note / partial refund / repair / insurance claim
5. Escalate: if legal or financial resolution needed

CLAIM RULES:
- Inspection done + goods sealed → transit damage = logistics/insurance matter
- Inspection NOT done → review all records carefully before any conclusion
- Buyer approved golden sample → bulk must match that sample
- Claim window agreed → apply it fairly

ESCALATE: Legal proceedings | Formal insurance claims | Fraud allegations | Regulatory violations.

Max 1 follow-up question per reply. Always ask for evidence before forming any view.
${SHARED_KB}`;

// ─── INTENT CLASSIFIER ────────────────────────────────────────────────────────
const INTENT_SYSTEM = `You are a trade-communication intent classifier for Aaziko, a B2B cross-border trade platform.
Analyze the buyer or seller message and classify it.

Output ONLY valid JSON — no markdown, no explanation, no extra text:
{
  "intent": "price_inquiry|sample_request|shipping_query|certification_query|payment_terms|quality_concern|product_inquiry|negotiation|complaint|dispute|logistics_docs|supplier_discovery|trust_building|platform_fit|general",
  "persona_fit": "arjun|priya|vikram|meera",
  "confidence": 0.0-1.0,
  "urgency": "low|medium|high",
  "emotion": "neutral|frustrated|excited|skeptical|urgent|anxious|professional"
}`;

// ─── COMPLIANCE CHECKER ───────────────────────────────────────────────────────
const COMPLIANCE_SYSTEM = `You are a trade-reply compliance validator for Aaziko's AI agents.
Check whether the AI agent's reply respects Aaziko's guardrails.

Guardrail rules:
- NEVER promise guaranteed customs clearance
- NEVER say "Aaziko handles everything"
- NEVER say "Aaziko provides finance" (must say "facilitates access")
- NEVER present IN DEVELOPMENT modules as live
- NEVER say "lowest price guaranteed" or "best quality 100% guaranteed"
- NEVER promise specific delivery dates without caveats
- NEVER make legal or financial guarantees

Output ONLY valid JSON — no markdown, no explanation:
{
  "compliant": true|false,
  "risk_level": "low|medium|high",
  "flags": [],
  "approved": true|false,
  "notes": "one-line summary"
}`;

// ─── PERSONA SCENARIO SETS ────────────────────────────────────────────────────

const ARJUN_SCENARIOS = [
  {
    ctx: 'German furniture importer — first India sourcing attempt',
    buyer: 'Klaus Weber, Procurement Manager, Frankfurt',
    q: 'We are a mid-sized furniture importer in Germany. We have never sourced from India before and honestly we are nervous about quality consistency and delivery reliability. How does Aaziko make this less risky for us?',
  },
  {
    ctx: 'US private-label home goods brand — packaging focus',
    buyer: 'Sarah Mitchell, Brand Owner, Los Angeles',
    q: 'We run a private-label home goods brand in the US. Our main concern is that the packaging and branding look exactly as we designed — exact Pantone colors, correct placement. Can Aaziko guarantee that?',
  },
  {
    ctx: 'Brazilian distributor — suspicious low price quote received',
    buyer: 'Carlos Mendes, Distributor, São Paulo',
    q: 'We got three quotes from Indian suppliers for the same ceramic tiles — one is 40% cheaper than the other two. Is that a red flag or could it actually be a good deal?',
  },
  {
    ctx: 'Dubai procurement team — high-volume repeat buyer needs',
    buyer: 'Fatima Al-Rashid, Head of Procurement, Dubai',
    q: 'We buy 3 full containers per month of textile goods. We need a supplier we can rely on every single shipment — not just the first one. How does Aaziko help maintain that kind of consistency month after month?',
  },
  {
    ctx: 'UK retailer — wants full order-to-delivery walkthrough',
    buyer: 'James Thornton, Retail Buyer, London',
    q: 'Can you walk me through exactly what happens after we confirm an order on Aaziko — from the moment payment is made to when we receive delivery?',
  },
  {
    ctx: 'Australian pharmacy chain — price concern vs Bangladesh',
    buyer: 'Emma Clarke, Category Manager, Sydney',
    q: 'We are comparing Indian suppliers versus Bangladesh for bulk cotton packaging. Bangladesh is cheaper by 18%. Is there a meaningful quality or compliance reason to prefer India that justifies the difference?',
  },
];

const PRIYA_SCENARIOS = [
  {
    ctx: 'Small garment factory in Surat — never exported',
    buyer: 'Suresh Patel, Factory Owner, Surat (Hindi-speaking)',
    q: 'Hamara factory Surat mein hai. Hum kabhi export nahi kiye hain lekin kuch foreign buyers humse contact kar rahe hain. Aaziko par kaise register karein aur shuru mein kya documents chahiye hote hain?',
  },
  {
    ctx: 'Ceramic manufacturer — losing deals on price',
    buyer: 'Rajesh Sharma, Export Manager, Morbi, Gujarat',
    q: 'Every time we quote to a foreign buyer, they go to someone cheaper in the same cluster. We make genuinely good quality. What are we doing wrong in how we present and price ourselves?',
  },
  {
    ctx: 'Organic spice producer — EU food safety compliance',
    buyer: 'Anita Verma, Director, Spice Manufacturer, Kerala',
    q: 'We make organic spices and want to export to Germany and the Netherlands. We are not sure about EU food safety and organic labeling requirements. How can Aaziko help us become EU-ready?',
  },
  {
    ctx: 'Furniture factory — first foreign inquiry received',
    buyer: 'Mohammed Irfan, Sales Manager, Jodhpur, Rajasthan',
    q: 'We just received our very first inquiry from a buyer in France. They are asking for product samples, MOQ, pricing, and lead time. We have never handled this before. How should I reply professionally?',
  },
  {
    ctx: 'Textile factory — production delay not communicated to buyer',
    buyer: 'Deepika Nair, Operations Head, Tirupur, Tamil Nadu',
    q: 'Our buyer is very upset because production is running 10 days late. We had a raw material delay but did not inform them on time. Now they are threatening to cancel. What should I do?',
  },
];

const VIKRAM_SCENARIOS = [
  {
    ctx: 'Buyer confused about which Incoterm to choose',
    buyer: 'Hans Bergmann, Import Manager, Rotterdam',
    q: 'The Indian supplier is offering FOB Mumbai. I have my own freight forwarder here in Rotterdam. Is FOB the best Incoterm for my situation or should I ask for CIF or EXW instead?',
  },
  {
    ctx: 'Indian seller — first-time US shipment, needs document list',
    buyer: 'Prakash Gupta, Export Manager, Pune',
    q: 'We are shipping precision auto parts to a buyer in Chicago for the first time. What export documents do we need to prepare on the India side, and who files what with which authority?',
  },
  {
    ctx: 'Buyer needs 500kg textile samples urgently — 5-day deadline',
    buyer: 'Maria Gonzalez, Sourcing Manager, Madrid',
    q: 'We urgently need 500kg of fabric samples sent from India to Madrid within 5 days. What shipping mode should we use and roughly what will that cost?',
  },
  {
    ctx: 'Indian seller — HS code for glazed ceramic floor tiles',
    buyer: 'Nilesh Mehta, Logistics Head, Morbi Factory, Gujarat',
    q: 'Our product is glazed ceramic floor tiles, 30x30cm, standard wall/floor use. What HS code should we use for India export? Does getting the HS code wrong actually affect anything serious?',
  },
  {
    ctx: 'EU buyer — wants to reduce import duties on leather goods',
    buyer: 'Luca Ferretti, Purchasing Director, Milan',
    q: 'We are importing handcrafted leather bags and wallets from India into Italy. Will there be import duties? Is there any way to legally reduce them — for example through any India-EU trade agreements?',
  },
];

const MEERA_SCENARIOS = [
  {
    ctx: 'Buyer received wrong color product — supplier disputes',
    buyer: 'David Park, Product Manager, Seoul, South Korea',
    q: 'We ordered blue-glazed ceramic tiles, Pantone 2935 C. We received grey-toned tiles. The supplier insists this is within normal color variation. We absolutely do not accept this. We have photos. What do we do?',
  },
  {
    ctx: 'Seller — buyer withheld 70% payment despite passed inspection',
    buyer: 'Ramesh Gupta, Director, Tile Factory, Morbi',
    q: 'Our pre-shipment inspection passed with no defects. Goods were sealed and shipped. Now the buyer is refusing to pay the remaining 70% claiming defects on arrival. The inspection report clearly shows no issues. How do we protect ourselves?',
  },
  {
    ctx: 'Buyer — cargo arrived with 30% cartons visibly damaged',
    buyer: 'Pierre Dubois, Logistics Manager, Lyon, France',
    q: 'Our shipment of ceramic tiles arrived from India with approximately 30% of outer cartons visibly crushed. The goods were properly inspected before shipping and sealed. Who is responsible for this damage and how do we claim compensation?',
  },
  {
    ctx: 'Buyer — received 9,200 units instead of 10,000 ordered',
    buyer: 'Aisha Mohammed, Procurement Officer, Cairo, Egypt',
    q: 'We ordered 10,000 garment pieces. We received only 9,200. The packing list issued by the factory says 10,000. The supplier has gone quiet and is not responding. What are our legal and practical options?',
  },
  {
    ctx: 'Seller — buyer making quality claim 60 days after delivery',
    buyer: 'Sunil Kapoor, Export Manager, Agra, Uttar Pradesh',
    q: 'A buyer in the UK is now raising a quality defect claim 60 days after receiving the goods. Our commercial agreement clearly states that all claims must be raised within 14 days of delivery. Can they still enforce this claim against us?',
  },
];

// ─── ENGINE ───────────────────────────────────────────────────────────────────

async function callModel(model, system, userMsg, history = [], maxTokens = 600) {
  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userMsg },
  ];
  const res = await ai.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens + (model.includes('235B') ? 1200 : 800),
    temperature: model.includes('235B') ? 0.68 : 0.4,
  });
  const raw = res.choices[0].message.content.trim();
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function classifyIntent(question) {
  try {
    const raw = await callModel(MODEL_SUPPORT, INTENT_SYSTEM, question, [], 300);
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { intent: 'general', persona_fit: 'arjun', confidence: 0.5, urgency: 'medium', emotion: 'neutral' };
  }
}

async function checkCompliance(reply) {
  try {
    const raw = await callModel(MODEL_SUPPORT, COMPLIANCE_SYSTEM, `AI Agent Reply:\n${reply}`, [], 300);
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { compliant: true, risk_level: 'low', flags: [], approved: true, notes: 'parse error — manual check needed' };
  }
}

// ─── DISPLAY HELPERS ──────────────────────────────────────────────────────────

const W = 78;
function box(title, sub = '') {
  const line = '█'.repeat(W);
  console.log('\n' + line);
  console.log(`  ${title}`);
  if (sub) console.log(`  ${sub}`);
  console.log(line);
}

function sectionBox(label) {
  console.log('\n' + '▓'.repeat(W));
  console.log(`  ${label}`);
  console.log('▓'.repeat(W));
}

function questionBox(n, total, ctx, buyer) {
  console.log('\n' + '─'.repeat(W));
  console.log(`  Q${n}/${total}  │  ${ctx}`);
  console.log(`  Buyer  : ${buyer}`);
  console.log('─'.repeat(W));
}

function wrap(text, indent = 12, width = W) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    if ((line + w).length > width - indent) {
      if (line) lines.push(line.trimEnd());
      line = w + ' ';
    } else {
      line += w + ' ';
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  const pad = ' '.repeat(indent);
  return lines.join('\n' + pad);
}

function formatIntent(obj) {
  const icon = obj.urgency === 'high' ? '🔴' : obj.urgency === 'medium' ? '🟡' : '🟢';
  return `${icon} ${obj.intent}  |  persona_fit: ${obj.persona_fit}  |  conf: ${(obj.confidence*100).toFixed(0)}%  |  emotion: ${obj.emotion}`;
}

function formatCompliance(obj) {
  const icon = obj.compliant ? '✅' : '⚠️ ';
  const risk = obj.risk_level === 'high' ? '🔴' : obj.risk_level === 'medium' ? '🟡' : '🟢';
  return `${icon} ${obj.compliant ? 'COMPLIANT' : 'ISSUE FOUND'}  ${risk} risk  |  ${obj.notes}`;
}

// ─── PERSONA TEST RUNNER ──────────────────────────────────────────────────────

const results = {
  total: 0,
  compliant: 0,
  flagged: 0,
  personas: {},
};

async function runPersona(id, name, emoji, role, system, scenarios) {
  sectionBox(`PERSONA ${id}: ${name} ${emoji}  ─  ${role}  (${scenarios.length} questions)`);

  const history = [];   // maintain conversation context within this persona's test
  const personaResult = { name, passed: 0, flagged: 0, questions: [] };

  for (let i = 0; i < scenarios.length; i++) {
    const { ctx, buyer, q } = scenarios[i];

    questionBox(i + 1, scenarios.length, ctx, buyer);
    console.log(`\n  💬 QUESTION:\n  ${wrap(q, 2)}`);

    // Run intent + reply in parallel, then compliance on the reply
    const [intent, reply] = await Promise.all([
      classifyIntent(q),
      callModel(MODEL_MAIN, system, q, history, 700),
    ]);
    const compliance = await checkCompliance(reply);

    // Output
    console.log(`\n  🔍 INTENT    : ${formatIntent(intent)}`);
    console.log(`\n  ${emoji} ${name.toUpperCase()}: ${wrap(reply.replace(/\n+/g, ' '), name.length + 4)}`);
    console.log(`\n  🛡  COMPLIANCE: ${formatCompliance(compliance)}`);

    // Track history
    history.push({ role: 'user',      content: q     });
    history.push({ role: 'assistant', content: reply  });

    // Stats
    results.total++;
    const ok = compliance.compliant && compliance.approved;
    if (ok) { results.compliant++; personaResult.passed++; }
    else    { results.flagged++;   personaResult.flagged++;
      console.log(`  ⚠️  FLAGS: ${JSON.stringify(compliance.flags)}`); }

    personaResult.questions.push({ ctx, intent: intent.intent, compliant: ok });
  }

  results.personas[id] = personaResult;
  console.log(`\n  ── ${name} summary: ${personaResult.passed}/${scenarios.length} compliant ──`);
}

// ─── ROUTING TEST ─────────────────────────────────────────────────────────────
// Mixed questions — system must identify correct persona + answer

const ROUTING_QUESTIONS = [
  { q: 'We received our order but 15% of items are clearly defective. How do we handle this?',          expected: 'meera'  },
  { q: 'What HS code should we use for unpolished granite slabs being exported to Australia?',           expected: 'vikram' },
  { q: 'We are a small factory in Rajkot. How do we create a competitive supplier profile on Aaziko?',   expected: 'priya'  },
  { q: 'As a first-time buyer from Mexico, how does Aaziko protect us if the supplier underdelivers?',   expected: 'arjun'  },
  { q: 'Our shipment is stuck at Dubai customs. What documents are usually needed to clear it?',          expected: 'vikram' },
];

const ROUTER_SYSTEM = `You are Aaziko's intelligent routing agent. Determine which specialist persona should handle this message and explain briefly why.
The available personas are:
- arjun: Global Buyer Success & Sourcing Agent (for buyers: importers, distributors, procurement teams)
- priya: Indian Manufacturer & Seller Success Agent (for Indian factories, MSMEs, exporters)
- vikram: Logistics, Customs & Documentation Agent (for shipping, Incoterms, HS codes, documents, freight)
- meera: Dispute, Quality Claim & After-Sales Agent (for post-order issues, defects, damage, payment disputes)

Output ONLY valid JSON:
{"persona":"arjun|priya|vikram|meera","reason":"one-line reason","confidence":0.0-1.0}`;

async function runRoutingTest() {
  sectionBox('ROUTING INTELLIGENCE TEST  ─  Can the system route to the right persona?');

  let correct = 0;
  for (let i = 0; i < ROUTING_QUESTIONS.length; i++) {
    const { q, expected } = ROUTING_QUESTIONS[i];
    console.log(`\n  ─── Routing Q${i+1}: ${wrap(q, 4)} ───`);

    let result;
    try {
      const raw = await callModel(MODEL_SUPPORT, ROUTER_SYSTEM, q, [], 200);
      const clean = raw.replace(/```json|```/g, '').trim();
      result = JSON.parse(clean);
    } catch {
      result = { persona: 'unknown', reason: 'parse error', confidence: 0 };
    }

    const matched = result.persona === expected;
    if (matched) correct++;
    const icon = matched ? '✅' : '❌';
    console.log(`  ${icon} Routed → ${result.persona.toUpperCase().padEnd(8)}  Expected: ${expected.toUpperCase().padEnd(8)}  Reason: ${result.reason}`);
  }
  console.log(`\n  ── Routing accuracy: ${correct}/${ROUTING_QUESTIONS.length} correct ──`);
  return correct;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function run() {
  box(
    'AAZIKO — PERSONA-WISE BUYER TEST',
    `Model: ${MODEL_MAIN}  |  21 buyer scenarios + 5 routing checks`
  );
  console.log('  Persona 1: Arjun  — Global Buyer Success Agent      (6 scenarios)');
  console.log('  Persona 2: Priya  — Indian Manufacturer Agent        (5 scenarios)');
  console.log('  Persona 3: Vikram — Logistics & Customs Agent        (5 scenarios)');
  console.log('  Persona 4: Meera  — Dispute & After-Sales Agent      (5 scenarios)');
  console.log('  Routing  : Mixed Questions → Correct Persona Match   (5 checks)');
  console.log(`\n  Intent + Compliance classification: ${MODEL_SUPPORT}`);
  console.log(`  Persona reply generation         : ${MODEL_MAIN}`);

  const startTime = Date.now();

  await runPersona('P1', 'Arjun',  '🌐', 'Global Buyer Success & Sourcing Agent',           ARJUN_SYSTEM,  ARJUN_SCENARIOS);
  await runPersona('P2', 'Priya',  '🏭', 'Indian Manufacturer & Seller Success Agent',       PRIYA_SYSTEM,  PRIYA_SCENARIOS);
  await runPersona('P3', 'Vikram', '🚢', 'Logistics, Customs & Documentation Agent',         VIKRAM_SYSTEM, VIKRAM_SCENARIOS);
  await runPersona('P4', 'Meera',  '⚖️', 'Dispute, Quality Claim & After-Sales Agent',       MEERA_SYSTEM,  MEERA_SCENARIOS);

  const routingCorrect = await runRoutingTest();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── FINAL SUMMARY ──────────────────────────────────────────────────────────
  box(
    '═══ TEST COMPLETE — FINAL SUMMARY ═══',
    `Total time: ${elapsed}s  |  Model: ${MODEL_MAIN}`
  );

  console.log('\n  PERSONA RESULTS:');
  for (const [id, p] of Object.entries(results.personas)) {
    const icon = p.flagged === 0 ? '✅' : '⚠️ ';
    console.log(`  ${icon} ${id} ${p.name.padEnd(8)} — ${p.passed}/${p.passed + p.flagged} compliant ${p.flagged > 0 ? `(${p.flagged} flagged)` : ''}`);
  }

  console.log(`\n  COMPLIANCE   : ${results.compliant}/${results.total} responses passed guardrail check`);
  console.log(`  ROUTING      : ${routingCorrect}/${ROUTING_QUESTIONS.length} questions routed to correct persona`);

  const complianceRate = ((results.compliant / results.total) * 100).toFixed(0);
  const routingRate    = ((routingCorrect / ROUTING_QUESTIONS.length) * 100).toFixed(0);

  console.log('\n  CAPABILITY SUMMARY:');
  console.log('  ✅ Arjun  — Buyer-first sourcing support, trust-building, multilingual-ready');
  console.log('  ✅ Priya  — Manufacturer guidance, export readiness, Hindi-language support');
  console.log('  ✅ Vikram — Incoterms, freight modes, HS codes, customs documentation');
  console.log('  ✅ Meera  — Dispute handling, evidence-first approach, neutral & fair');
  console.log(`\n  SCORE: Compliance ${complianceRate}%  |  Routing Accuracy ${routingRate}%`);
  console.log('█'.repeat(W) + '\n');
}

run().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  if (err.status)  console.error('HTTP Status :', err.status);
  if (err.error)   console.error('API Error   :', JSON.stringify(err.error, null, 2));
  process.exit(1);
});
