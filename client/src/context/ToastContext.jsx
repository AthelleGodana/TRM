import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);
let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, opts = {}) => {
      const id = ++toastId;
      const { type = 'info', duration = 4000, title } = opts;
      setToasts((prev) => [...prev, { id, message, type, title }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  const toast = useCallback(
    (message, opts) => push(message, opts),
    [push]
  );

  toast.success = (message, opts) => push(message, { ...opts, type: 'success' });
  toast.error = (message, opts) => push(message, { ...opts, type: 'error' });
  toast.info = (message, opts) => push(message, { ...opts, type: 'info' });
  toast.warning = (message, opts) => push(message, { ...opts, type: 'warning' });
  toast.emergency = (message, opts) => push(message, { ...opts, type: 'emergency', duration: 8000 });

return (
    <ToastContext.Provider value={{ toast, toasts, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
