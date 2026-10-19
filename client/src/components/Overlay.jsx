/**
 * Shared overlay behaviour for the drawer and the dialog.
 *
 * Both need the same four things to be keyboard-usable, so it lives in one
 * hook instead of twice:
 *   - Escape closes
 *   - focus moves into the overlay on open and returns to the trigger on close
 *   - Tab is trapped inside while it is open
 *   - the backdrop is click-to-close but is not itself a tab stop
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useOverlay(open, onClose) {
  const containerRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    returnFocusRef.current = document.activeElement;

    const container = containerRef.current;
    const first = container?.querySelector(FOCUSABLE);
    (first ?? container)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !container) return;

      const stops = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (stops.length === 0) return;

      const firstStop = stops[0];
      const lastStop = stops[stops.length - 1];
      if (event.shiftKey && document.activeElement === firstStop) {
        event.preventDefault();
        lastStop.focus();
      } else if (!event.shiftKey && document.activeElement === lastStop) {
        event.preventDefault();
        firstStop.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // Put the caret back where the user left it.
      if (returnFocusRef.current instanceof HTMLElement) returnFocusRef.current.focus();
    };
  }, [open, onClose]);

  return containerRef;
}

export function Scrim({ onClose }) {
  return <div className="scrim" onClick={onClose} aria-hidden="true" />;
}
