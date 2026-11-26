import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDialog } from '../../hooks/useDialog';
import { BusFront, Download, Plus, Share, X } from 'lucide-react';

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
  // Focus trap, Escape, scroll lock and focus return for the iOS steps.
  const iosRef = useDialog(showIosModal, close);

  return (
    <AnimatePresence>
      {showBanner && !dismissed && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          role="region"
          aria-labelledby="install-banner-title"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-96 z-[500]"
        >
          <div className="glass-card p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 shrink-0 rounded-lg bg-primary-600 text-white flex items-center justify-center" aria-hidden="true">
                <BusFront size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="install-banner-title" className="font-semibold text-gray-800 dark:text-gray-100 text-[15px]">Install Transtrack Kenya</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Get real-time bus tracking right on your home screen.
                </p>
                <button
                  type="button"
                  onClick={handleInstall}
                  className="mt-3 w-full min-h-[48px] btn-primary inline-flex items-center justify-center gap-2"
                >
                  <Download size={18} aria-hidden="true" />
                  Install App
                </button>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Dismiss install prompt"
                className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
              >
                <X size={20} aria-hidden="true" />
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
            ref={iosRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            tabIndex={-1}
            className="relative glass-card w-full max-w-sm p-6 bg-white dark:bg-surface-darkCard"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute top-4 right-4 icon-btn"
            >
              <X size={20} aria-hidden="true" />
            </button>

            <div className="w-12 h-12 rounded-lg bg-primary-600 text-white flex items-center justify-center mb-4" aria-hidden="true">
              <BusFront size={24} />
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
                  <Share size={20} aria-hidden="true" />
                </span>
                Tap the <strong>Share</strong> button
              </li>
              <li className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <span className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400">
                  <Plus size={20} aria-hidden="true" />
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
