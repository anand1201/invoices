/**
 * Invoice persistence.
 *
 * Totals are *never* taken from the request body — the server recomputes them
 * from the normalised line items with the shared `computeTotals` and stores its
 * own numbers. A client that lies about its total simply gets the correct one
 * back.
 */

import { randomUUID } from 'node:crypto';
import { query } from './db.js';

const COLUMNS = `
  id, invoice_number, issue_date, due_date, currency,
  business_name, business_email, business_phone, business_address,
  customer_name, customer_email, customer_phone, customer_address,
  line_items, custom_fields, notes,
  discount_cents, tax_rate_milli, subtotal_cents, tax_cents, total_cents,
  created_at, updated_at`;

/** MariaDB hands JSON back as a string; MySQL 8 hands back an object. */
function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function rowToInvoice(row) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    currency: row.currency,
    business: {
      name: row.business_name,
      email: row.business_email,
      phone: row.business_phone,
      address: row.business_address,
    },
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
      address: row.customer_address,
    },
    lineItems: parseJson(row.line_items, []),
    customFields: parseJson(row.custom_fields, []),
    notes: row.notes ?? '',
    discountCents: Number(row.discount_cents),
    taxRateMilli: Number(row.tax_rate_milli),
    // Stored snapshot of what was computed at save time. Clients recompute
    // locally anyway; this is here for the list view and for auditing.
    storedTotals: {
      subtotalCents: Number(row.subtotal_cents),
      taxCents: Number(row.tax_cents),
      totalCents: Number(row.total_cents),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Flatten a canonical invoice + totals into the positional column values. */
function toColumnValues(invoice, totals) {
  return [
    invoice.invoiceNumber,
    invoice.issueDate,
    invoice.dueDate,
    invoice.currency || 'USD',
    invoice.business.name,
    invoice.business.email,
    invoice.business.phone,
    invoice.business.address,
    invoice.customer.name,
    invoice.customer.email,
    invoice.customer.phone,
    invoice.customer.address,
    JSON.stringify(invoice.lineItems),
    JSON.stringify(invoice.customFields),
    invoice.notes || null,
    invoice.discountCents,
    invoice.taxRateMilli,
    totals.subtotalCents,
    totals.taxCents,
    totals.totalCents,
  ];
}

export async function createInvoice(invoice, totals) {
  const id = randomUUID();
  await query(
    `INSERT INTO invoices (
       id, invoice_number, issue_date, due_date, currency,
       business_name, business_email, business_phone, business_address,
       customer_name, customer_email, customer_phone, customer_address,
       line_items, custom_fields, notes,
       discount_cents, tax_rate_milli, subtotal_cents, tax_cents, total_cents
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, ...toColumnValues(invoice, totals)],
  );
  return getInvoice(id);
}

export async function updateInvoice(id, invoice, totals) {
  const rows = await query(
    `UPDATE invoices SET
       invoice_number = ?, issue_date = ?, due_date = ?, currency = ?,
       business_name = ?, business_email = ?, business_phone = ?, business_address = ?,
       customer_name = ?, customer_email = ?, customer_phone = ?, customer_address = ?,
       line_items = ?, custom_fields = ?, notes = ?,
       discount_cents = ?, tax_rate_milli = ?,
       subtotal_cents = ?, tax_cents = ?, total_cents = ?
     WHERE id = ?`,
    [...toColumnValues(invoice, totals), id],
  );
  if (rows.affectedRows === 0) return null;
  return getInvoice(id);
}

export async function getInvoice(id) {
  const rows = await query(`SELECT ${COLUMNS} FROM invoices WHERE id = ? LIMIT 1`, [id]);
  return rows.length ? rowToInvoice(rows[0]) : null;
}

/** Lightweight rows for the "saved invoices" drawer. */
export async function listInvoices({ limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await query(
    `SELECT id, invoice_number, issue_date, due_date, customer_name,
            total_cents, updated_at
     FROM invoices
     ORDER BY updated_at DESC
     LIMIT ${safeLimit}`,
  );
  return rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    customerName: row.customer_name,
    totalCents: Number(row.total_cents),
    updatedAt: row.updated_at,
  }));
}

export async function deleteInvoice(id) {
  const result = await query('DELETE FROM invoices WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

export async function logEmail(entry) {
  await query(
    `INSERT INTO invoice_emails
       (invoice_id, to_email, subject, status, transport, message_id, preview_url, error_message)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      entry.invoiceId,
      entry.toEmail,
      entry.subject.slice(0, 255),
      entry.status,
      entry.transport || 'smtp',
      entry.messageId ? String(entry.messageId).slice(0, 255) : null,
      entry.previewUrl ? String(entry.previewUrl).slice(0, 500) : null,
      entry.errorMessage ? String(entry.errorMessage).slice(0, 500) : null,
    ],
  );
}

export async function listEmails(invoiceId, limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const rows = await query(
    `SELECT to_email, subject, status, transport, message_id, preview_url, error_message, created_at
     FROM invoice_emails WHERE invoice_id = ?
     ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [invoiceId],
  );
  return rows.map((row) => ({
    toEmail: row.to_email,
    subject: row.subject,
    status: row.status,
    transport: row.transport,
    messageId: row.message_id,
    previewUrl: row.preview_url,
    error: row.error_message,
    createdAt: row.created_at,
  }));
}
