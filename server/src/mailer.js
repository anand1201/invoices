/**
 * SMTP delivery via nodemailer.
 *
 * One generic SMTP transport covers every provider the client might already
 * have (Brevo, Mailgun, Postmark, Resend's SMTP bridge, Gmail app passwords, a
 * self-hosted MTA). Switching providers is an `.env` change, not a code change.
 *
 * If no SMTP_HOST is configured and the Ethereal fallback is enabled, the
 * server creates a throwaway Ethereal mailbox and returns a preview URL. That
 * keeps `npm run dev` useful on a fresh clone without shipping any credentials,
 * and it is clearly reported back to the UI as a non-delivering transport so it
 * can never be mistaken for a real send.
 */

import nodemailer from 'nodemailer';
import { config } from './config.js';

/** @type {{ transporter: import('nodemailer').Transporter, kind: string } | null} */
let cached = null;

function isSmtpConfigured() {
  return Boolean(config.mail.host);
}

async function getTransport() {
  if (cached) return cached;

  if (isSmtpConfigured()) {
    const transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure, // true => implicit TLS (465); false => STARTTLS
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
      // Fail fast instead of hanging an HTTP request for two minutes.
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      tls: config.mail.allowSelfSigned ? { rejectUnauthorized: false } : undefined,
    });
    cached = { transporter, kind: 'smtp' };
    return cached;
  }

  if (!config.mail.etherealFallback) {
    throw Object.assign(new Error('Email is not configured: set SMTP_HOST in your .env.'), {
      statusCode: 503,
      code: 'MAIL_NOT_CONFIGURED',
    });
  }

  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  cached = { transporter, kind: 'ethereal' };
  return cached;
}

function fromHeader() {
  const { fromName, fromEmail, user } = config.mail;
  // Fall back to the SMTP username, which is an address for most providers.
  const address = fromEmail || user || 'no-reply@invoice-studio.local';
  return fromName ? `"${fromName.replace(/"/g, '')}" <${address}>` : address;
}

/**
 * @param {object} message
 * @param {string} message.to
 * @param {string} message.subject
 * @param {string} message.html
 * @param {string} message.text
 * @param {string} [message.replyTo]
 */
export async function sendMail({ to, subject, html, text, replyTo }) {
  const { transporter, kind } = await getTransport();

  const info = await transporter.sendMail({
    from: fromHeader(),
    to,
    bcc: config.mail.bcc || undefined,
    replyTo: replyTo || undefined,
    subject,
    text,
    html,
  });

  return {
    transport: kind,
    messageId: info.messageId,
    accepted: info.accepted ?? [],
    rejected: info.rejected ?? [],
    // Ethereal only: a link to view the message that was "delivered".
    previewUrl: kind === 'ethereal' ? nodemailer.getTestMessageUrl(info) || null : null,
  };
}

/** Reported at /api/health so the UI can explain what sending will actually do. */
export function mailStatus() {
  if (isSmtpConfigured()) {
    return {
      configured: true,
      transport: 'smtp',
      host: config.mail.host,
      from: config.mail.fromEmail || config.mail.user || null,
    };
  }
  return {
    configured: config.mail.etherealFallback,
    transport: config.mail.etherealFallback ? 'ethereal' : 'none',
    host: null,
    from: null,
  };
}
