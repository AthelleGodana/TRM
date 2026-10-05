import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LogOut, Download } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function Navbar({ title, onInstall }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Determine the role home path for the back button fallback.
  const homePath = user ? `/${user.role}` : '/';

  const handleBack = () => {
    // If there's browser history, go back; otherwise go to the role home.
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(homePath);
    }
  };

  // Show the back button only on nested (non-home) pages.
  const isHome = location.pathname === homePath;

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-40 glass px-4 py-3 flex items-center justify-between rounded-none border-x-0 border-t-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        {!isHome && (
          <button
            onClick={handleBack}
            aria-label="Go back"
            className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-gray-900/5 dark:bg-white/10 hover:bg-gray-900/10 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-10 h-10 min-w-10 rounded-xl bg-gradient-to-br from-primary-600 to-accent-violet flex items-center justify-center text-xl shadow-glow">
            🚌
          </span>
          <span className="font-bold text-gray-800 dark:text-gray-100 tracking-tight text-[17px] leading-tight truncate">
            Transtrack Kenya
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        {onInstall && (
          <button
            onClick={onInstall}
            aria-label="Install app"
            title="Install app"
            className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:text-primary-400 hover:bg-primary-600/20 transition-colors"
          >
            <Download size={20} />
          </button>
        )}
        {user && (
          <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">
            {user.firstName} {user.lastName}
          </span>
        )}
        <button
          onClick={handleLogout}
          aria-label="Logout"
          className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-gray-900/5 dark:bg-white/10 hover:bg-gray-900/10 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 transition-colors"
        >
          <LogOut size={20} />
        </button>
      </div>
    </motion.nav>
  );
}
