/**
 * Toast notifications.
 *
 * The container is a polite live region, so success and failure messages are
 * announced to assistive tech rather than only being visible. Errors are not
 * auto-dismissed — if a send failed, the reason should stay on screen until the
 * user dismisses it.
 */

import { useCallback, useRef, useState } from 'react';

import { IconClose } from './icons.jsx';

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    ({ kind = 'info', title, body, link, linkLabel, duration }) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { id, kind, title, body, link, linkLabel }]);

      const ms = duration ?? (kind === 'error' ? 0 : 5000);
      if (ms > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ms),
        );
      }
      return id;
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}

export function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id} data-kind={toast.kind}>
          <div className="toast__body">
            {toast.title ? <div className="toast__title">{toast.title}</div> : null}
            {toast.body ? <div>{toast.body}</div> : null}
            {toast.link ? (
              <div style={{ marginTop: 4 }}>
                <a href={toast.link} target="_blank" rel="noreferrer noopener">
                  {toast.linkLabel || 'Open link'}
                </a>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            <IconClose width="14" height="14" />
          </button>
        </div>
      ))}
    </div>
  );
}
