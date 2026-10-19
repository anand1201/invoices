/**
 * HTTP API.
 *
 *   GET    /api/health              service + mail transport status
 *   GET    /api/invoices            recent invoices (list view)
 *   POST   /api/invoices            create
 *   GET    /api/invoices/:id        fetch one (this is what survives a reload)
 *   PUT    /api/invoices/:id        update
 *   DELETE /api/invoices/:id        delete
 *   POST   /api/invoices/:id/email  render + send through SMTP, then log it
 *
 * Every write runs the body through the shared `normalizeInvoice`, so the
 * browser and the API agree on exactly what "valid" means and a direct curl
 * cannot smuggle in a negative price or an over-subtotal discount. Validation
 * failures come back as 422 with the same `{ path: message }` map the editor
 * uses to render inline errors.
 */

import express from 'express';
import { normalizeInvoice, validateForEmail, formatUSD } from '@invoice/shared';

import { buildSubject, renderInvoiceHtml, renderInvoiceText } from './email-template.js';
import { sendMail, mailStatus } from './mailer.js';
import * as repo from './repository.js';

export const router = express.Router();

/** Wrap an async handler so rejected promises reach the error middleware. */
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const badRequest = (message, code = 'BAD_REQUEST') =>
  Object.assign(new Error(message), { statusCode: 400, code });

const notFound = () =>
  Object.assign(new Error('Invoice not found.'), { statusCode: 404, code: 'NOT_FOUND' });

function validationError(errors) {
  return Object.assign(new Error('This invoice has validation errors.'), {
    statusCode: 422,
    code: 'VALIDATION_FAILED',
    errors,
  });
}

/** UUIDs only — keeps malformed ids from reaching the database at all. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireId(req) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw notFound();
  return id;
}

// ---------------------------------------------------------------------------

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'invoice-studio-api', mail: mailStatus() });
});

router.get(
  '/invoices',
  route(async (req, res) => {
    res.json({ invoices: await repo.listInvoices({ limit: req.query.limit }) });
  }),
);

router.post(
  '/invoices',
  route(async (req, res) => {
    const { invoice, totals, isValid, errors } = normalizeInvoice(req.body?.invoice ?? req.body);
    if (!isValid) throw validationError(errors);

    const saved = await repo.createInvoice(invoice, totals);
    res.status(201).json({ invoice: saved, totals });
  }),
);

router.get(
  '/invoices/:id',
  route(async (req, res) => {
    const invoice = await repo.getInvoice(requireId(req));
    if (!invoice) throw notFound();
    // Recompute on read as well: the stored totals are a snapshot, the shared
    // calculator is the truth.
    const { totals } = normalizeInvoice(invoice);
    res.json({ invoice, totals });
  }),
);

router.put(
  '/invoices/:id',
  route(async (req, res) => {
    const id = requireId(req);
    const { invoice, totals, isValid, errors } = normalizeInvoice(req.body?.invoice ?? req.body);
    if (!isValid) throw validationError(errors);

    const saved = await repo.updateInvoice(id, invoice, totals);
    if (!saved) throw notFound();
    res.json({ invoice: saved, totals });
  }),
);

router.delete(
  '/invoices/:id',
  route(async (req, res) => {
    const deleted = await repo.deleteInvoice(requireId(req));
    if (!deleted) throw notFound();
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Small in-process rate limit. Sending email is the one endpoint that costs
 * real money and real reputation, so an accidental double-click loop or a
 * curl-in-a-while-loop should not turn into a hundred messages. A single
 * process does not need Redis for this.
 */
const sendWindowMs = 60_000;
const sendLimit = 12;
const sendHistory = new Map();

function enforceSendLimit(key) {
  const now = Date.now();
  const recent = (sendHistory.get(key) ?? []).filter((t) => now - t < sendWindowMs);
  if (recent.length >= sendLimit) {
    throw Object.assign(new Error('Too many emails sent just now. Try again in a minute.'), {
      statusCode: 429,
      code: 'RATE_LIMITED',
    });
  }
  recent.push(now);
  sendHistory.set(key, recent);
  if (sendHistory.size > 500) sendHistory.clear(); // crude bound; fine for one box
}

router.post(
  '/invoices/:id/email',
  route(async (req, res) => {
    const id = requireId(req);
    const stored = await repo.getInvoice(id);
    if (!stored) throw notFound();

    const recipientOverride = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
    const note = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';

    // Always render from what is in the database, never from the request body.
    const { invoice, totals, recipient, isValid, errors } = validateForEmail(
      stored,
      recipientOverride,
    );
    if (!isValid) throw validationError(errors);

    enforceSendLimit(req.ip || 'unknown');

    const subject = buildSubject(invoice, totals);
    const html = renderInvoiceHtml(invoice, totals, note);
    const text = renderInvoiceText(invoice, totals, note);

    try {
      const result = await sendMail({
        to: recipient,
        subject,
        html,
        text,
        replyTo: invoice.business.email || undefined,
      });

      await repo.logEmail({
        invoiceId: id,
        toEmail: recipient,
        subject,
        status: 'sent',
        transport: result.transport,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
      });

      res.json({
        sent: true,
        to: recipient,
        subject,
        amount: formatUSD(totals.totalCents),
        transport: result.transport,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
      });
    } catch (error) {
      await repo
        .logEmail({
          invoiceId: id,
          toEmail: recipient,
          subject,
          status: 'failed',
          transport: 'smtp',
          errorMessage: error.message,
        })
        .catch(() => {}); // never let logging mask the real failure

      throw Object.assign(new Error(smtpMessage(error)), {
        statusCode: error.statusCode || 502,
        code: error.code || 'MAIL_SEND_FAILED',
      });
    }
  }),
);

router.get(
  '/invoices/:id/emails',
  route(async (req, res) => {
    res.json({ emails: await repo.listEmails(requireId(req)) });
  }),
);

/** Turn nodemailer/SMTP noise into something a user can act on. */
function smtpMessage(error) {
  const raw = String(error?.message || 'Unknown SMTP error');
  if (error?.code === 'EAUTH') return 'SMTP rejected the credentials. Check SMTP_USER / SMTP_PASSWORD.';
  if (error?.code === 'ESOCKET' || error?.code === 'ECONNECTION') {
    return 'Could not reach the SMTP server. Check SMTP_HOST, SMTP_PORT and SMTP_SECURE.';
  }
  if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNREFUSED') {
    return 'The SMTP server did not respond. Check the host/port and any firewall.';
  }
  if (error?.responseCode === 550 || /relay|not permitted|unverified/i.test(raw)) {
    return 'The provider refused the sender or recipient. Verify MAIL_FROM_EMAIL with your provider.';
  }
  return `Email could not be sent: ${raw}`;
}

export default router;
