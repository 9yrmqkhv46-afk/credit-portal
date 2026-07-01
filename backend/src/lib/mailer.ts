/**
 * Email sender for verification codes (OTP) and notifications.
 *
 * Uses nodemailer with SMTP when configured (SMTP_HOST/PORT/USER/PASS/MAIL_FROM).
 * When no SMTP host is set (local/dev), it falls back to logging the message to
 * the server console so the OTP flow is fully usable without a mail provider.
 */

import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';

let transporter: Transporter | null = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

export function isMailConfigured(): boolean {
  return transporter !== null || !!config.resendApiKey;
}

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  // 1) HTTP email API (Resend) — no SMTP server required, only an API key.
  if (config.resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.smtp.from, to, subject, text, html: html ?? undefined }),
      });
      if (!res.ok) throw new Error(`Resend API ${res.status}`);
      return;
    } catch (err) {
      // Fall through to SMTP / dev log rather than failing the auth flow.
      // eslint-disable-next-line no-console
      console.error('[mailer] Resend send failed, falling back:', err);
    }
  }

  // 2) SMTP (nodemailer) when configured.
  if (transporter) {
    await transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
    return;
  }

  // 3) Dev fallback — surface the message in logs instead of sending.
  // eslint-disable-next-line no-console
  console.log(`\n[mailer:dev] To: ${to}\n[mailer:dev] Subject: ${subject}\n[mailer:dev] ${text}\n`);
}

/** Send a one-time verification code. */
export async function sendOtpEmail(to: string, code: string, purpose: 'REGISTER' | 'LOGIN'): Promise<void> {
  const action = purpose === 'REGISTER' ? 'verify your email address' : 'complete your sign-in';
  const subject = `${config.appName} verification code: ${code}`;
  const text = `Your ${config.appName} code to ${action} is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#01696f">${config.appName}</h2>
      <p>Use this code to ${action}:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:6px;color:#111">${code}</p>
      <p style="color:#666">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
    </div>`;
  await sendMail(to, subject, text, html);
}
