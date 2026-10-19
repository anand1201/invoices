/**
 * Draft factories.
 *
 * `createSampleDraft()` is what a first-time visitor sees: a complete, plausible
 * invoice from a fictional studio so the editor and the preview both look
 * finished on load instead of showing an empty skeleton.
 */

/** Crypto-grade id in browsers and in Node >= 19. */
export function newId(prefix = 'id') {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid.replace(/-/g, '').slice(0, 16)}`;
}

/** YYYY-MM-DD for a date `offsetDays` from today, in the viewer's local zone. */
export function isoDay(offsetDays = 0, from = new Date()) {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function createLineItem(overrides = {}) {
  return { id: newId('li'), description: '', quantity: '1', unitPrice: '0.00', ...overrides };
}

export function createCustomField(overrides = {}) {
  return { id: newId('cf'), label: '', value: '', visible: true, ...overrides };
}

export function createEmptyDraft() {
  return {
    id: null,
    invoiceNumber: 'INV-0001',
    issueDate: isoDay(0),
    dueDate: isoDay(14),
    business: { name: '', email: '', phone: '', address: '' },
    customer: { name: '', email: '', phone: '', address: '' },
    lineItems: [createLineItem()],
    customFields: [],
    discount: '0.00',
    taxRate: '0',
    notes: '',
  };
}

export function createSampleDraft() {
  return {
    id: null,
    invoiceNumber: 'INV-2026-014',
    issueDate: isoDay(0),
    dueDate: isoDay(14),
    business: {
      name: 'Northwind Studio',
      email: 'billing@northwind.studio',
      phone: '+1 (415) 555-0137',
      address: '2180 Mission Street, Suite 400\nSan Francisco, CA 94110',
    },
    customer: {
      name: 'Harbourline Coffee Co.',
      email: 'accounts@harbourline.example',
      phone: '+1 (206) 555-0112',
      address: '814 Pike Street\nSeattle, WA 98101',
    },
    lineItems: [
      {
        id: newId('li'),
        description: 'Brand identity refresh — logo, palette, type system',
        quantity: '1',
        unitPrice: '2400.00',
      },
      {
        id: newId('li'),
        description: 'Packaging design — 12oz and 2lb bag',
        quantity: '2',
        unitPrice: '650.00',
      },
      {
        id: newId('li'),
        description: 'Art direction (hourly)',
        quantity: '6.5',
        unitPrice: '145.00',
      },
    ],
    customFields: [
      { id: newId('cf'), label: 'Purchase order', value: 'PO-55821', visible: true },
      { id: newId('cf'), label: 'Project', value: 'Harbourline — Spring 2026', visible: true },
      { id: newId('cf'), label: 'Internal note', value: 'Renewal discussed in March', visible: false },
    ],
    discount: '150.00',
    taxRate: '8.5',
    notes:
      'Payment due within 14 days by ACH or wire. Late balances accrue 1.5% monthly.\nThank you for working with Northwind Studio.',
  };
}

/** The brief's acceptance case: 2 x $50 - $10 + 10% tax = $99.00. */
export function createCheckDraft() {
  return {
    ...createEmptyDraft(),
    invoiceNumber: 'INV-CHECK-99',
    business: { name: 'Northwind Studio', email: '', phone: '', address: '' },
    customer: { name: 'Spec Check', email: '', phone: '', address: '' },
    lineItems: [
      { id: newId('li'), description: 'Spec check line', quantity: '2', unitPrice: '50.00' },
    ],
    discount: '10.00',
    taxRate: '10',
    notes: 'Expected: subtotal $100.00, discount $10.00, tax $9.00, total $99.00.',
  };
}
