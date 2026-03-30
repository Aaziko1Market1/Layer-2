/**
 * Zoho Email Test — sends a persona-generated test email
 * Run: node test-zoho-email.mjs
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse .env manually
const envFile = readFileSync(path.join(__dirname, '.env'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  env[key] = value;
}

const nodemailer = require('nodemailer');

const TO = 'aazikodevteamleader@gmail.com';

const email    = env.ZOHO_EMAIL;
const password = env.ZOHO_APP_PASSWORD || env.ZOHO_PASSWORD;
const host     = env.ZOHO_HOST || 'smtp.zoho.com';
const port     = parseInt(env.ZOHO_PORT || '587', 10);
const fromName = env.ZOHO_FROM_NAME || 'Arjun';

console.log('\n══════════════════════════════════════════════');
console.log('  Aaziko Auto-Mail — Zoho SMTP Test');
console.log('══════════════════════════════════════════════');
console.log(`  From  : "${fromName}" <${email}>`);
console.log(`  To    : ${TO}`);
console.log(`  Host  : ${host}:${port}`);
console.log(`  Auth  : ${password ? '✓ password set' : '✗ NO PASSWORD'}`);
console.log('══════════════════════════════════════════════\n');

if (!email || !password) {
  console.error('❌  ZOHO_EMAIL or ZOHO_APP_PASSWORD not set in .env — aborting.');
  process.exit(1);
}

// ─── AI-persona generated test email body ───────────────────────────
const emailSubject = 'Connecting with Aaziko — India Sourcing Platform | Test';

const emailBody = `Hi Dev Team,

I hope this message finds you well.

My name is ${fromName}, and I represent Aaziko — one of India's fastest-growing B2B trade platforms connecting international buyers with verified Indian manufacturers and exporters.

We work with buyers from over 60 countries across product categories including textiles, chemicals, engineering goods, food products, and more.

I noticed your interest in India-origin products and wanted to reach out personally. Here's what makes Aaziko different:

• Verified supplier network — factory audits, compliance docs included  
• Real-time pricing intelligence for 10,000+ HS codes  
• Dedicated trade consultant support (that's me!)  
• 48-hour sample turnaround for most categories  

Would you be open to a quick 15-minute call this week to explore if there's a fit?

✅  This is a live system test from the Aaziko AI Communicator platform.
    SMTP: ${host}:${port} | Sender: ${email}

Warm regards,
${fromName}
Trade Consultant | Aaziko
📧 ${email}
🌐 https://aaziko.com`;

// ─── Send ─────────────────────────────────────────────────────────────
async function run() {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: true },
  });

  // 1. Verify connection
  process.stdout.write('  [1/2] Verifying SMTP connection... ');
  try {
    await transporter.verify();
    console.log('✅  Connected!');
  } catch (err) {
    console.log('❌  Failed!');
    console.error('\nSMTP Error:', err.message);
    console.error('\nPossible fixes:');
    console.error('  • Make sure you are using an App Password (Zoho Mail → Settings → Security → App Passwords)');
    console.error('  • Check ZOHO_EMAIL is the full email address');
    console.error('  • Try ZOHO_PORT=465 if 587 does not work');
    process.exit(1);
  }

  // 2. Send email
  process.stdout.write(`  [2/2] Sending test email to ${TO}... `);
  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${email}>`,
      replyTo: email,
      to: TO,
      subject: emailSubject,
      text: emailBody,
      html: emailBody.replace(/\n/g, '<br>').replace(
        /✅ .*/,
        `<div style="background:#f0fdf4;border:1px solid #86efac;padding:12px;border-radius:8px;margin:16px 0;font-size:13px;color:#166534">
          ✅ <strong>Live system test</strong> from Aaziko AI Communicator<br>
          SMTP: ${host}:${port} | Sender: ${email}
        </div>`
      ),
    });
    console.log('✅  Sent!\n');
    console.log('══════════════════════════════════════════════');
    console.log('  RESULT: SUCCESS');
    console.log(`  Message-ID : ${info.messageId}`);
    console.log(`  Response   : ${info.response}`);
    console.log('══════════════════════════════════════════════');
    console.log(`\n  📬 Check ${TO} for the email.\n`);
  } catch (err) {
    console.log('❌  Failed to send!');
    console.error('\nSend Error:', err.message);
    process.exit(1);
  }

  transporter.close();
}

run();
