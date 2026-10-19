/**
 * Discount / tax inputs plus the running total.
 *
 * The numbers on the right are read straight off the shared calculator, and the
 * grand total sits in an `aria-live="polite"` region so a screen-reader user
 * hears the new total after they stop typing instead of having to go hunting
 * for it.
 */

import { formatUSD } from '@invoice/shared';

import { NumberField } from './Field.jsx';
import { IconAlert } from './icons.jsx';

export function Totals({ discount, taxRate, totals, errors, onChange }) {
  const taxPercent = totals.taxRateMilli / 1000;

  return (
    <section className="card" aria-labelledby="totals-heading">
      <header className="card__head">
        <h2 className="card__title" id="totals-heading">
          Discount, tax &amp; total
        </h2>
        <span className="card__hint">USD</span>
      </header>

      <div className="totals">
        <div className="totals__inputs">
          <NumberField
            id="discount"
            label="Fixed discount"
            value={discount}
            onChange={(value) => onChange({ discount: value })}
            error={errors.discount}
            prefix="$"
            hint="A flat amount taken off the subtotal before tax."
          />

          <NumberField
            id="taxRate"
            label="Tax rate"
            value={taxRate}
            onChange={(value) => onChange({ taxRate: value })}
            error={errors.taxRate}
            suffix="%"
            step="0.001"
            max="100"
            hint="Applied to the subtotal after the discount."
          />

          <p className="callout callout--info">
            <IconAlert />
            <span>
              Order of operations: every line is rounded to the cent, the rounded lines are summed,
              the discount comes off that subtotal, then tax is calculated on what remains and
              rounded once.
            </span>
          </p>
        </div>

        <div className="totals__rows">
          <div className="trow">
            <span className="trow__label">Subtotal</span>
            <span className="trow__value">{formatUSD(totals.subtotalCents)}</span>
          </div>

          <div className="trow trow--discount">
            <span className="trow__label">Discount</span>
            <span className="trow__value">
              {totals.discountCents > 0 ? `−${formatUSD(totals.discountCents)}` : formatUSD(0)}
            </span>
          </div>

          <div className="trow">
            <span className="trow__label">Taxable amount</span>
            <span className="trow__value">{formatUSD(totals.taxableCents)}</span>
          </div>

          <div className="trow">
            <span className="trow__label">Tax ({formatPercent(taxPercent)}%)</span>
            <span className="trow__value">{formatUSD(totals.taxCents)}</span>
          </div>

          <div className="trow trow--grand">
            <span className="trow__label">Total due</span>
            <span className="trow__value" aria-live="polite" aria-atomic="true">
              {formatUSD(totals.totalCents)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 8.5 -> "8.5", 10 -> "10" — no trailing ".000". */
export function formatPercent(value) {
  return String(Number(value.toFixed(3)));
}
