import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);
let toastId = 0;

// Errors and emergencies stay until dismissed; others close after
// `duration` ms (the timer pauses while hovered or focused, see
// ToastContainer).
const STICKY = new Set(['error', 'emergency']);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, opts = {}) => {
    const id = ++toastId;
    const { type = 'info', title } = opts;
    const duration = opts.duration ?? (STICKY.has(type) ? null : 5000);
    setToasts((prev) => [...prev.slice(-4), { id, message, type, title, duration }]);
    return id;
  }, []);

  const toast = useMemo(() => {
    const fn = (message, opts) => push(message, opts);
    fn.success = (message, opts) => push(message, { ...opts, type: 'success' });
    fn.error = (message, opts) => push(message, { ...opts, type: 'error' });
    fn.info = (message, opts) => push(message, { ...opts, type: 'info' });
    fn.warning = (message, opts) => push(message, { ...opts, type: 'warning' });
    fn.emergency = (message, opts) => push(message, { ...opts, type: 'emergency' });
    return fn;
  }, [push]);

  const value = useMemo(() => ({ toast, toasts, dismiss }), [toast, toasts, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
