import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, Plus } from 'lucide-react';

// Detect iOS Safari (iPhone/iPad/iPod) — these don't support beforeinstallprompt.
const isIOS = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream;

// Detect if the app is already running in standalone / installed mode.
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true);

export default function InstallPrompt({ triggerRef }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Expose a handler to parent (App) so the Navbar's install button can open the prompt.
  useEffect(() => {
    if (triggerRef) {
      triggerRef.current = handleInstall;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerRef, deferredPrompt]);

  useEffect(() => {
    if (isStandalone()) return;

    const handler = (e) => {
      // Prevent the mini-infobar and capture the event to trigger later.
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS fallback: show the banner after a short delay so the UI is ready.
    if (isIOS()) {
      const t = setTimeout(() => setShowBanner(true), 1500);
      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
        clearTimeout(t);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      // Android / Desktop / Chrome — trigger the native install prompt.
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS()) {
      // iOS Safari — show the "Add to Home Screen" instructions modal.
      setShowIosModal(true);
    }
  };

  const close = () => {
    setShowBanner(false);
    setShowIosModal(false);
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      {showBanner && !dismissed && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          role="dialog"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-96 z-[500]"
        >
          <div className="glass-card bg-white/95 dark:bg-surface-darkCard p-4 shadow-2xl border border-gray-200 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 min-w-11 rounded-2xl bg-gradient-to-br from-primary-600 to-accent-violet flex items-center justify-center text-2xl shadow-glow">
                🚌
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 dark:text-gray-100 text-[15px]">Install Transtrack Kenya</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Get real-time bus tracking right on your home screen.
                </p>
                <button
                  onClick={handleInstall}
                  className="mt-3 w-full min-h-[48px] btn-primary inline-flex items-center justify-center gap-2"
                >
                  <Download size={18} />
                  Install App
                </button>
              </div>
              <button
                onClick={close}
                aria-label="Dismiss install prompt"
                className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {showIosModal && (
        <motion.div
          className="fixed inset-0 z-[600] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            role="dialog"
            aria-labelledby="ios-install-title"
            className="relative glass-card w-full max-w-sm p-6 bg-white dark:bg-surface-darkCard"
          >
            <button
              onClick={close}
              aria-label="Close"
              className="absolute top-4 right-4 min-w-11 min-h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-600 to-accent-violet flex items-center justify-center text-3xl shadow-glow mb-4">
              🚌
            </div>
            <h2 id="ios-install-title" className="text-lg font-bold text-gray-800 dark:text-gray-100">
              Add Transtrack Kenya to your home screen
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              For the best experience, install the app on your iPhone or iPad:
            </p>

            <ol className="mt-4 flex flex-col gap-3 text-sm">
              <li className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <span className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400">
                  <Share size={20} />
                </span>
                Tap the <strong>Share</strong> button
              </li>
              <li className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <span className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400">
                  <Plus size={20} />
                </span>
                Tap <strong>Add to Home Screen</strong>
              </li>
            </ol>

            <button onClick={close} className="mt-6 w-full min-h-[48px] btn-primary">
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
