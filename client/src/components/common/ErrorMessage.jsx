import { motion, AnimatePresence } from 'framer-motion';

export default function ErrorMessage({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm px-3.5 py-2.5 rounded-xl mb-3 overflow-hidden"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
