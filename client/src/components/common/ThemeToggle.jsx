import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      className="relative w-12 h-7 rounded-full glass flex items-center px-1 transition-colors"
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="w-5 h-5 rounded-full bg-gradient-to-br from-primary-500 to-accent-violet flex items-center justify-center text-[10px]"
        style={{ marginLeft: isDark ? '18px' : '0px' }}
      >
        {isDark ? '🌙' : '☀️'}
      </motion.div>
    </button>
  );
}
