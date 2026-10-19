/**
 * Draft -> canonical invoice normalisation + validation.
 *
 * The React editor keeps numeric fields as *strings* (so that typing "1.", "0"
 * or an empty box behaves naturally). `normalizeInvoice` is the single funnel
 * that turns such a draft into the canonical integer representation, and it
 * reports every problem it finds as a flat `{ path: message }` map.
 *
 * The client calls it on every keystroke to drive inline errors and the live
 * preview; the server calls it on every write so a hand-crafted HTTP request
 * cannot store a negative price or an oversized discount. Same code, same
 * verdict — the browser is convenience, the server is the authority.
 */

import {
  MAX_CENTS,
  MAX_QTY_MILLI,
  MAX_RATE_MILLI,
  parseCents,
  parseQuantityMilli,
  parseRateMilli,
} from './money.js';
import { computeTotals } from './totals.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_TEXT = 500;
const MAX_NOTES = 4000;
const MAX_LINE_ITEMS = 200;
const MAX_CUSTOM_FIELDS = 50;

/**
 * @param {object} draft raw editor state
 * @returns {{ invoice: object, totals: object, errors: Record<string,string>, isValid: boolean }}
 */
export function normalizeInvoice(draft = {}) {
  /** @type {Record<string,string>} */
  const errors = {};
  const fail = (path, message) => {
    if (!errors[path]) errors[path] = message;
  };

  // --- identity & dates ----------------------------------------------------
  const invoiceNumber = text(draft.invoiceNumber, 64);
  if (!invoiceNumber) fail('invoiceNumber', 'Invoice number is required.');

  const issueDate = isoDate(draft.issueDate);
  const dueDate = isoDate(draft.dueDate);
  if (!issueDate) fail('issueDate', 'Pick an issue date (YYYY-MM-DD).');
  if (!dueDate) fail('dueDate', 'Pick a due date (YYYY-MM-DD).');
  if (issueDate && dueDate && dueDate < issueDate) {
    fail('dueDate', 'Due date cannot be earlier than the issue date.');
  }

  // --- parties -------------------------------------------------------------
  const business = party(draft.business, 'business', fail, { requireName: true });
  const customer = party(draft.customer, 'customer', fail, { requireName: true });

  // --- line items ----------------------------------------------------------
  const rawItems = Array.isArray(draft.lineItems) ? draft.lineItems.slice(0, MAX_LINE_ITEMS) : [];
  if (rawItems.length === 0) fail('lineItems', 'Add at least one line item.');

  const lineItems = rawItems.map((item, index) => {
    const id = text(item?.id, 64) || `item-${index + 1}`;
    const description = text(item?.description, MAX_TEXT);
    if (!description) fail(`lineItems.${id}.description`, 'Describe this item.');

    const quantityMilli = scalar({
      raw: item?.quantity ?? item?.quantityMilli,
      alreadyScaled: item?.quantity === undefined && item?.quantityMilli !== undefined,
      parse: parseQuantityMilli,
      max: MAX_QTY_MILLI,
      path: `lineItems.${id}.quantity`,
      label: 'Quantity',
      fail,
    });

    const unitPriceCents = scalar({
      raw: item?.unitPrice ?? item?.unitPriceCents,
      alreadyScaled: item?.unitPrice === undefined && item?.unitPriceCents !== undefined,
      parse: parseCents,
      max: MAX_CENTS,
      path: `lineItems.${id}.unitPrice`,
      label: 'Unit price',
      fail,
    });

    return { id, description, quantityMilli, unitPriceCents };
  });

  // --- discount & tax ------------------------------------------------------
  const discountCents = scalar({
    raw: draft.discount ?? draft.discountCents,
    alreadyScaled: draft.discount === undefined && draft.discountCents !== undefined,
    parse: parseCents,
    max: MAX_CENTS,
    path: 'discount',
    label: 'Discount',
    fail,
    allowEmpty: true,
  });

  const taxRateMilli = scalar({
    raw: draft.taxRate ?? draft.taxRateMilli,
    alreadyScaled: draft.taxRate === undefined && draft.taxRateMilli !== undefined,
    parse: parseRateMilli,
    max: MAX_RATE_MILLI,
    path: 'taxRate',
    label: 'Tax rate',
    fail,
    allowEmpty: true,
    maxMessage: 'Tax rate cannot exceed 100%.',
  });

  // --- custom fields (never touch the arithmetic) --------------------------
  const rawFields = Array.isArray(draft.customFields)
    ? draft.customFields.slice(0, MAX_CUSTOM_FIELDS)
    : [];
  const customFields = rawFields.map((field, index) => {
    const id = text(field?.id, 64) || `field-${index + 1}`;
    const label = text(field?.label, 120);
    if (!label) fail(`customFields.${id}.label`, 'Give this field a label.');
    return {
      id,
      label,
      value: text(field?.value, MAX_TEXT),
      // Anything other than an explicit `false` counts as visible.
      visible: field?.visible !== false,
    };
  });

  const notes = text(draft.notes, MAX_NOTES);

  const invoice = {
    id: text(draft.id, 64) || null,
    invoiceNumber,
    issueDate,
    dueDate,
    currency: 'USD',
    business,
    customer,
    lineItems,
    customFields,
    discountCents,
    taxRateMilli,
    notes,
  };

  const totals = computeTotals(invoice);

  // The spec's hard rule: a fixed discount may not exceed the subtotal. We
  // still *compute* a capped total (so the preview stays sane while typing)
  // but we refuse to save or send until the number is fixed.
  if (totals.discountWasCapped) {
    fail('discount', 'Discount cannot be greater than the subtotal.');
  }

  return { invoice, totals, errors, isValid: Object.keys(errors).length === 0 };
}

/** Extra requirements that only apply when emailing an invoice out. */
export function validateForEmail(draft, recipientOverride) {
  const result = normalizeInvoice(draft);
  const errors = { ...result.errors };
  const recipient = text(recipientOverride, 320) || result.invoice.customer.email;

  if (!recipient) {
    errors['customer.email'] = 'A customer email is required to send this invoice.';
  } else if (!EMAIL_RE.test(recipient)) {
    errors['customer.email'] = 'Enter a valid customer email address.';
  }
  if (!result.invoice.business.email) {
    // Not fatal — only a hint, because the From address comes from the server.
    delete errors['business.email'];
  }

  return { ...result, recipient, errors, isValid: Object.keys(errors).length === 0 };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function text(value, maxLength) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function isoDate(value) {
  const raw = text(value, 10);
  if (!DATE_RE.test(raw)) return '';
  // Reject calendar-invalid dates like 2026-02-31 that still match the regex.
  const [y, m, d] = raw.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return '';
  }
  return raw;
}

function party(raw, prefix, fail, { requireName }) {
  const value = {
    name: text(raw?.name, 160),
    email: text(raw?.email, 320),
    phone: text(raw?.phone, 60),
    address: text(raw?.address, MAX_TEXT),
  };
  if (requireName && !value.name) {
    fail(`${prefix}.name`, prefix === 'business' ? 'Your business name is required.' : 'Customer name is required.');
  }
  if (value.email && !EMAIL_RE.test(value.email)) {
    fail(`${prefix}.email`, 'Enter a valid email address.');
  }
  return value;
}

/**
 * Parse one numeric field, record a precise error, and always return a usable
 * integer so the preview can keep rendering while the user is mid-correction.
 */
function scalar({ raw, alreadyScaled, parse, max, path, label, fail, allowEmpty = false, maxMessage }) {
  if (alreadyScaled) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      fail(path, `${label} must be a number.`);
      return 0;
    }
    if (n < 0) {
      fail(path, `${label} cannot be negative.`);
      return 0;
    }
    if (n > max) {
      fail(path, maxMessage || `${label} is too large.`);
      return max;
    }
    return Math.trunc(n);
  }

  const parsed = parse(raw);
  if (!parsed.ok) {
    if (parsed.reason === 'empty') {
      if (!allowEmpty) fail(path, `${label} is required.`);
      return 0;
    }
    fail(path, `${label} must be a number.`);
    return 0;
  }
  if (parsed.value < 0) {
    fail(path, `${label} cannot be negative.`);
    return 0;
  }
  if (parsed.value > max) {
    fail(path, maxMessage || `${label} is too large.`);
    return max;
  }
  return parsed.value;
}
