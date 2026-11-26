import { useEffect, useRef } from 'react';
import { useToast } from '../../context/ToastContext';

// Last line of defence: an unexpected error outside React rendering (a
// failed promise nobody handled, a script error) shows a toast instead of
// failing silently. Repeats of the same message within 10 s are dropped.
export default function GlobalErrorToasts() {
  const { toast } = useToast();
  const last = useRef({ message: '', at: 0 });

  useEffect(() => {
    const show = (raw) => {
      // Requests that failed already show their own message, and a 401 is
      // handled by the session refresh.
      if (raw?.isAxiosError || raw?.name === 'CanceledError' || raw?.name === 'AbortError') return;
      const message = 'Something went wrong. If it keeps happening, reload the page.';
      const now = Date.now();
      if (last.current.message === message && now - last.current.at < 10_000) return;
      last.current = { message, at: now };
      toast.error(message);
    };
    const onRejection = (e) => show(e.reason);
    // Errors from cross-origin scripts arrive without detail; ignore them.
    const onError = (e) => { if (e.error) show(e.error); };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [toast]);

  return null;
}
