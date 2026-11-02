import { useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';

// Centred dialog on larger screens, bottom sheet on phones.
export default function Modal({ open, onClose, title, children }) {
  const ref = useDialog(open, onClose);
  const titleId = useId();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative glass-card w-full sm:max-w-md max-h-[90dvh] overflow-y-auto p-5 rounded-b-none sm:rounded-xl shadow-xl"
            initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 id={titleId} className="section-title">{title}</h2>
              <button type="button" onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
