/**
 * Integration test — remote MongoDB + AI + Zoho email
 * Tests the full pipeline: DB read → AI generate → Zoho send
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envFile = readFileSync(path.join(__dirname, '.env'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const { MongoClient } = require('mongodb');
const nodemailer    = require('nodemailer');
const https         = require('https');

const MONGODB_URI = env.MONGODB_URI;
const DB_NAME     = env.MONGODB_DB || 'Dhruval';
const TEST_TO     = 'aazikodevteamleader@gmail.com';

async function callAI(system, user) {
  const body = JSON.stringify({
    model: env.COMM_PREMIUM_MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.72, max_tokens: 600, stream: false,
  });
  return new Promise((resolve, reject) => {
    const url = new URL(`${env.COMM_PREMIUM_BASE_URL}/chat/completions`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.COMM_PREMIUM_API_KEY}`, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.error) return reject(new Error(JSON.stringify(j.error)));
          resolve(j.choices?.[0]?.message?.content || '');
        } catch { reject(new Error(d.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Aaziko — Remote DB + AI + Zoho Full Integration Test   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // 1. Connect to MongoDB
  process.stdout.write('  [1/5] Connecting to remote MongoDB... ');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`✅  Connected → ${DB_NAME}`);

  // 2. Fetch buyers with email
  process.stdout.write('  [2/5] Fetching buyers with email (top 3 by lead score)... ');
  const buyers = await db.collection('shortlist_buyer_seller').find({
    type: 'buyer',
    'filteredContactData.dataQuality.hasEmail': true,
    'filteredContactData.contactDetails.email': { $ne: '' },
  }).sort({ lead_score: -1 }).limit(3).toArray();
  console.log(`✅  Found ${buyers.length} buyers`);

  buyers.forEach((b, i) => {
    console.log(`     ${i + 1}. ${b.name} (${b.country}) | Score: ${b.lead_score} | Email: ${b.filteredContactData?.contactDetails?.email}`);
  });

  // 3. Use top buyer
  const buyer = buyers[0];
  const buyerEmail = buyer.filteredContactData?.contactDetails?.email;
  const products = (buyer.products || []).slice(0, 6).map(p => p.replace(/^RAW MATERIALS FOR[^:]+:/i, '').trim());
  const icebreakers = (buyer.filteredContactData?.icebreakerPoints || []).slice(0, 2).map(p => p.point).join('; ');

  console.log(`\n  Selected buyer: ${buyer.name} (${buyer.country})`);
  console.log(`  Email: ${buyerEmail}`);

  // 4. Generate email with Qwen3-235B
  process.stdout.write('\n  [3/5] Generating personalized email via Qwen3-235B... ');
  const emailBody = await callAI(
    `You are ${env.ZOHO_FROM_NAME || 'Arjun'}, Senior Trade Consultant at Aaziko — India's premier B2B sourcing platform. Write personalized, concise cold emails (150-220 words). Sign as ${env.ZOHO_FROM_NAME || 'Arjun'} | Senior Trade Consultant | Aaziko.`,
    `Write a first-touch email to:
Company: ${buyer.name}
Country: ${buyer.country}
HS Codes: ${(buyer.hsCodes || []).join(', ')}
Trade Volume: $${buyer.totalAmount?.toLocaleString()} across ${buyer.transactionCount} shipments
Lead Score: ${buyer.lead_score}/100
Products sourced: ${products.join(', ')}
${icebreakers ? `Insights: ${icebreakers}` : ''}

Reference their specific trade data. Highlight Aaziko's verified Indian suppliers for their HS code. Close with ONE question about their sourcing. Output body only (no Subject: line).`
  );
  console.log('✅  Done!');
  console.log('\n─── Generated Email Body ───────────────────────────────────');
  console.log(emailBody);
  console.log('────────────────────────────────────────────────────────────\n');

  // 5. Save to email_outreach_log
  process.stdout.write('  [4/5] Saving outreach record to MongoDB... ');
  const outreachRecord = {
    buyer_db_id: buyer._id.toString(),
    buyer_id: buyer.buyer_id,
    buyer_name: buyer.name,
    buyer_email: buyerEmail,
    buyer_country: buyer.country,
    buyer_category: buyer.category,
    lead_score: buyer.lead_score,
    lead_priority: buyer.lead_priority,
    intent_priority: buyer.intent_priority,
    stage: 'initial',
    status: 'queued',
    email_subject: `Sourcing ${products[0] || 'Products'} from India — Aaziko`,
    email_body: emailBody,
    message_id: `test_${Date.now()}`,
    next_followup_at: new Date(Date.now() + 5 * 24 * 3600 * 1000),
    created_at: new Date(),
    updated_at: new Date(),
  };
  await db.collection('email_outreach_log').insertOne(outreachRecord);
  console.log('✅  Saved!');

  // Save memory
  await db.collection('ai_agent_memory').updateOne(
    { buyer_db_id: buyer._id.toString() },
    {
      $set: {
        buyer_db_id: buyer._id.toString(),
        buyer_name: buyer.name,
        buyer_country: buyer.country,
        overall_status: 'queued',
        last_email_sent_at: new Date(),
        updated_at: new Date(),
      },
      $inc: { emails_sent: 1 },
      $setOnInsert: { ai_notes: `Initial contact - ${new Date().toDateString()}`, created_at: new Date() },
    },
    { upsert: true }
  );

  // 6. Send via Zoho SMTP to test address (not actual buyer email for test)
  process.stdout.write(`  [5/5] Sending test email to ${TEST_TO}... `);
  const transporter = nodemailer.createTransport({
    host: env.ZOHO_HOST, port: parseInt(env.ZOHO_PORT || '587'),
    secure: parseInt(env.ZOHO_PORT || '587') === 465, requireTLS: true,
    auth: { user: env.ZOHO_EMAIL, pass: env.ZOHO_APP_PASSWORD || env.ZOHO_PASSWORD },
    tls: { rejectUnauthorized: true },
  });

  const info = await transporter.sendMail({
    from: `"${env.ZOHO_FROM_NAME}" <${env.ZOHO_EMAIL}>`,
    replyTo: env.ZOHO_EMAIL,
    to: TEST_TO,
    subject: `[DB Integration Test] Buyer: ${buyer.name} (${buyer.country}) — Lead ${buyer.lead_score}/100`,
    text: `INTEGRATION TEST — Real DB Buyer\n\nBuyer: ${buyer.name}\nCountry: ${buyer.country}\nEmail in DB: ${buyerEmail}\nLead Score: ${buyer.lead_score}/100\nTrade: $${buyer.totalAmount?.toLocaleString()}\nHS Codes: ${(buyer.hsCodes || []).join(', ')}\n\n--- AI Generated Email ---\n\n${emailBody}`,
    html: `<div style="font-family:sans-serif;max-width:600px;padding:20px">
      <div style="background:#1e3a5f;color:#fff;padding:16px;border-radius:8px;margin-bottom:16px">
        <strong>🧪 Integration Test — Real Database Buyer</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
        ${[['Buyer', buyer.name],['Country', buyer.country],['Email in DB', buyerEmail || 'N/A'],['Lead Score', `${buyer.lead_score}/100`],['Trade Volume', `$${buyer.totalAmount?.toLocaleString()}`],['Shipments', buyer.transactionCount],['HS Codes', (buyer.hsCodes||[]).join(', ')]]
          .map(([k,v]) => `<tr><td style="padding:6px 12px;background:#f8fafc;font-weight:600;color:#374151;width:40%">${k}</td><td style="padding:6px 12px;color:#1f2937">${v}</td></tr>`)
          .join('')}
      </table>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:16px;font-size:13px;color:#166534">
        ✅ <strong>Outreach record saved</strong> to <code>email_outreach_log</code> in Dhruval DB<br>
        ⏰ <strong>Follow-up scheduled</strong> in 5 days
      </div>
      <div style="background:#eff6ff;border-radius:8px;padding:16px;font-size:13px;color:#1e40af;font-weight:600;margin-bottom:12px">AI Generated Email (Qwen3-235B · Arjun Persona)</div>
      <div style="font-size:14px;line-height:1.7;color:#1f2937">${emailBody.replace(/\n/g,'<br>')}</div>
    </div>`,
  });
  console.log('✅  Sent!');
  transporter.close();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   ALL TESTS PASSED                                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  MongoDB    : ✅ ${DB_NAME}.shortlist_buyer_seller (${buyer.name})`);
  console.log(`  AI Model   : ✅ ${env.COMM_PREMIUM_MODEL}`);
  console.log(`  Zoho SMTP  : ✅ ${info.response}`);
  console.log(`  Outreach DB: ✅ Saved to email_outreach_log`);
  console.log(`  Follow-up  : ✅ Scheduled in 5 days`);
  console.log(`\n  📬 Check ${TEST_TO} for the test email.\n`);

  await client.close();
}

main().catch(err => { console.error('\n❌ Test failed:', err.message); process.exit(1); });
