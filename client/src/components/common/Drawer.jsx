import { useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';

// Side panel dialog. side: 'right' (default, forms) or 'left' (navigation).
export default function Drawer({ open, onClose, title, children, side = 'right' }) {
  const ref = useDialog(open, onClose);
  const titleId = useId();
  const offscreen = side === 'left' ? '-100%' : '100%';
  const edge = side === 'left' ? 'left-0 border-r' : 'right-0 border-l';
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`absolute top-0 ${edge} h-full w-full max-w-sm bg-card border-border p-5 overflow-y-auto shadow-xl`}
            initial={{ x: offscreen }} animate={{ x: 0 }} exit={{ x: offscreen }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{
              paddingTop: 'max(1.25rem, env(safe-area-inset-top))',
              paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
            }}
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
