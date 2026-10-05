import { motion, AnimatePresence } from 'framer-motion';

export default function SuccessMessage({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm px-3.5 py-2.5 rounded-xl mb-3 overflow-hidden"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
