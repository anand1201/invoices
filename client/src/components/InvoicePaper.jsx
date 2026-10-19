/**
 * The invoice sheet — live preview *and* the print target.
 *
 * There is deliberately only one render of the invoice. "Print / Save as PDF"
 * does not build a second document or open a hidden iframe; the print
 * stylesheet collapses the app chrome and promotes this element to the page.
 * One render means the PDF can never drift from what the user was just looking
 * at.
 *
 * Only `visible` custom fields are rendered at all, so a hidden field is not
 * merely CSS-hidden on paper — it is not in the printed DOM.
 */

import { formatUSD, quantityMilliToInput } from '@invoice/shared';

import { formatPercent } from './Totals.jsx';

/** "2026-03-14" -> "Mar 14, 2026", parsed as UTC so the day never shifts. */
function prettyDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const Placeholder = ({ children }) => <span className="paper__placeholder">{children}</span>;

export function InvoicePaper({ invoice, totals }) {
  const visibleFields = invoice.customFields.filter((field) => field.visible);
  const businessLines = [invoice.business.address, invoice.business.email, invoice.business.phone]
    .filter(Boolean)
    .join('\n');
  const customerLines = [invoice.customer.address, invoice.customer.email, invoice.customer.phone]
    .filter(Boolean)
    .join('\n');

  return (
    <article className="paper" aria-label={`Invoice ${invoice.invoiceNumber} preview`}>
      {/* --- masthead --- */}
      <header className="paper__top">
        <div>
          <h2 className="paper__biz-name">
            {invoice.business.name || <Placeholder>Your business name</Placeholder>}
          </h2>
          {businessLines ? (
            <p className="paper__biz-lines">{businessLines}</p>
          ) : (
            <p className="paper__biz-lines">
              <Placeholder>Address, email and phone appear here</Placeholder>
            </p>
          )}
        </div>

        <div className="paper__title-block">
          <p className="paper__kicker">Invoice</p>
          <p className="paper__number">
            {invoice.invoiceNumber || <Placeholder>INV-0000</Placeholder>}
          </p>
          {invoice.dueDate ? (
            <p className="paper__due-pill">Due {prettyDate(invoice.dueDate)}</p>
          ) : null}
        </div>
      </header>

      {/* --- parties + metadata --- */}
      <section className="paper__parties">
        <div>
          <p className="paper__label">Billed to</p>
          <p className="paper__party-name">
            {invoice.customer.name || <Placeholder>Customer name</Placeholder>}
          </p>
          {customerLines ? <p className="paper__party-lines">{customerLines}</p> : null}
        </div>

        <div className="paper__meta">
          <div className="paper__meta-row">
            <span className="paper__meta-key">Invoice number</span>
            <span className="paper__meta-val">{invoice.invoiceNumber || '—'}</span>
          </div>
          <div className="paper__meta-row">
            <span className="paper__meta-key">Issue date</span>
            <span className="paper__meta-val">{prettyDate(invoice.issueDate) || '—'}</span>
          </div>
          <div className="paper__meta-row">
            <span className="paper__meta-key">Due date</span>
            <span className="paper__meta-val">{prettyDate(invoice.dueDate) || '—'}</span>
          </div>

          {/* Visible custom fields only — hidden ones never reach the DOM. */}
          {visibleFields.map((field) => (
            <div className="paper__meta-row" key={field.id}>
              <span className="paper__meta-key">{field.label}</span>
              <span className="paper__meta-val">{field.value || '—'}</span>
            </div>
          ))}
        </div>
      </section>

      {/* --- items --- */}
      <section>
        <table className="paper__table">
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col" className="num">
                Qty
              </th>
              <th scope="col" className="num">
                Rate
              </th>
              <th scope="col" className="num">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {totals.lines.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <Placeholder>No line items yet</Placeholder>
                </td>
              </tr>
            ) : (
              totals.lines.map((line) => (
                <tr key={line.id}>
                  <td className="desc">
                    {line.description || <Placeholder>Untitled item</Placeholder>}
                  </td>
                  <td className="num muted">{quantityMilliToInput(line.quantityMilli) || '0'}</td>
                  <td className="num muted">{formatUSD(line.unitPriceCents)}</td>
                  <td className="num amount">{formatUSD(line.amountCents)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* --- totals --- */}
      <section className="paper__totals">
        <div className="paper__totals-inner">
          <div className="trow">
            <span className="trow__label">Subtotal</span>
            <span className="trow__value">{formatUSD(totals.subtotalCents)}</span>
          </div>

          {totals.discountCents > 0 ? (
            <div className="trow trow--discount">
              <span className="trow__label">Discount</span>
              <span className="trow__value">−{formatUSD(totals.discountCents)}</span>
            </div>
          ) : null}

          {totals.taxRateMilli > 0 ? (
            <div className="trow">
              <span className="trow__label">Tax ({formatPercent(totals.taxRateMilli / 1000)}%)</span>
              <span className="trow__value">{formatUSD(totals.taxCents)}</span>
            </div>
          ) : null}

          <div className="trow trow--grand">
            <span className="trow__label">Total due</span>
            <span className="trow__value">{formatUSD(totals.totalCents)}</span>
          </div>
        </div>
      </section>

      {/* --- footer --- */}
      <footer className="paper__foot">
        {invoice.notes ? (
          <div>
            <p className="paper__label">Notes &amp; terms</p>
            <p className="paper__notes">{invoice.notes}</p>
          </div>
        ) : null}
        <p className="paper__sig">
          {invoice.business.name ? `${invoice.business.name} · ` : ''}All amounts in US dollars
          (USD).
        </p>
      </footer>
    </article>
  );
}
