import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '../../context/ToastContext';

const STYLES = {
  success: { bar: 'bg-emerald-500', icon: '✅', ring: 'ring-emerald-500/30' },
  error: { bar: 'bg-rose-500', icon: '❌', ring: 'ring-rose-500/30' },
  warning: { bar: 'bg-amber-500', icon: '⚠️', ring: 'ring-amber-500/30' },
  info: { bar: 'bg-primary-500', icon: '💡', ring: 'ring-primary-500/30' },
  emergency: { bar: 'bg-rose-600', icon: '🚨', ring: 'ring-rose-600/40' },
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const s = STYLES[t.type] || STYLES.info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`pointer-events-auto glass-card p-4 shadow-xl ring-1 ${s.ring} flex items-start gap-3 overflow-hidden relative`}
            >
              <span className="text-xl leading-none mt-0.5">{s.icon}</span>
              <div className="flex-1 min-w-0">
                {t.title && (
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 tracking-wide uppercase">{t.title}</p>
                )}
                <p className="text-sm text-gray-700 dark:text-gray-200">{t.message}</p>
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-white text-lg leading-none"
                aria-label="Dismiss"
              >
                ✕
              </button>
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: t.type === 'emergency' ? 8 : 4, ease: 'linear' }}
                className={`absolute bottom-0 left-0 h-0.5 w-full origin-left ${s.bar}`}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
