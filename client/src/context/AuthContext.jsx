import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { refreshSession, setSessionExpiredHandler } from '../services/api';
import { setAccessToken } from '../services/tokenStore';
import {
  signInWithGoogle as googleSignIn, logoutSession, switchOrganization as switchOrg, loginUser, fetchMe,
  devLoginRequest,
} from '../services/auth.service';

const AuthContext = createContext(null);

// Holds the current session as described by the server: the user, their
// role in the active organisation, that organisation's feature flags and
// role labels, and the organisations they can switch to.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // True when the session ended by itself (refresh failed), so the sign-in
  // page can say so instead of appearing out of nowhere.
  const [expired, setExpired] = useState(false);

  const applySession = useCallback((data) => {
    setAccessToken(data.accessToken);
    setSession(data.session);
    setExpired(false);
    return data.session;
  }, []);

  // Restore the session from the refresh cookie on start-up.
  const restore = useCallback(() =>
    refreshSession()
      .then((data) => { setSession(data.session); return data.session; })
      .catch(() => { setSession(null); return null; }), []);

  useEffect(() => {
    setSessionExpiredHandler(() => { setExpired(true); setSession(null); });
    restore().finally(() => setLoading(false));
  }, [restore]);

  // Returns the server outcome so the sign-in page can route onboarding
  // and pending-organisation cases.
  const signInWithGoogle = async (credential) => {
    const result = await googleSignIn(credential);
    if (result.status === 'ACTIVE') applySession(result);
    return result;
  };

  // Development-only demo login; same outcome shape as Google sign-in.
  const devLogin = async (email) => {
    const result = await devLoginRequest(email);
    if (result.status === 'ACTIVE') applySession(result);
    return result;
  };

  const switchOrganization = async (organizationId) => applySession(await switchOrg(organizationId));

  const logout = async () => {
    try {
      await logoutSession();
    } finally {
      setAccessToken(null);
      setSession(null);
      // Older app versions cached API responses; drop them on sign-out.
      window.caches?.delete('tms-routes-cache').catch(() => {});
    }
  };

  // Legacy password login (transition only); it returns a bare token.
  const loginWithPassword = async (username, password) => {
    const data = await loginUser({ username, password });
    setAccessToken(data.token);
    const me = await fetchMe();
    setSession(me.session);
    return me.session;
  };

  // Shape kept compatible with existing components (user.role, names).
  const user = session && { ...session.user, role: session.role };

  return (
    <AuthContext.Provider value={{
      session, user, loading, expired, signInWithGoogle, devLogin, switchOrganization, logout, restore, loginWithPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
