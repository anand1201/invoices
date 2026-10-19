/**
 * Inline SVG icons.
 *
 * Inline rather than an icon package: there are nine of them, they inherit
 * `currentColor`, and they cost nothing at install time. All are
 * `aria-hidden` — the accessible name always comes from the button's own label
 * or `aria-label`, never from the glyph.
 */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export const IconPlus = (p) => (
  <svg {...base} {...p}>
    <path d="M8 3.2v9.6M3.2 8h9.6" />
  </svg>
);

export const IconTrash = (p) => (
  <svg {...base} {...p}>
    <path d="M2.8 4.6h10.4M6.2 4.6V3.2h3.6v1.4M4.4 4.6l.6 8.2h6l.6-8.2M6.6 7v3.4M9.4 7v3.4" />
  </svg>
);

export const IconEye = (p) => (
  <svg {...base} {...p}>
    <path d="M1.4 8S3.7 3.6 8 3.6 14.6 8 14.6 8 12.3 12.4 8 12.4 1.4 8 1.4 8Z" />
    <circle cx="8" cy="8" r="1.9" />
  </svg>
);

export const IconEyeOff = (p) => (
  <svg {...base} {...p}>
    <path d="M6.3 3.9A6.4 6.4 0 0 1 8 3.6C12.3 3.6 14.6 8 14.6 8a11 11 0 0 1-1.9 2.4M4 4.6A11.2 11.2 0 0 0 1.4 8S3.7 12.4 8 12.4c.9 0 1.7-.2 2.4-.5M2 2l12 12M6.8 6.9a1.9 1.9 0 0 0 2.5 2.6" />
  </svg>
);

export const IconSave = (p) => (
  <svg {...base} {...p}>
    <path d="M3 2.6h7.2L13.4 5.8V13a.4.4 0 0 1-.4.4H3a.4.4 0 0 1-.4-.4V3a.4.4 0 0 1 .4-.4Z" />
    <path d="M5.4 2.6v3.6h5V3.4M5.4 13.4v-3.6h5.2v3.6" />
  </svg>
);

export const IconSend = (p) => (
  <svg {...base} {...p}>
    <path d="M14.2 1.8 7.4 8.6M14.2 1.8 9.9 14.2 7.4 8.6 1.8 6.1Z" />
  </svg>
);

export const IconPrint = (p) => (
  <svg {...base} {...p}>
    <path d="M4.4 6V2.6h7.2V6M4.4 11.6H3a.4.4 0 0 1-.4-.4V6.4A.4.4 0 0 1 3 6h10a.4.4 0 0 1 .4.4v4.8a.4.4 0 0 1-.4.4h-1.4" />
    <path d="M4.4 9.8h7.2v3.6H4.4z" />
  </svg>
);

export const IconFolder = (p) => (
  <svg {...base} {...p}>
    <path d="M1.9 4.2a.6.6 0 0 1 .6-.6h3.1l1.3 1.6h6.6a.6.6 0 0 1 .6.6v6.4a.6.6 0 0 1-.6.6H2.5a.6.6 0 0 1-.6-.6Z" />
  </svg>
);

export const IconFile = (p) => (
  <svg {...base} {...p}>
    <path d="M9.2 2.6H4a.4.4 0 0 0-.4.4v10a.4.4 0 0 0 .4.4h8a.4.4 0 0 0 .4-.4V5.8Z" />
    <path d="M9.2 2.6v3.2h3.2M5.8 8.8h4.4M5.8 11h3" />
  </svg>
);

export const IconClose = (p) => (
  <svg {...base} {...p}>
    <path d="M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8" />
  </svg>
);

export const IconAlert = (p) => (
  <svg {...base} width="13" height="13" viewBox="0 0 16 16" {...p}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 5.2v3.4M8 10.8h.01" />
  </svg>
);

export const IconCheck = (p) => (
  <svg {...base} {...p}>
    <path d="M3 8.6l3.4 3.2L13 4.4" />
  </svg>
);
