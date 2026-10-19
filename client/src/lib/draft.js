/**
 * Draft <-> stored-invoice conversion.
 *
 * The editor state ("draft") keeps numbers as strings so that half-typed values
 * like "" or "1." don't fight the user, and so an input never jumps the caret.
 * The server stores canonical integers. These two functions are the only place
 * that crosses that boundary.
 */

import { centsToInput, quantityMilliToInput, rateMilliToInput } from '@invoice/shared';

/** Stored invoice (integer fields) -> editor draft (string fields). */
export function invoiceToDraft(invoice) {
  return {
    id: invoice.id ?? null,
    invoiceNumber: invoice.invoiceNumber ?? '',
    issueDate: (invoice.issueDate ?? '').slice(0, 10),
    dueDate: (invoice.dueDate ?? '').slice(0, 10),
    business: { ...emptyParty(), ...(invoice.business ?? {}) },
    customer: { ...emptyParty(), ...(invoice.customer ?? {}) },
    lineItems: (invoice.lineItems ?? []).map((item, index) => ({
      id: item.id || `li_${index}`,
      description: item.description ?? '',
      quantity: quantityMilliToInput(item.quantityMilli ?? 0),
      unitPrice: centsToInput(item.unitPriceCents ?? 0),
    })),
    customFields: (invoice.customFields ?? []).map((field, index) => ({
      id: field.id || `cf_${index}`,
      label: field.label ?? '',
      value: field.value ?? '',
      visible: field.visible !== false,
    })),
    discount: centsToInput(invoice.discountCents ?? 0),
    taxRate: rateMilliToInput(invoice.taxRateMilli ?? 0),
    notes: invoice.notes ?? '',
  };
}

function emptyParty() {
  return { name: '', email: '', phone: '', address: '' };
}

/* ---------------------------------------------------------------------------
 * Local cache
 *
 * The database is the system of record — "reload and it is still there" is
 * served by GET /api/invoices/:id. localStorage here does two small jobs only:
 * remember *which* invoice was open, and hold a not-yet-saved first draft so a
 * refresh before the first save is not destructive.
 * ------------------------------------------------------------------------- */

const LAST_ID_KEY = 'invoiceStudio.lastInvoiceId';
const DRAFT_KEY = 'invoiceStudio.unsavedDraft';

const safeStorage = (() => {
  try {
    const probe = '__is_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private mode / blocked storage: degrade silently to a no-op.
    return null;
  }
})();

export function readLastInvoiceId() {
  return safeStorage?.getItem(LAST_ID_KEY) || null;
}

export function writeLastInvoiceId(id) {
  if (!safeStorage) return;
  if (id) safeStorage.setItem(LAST_ID_KEY, id);
  else safeStorage.removeItem(LAST_ID_KEY);
}

export function readUnsavedDraft() {
  if (!safeStorage) return null;
  try {
    const raw = safeStorage.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.lineItems) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeUnsavedDraft(draft) {
  if (!safeStorage) return;
  try {
    if (draft) safeStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else safeStorage.removeItem(DRAFT_KEY);
  } catch {
    /* quota exceeded — not worth interrupting the user over */
  }
}
