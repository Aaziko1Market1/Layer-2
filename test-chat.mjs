import OpenAI from 'openai';

const KEY  = 'WsmIwf5khm7Z7RUvpjjMrWhjx3QqPUz9';
const BASE = 'https://api.deepinfra.com/v1/openai';
const ai   = new OpenAI({ baseURL: BASE, apiKey: KEY });

// ─── MODELS ──────────────────────────────────────────────────────────────────
const PREMIUM  = 'Qwen/Qwen3-235B-A22B-Instruct-2507';
const MID      = 'Qwen/Qwen3-32B';
const INTENT_M = 'Qwen/Qwen3-32B';
const COMPLY_M = 'Qwen/Qwen3-32B';

// ─── AAZIKO GROUND-TRUTH BUSINESS DATA ───────────────────────────────────────
// This is injected into every Arjun reply so answers are based on REAL data,
// not the model's general knowledge.
const AAZIKO_CONTEXT = `
=== AAZIKO PLATFORM DATA (use ONLY this data to answer — never invent numbers) ===

PLATFORM: 4,800 verified suppliers | 62 countries served | $480M+ total exports
Support: trade@aaziko.com | WhatsApp: +91-98765-00000

PRODUCT: Cotton T-Shirts (HS 6109.10)
- Variants: Round neck, V-neck, Polo, Henley
- GSM options: 140, 160, 180, 200, 220
- Fabric: 100% Cotton | 95/5 Cotton-Elastane | CVC 60/40 | Pique Cotton
- MOQ: 500 pcs (min) | 5,000 pcs (standard bulk)
- FOB India Pricing:
    500–2,000 pcs   → $4.20–$5.50 per piece
    2,001–5,000 pcs → $3.40–$4.20 per piece
    5,001–15,000 pcs → $2.80–$3.40 per piece
    15,000+ pcs     → $2.40–$2.80 per piece
- Lead time: Samples 7–10 days | Bulk 25–35 days
- Certifications available: GOTS, OEKO-TEX Standard 100, BCI, Fair Trade
- Customization: Custom neck label, screen print, embroidery, sublimation, swing tags, polybag packing
- Manufacturing hubs: Tirupur (Tamil Nadu), Ludhiana (Punjab), Surat (Gujarat)

TOP VERIFIED SUPPLIERS FOR COTTON T-SHIRTS:
1. Tirupur Textiles Pvt Ltd (Tirupur, Tamil Nadu)
   - Certs: GOTS, OEKO-TEX, BSCI, WRAP | Rating: 4.8/5 | On-time: 97% | Capacity: 3M pcs/year
2. Surat Garments Hub (Surat, Gujarat)
   - Certs: OEKO-TEX, ISO 9001 | Rating: 4.6/5 | On-time: 94% | Capacity: 2M pcs/year

SHIPPING:
- Incoterms: FOB, CIF, EXW, DDP, DAP, CFR
- Ports: Mumbai (JNPT), Chennai, Mundra
- Sea freight to Hamburg, Germany: 24–30 days
- Sea freight to Dubai, UAE: 10–14 days
- Sea freight to Rotterdam: 22–28 days
- Sea freight to New York: 22–28 days
- Air freight to Germany: 3–5 days
- Documentation: Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin

PAYMENT TERMS:
- Standard: 30% TT advance + 70% against BL copy
- Options: 50/50 split | LC at sight | 20% advance + 80% on BL (repeat buyers)
- Currencies: USD, EUR, GBP, AED
- Samples: 100% advance (fully deductible from bulk order)

SAMPLES:
- Cost: $40–$80 per sample piece (includes custom fabric + print)
- Shipping: $25–$45 via DHL Express
- Lead time: 7–10 business days
- Changes allowed: Up to 2 revisions before bulk approval
- Must be approved before bulk production begins

QUALITY CONTROL:
- Process: Pre-production sample → In-line check → Pre-shipment inspection (PSI)
- Standard: AQL 2.5 (max 2.5% defect rate accepted)
- Third-party inspectors: SGS, Bureau Veritas, Intertek, QIMA
- Inspection cost: $180–$280 per shipment
- Defect policy: Replacement or credit note within 30 days

CERTIFICATIONS:
- GOTS: Minimum 70% organic fibre, covers full supply chain | Price: +15–25% premium
- OEKO-TEX Standard 100: Every component tested for harmful substances | Price: +8–15% premium
- BSCI: Ethical labour audit | No extra cost — included in Aaziko supplier vetting
- WRAP: Safe, lawful, humane manufacturing | No extra cost

=== END AAZIKO DATA ===
`;

// ─── SYSTEM PROMPTS ──────────────────────────────────────────────────────────
const ARJUN = `You are Arjun, a senior trade consultant at Aaziko.com — India's verified B2B export platform.

STRICT RULES:
1. Answer ONLY using the AAZIKO PLATFORM DATA provided — never invent prices, lead times, or specs
2. If the buyer asks something not in the data, say "Let me check with our team and confirm"
3. Ask MAXIMUM ONE question per reply — never ask two questions in one message
4. Sound like a real human trade expert: warm, specific, confident
5. Keep replies to 3–4 sentences maximum
6. Use trade terms naturally: MOQ, FOB, CIF, TT, LC, AQL, PSI

${AAZIKO_CONTEXT}`;

const INTENT_SYS = `Classify the buyer message intent. Output ONLY this JSON (no markdown, no explanation):
{"intent":"price_inquiry|sample_request|shipping_query|certification_query|payment_terms|quality_concern|product_inquiry|negotiation|complaint|general","confidence":0.0-1.0,"urgency":"low|medium|high","emotion":"neutral|frustrated|excited|skeptical|urgent"}`;

const COMPLY_SYS = `Trade compliance check. Output ONLY this JSON:
{"compliant":true|false,"risk_level":"low|medium|high","flags":[],"approved":true|false,"notes":"one line summary"}`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function ask(model, system, userMsg, history = [], maxTokens = 350) {
  const isQwen3 = model.includes('Qwen3');
  const budget  = isQwen3 ? maxTokens + 900 : maxTokens;
  const msgs    = [{ role: 'system', content: system }, ...history, { role: 'user', content: userMsg }];
  const res     = await ai.chat.completions.create({ model, messages: msgs, max_tokens: budget, temperature: 0.75 });
  const raw     = res.choices[0].message.content.trim();
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function line()  { console.log('─'.repeat(72)); }
function dline() { console.log('═'.repeat(72)); }

function printTurn(n, buyer, intent, arjun, comply) {
  line();
  console.log(`  Q${n}/10`);
  console.log();
  console.log(`  👤 BUYER  : ${buyer}`);
  console.log();
  console.log(`  🔍 INTENT : ${intent}`);
  console.log();
  console.log(`  🤖 ARJUN  : ${arjun}`);
  console.log();
  console.log(`  🛡  COMPLY : ${comply}`);
}

// ─── 10 REAL HUMAN BUYER QUESTIONS ───────────────────────────────────────────
const QUESTIONS = [
  // Q1 — First contact, vague
  "Hi, I came across Aaziko online. We are a clothing retailer in Germany and looking to source from India. Can you help us?",
  // Q2 — Product specific
  "We mainly need round-neck cotton t-shirts, 180 GSM. What kind of pricing can we expect for 5000 pieces?",
  // Q3 — Skeptical, been burned before
  "Honestly we tried sourcing from India before and the quality was terrible. How do I know your suppliers are actually reliable?",
  // Q4 — Certification pressure
  "Our customers in Germany care a lot about sustainability. Do your suppliers have any GOTS or OEKO-TEX certifications?",
  // Q5 — Negotiation push
  "We got a quote from a Bangladesh supplier at $2.40 per piece for the same specs. Can you compete with that?",
  // Q6 — Logistics / shipping
  "We don't have much experience with shipping from India. What are the typical Incoterms and how long does it take to reach Hamburg?",
  // Q7 — Payment concern
  "One more thing — we are a small business and can't do 100% advance payment. What are the payment options?",
  // Q8 — Sample request
  "OK before we commit to bulk, can we get samples first? How does that work and what will it cost us?",
  // Q9 — Custom label / branding
  "If we place a bulk order, can the manufacturers put our brand label inside the shirts? We have our own brand name.",
  // Q10 — Closing / urgency
  "We are planning to launch a new collection in August. If we confirm the order by end of April, can you guarantee delivery by July 15th?",
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function run() {
  dline();
  console.log('  AAZIKO AI — REAL BUYER CONVERSATION TEST (10 Questions)');
  console.log('  Buyer  : Klaus Bauer, Retail Clothing Importer — Frankfurt, Germany');
  console.log('  Product: 180 GSM Cotton T-Shirts | Tier: Gold → Premium');
  console.log('  Model  : Arjun (Aaziko AI Agent) powered by DeepInfra');
  dline();

  const history = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];

    // Determine tier by question number (starts silver, upgrades as deal progresses)
    const model = i < 2 ? MID : PREMIUM;
    const tierLabel = i < 2 ? 'Silver→MID [Qwen3-32B]' : 'Gold/Platinum [Qwen3-235B]';

    // Run intent, reply, compliance in sequence (reply depends on intent context)
    const [intent, comply] = await Promise.all([
      ask(INTENT_M,  INTENT_SYS, q, [], 600),
      ask(COMPLY_M,  COMPLY_SYS, q, [], 600),
    ]);

    // Arjun reply with full conversation context
    const arjun = await ask(model, ARJUN, q, history, 400);

    // Print turn
    console.log();
    printTurn(
      i + 1,
      q,
      `[${tierLabel}]  ${intent.replace(/\n/g,' ').slice(0,120)}`,
      arjun.replace(/\n/g, '\n              '),
      comply.replace(/\n/g,' ').slice(0,120)
    );

    // Add to conversation history for context
    history.push({ role: 'user', content: q });
    history.push({ role: 'assistant', content: arjun });
  }

  console.log();
  dline();
  console.log('  ✅ ALL 10 QUESTIONS ANSWERED — CONVERSATION COMPLETE');
  console.log();
  console.log('  Pipeline per turn:');
  console.log('  1. Intent Classification  → Qwen3-32B   (what does buyer want?)');
  console.log('  2. Compliance Check       → Qwen3-32B   (any trade/legal risks?)');
  console.log('  3. Arjun Reply            → Qwen3-235B  (actual human-like response)');
  console.log('  4. Full context history   → carried across all 10 turns');
  dline();
  console.log();
}

run().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
