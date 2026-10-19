/**
 * Server-rendered invoice email.
 *
 * Built as a table-based, inline-styled HTML document because that is what mail
 * clients actually render (Outlook has no flexbox, Gmail strips <style> blocks
 * in some views). Every value is HTML-escaped: invoice text is user input, and
 * it is about to be injected into a document we send to a third party.
 *
 * A plain-text alternative is generated from the same data so the message has a
 * real `text/plain` part and does not look like spam.
 */

import { formatUSD, quantityMilliToInput } from '@invoice/shared';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Escape, then turn newlines into <br> so pasted addresses keep their shape. */
const escMultiline = (value) => esc(value).replace(/\r?\n/g, '<br>');

const prettyDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return esc(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const INK = '#1b1b1f';
const MUTED = '#6b6b76';
const RULE = '#e3e3e8';
const ACCENT = '#2f3bc4';

export function buildSubject(invoice, totals) {
  return `Invoice ${invoice.invoiceNumber} from ${invoice.business.name} — ${formatUSD(
    totals.totalCents,
  )}`;
}

export function renderInvoiceText(invoice, totals, message) {
  const lines = [];
  if (message) lines.push(message, '');
  lines.push(`INVOICE ${invoice.invoiceNumber}`);
  lines.push(`From: ${invoice.business.name}`);
  lines.push(`To:   ${invoice.customer.name}`);
  lines.push(`Issued: ${prettyDate(invoice.issueDate)}   Due: ${prettyDate(invoice.dueDate)}`);
  lines.push('');

  for (const field of invoice.customFields.filter((f) => f.visible)) {
    lines.push(`${field.label}: ${field.value}`);
  }
  if (invoice.customFields.some((f) => f.visible)) lines.push('');

  lines.push('ITEMS');
  for (const line of totals.lines) {
    lines.push(
      `- ${line.description} — ${quantityMilliToInput(line.quantityMilli)} x ${formatUSD(
        line.unitPriceCents,
      )} = ${formatUSD(line.amountCents)}`,
    );
  }
  lines.push('');
  lines.push(`Subtotal: ${formatUSD(totals.subtotalCents)}`);
  if (totals.discountCents > 0) lines.push(`Discount: -${formatUSD(totals.discountCents)}`);
  if (totals.taxRateMilli > 0) {
    lines.push(`Tax (${totals.taxRateMilli / 1000}%): ${formatUSD(totals.taxCents)}`);
  }
  lines.push(`TOTAL DUE: ${formatUSD(totals.totalCents)}`);

  if (invoice.notes) {
    lines.push('', 'NOTES', invoice.notes);
  }
  return lines.join('\n');
}

export function renderInvoiceHtml(invoice, totals, message) {
  const visibleFields = invoice.customFields.filter((field) => field.visible);

  const metaRow = (label, value) => `
    <tr>
      <td style="padding:2px 16px 2px 0;font:400 12px/1.5 Helvetica,Arial,sans-serif;color:${MUTED};white-space:nowrap;">${esc(label)}</td>
      <td style="padding:2px 0;font:500 13px/1.5 Helvetica,Arial,sans-serif;color:${INK};">${escMultiline(value)}</td>
    </tr>`;

  const itemRows = totals.lines
    .map(
      (line, index) => `
    <tr style="background:${index % 2 ? '#fafafc' : '#ffffff'};">
      <td style="padding:10px 12px;font:400 13px/1.45 Helvetica,Arial,sans-serif;color:${INK};border-bottom:1px solid ${RULE};">${escMultiline(line.description)}</td>
      <td align="right" style="padding:10px 12px;font:400 13px/1.45 Helvetica,Arial,sans-serif;color:${MUTED};border-bottom:1px solid ${RULE};white-space:nowrap;">${esc(quantityMilliToInput(line.quantityMilli))}</td>
      <td align="right" style="padding:10px 12px;font:400 13px/1.45 Helvetica,Arial,sans-serif;color:${MUTED};border-bottom:1px solid ${RULE};white-space:nowrap;">${esc(formatUSD(line.unitPriceCents))}</td>
      <td align="right" style="padding:10px 12px;font:600 13px/1.45 Helvetica,Arial,sans-serif;color:${INK};border-bottom:1px solid ${RULE};white-space:nowrap;">${esc(formatUSD(line.amountCents))}</td>
    </tr>`,
    )
    .join('');

  const totalRow = (label, value, strong = false) => `
    <tr>
      <td style="padding:${strong ? '12px' : '5px'} 12px 5px 0;font:${strong ? '600' : '400'} ${strong ? '14px' : '13px'}/1.4 Helvetica,Arial,sans-serif;color:${strong ? INK : MUTED};${strong ? `border-top:2px solid ${INK};` : ''}">${esc(label)}</td>
      <td align="right" style="padding:${strong ? '12px' : '5px'} 0 5px 12px;font:${strong ? '700' : '500'} ${strong ? '18px' : '13px'}/1.4 Helvetica,Arial,sans-serif;color:${strong ? ACCENT : INK};white-space:nowrap;${strong ? `border-top:2px solid ${INK};` : ''}">${esc(value)}</td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(`Invoice ${invoice.invoiceNumber}`)}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f1f1f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><td align="center">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;border-collapse:collapse;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

    <tr><td style="padding:28px 32px 20px;border-bottom:1px solid ${RULE};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="font:700 17px/1.3 Helvetica,Arial,sans-serif;color:${INK};">${esc(invoice.business.name)}</td>
          <td align="right" style="font:600 11px/1.3 Helvetica,Arial,sans-serif;color:${MUTED};letter-spacing:.14em;text-transform:uppercase;">Invoice</td>
        </tr>
        <tr>
          <td style="padding-top:4px;font:400 12px/1.5 Helvetica,Arial,sans-serif;color:${MUTED};">${escMultiline(invoice.business.address)}</td>
          <td align="right" style="padding-top:4px;font:600 15px/1.3 Helvetica,Arial,sans-serif;color:${INK};">${esc(invoice.invoiceNumber)}</td>
        </tr>
      </table>
    </td></tr>

    ${
      message
        ? `<tr><td style="padding:18px 32px;background:#f7f7fb;border-bottom:1px solid ${RULE};font:400 14px/1.6 Helvetica,Arial,sans-serif;color:${INK};">${escMultiline(message)}</td></tr>`
        : ''
    }

    <tr><td style="padding:24px 32px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td valign="top" width="50%" style="padding-right:16px;">
            <div style="font:600 10px/1.4 Helvetica,Arial,sans-serif;color:${MUTED};letter-spacing:.14em;text-transform:uppercase;padding-bottom:6px;">Billed to</div>
            <div style="font:600 14px/1.5 Helvetica,Arial,sans-serif;color:${INK};">${esc(invoice.customer.name)}</div>
            <div style="font:400 12px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">${escMultiline(invoice.customer.address)}</div>
            ${invoice.customer.email ? `<div style="font:400 12px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">${esc(invoice.customer.email)}</div>` : ''}
          </td>
          <td valign="top" width="50%">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${metaRow('Issued', prettyDate(invoice.issueDate))}
              ${metaRow('Due', prettyDate(invoice.dueDate))}
              ${visibleFields.map((f) => metaRow(f.label, f.value)).join('')}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding:16px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr>
            <th align="left" style="padding:0 12px 8px;font:600 10px/1.4 Helvetica,Arial,sans-serif;color:${MUTED};letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid ${INK};">Description</th>
            <th align="right" style="padding:0 12px 8px;font:600 10px/1.4 Helvetica,Arial,sans-serif;color:${MUTED};letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid ${INK};">Qty</th>
            <th align="right" style="padding:0 12px 8px;font:600 10px/1.4 Helvetica,Arial,sans-serif;color:${MUTED};letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid ${INK};">Rate</th>
            <th align="right" style="padding:0 12px 8px;font:600 10px/1.4 Helvetica,Arial,sans-serif;color:${MUTED};letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid ${INK};">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </td></tr>

    <tr><td style="padding:18px 32px 28px;">
      <table role="presentation" align="right" cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:260px;">
        ${totalRow('Subtotal', formatUSD(totals.subtotalCents))}
        ${totals.discountCents > 0 ? totalRow('Discount', `-${formatUSD(totals.discountCents)}`) : ''}
        ${totals.taxRateMilli > 0 ? totalRow(`Tax (${totals.taxRateMilli / 1000}%)`, formatUSD(totals.taxCents)) : ''}
        ${totalRow('Total due', formatUSD(totals.totalCents), true)}
      </table>
    </td></tr>

    ${
      invoice.notes
        ? `<tr><td style="padding:20px 32px;border-top:1px solid ${RULE};background:#fafafc;">
             <div style="font:600 10px/1.4 Helvetica,Arial,sans-serif;color:${MUTED};letter-spacing:.14em;text-transform:uppercase;padding-bottom:6px;">Notes</div>
             <div style="font:400 13px/1.65 Helvetica,Arial,sans-serif;color:${INK};">${escMultiline(invoice.notes)}</div>
           </td></tr>`
        : ''
    }

    <tr><td style="padding:16px 32px 22px;border-top:1px solid ${RULE};font:400 11px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
      Questions about this invoice? Reply to this email${invoice.business.email ? ` or write to ${esc(invoice.business.email)}` : ''}.
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}
