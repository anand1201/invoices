import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeTotals } from './totals.js';
import { formatUSD, parseCents, parseQuantityMilli, parseRateMilli } from './money.js';
import { normalizeInvoice } from './validate.js';
import { createCheckDraft, createSampleDraft } from './sample.js';

const line = (quantityMilli, unitPriceCents, id = 'li') => ({
  id,
  description: 'x',
  quantityMilli,
  unitPriceCents,
});

// ---------------------------------------------------------------------------
// The acceptance case from the brief
// ---------------------------------------------------------------------------

test('brief check: 2 x $50 - $10 discount + 10% tax = $99.00', () => {
  const t = computeTotals({
    lineItems: [line(2000, 5000)],
    discountCents: 1000,
    taxRateMilli: 10_000,
  });

  assert.equal(t.subtotalCents, 10_000, 'subtotal $100.00');
  assert.equal(t.discountCents, 1000, 'discount $10.00');
  assert.equal(t.taxableCents, 9000, 'taxable base $90.00');
  assert.equal(t.taxCents, 900, 'tax $9.00');
  assert.equal(t.totalCents, 9900);
  assert.equal(formatUSD(t.totalCents), '$99.00');
});

test('brief check also passes through the full draft -> normalize path', () => {
  const { totals, isValid, errors } = normalizeInvoice(createCheckDraft());
  assert.deepEqual(errors, {});
  assert.equal(isValid, true);
  assert.equal(formatUSD(totals.subtotalCents), '$100.00');
  assert.equal(formatUSD(totals.discountCents), '$10.00');
  assert.equal(formatUSD(totals.taxCents), '$9.00');
  assert.equal(formatUSD(totals.totalCents), '$99.00');
});

// ---------------------------------------------------------------------------
// Rounding order
// ---------------------------------------------------------------------------

test('each line rounds to cents before the subtotal is summed', () => {
  // 3 x $0.335 => each line rounds to 34c, so the subtotal is 3 x 34 = 102c.
  // Summing unrounded (100.5c) and rounding once would give 101c — wrong.
  const t = computeTotals({
    lineItems: [line(1000, 34, 'a'), line(1000, 34, 'b'), line(1000, 34, 'c')],
  });
  assert.equal(t.subtotalCents, 102);
});

test('fractional quantities round half-up per line', () => {
  // 1.5 x $3.33 = $4.995 -> $5.00
  const t = computeTotals({ lineItems: [line(1500, 333)] });
  assert.equal(t.lines[0].amountCents, 500);
  assert.equal(formatUSD(t.totalCents), '$5.00');
});

test('tax is rounded once, on the discounted base', () => {
  // ($10.05 - $0.00) x 7.25% = 0.728625 -> 73c
  const t = computeTotals({ lineItems: [line(1000, 1005)], taxRateMilli: 7250 });
  assert.equal(t.taxCents, 73);
  assert.equal(t.totalCents, 1078);
});

test('tax applies after the discount, not before', () => {
  const t = computeTotals({
    lineItems: [line(1000, 10_000)],
    discountCents: 2000,
    taxRateMilli: 10_000,
  });
  assert.equal(t.taxableCents, 8000);
  assert.equal(t.taxCents, 800); // 10% of $80, not of $100
});

// ---------------------------------------------------------------------------
// Guard rails
// ---------------------------------------------------------------------------

test('discount is capped at the subtotal and flagged', () => {
  const t = computeTotals({ lineItems: [line(1000, 5000)], discountCents: 9999 });
  assert.equal(t.discountCents, 5000);
  assert.equal(t.totalCents, 0);
  assert.equal(t.discountWasCapped, true);
});

test('negative quantity, price, discount and tax rate are all rejected', () => {
  const { errors, isValid } = normalizeInvoice({
    ...createCheckDraft(),
    lineItems: [{ id: 'li1', description: 'bad', quantity: '-2', unitPrice: '-50' }],
    discount: '-5',
    taxRate: '-10',
  });
  assert.equal(isValid, false);
  assert.equal(errors['lineItems.li1.quantity'], 'Quantity cannot be negative.');
  assert.equal(errors['lineItems.li1.unitPrice'], 'Unit price cannot be negative.');
  assert.equal(errors.discount, 'Discount cannot be negative.');
  assert.equal(errors.taxRate, 'Tax rate cannot be negative.');
});

test('a discount larger than the subtotal fails validation', () => {
  const { errors, isValid } = normalizeInvoice({ ...createCheckDraft(), discount: '500' });
  assert.equal(isValid, false);
  assert.equal(errors.discount, 'Discount cannot be greater than the subtotal.');
});

test('tax rate above 100% is rejected', () => {
  const { errors } = normalizeInvoice({ ...createCheckDraft(), taxRate: '101' });
  assert.equal(errors.taxRate, 'Tax rate cannot exceed 100%.');
});

test('due date before issue date is rejected', () => {
  const { errors } = normalizeInvoice({
    ...createCheckDraft(),
    issueDate: '2026-05-10',
    dueDate: '2026-05-01',
  });
  assert.equal(errors.dueDate, 'Due date cannot be earlier than the issue date.');
});

test('calendar-invalid dates are rejected', () => {
  const { errors } = normalizeInvoice({ ...createCheckDraft(), issueDate: '2026-02-31' });
  assert.ok(errors.issueDate);
});

// ---------------------------------------------------------------------------
// Custom fields never affect arithmetic
// ---------------------------------------------------------------------------

test('custom fields are carried through but never change the total', () => {
  const base = createSampleDraft();
  const withoutFields = normalizeInvoice({ ...base, customFields: [] });
  const withFields = normalizeInvoice({
    ...base,
    customFields: [
      { id: 'cf1', label: 'Surcharge', value: '999999', visible: true },
      { id: 'cf2', label: 'Credit', value: '-500', visible: false },
    ],
  });

  assert.equal(withFields.totals.totalCents, withoutFields.totals.totalCents);
  assert.equal(withFields.invoice.customFields.length, 2);
  assert.equal(withFields.invoice.customFields[1].visible, false);
});

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test('money parsing is exact for typed decimals', () => {
  assert.equal(parseCents('50').value, 5000);
  assert.equal(parseCents('19.99').value, 1999);
  assert.equal(parseCents('$1,234.56').value, 123_456);
  assert.equal(parseCents('0.1').value, 10);
  assert.equal(parseCents('.5').value, 50);
  // Third decimal rounds half-up rather than inheriting float error.
  assert.equal(parseCents('1.005').value, 101);
  assert.equal(parseCents('1.004').value, 100);
  assert.equal(parseCents('abc').ok, false);
  assert.equal(parseCents('').ok, false);
});

test('quantity and rate parsing keep three decimals', () => {
  assert.equal(parseQuantityMilli('2.5').value, 2500);
  assert.equal(parseQuantityMilli('0.125').value, 125);
  assert.equal(parseRateMilli('8.5%').value, 8500);
  assert.equal(parseRateMilli('10').value, 10_000);
});

test('formatUSD renders thousands separators and two decimals', () => {
  assert.equal(formatUSD(0), '$0.00');
  assert.equal(formatUSD(5), '$0.05');
  assert.equal(formatUSD(123_456_789), '$1,234,567.89');
});

// ---------------------------------------------------------------------------
// Sample data should be valid out of the box
// ---------------------------------------------------------------------------

test('the seeded sample invoice is valid and adds up', () => {
  const { totals, isValid, errors } = normalizeInvoice(createSampleDraft());
  assert.deepEqual(errors, {});
  assert.equal(isValid, true);
  // 2400 + 1300 + 942.50 = 4642.50; -150 = 4492.50; 8.5% = 381.86; total 4874.36
  assert.equal(formatUSD(totals.subtotalCents), '$4,642.50');
  assert.equal(formatUSD(totals.taxCents), '$381.86');
  assert.equal(formatUSD(totals.totalCents), '$4,874.36');
});
