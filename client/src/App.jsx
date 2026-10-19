/**
 * Invoice Studio — application shell.
 *
 * State model
 * -----------
 * `draft` is the single source of truth for the editor and holds numeric
 * fields as strings. Everything else is derived, not stored: on every change
 * the draft runs through the shared `normalizeInvoice`, which returns the
 * canonical invoice, the totals and a `{ path: message }` error map. The live
 * preview, the totals panel and every inline error read from that one result,
 * which is why the preview can never disagree with the numbers.
 *
 * Persistence
 * -----------
 * MySQL is the system of record. The first Save POSTs and gets back a UUID;
 * after that, edits autosave with a short debounce. The id is remembered in
 * localStorage so a reload re-fetches the invoice from the API — the thing on
 * screen after F5 came out of the database, not out of the browser.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCheckDraft,
  createEmptyDraft,
  createLineItem,
  createCustomField,
  createSampleDraft,
  formatUSD,
  normalizeInvoice,
} from '@invoice/shared';

import { api } from './lib/api.js';
import {
  invoiceToDraft,
  readLastInvoiceId,
  readUnsavedDraft,
  writeLastInvoiceId,
  writeUnsavedDraft,
} from './lib/draft.js';

import { CustomFields } from './components/CustomFields.jsx';
import { Field, TextAreaField, TextField } from './components/Field.jsx';
import { InvoicePaper } from './components/InvoicePaper.jsx';
import { LineItems } from './components/LineItems.jsx';
import { SavedDrawer } from './components/SavedDrawer.jsx';
import { SendDialog } from './components/SendDialog.jsx';
import { Totals } from './components/Totals.jsx';
import { Toasts, useToasts } from './components/Toasts.jsx';
import {
  IconAlert,
  IconFolder,
  IconPlus,
  IconPrint,
  IconSave,
  IconSend,
} from './components/icons.jsx';

const AUTOSAVE_DELAY_MS = 1400;

export default function App() {
  const [draft, setDraft] = useState(null);
  /** JSON of the last successfully persisted draft — drives the dirty flag. */
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [serverErrors, setServerErrors] = useState({});
  const [revealErrors, setRevealErrors] = useState(true);

  const [mailStatus, setMailStatus] = useState(null);
  const [view, setView] = useState('edit'); // mobile pane switch

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedList, setSavedList] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const { toasts, push, dismiss } = useToasts();
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // ---------------------------------------------------------------- derived
  const { invoice, totals, errors, isValid } = useMemo(
    () => normalizeInvoice(draft ?? createEmptyDraft()),
    [draft],
  );

  const allErrors = useMemo(() => ({ ...errors, ...serverErrors }), [errors, serverErrors]);
  const shownErrors = revealErrors ? allErrors : {};
  const dirty = Boolean(draft) && savedSnapshot !== JSON.stringify(draft);

  // ------------------------------------------------------------------- boot
  useEffect(() => {
    let cancelled = false;

    api
      .health()
      .then((health) => !cancelled && setMailStatus(health.mail))
      .catch(() => {
        if (!cancelled) {
          setMailStatus({ transport: 'none', configured: false });
          push({
            kind: 'error',
            title: 'API unreachable',
            body: 'Could not reach the server on /api. Start it with `npm run dev` and reload.',
          });
        }
      });

    (async () => {
      const lastId = readLastInvoiceId();
      if (lastId) {
        try {
          const { invoice: stored } = await api.get(lastId);
          if (cancelled) return;
          const restored = invoiceToDraft(stored);
          setDraft(restored);
          setSavedSnapshot(JSON.stringify(restored));
          setSaveState('saved');
          return;
        } catch {
          // The invoice was deleted, or the DB was reset — fall through to a
          // fresh draft rather than getting stuck on a dead id.
          writeLastInvoiceId(null);
        }
      }
      if (cancelled) return;
      setDraft(readUnsavedDraft() ?? createSampleDraft());
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  /** Mirror a never-saved draft locally so a refresh is not destructive. */
  useEffect(() => {
    if (draft && !draft.id) writeUnsavedDraft(draft);
  }, [draft]);

  // ------------------------------------------------------------------- save
  const save = useCallback(
    async ({ silent = false } = {}) => {
      const current = draftRef.current;
      if (!current) return null;

      setRevealErrors(true);
      const result = normalizeInvoice(current);
      if (!result.isValid) {
        if (!silent) {
          push({
            kind: 'error',
            title: 'Fix the highlighted fields',
            body: Object.values(result.errors)[0],
          });
        }
        return null;
      }

      setSaveState('saving');
      setServerErrors({});
      try {
        const response = current.id
          ? await api.update(current.id, result.invoice)
          : await api.create(result.invoice);

        const id = response.invoice.id;
        const persisted = { ...current, id };
        setDraft((prev) => (prev === current ? persisted : { ...prev, id }));
        setSavedSnapshot(JSON.stringify(persisted));
        writeLastInvoiceId(id);
        writeUnsavedDraft(null);
        setSaveState('saved');
        if (!silent) {
          push({
            kind: 'success',
            title: `Invoice ${result.invoice.invoiceNumber} saved`,
            body: `${formatUSD(result.totals.totalCents)} · stored in the database`,
          });
        }
        return id;
      } catch (error) {
        setSaveState('error');
        if (error.errors) setServerErrors(error.errors);
        push({ kind: 'error', title: 'Could not save', body: error.message });
        return null;
      }
    },
    [push],
  );

  /** Debounced autosave, but only for invoices that already exist server-side. */
  useEffect(() => {
    if (!draft?.id || !dirty || !isValid) return undefined;
    const timer = setTimeout(() => save({ silent: true }), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, dirty, isValid, save]);

  /** Ctrl/Cmd+S saves, like every other document editor. */
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  // -------------------------------------------------------------- mutations
  const patch = useCallback((updates) => setDraft((d) => ({ ...d, ...updates })), []);

  const patchParty = useCallback(
    (which, updates) => setDraft((d) => ({ ...d, [which]: { ...d[which], ...updates } })),
    [],
  );

  const patchItem = useCallback((id, updates) => {
    setDraft((d) => ({
      ...d,
      lineItems: d.lineItems.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }));
  }, []);

  const addItem = useCallback(() => {
    setDraft((d) => ({ ...d, lineItems: [...d.lineItems, createLineItem()] }));
  }, []);

  const removeItem = useCallback((id) => {
    setDraft((d) => ({ ...d, lineItems: d.lineItems.filter((item) => item.id !== id) }));
  }, []);

  const patchField = useCallback((id, updates) => {
    setDraft((d) => ({
      ...d,
      customFields: d.customFields.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    }));
  }, []);

  const addField = useCallback(() => {
    setDraft((d) => ({ ...d, customFields: [...d.customFields, createCustomField()] }));
  }, []);

  const removeField = useCallback((id) => {
    setDraft((d) => ({ ...d, customFields: d.customFields.filter((f) => f.id !== id) }));
  }, []);

  // -------------------------------------------------------------- documents
  const startDraft = useCallback(
    (next, { reveal }) => {
      setDraft(next);
      setSavedSnapshot(null);
      setSaveState('idle');
      setServerErrors({});
      setRevealErrors(reveal);
      writeLastInvoiceId(null);
      writeUnsavedDraft(next);
      setView('edit');
    },
    [],
  );

  const newInvoice = () => startDraft(createEmptyDraft(), { reveal: false });
  const loadSample = () => startDraft(createSampleDraft(), { reveal: true });
  const loadSpecCheck = () => startDraft(createCheckDraft(), { reveal: true });

  const refreshList = useCallback(async () => {
    setListLoading(true);
    try {
      const { invoices } = await api.list();
      setSavedList(invoices);
    } catch (error) {
      push({ kind: 'error', title: 'Could not load saved invoices', body: error.message });
    } finally {
      setListLoading(false);
    }
  }, [push]);

  const openDrawer = () => {
    setDrawerOpen(true);
    refreshList();
  };

  const openInvoice = async (id) => {
    try {
      const { invoice: stored } = await api.get(id);
      const restored = invoiceToDraft(stored);
      setDraft(restored);
      setSavedSnapshot(JSON.stringify(restored));
      setSaveState('saved');
      setServerErrors({});
      setRevealErrors(true);
      writeLastInvoiceId(id);
      writeUnsavedDraft(null);
      setDrawerOpen(false);
      push({ kind: 'info', title: `Opened ${stored.invoiceNumber}`, body: 'Loaded from the database.' });
    } catch (error) {
      push({ kind: 'error', title: 'Could not open that invoice', body: error.message });
    }
  };

  const deleteInvoice = async (item) => {
    // eslint-disable-next-line no-alert -- a deliberate, reversible-free confirm
    if (!window.confirm(`Delete invoice ${item.invoiceNumber}? This cannot be undone.`)) return;
    try {
      await api.remove(item.id);
      setSavedList((list) => list.filter((row) => row.id !== item.id));
      if (draft?.id === item.id) {
        writeLastInvoiceId(null);
        setDraft((d) => ({ ...d, id: null }));
        setSavedSnapshot(null);
        setSaveState('idle');
      }
      push({ kind: 'success', title: `Deleted ${item.invoiceNumber}` });
    } catch (error) {
      push({ kind: 'error', title: 'Could not delete', body: error.message });
    }
  };

  // ------------------------------------------------------------------ email
  const openSend = async () => {
    setRevealErrors(true);
    if (!isValid) {
      push({
        kind: 'error',
        title: 'Fix the highlighted fields first',
        body: Object.values(allErrors)[0],
      });
      return;
    }
    // Email always renders from the stored record, so make sure the record is
    // current before we open the dialog.
    if (!draft.id || dirty) {
      const id = await save({ silent: true });
      if (!id) return;
    }
    setSendError(null);
    setSendOpen(true);
  };

  const handleSend = async ({ to, message }) => {
    setSending(true);
    setSendError(null);
    try {
      const result = await api.sendEmail(draftRef.current.id, { to, message });
      setSendOpen(false);
      push({
        kind: 'success',
        title: `Invoice emailed to ${result.to}`,
        body:
          result.transport === 'ethereal'
            ? 'Ethereal test transport — this did not reach a real inbox.'
            : `Delivered via ${result.transport} · ${result.amount}`,
        link: result.previewUrl,
        linkLabel: 'View the test message',
        duration: 9000,
      });
    } catch (error) {
      setSendError(error.message);
    } finally {
      setSending(false);
    }
  };

  // ------------------------------------------------------------------ print
  const print = () => {
    // Make sure the sheet is on screen before handing over to the browser —
    // otherwise a mobile user printing from the Edit tab gets a blank page.
    setView('preview');
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  // ----------------------------------------------------------------- render
  if (!draft) {
    return (
      <div className="app">
        <main className="workspace" style={{ alignContent: 'center' }}>
          <p className="empty">Loading your invoice…</p>
        </main>
      </div>
    );
  }

  const errorList = Object.values(shownErrors);

  return (
    <div className="app">
      <a className="skip-link" href="#editor">
        Skip to the invoice editor
      </a>

      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            N
          </span>
          <span className="brand__text">
            <span className="brand__name">Invoice Studio</span>
            <span className="brand__sub">Northwind Studio · USD</span>
          </span>
        </div>

        <SaveChip state={saveState} dirty={dirty} saved={Boolean(draft.id)} />

        <div className="topbar__spacer" />

        {/* On narrow screens the three secondary actions collapse to icons so
            that Save and Send — the ones people actually reach for — stay on
            screen without a horizontal swipe. aria-label keeps them named. */}
        <div className="topbar__actions">
          <button
            type="button"
            className="btn btn--ghost btn--collapse"
            onClick={openDrawer}
            aria-label="Saved invoices"
          >
            <IconFolder className="btn__icon" />
            <span className="btn__label">Saved</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--collapse"
            onClick={newInvoice}
            aria-label="New blank invoice"
          >
            <IconPlus className="btn__icon" />
            <span className="btn__label">New</span>
          </button>
          <button
            type="button"
            className="btn btn--collapse"
            onClick={print}
            aria-label="Print or save as PDF"
          >
            <IconPrint className="btn__icon" />
            <span className="btn__label">Print / PDF</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => save()}
            disabled={saveState === 'saving'}
          >
            <IconSave className="btn__icon" />
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn--accent" onClick={openSend}>
            <IconSend className="btn__icon" />
            Send
          </button>
        </div>
      </header>

      <nav className="viewtabs" aria-label="Switch between editor and preview">
        <div className="viewtabs__inner">
          <button type="button" aria-pressed={view === 'edit'} onClick={() => setView('edit')}>
            Edit
          </button>
          <button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>
            Preview · {formatUSD(totals.totalCents)}
          </button>
        </div>
      </nav>

      <main className="workspace" data-view={view}>
        {/* ------------------------------- editor ------------------------- */}
        <div className="editor-col" id="editor">
          <h1 className="visually-hidden">Invoice editor</h1>

          {revealErrors && errorList.length > 0 ? (
            <div className="card" style={{ borderColor: 'var(--danger)' }}>
              <div className="card__body">
                <p className="callout callout--error" role="alert">
                  <IconAlert />
                  <span>
                    <strong>
                      {errorList.length} {errorList.length === 1 ? 'issue' : 'issues'} to fix before
                      saving or sending:
                    </strong>
                    <ul className="callout__list">
                      {errorList.slice(0, 5).map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                      {errorList.length > 5 ? <li>…and {errorList.length - 5} more.</li> : null}
                    </ul>
                  </span>
                </p>
              </div>
            </div>
          ) : null}

          {/* --- invoice details --- */}
          <section className="card" aria-labelledby="details-heading">
            <header className="card__head">
              <h2 className="card__title" id="details-heading">
                Invoice details
              </h2>
              <span className="card__hint" style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn--sm btn--ghost" onClick={loadSample}>
                  Sample data
                </button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={loadSpecCheck}>
                  $99 check
                </button>
              </span>
            </header>
            <div className="card__body">
              <div className="grid grid--3">
                <TextField
                  id="invoiceNumber"
                  label="Invoice number"
                  value={draft.invoiceNumber}
                  onChange={(value) => patch({ invoiceNumber: value })}
                  error={shownErrors.invoiceNumber}
                  required
                  placeholder="INV-0001"
                />
                <TextField
                  id="issueDate"
                  label="Issue date"
                  type="date"
                  value={draft.issueDate}
                  onChange={(value) => patch({ issueDate: value })}
                  error={shownErrors.issueDate}
                  required
                />
                <TextField
                  id="dueDate"
                  label="Due date"
                  type="date"
                  value={draft.dueDate}
                  onChange={(value) => patch({ dueDate: value })}
                  error={shownErrors.dueDate}
                  required
                />
              </div>
            </div>
          </section>

          {/* --- parties --- */}
          <div className="grid grid--2" style={{ gap: 16 }}>
            <PartyCard
              heading="From — your business"
              prefix="business"
              party={draft.business}
              errors={shownErrors}
              onChange={(updates) => patchParty('business', updates)}
              namePlaceholder="Northwind Studio"
            />
            <PartyCard
              heading="Bill to — customer"
              prefix="customer"
              party={draft.customer}
              errors={shownErrors}
              onChange={(updates) => patchParty('customer', updates)}
              namePlaceholder="Harbourline Coffee Co."
              emailHint="Used as the default recipient when emailing."
            />
          </div>

          <LineItems
            items={draft.lineItems}
            lines={totals.lines}
            errors={shownErrors}
            onChange={patchItem}
            onAdd={addItem}
            onRemove={removeItem}
          />

          <Totals
            discount={draft.discount}
            taxRate={draft.taxRate}
            totals={totals}
            errors={shownErrors}
            onChange={patch}
          />

          <CustomFields
            fields={draft.customFields}
            errors={shownErrors}
            onChange={patchField}
            onAdd={addField}
            onRemove={removeField}
          />

          {/* --- notes --- */}
          <section className="card" aria-labelledby="notes-heading">
            <header className="card__head">
              <h2 className="card__title" id="notes-heading">
                Notes &amp; payment terms
              </h2>
            </header>
            <div className="card__body">
              <TextAreaField
                id="notes"
                label="Shown at the bottom of the invoice"
                value={draft.notes}
                onChange={(value) => patch({ notes: value })}
                rows={4}
                placeholder="Payment due within 14 days by ACH or wire."
              />
            </div>
          </section>
        </div>

        {/* ------------------------------ preview ------------------------- */}
        <div className="preview-col">
          <div className="preview-head">
            <span className="preview-head__title">Live preview</span>
            <span className="preview-head__spacer" />
            <span className="badge">
              {totals.lines.length} {totals.lines.length === 1 ? 'line' : 'lines'} ·{' '}
              {formatUSD(totals.totalCents)}
            </span>
          </div>
          <div className="paper-scroll">
            <InvoicePaper invoice={invoice} totals={totals} />
          </div>
        </div>
      </main>

      <SavedDrawer
        open={drawerOpen}
        invoices={savedList}
        loading={listLoading}
        currentId={draft.id}
        onClose={() => setDrawerOpen(false)}
        onOpenInvoice={openInvoice}
        onDelete={deleteInvoice}
      />

      <SendDialog
        open={sendOpen}
        invoice={invoice}
        totals={totals}
        mailStatus={mailStatus}
        sending={sending}
        error={sendError}
        onClose={() => setSendOpen(false)}
        onSend={handleSend}
      />

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function SaveChip({ state, dirty, saved }) {
  let label;
  let value;
  if (state === 'saving') {
    value = 'saving';
    label = 'Saving…';
  } else if (state === 'error') {
    value = 'error';
    label = 'Not saved';
  } else if (dirty || !saved) {
    value = 'dirty';
    label = saved ? 'Unsaved changes' : 'Not saved yet';
  } else {
    value = 'saved';
    label = 'Saved to database';
  }

  return (
    <span className="savechip" data-state={value}>
      <span className="savechip__dot" aria-hidden="true" />
      <span aria-live="polite">{label}</span>
    </span>
  );
}

function PartyCard({ heading, prefix, party, errors, onChange, namePlaceholder, emailHint }) {
  return (
    <section className="card" aria-labelledby={`${prefix}-heading`}>
      <header className="card__head">
        <h2 className="card__title" id={`${prefix}-heading`}>
          {heading}
        </h2>
      </header>
      <div className="card__body">
        <div className="grid">
          <TextField
            id={`${prefix}-name`}
            label="Name"
            value={party.name}
            onChange={(value) => onChange({ name: value })}
            error={errors[`${prefix}.name`]}
            required
            placeholder={namePlaceholder}
            autoComplete="organization"
          />
          <div className="grid grid--2">
            <TextField
              id={`${prefix}-email`}
              label="Email"
              type="email"
              value={party.email}
              onChange={(value) => onChange({ email: value })}
              error={errors[`${prefix}.email`]}
              hint={emailHint}
              optional={!emailHint}
              placeholder="name@example.com"
              autoComplete="email"
            />
            <TextField
              id={`${prefix}-phone`}
              label="Phone"
              type="tel"
              value={party.phone}
              onChange={(value) => onChange({ phone: value })}
              optional
              placeholder="+1 (555) 010-0100"
              autoComplete="tel"
            />
          </div>
          <Field id={`${prefix}-address`} label="Address" optional>
            {({ id, describedBy }) => (
              <textarea
                id={id}
                className="textarea"
                rows={2}
                value={party.address}
                onChange={(event) => onChange({ address: event.target.value })}
                aria-describedby={describedBy}
                placeholder={'Street\nCity, State ZIP'}
              />
            )}
          </Field>
        </div>
      </div>
    </section>
  );
}
