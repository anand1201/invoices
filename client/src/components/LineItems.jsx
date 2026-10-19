/**
 * Line-item editor.
 *
 * A real <table> on desktop (it is tabular data, and the header cells give
 * screen readers the column names for free) that CSS restacks into labelled
 * cards under 720px. Each row's computed amount comes from the shared
 * calculator via `totals.lines`, so what the row shows and what the invoice
 * charges can never diverge.
 */

import { formatUSD } from '@invoice/shared';

import { NumberInput } from './Field.jsx';
import { IconPlus, IconTrash, IconAlert } from './icons.jsx';

export function LineItems({ items, lines, errors, onChange, onAdd, onRemove }) {
  const amountById = new Map(lines.map((line) => [line.id, line.amountCents]));

  return (
    <section className="card" aria-labelledby="items-heading">
      <header className="card__head">
        <h2 className="card__title" id="items-heading">
          Line items
        </h2>
        <span className="card__hint">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </header>

      <div className="card__body card__body--flush">
        {items.length === 0 ? (
          <p className="empty">No line items yet — add the first one below.</p>
        ) : (
          <table className="items">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col" className="num" style={{ width: 110 }}>
                  Qty
                </th>
                <th scope="col" className="num" style={{ width: 140 }}>
                  Unit price
                </th>
                <th scope="col" className="num" style={{ width: 120 }}>
                  Amount
                </th>
                <th scope="col">
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const descError = errors[`lineItems.${item.id}.description`];
                const qtyError = errors[`lineItems.${item.id}.quantity`];
                const priceError = errors[`lineItems.${item.id}.unitPrice`];
                const rowError = qtyError || priceError || descError;

                return (
                  <tr key={item.id}>
                    <td>
                      <span className="items__row-label" aria-hidden="true">
                        Item {index + 1}
                      </span>
                      <label className="visually-hidden" htmlFor={`${item.id}-desc`}>
                        Description for item {index + 1}
                      </label>
                      <input
                        id={`${item.id}-desc`}
                        className="input"
                        value={item.description}
                        placeholder="What are you billing for?"
                        onChange={(event) => onChange(item.id, { description: event.target.value })}
                        aria-invalid={descError ? true : undefined}
                        aria-describedby={rowError ? `${item.id}-error` : undefined}
                      />
                    </td>

                    <td className="items__qty-price-cell">
                      <div className="items__qty-price">
                        <div>
                          <span className="items__row-label" aria-hidden="true">
                            Qty
                          </span>
                          <label className="visually-hidden" htmlFor={`${item.id}-qty`}>
                            Quantity for item {index + 1}
                          </label>
                          <NumberInput
                            id={`${item.id}-qty`}
                            value={item.quantity}
                            onChange={(value) => onChange(item.id, { quantity: value })}
                            invalid={Boolean(qtyError)}
                            describedBy={rowError ? `${item.id}-error` : undefined}
                            step="0.001"
                          />
                        </div>
                        {/* On mobile the unit price rides along in this grid;
                            on desktop it lives in its own <td> below. */}
                        <div className="items__mobile-price">
                          <span className="items__row-label" aria-hidden="true">
                            Unit price
                          </span>
                          <label className="visually-hidden" htmlFor={`${item.id}-price-m`}>
                            Unit price for item {index + 1}
                          </label>
                          <NumberInput
                            id={`${item.id}-price-m`}
                            value={item.unitPrice}
                            onChange={(value) => onChange(item.id, { unitPrice: value })}
                            invalid={Boolean(priceError)}
                            describedBy={rowError ? `${item.id}-error` : undefined}
                            prefix="$"
                          />
                        </div>
                      </div>
                    </td>

                    <td className="items__desktop-price">
                      <label className="visually-hidden" htmlFor={`${item.id}-price`}>
                        Unit price for item {index + 1}
                      </label>
                      <NumberInput
                        id={`${item.id}-price`}
                        value={item.unitPrice}
                        onChange={(value) => onChange(item.id, { unitPrice: value })}
                        invalid={Boolean(priceError)}
                        describedBy={rowError ? `${item.id}-error` : undefined}
                        prefix="$"
                      />
                    </td>

                    <td className="items__amount">
                      <span className="items__row-label" aria-hidden="true">
                        Amount
                      </span>
                      <span>{formatUSD(amountById.get(item.id) ?? 0)}</span>
                    </td>

                    <td className="items__rm">
                      <button
                        type="button"
                        className="btn btn--icon btn--danger-ghost"
                        onClick={() => onRemove(item.id)}
                        aria-label={`Remove item ${index + 1}${
                          item.description ? `: ${item.description}` : ''
                        }`}
                      >
                        <IconTrash className="btn__icon" />
                      </button>
                    </td>

                    {rowError ? (
                      <td colSpan={5} style={{ paddingTop: 0 }}>
                        <span className="field__error" id={`${item.id}-error`} role="alert">
                          <IconAlert />
                          {rowError}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="items__foot">
          <button type="button" className="btn btn--sm" onClick={onAdd}>
            <IconPlus className="btn__icon" />
            Add line item
          </button>
          {errors.lineItems ? (
            <span className="field__error" role="alert">
              <IconAlert />
              {errors.lineItems}
            </span>
          ) : null}
          <span className="items__foot-note">Each line is rounded to the cent.</span>
        </div>
      </div>
    </section>
  );
}
