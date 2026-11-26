import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), '
  + 'textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Dialog behaviour shared by Modal and Drawer: Escape closes, focus moves
// into the dialog when it opens, Tab stays inside it, and focus returns to
// whatever was focused before.
export function useDialog(open, onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const focusables = () => [...(ref.current?.querySelectorAll(FOCUSABLE) || [])];
    (focusables()[0] || ref.current)?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const dialog = ref.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      // Return focus only if it is still in the dialog (or nowhere). If
      // something else moved it on purpose, e.g. to <main> after a menu
      // link navigated, leave it there.
      const active = document.activeElement;
      if (!active || active === document.body || dialog?.contains(active)) previous?.focus?.();
    };
  }, [open]);

  return ref;
}
