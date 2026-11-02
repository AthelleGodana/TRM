import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, CircleCheck, Info, Siren, TriangleAlert, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const STYLES = {
  success: { Icon: CircleCheck, tone: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  error: { Icon: CircleAlert, tone: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' },
  warning: { Icon: TriangleAlert, tone: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  info: { Icon: Info, tone: 'text-primary-600 dark:text-primary-400', bar: 'bg-primary-500' },
  emergency: { Icon: Siren, tone: 'text-red-600 dark:text-red-400', bar: 'bg-red-600' },
};

// Errors and emergencies interrupt (role=alert); everything else is polite.
const URGENT = new Set(['error', 'emergency']);

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      className="fixed left-4 right-4 sm:left-auto sm:w-96 z-[100] flex flex-col gap-2 pointer-events-none"
      style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const s = STYLES[t.type] || STYLES.info;
          return (
            <motion.div
              key={t.id}
              layout
              role={URGENT.has(t.type) ? 'alert' : 'status'}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="pointer-events-auto glass-card shadow-lg p-3.5 flex items-start gap-3 overflow-hidden relative"
            >
              <s.Icon size={20} className={`shrink-0 mt-0.5 ${s.tone}`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                {t.title && <p className="text-sm font-semibold text-foreground">{t.title}</p>}
                <p className="text-sm text-muted-foreground">{t.message}</p>
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="icon-btn -m-2 shrink-0" aria-label="Dismiss notification">
                <X size={18} aria-hidden="true" />
              </button>
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: t.type === 'emergency' ? 8 : 4, ease: 'linear' }}
                className={`absolute bottom-0 left-0 h-0.5 w-full origin-left ${s.bar}`}
                aria-hidden="true"
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
