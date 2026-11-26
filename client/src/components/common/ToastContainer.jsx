import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, CircleCheck, Info, Siren, TriangleAlert, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const STYLES = {
  success: { Icon: CircleCheck, tone: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-600' },
  error: { Icon: CircleAlert, tone: 'text-red-700 dark:text-red-400', bar: 'bg-red-600' },
  warning: { Icon: TriangleAlert, tone: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-600' },
  info: { Icon: Info, tone: 'text-primary-700 dark:text-primary-400', bar: 'bg-primary-600' },
  emergency: { Icon: Siren, tone: 'text-red-700 dark:text-red-400', bar: 'bg-red-600' },
};

// Errors and emergencies interrupt; everything else is announced politely.
const URGENT = new Set(['error', 'emergency']);

// Screen readers only announce changes inside live regions that already
// exist, so both regions are rendered from the start and receive the text
// of each new toast. The visible toasts themselves are not live regions.
function Announcer({ toasts }) {
  const [polite, setPolite] = useState('');
  const [urgent, setUrgent] = useState('');
  const seen = useRef(0);
  useEffect(() => {
    const fresh = toasts.filter((t) => t.id > seen.current);
    if (!fresh.length) return;
    seen.current = Math.max(...fresh.map((t) => t.id));
    const text = (t) => [t.title, t.message].filter(Boolean).join('. ');
    const u = fresh.filter((t) => URGENT.has(t.type)).map(text).join(' ');
    const p = fresh.filter((t) => !URGENT.has(t.type)).map(text).join(' ');
    if (u) setUrgent(u);
    if (p) setPolite(p);
  }, [toasts]);
  return (
    <>
      <div role="alert" aria-atomic="true" className="sr-only">{urgent}</div>
      <div role="status" aria-atomic="true" className="sr-only">{polite}</div>
    </>
  );
}

function Toast({ t, onDismiss }) {
  const s = STYLES[t.type] || STYLES.info;
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration);
  const startedAt = useRef(Date.now());

  // Auto-close, pausing while the pointer or keyboard focus is on the toast
  // so it can be read and acted on.
  useEffect(() => {
    if (t.duration == null) return undefined;
    if (paused) return undefined;
    startedAt.current = Date.now();
    const timer = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, t.duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto glass-card shadow-lg p-3.5 flex items-start gap-3 overflow-hidden relative"
    >
      <s.Icon size={20} className={`shrink-0 mt-0.5 ${s.tone}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {t.title && <p className="text-sm font-semibold text-foreground">{t.title}</p>}
        <p className="text-sm text-muted-foreground">{t.message}</p>
      </div>
      <button type="button" onClick={onDismiss} className="icon-btn -m-2 shrink-0" aria-label="Dismiss notification">
        <X size={18} aria-hidden="true" />
      </button>
      {t.duration != null && (
        <div
          className={`absolute bottom-0 left-0 h-0.5 w-full origin-left ${s.bar} toast-progress`}
          style={{ animationDuration: `${t.duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
          aria-hidden="true"
        />
      )}
    </motion.div>
  );
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();
  return (
    <>
      <Announcer toasts={toasts} />
      <div
        className="fixed left-4 right-4 sm:left-auto sm:w-96 z-[100] flex flex-col gap-2 pointer-events-none"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => <Toast key={t.id} t={t} onDismiss={() => dismiss(t.id)} />)}
        </AnimatePresence>
      </div>
    </>
  );
}
