/**
 * Aaziko — Buyer-Specific AI Email Test
 * Uses Qwen3-235B (premium tier) + Arjun persona
 * Sends to: aazikodevteamleader@gmail.com
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Parse .env ──────────────────────────────────────────────────────
const envFile = readFileSync(path.join(__dirname, '.env'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const nodemailer = require('nodemailer');
const https      = require('https');

// ─── Buyer Data (from your database) ────────────────────────────────
const BUYER = {
  _id:              '696b426ec4b85a2cd89604e5',
  name:             'SOHAR PORCELAIN',
  country:          'OMAN',
  category:         'B3',
  totalAmount:      68127.11,
  transactionCount: 18,
  hsCodes:          ['32072010'],
  products: [
    'GLAZE TOP - FF - 2049',
    'GLAZE COMPOUND -FF- D',
    'ENGOBE-FF-5008-C',
    'GLAZE SILKY TOP - FF-5609',
    'GLAZE POLISH BASE - FF-5659',
    'GLAZE TOP - FF - 2415',
    'TOP MAT TR GLAZE COMPOUND',
    'CERAMIC GLAZE MATERIAL',
    'CORUNDUM 200 X HARD GLAZE MATERIAL',
    'SMALTOBBIO RUSTIC COMPOUND',
    'SOFT SMALTOBBIO X PGVT COMPOUND',
    'CERAMIC GLAZE MATERIAL ITEM CODE: RM50030',
  ],
  buyer_id:         'XXVL035791',
  intent_priority:  'cold',
  intent_score:     15,
  lead_priority:    'medium',
  lead_score:       51,
  intent_signals:   ['multi_product', 'partial_contact'],
  lead_score_breakdown: {
    value_score:     69,
    frequency_score: 69,
    diversity_score: 0,
    recency_score:   40,
  },
  lastUpdated: '2026-01-17',
};

const TO        = 'aazikodevteamleader@gmail.com';
const AI_URL    = env.COMM_PREMIUM_BASE_URL;   // https://api.deepinfra.com/v1/openai
const AI_MODEL  = env.COMM_PREMIUM_MODEL;      // Qwen/Qwen3-235B-A22B-Instruct-2507
const AI_KEY    = env.COMM_PREMIUM_API_KEY;
const FROM_NAME = env.ZOHO_FROM_NAME || 'Arjun';
const FROM_EMAIL= env.ZOHO_EMAIL;
const SMTP_PASS = env.ZOHO_APP_PASSWORD || env.ZOHO_PASSWORD;
const SMTP_HOST = env.ZOHO_HOST || 'smtp.zoho.com';
const SMTP_PORT = parseInt(env.ZOHO_PORT || '587', 10);

// ─── Call Qwen3-235B via OpenAI-compat API ───────────────────────────
async function generateEmail() {
  const systemPrompt = `You are Arjun Mehta, a senior B2B Trade Consultant at Aaziko — India's premier trade intelligence and sourcing platform. You specialize in connecting international buyers with verified Indian manufacturers of ceramic raw materials, frits, glazes, and specialty chemical compounds.

Your writing style:
- Professional yet warm and personal
- Data-driven — you reference the buyer's specific trade numbers
- Specific — you mention their exact products, not generic categories
- Consultative — you highlight a genuine insight or value, not just a sales pitch
- Concise — emails are 180-240 words max, never padded
- End with ONE clear question or call-to-action
- Sign off as: Arjun Mehta | Senior Trade Consultant | Aaziko`;

  const userPrompt = `Write a highly personalized cold outreach email to this buyer. Use their exact data below.

BUYER PROFILE:
Company: ${BUYER.name}
Country: ${BUYER.country}
HS Code: ${BUYER.hsCodes.join(', ')} (Ceramic frits, glazes, and glass compounds)
Total Trade Volume: $${BUYER.totalAmount.toLocaleString()}
Transaction Count: ${BUYER.transactionCount} shipments
Lead Score: ${BUYER.lead_score}/100 (${BUYER.lead_priority} priority)
Intent Score: ${BUYER.intent_score} (${BUYER.intent_priority} intent)
Intent Signals: ${BUYER.intent_signals.join(', ')}

PRODUCTS THEY SOURCE:
${BUYER.products.slice(0, 8).map((p, i) => `${i+1}. ${p}`).join('\n')}

WHAT TO WRITE:
- Open with a specific reference to their business (ceramic/porcelain tile manufacturing in Oman)
- Mention their sourcing breadth — they buy 12+ glaze compound variants (PGVT, rustic, polished, engobes)
- Highlight that Aaziko has verified Indian suppliers for HS 3207 (ceramic frits & glazes) with competitive pricing
- Reference that $68K across 18 shipments shows active sourcing — Aaziko can consolidate and save on freight/compliance
- One specific value insight: Indian suppliers under HS 32072010 offer 15-20% cost advantage vs. European/Turkish alternatives
- Close with a specific question about their current sourcing cycle or supplier challenges

DO NOT include a Subject line — output only the email body starting with "Hi [Name/Team],"`;

  const requestBody = JSON.stringify({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 600,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${AI_URL}/chat/completions`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_KEY}`,
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)));
          const content = json.choices?.[0]?.message?.content;
          if (!content) return reject(new Error('No content in AI response: ' + data));
          resolve({ content, model: json.model, tokens: json.usage });
        } catch (e) {
          reject(new Error('JSON parse error: ' + data.substring(0, 300)));
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

// ─── Build HTML email ─────────────────────────────────────────────────
function buildHtml(textBody) {
  const htmlBody = textBody
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p style="margin:0 0 14px">')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 36px">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px">Aaziko</h1>
        <p style="margin:4px 0 0;color:#93c5fd;font-size:13px">India's B2B Trade Intelligence Platform</p>
      </td></tr>

      <!-- Buyer Badge -->
      <tr><td style="padding:20px 36px 0">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;display:flex;align-items:center">
          <div>
            <div style="font-size:13px;font-weight:600;color:#1e40af">${BUYER.name} · ${BUYER.country}</div>
            <div style="font-size:11px;color:#3b82f6;margin-top:2px">
              HS 32072010 · ${BUYER.transactionCount} shipments · $${BUYER.totalAmount.toLocaleString()} trade volume · Lead Score: ${BUYER.lead_score}/100
            </div>
          </div>
        </div>
      </td></tr>

      <!-- Email Body -->
      <tr><td style="padding:24px 36px 8px;color:#1f2937;font-size:14.5px;line-height:1.7">
        <p style="margin:0 0 14px">${htmlBody}</p>
      </td></tr>

      <!-- Product Tags -->
      <tr><td style="padding:0 36px 24px">
        <div style="background:#f9fafb;border-radius:8px;padding:14px 16px">
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Products Being Sourced</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${BUYER.products.slice(0,8).map(p =>
              `<span style="background:#e0e7ff;color:#3730a3;border-radius:4px;padding:3px 8px;font-size:11px">${p.replace('RAW MATERIALS FOR TILES INDUSTRY:', '').trim()}</span>`
            ).join('')}
          </div>
        </div>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 36px">
        <p style="margin:0;font-size:12px;color:#6b7280">
          <strong style="color:#374151">Arjun Mehta</strong> · Senior Trade Consultant · Aaziko<br>
          <a href="mailto:${FROM_EMAIL}" style="color:#2563eb;text-decoration:none">${FROM_EMAIL}</a> · 
          <a href="https://aaziko.com" style="color:#2563eb;text-decoration:none">aaziko.com</a>
        </p>
        <p style="margin:10px 0 0;font-size:10px;color:#9ca3af">
          ⚙️ Generated by Aaziko AI Communicator · Model: ${AI_MODEL} · Buyer ID: ${BUYER.buyer_id}
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Aaziko AI Communicator — Buyer Email Test      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`  Buyer   : ${BUYER.name} (${BUYER.country})`);
  console.log(`  HS Code : ${BUYER.hsCodes.join(', ')}`);
  console.log(`  Volume  : $${BUYER.totalAmount.toLocaleString()} across ${BUYER.transactionCount} shipments`);
  console.log(`  To      : ${TO}`);
  console.log(`  Model   : ${AI_MODEL}`);
  console.log(`  SMTP    : ${FROM_EMAIL} → ${SMTP_HOST}:${SMTP_PORT}`);
  console.log('');

  // Step 1: Generate email
  process.stdout.write('  [1/3] Calling Qwen3-235B to generate email... ');
  let emailContent, tokenUsage;
  try {
    const result = await generateEmail();
    emailContent = result.content;
    tokenUsage   = result.tokens;
    console.log('✅  Done!');
    console.log(`         Tokens used: ${tokenUsage?.total_tokens || 'N/A'}`);
  } catch (err) {
    console.log('❌  Failed!');
    console.error('  Error:', err.message);
    process.exit(1);
  }

  // Preview
  console.log('\n─────── AI Generated Email Body ───────────────────');
  console.log(emailContent);
  console.log('────────────────────────────────────────────────────\n');

  // Step 2: Connect SMTP
  process.stdout.write('  [2/3] Connecting to Zoho SMTP... ');
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    requireTLS: SMTP_PORT === 587,
    auth: { user: FROM_EMAIL, pass: SMTP_PASS },
    tls: { rejectUnauthorized: true },
  });

  try {
    await transporter.verify();
    console.log('✅  Connected!');
  } catch (err) {
    console.log('❌  SMTP connection failed!');
    console.error('  Error:', err.message);
    process.exit(1);
  }

  // Step 3: Send
  process.stdout.write(`  [3/3] Sending to ${TO}... `);
  try {
    const subject = `Partnership Opportunity — Ceramic Glaze Sourcing for ${BUYER.name} | Aaziko`;
    const info = await transporter.sendMail({
      from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
      replyTo: FROM_EMAIL,
      to:      TO,
      subject,
      text:    emailContent,
      html:    buildHtml(emailContent),
    });

    console.log('✅  Sent!\n');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   RESULT: SUCCESS                                ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`  Message-ID  : ${info.messageId}`);
    console.log(`  Server resp : ${info.response}`);
    console.log(`  Subject     : ${subject}`);
    console.log(`\n  📬 Check ${TO} — email is delivered.\n`);
  } catch (err) {
    console.log('❌  Send failed!');
    console.error('  Error:', err.message);
    process.exit(1);
  }

  transporter.close();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
