import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisPromise = null;

function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in.')); };
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

// An installed iOS PWA cannot complete a popup that opens in Safari, so it
// uses Google's redirect mode; the server finishes the sign-in and sends
// the user back into the app. Everywhere else (browsers, Android PWAs,
// desktop installs) the popup flow keeps the user on the page.
function useRedirectMode() {
  const standalone = window.navigator.standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches;
  const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  return standalone && ios;
}

// "Sign in with Google" button from Google Identity Services. Calls
// onCredential(idToken) in popup mode; in redirect mode Google posts the
// credential straight to /api/auth/google/redirect.
export default function GoogleSignInButton({ clientId, onCredential, onError }) {
  const container = useRef(null);
  const callbackRef = useRef(onCredential);
  const { theme } = useTheme();
  const redirect = useRedirectMode();
  const [failed, setFailed] = useState(false);
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !container.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => callbackRef.current(response.credential),
          ux_mode: redirect ? 'redirect' : 'popup',
          login_uri: `${window.location.origin}/api/auth/google/redirect`,
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          use_fedcm_for_prompt: true,
        });
        window.google.accounts.id.renderButton(container.current, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: Math.min(container.current.offsetWidth || 320, 400),
        });
      })
      .catch((err) => { setFailed(true); onError?.(err.message); });
    return () => { cancelled = true; };
  }, [clientId, theme, redirect, onError]);

  if (!clientId) {
    return <p className="text-sm text-center text-amber-600">Google sign-in is not configured (GOOGLE_CLIENT_ID).</p>;
  }
  return (
    <div>
      <div ref={container} className="flex justify-center min-h-[44px]" />
      {failed && <p className="text-xs text-center text-gray-400 mt-2">Check your connection and reload to try again.</p>}
    </div>
  );
}
