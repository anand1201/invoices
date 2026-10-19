/**
 * Send-by-email dialog.
 *
 * The browser hands the server an invoice id, an optional recipient override
 * and an optional note — nothing else. The server reads the invoice back out
 * of the database, renders the email itself and sends it through SMTP, so the
 * body of the email cannot be influenced by whatever is sitting in this tab.
 */

import { useEffect, useState } from 'react';
import { formatUSD } from '@invoice/shared';

import { Scrim, useOverlay } from './Overlay.jsx';
import { Field, TextField } from './Field.jsx';
import { IconAlert, IconClose, IconSend } from './icons.jsx';

export function SendDialog({ open, invoice, totals, mailStatus, sending, error, onClose, onSend }) {
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');

  // Reset the form each time the dialog opens so a previous failure or a stale
  // recipient never carries over.
  useEffect(() => {
    if (!open) return;
    setTo(invoice.customer.email || '');
    setMessage(
      `Hi${invoice.customer.name ? ` ${invoice.customer.name.split(' ')[0]}` : ''},\n\n` +
        `Please find invoice ${invoice.invoiceNumber} attached below, due ${invoice.dueDate}.\n\n` +
        `Thanks,\n${invoice.business.name}`,
    );
  }, [open, invoice.customer.email, invoice.customer.name, invoice.invoiceNumber, invoice.dueDate, invoice.business.name]);

  const ref = useOverlay(open, onClose);
  if (!open) return null;

  const isEthereal = mailStatus?.transport === 'ethereal';
  const notConfigured = mailStatus?.transport === 'none';

  return (
    <>
      <Scrim onClose={onClose} />
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-title"
        ref={ref}
        tabIndex={-1}
      >
        <header className="dialog__head">
          <h2 className="dialog__title" id="send-title">
            Email this invoice
          </h2>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn--icon btn--ghost"
            onClick={onClose}
            aria-label="Close send dialog"
          >
            <IconClose className="btn__icon" />
          </button>
        </header>

        <form
          className="dialog__body"
          onSubmit={(event) => {
            event.preventDefault();
            onSend({ to: to.trim(), message: message.trim() });
          }}
          id="send-form"
        >
          <dl className="summary-strip">
            <div>
              <dt>Invoice</dt>
              <dd>{invoice.invoiceNumber}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatUSD(totals.totalCents)}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{invoice.dueDate}</dd>
            </div>
          </dl>

          <TextField
            id="send-to"
            label="Send to"
            type="email"
            value={to}
            onChange={setTo}
            required
            autoComplete="email"
            placeholder="accounts@customer.example"
            hint="Defaults to the customer email on the invoice."
          />

          <Field id="send-message" label="Message" optional>
            {({ id, describedBy }) => (
              <textarea
                id={id}
                className="textarea"
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          {notConfigured ? (
            <p className="callout callout--error">
              <IconAlert />
              <span>
                No SMTP transport is configured on the server. Set <code>SMTP_HOST</code> and the
                related values in <code>server/.env</code>, then restart the API.
              </span>
            </p>
          ) : isEthereal ? (
            <p className="callout callout--warn">
              <IconAlert />
              <span>
                The server is using an <strong>Ethereal test mailbox</strong>, so this will
                <strong> not</strong> reach a real inbox — you&apos;ll get a preview link instead.
                Fill in the SMTP values in <code>server/.env</code> for real delivery.
              </span>
            </p>
          ) : (
            <p className="callout callout--info">
              <IconAlert />
              <span>
                Sending through <strong>{mailStatus?.host}</strong>
                {mailStatus?.from ? ` as ${mailStatus.from}` : ''}. Credentials stay on the server.
              </span>
            </p>
          )}

          {error ? (
            <p className="callout callout--error" role="alert">
              <IconAlert />
              <span>{error}</span>
            </p>
          ) : null}
        </form>

        <footer className="dialog__foot">
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            The invoice is rendered server-side from the saved record.
          </span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="send-form"
            className="btn btn--accent"
            disabled={sending || notConfigured || !to.trim()}
          >
            <IconSend className="btn__icon" />
            {sending ? 'Sending…' : 'Send invoice'}
          </button>
        </footer>
      </div>
    </>
  );
}
