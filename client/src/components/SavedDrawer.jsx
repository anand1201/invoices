/**
 * "Saved invoices" drawer — the visible proof that storage is server-side.
 *
 * The list is fetched from GET /api/invoices every time the drawer opens, so
 * what you see came out of MySQL, not out of this tab's memory.
 */

import { formatUSD } from '@invoice/shared';

import { Scrim, useOverlay } from './Overlay.jsx';
import { IconClose, IconFile, IconTrash } from './icons.jsx';

function relativeTime(value) {
  if (!value) return '';
  const then = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function SavedDrawer({ open, invoices, loading, currentId, onClose, onOpenInvoice, onDelete }) {
  const ref = useOverlay(open, onClose);
  if (!open) return null;

  return (
    <>
      <Scrim onClose={onClose} />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        ref={ref}
        tabIndex={-1}
      >
        <header className="drawer__head">
          <h2 className="drawer__title" id="drawer-title">
            Saved invoices
          </h2>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn--icon btn--ghost" onClick={onClose} aria-label="Close saved invoices">
            <IconClose className="btn__icon" />
          </button>
        </header>

        <div className="drawer__body">
          {loading ? (
            <p className="empty">Loading from the database…</p>
          ) : invoices.length === 0 ? (
            <p className="empty">
              Nothing saved yet. Press <strong>Save</strong> and this list will fill up.
            </p>
          ) : (
            <div className="ilist">
              {invoices.map((item) => (
                <div className="ilist__row" key={item.id} data-current={item.id === currentId}>
                  <button
                    type="button"
                    className="ilist__btn"
                    onClick={() => onOpenInvoice(item.id)}
                    aria-current={item.id === currentId || undefined}
                  >
                    <span className="ilist__num">
                      <IconFile
                        width="13"
                        height="13"
                        style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }}
                      />
                      {item.invoiceNumber}
                      {item.id === currentId ? (
                        <span className="badge badge--on" style={{ marginLeft: 8 }}>
                          open
                        </span>
                      ) : null}
                    </span>
                    <span className="ilist__total">{formatUSD(item.totalCents)}</span>
                    <span className="ilist__meta">{item.customerName || 'No customer'}</span>
                    <span className="ilist__when">{relativeTime(item.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--icon btn--danger-ghost"
                    onClick={() => onDelete(item)}
                    aria-label={`Delete invoice ${item.invoiceNumber}`}
                  >
                    <IconTrash className="btn__icon" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="drawer__foot">
          Stored in MySQL/MariaDB. Opening one replaces what is in the editor.
        </footer>
      </aside>
    </>
  );
}
