/**
 * Invoice totals.
 *
 * The order of operations is fixed by the spec and is the one place where a
 * "reasonable looking" refactor would silently produce wrong invoices, so it
 * is spelled out here once and imported everywhere:
 *
 *   1. line amount   = round_half_up(quantity x unit price)   <- rounded per line
 *   2. subtotal      = sum of the *already rounded* line amounts
 *   3. discount      = min(fixed discount, subtotal)           <- never negative total
 *   4. taxable base  = subtotal - discount
 *   5. tax           = round_half_up(taxable base x rate)      <- rounded once, at the end
 *   6. grand total   = taxable base + tax
 *
 * Worked example from the brief: 2 x $50.00, $10.00 discount, 10% tax
 *   line   = round(2000 x 5000 / 1000)      = 10000c  ($100.00)
 *   sub    = 10000c                                   ($100.00)
 *   disc   = min(1000, 10000)               =  1000c  ($10.00)
 *   base   = 10000 - 1000                   =  9000c  ($90.00)
 *   tax    = round(9000 x 10000 / 100000)   =   900c  ($9.00)
 *   total  = 9000 + 900                     =  9900c  ($99.00)
 */

import { roundedDiv } from './money.js';

/**
 * @typedef {object} CanonicalLineItem
 * @property {string} id
 * @property {string} description
 * @property {number} quantityMilli  quantity x 1000, integer
 * @property {number} unitPriceCents unit price in cents, integer
 */

/**
 * @param {object} input
 * @param {CanonicalLineItem[]} input.lineItems
 * @param {number} input.discountCents fixed discount in cents
 * @param {number} input.taxRateMilli  tax rate x 1000 percent (10% -> 10000)
 */
export function computeTotals({ lineItems = [], discountCents = 0, taxRateMilli = 0 }) {
  // Step 1 — each line is rounded to whole cents on its own.
  const lines = lineItems.map((item) => {
    const quantityMilli = int(item.quantityMilli);
    const unitPriceCents = int(item.unitPriceCents);
    return {
      id: item.id,
      description: item.description ?? '',
      quantityMilli,
      unitPriceCents,
      amountCents: roundedDiv(quantityMilli * unitPriceCents, 1000),
    };
  });

  // Step 2 — sum the rounded lines (not the unrounded products).
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);

  // Step 3 — a fixed discount can never exceed the subtotal.
  const requestedDiscountCents = Math.max(0, int(discountCents));
  const discountCentsApplied = Math.min(requestedDiscountCents, subtotalCents);

  // Step 4/5/6 — tax is charged on the discounted base and rounded once.
  const taxableCents = subtotalCents - discountCentsApplied;
  const rateMilli = Math.max(0, int(taxRateMilli));
  const taxCents = roundedDiv(taxableCents * rateMilli, 100_000);
  const totalCents = taxableCents + taxCents;

  return {
    lines,
    subtotalCents,
    requestedDiscountCents,
    discountCents: discountCentsApplied,
    /** True when the typed discount was larger than the subtotal and got capped. */
    discountWasCapped: requestedDiscountCents > subtotalCents,
    taxableCents,
    taxRateMilli: rateMilli,
    taxCents,
    totalCents,
  };
}

function int(value) {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}
