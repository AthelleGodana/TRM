import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ErrorMessage from '../components/common/ErrorMessage';
import ThemeToggle from '../components/common/ThemeToggle';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import Brand from '../components/layout/Brand';
import { getAuthConfig, getDevAccounts } from '../services/auth.service';
import { homeForRole } from '../config/roles';

// Errors the server can hand back after a redirect-mode sign-in.
const REDIRECT_ERRORS = {
  ORG_PENDING: 'Your organisation is awaiting approval by the Transtrack team. You can sign in once it is approved.',
  ORG_SUSPENDED: 'Your organisation has been suspended. Contact your administrator.',
  GOOGLE: 'Google sign-in failed. Please try again.',
  CSRF: 'Your sign-in could not be verified. Please try again.',
};

function LegacyPasswordForm({ onSignedIn, onError }) {
  const { loginWithPassword } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      onSignedIn(await loginWithPassword(form.username, form.password));
    } catch (err) {
      onError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4 text-left">
      <div>
        <label htmlFor="legacy-username" className="field-label">Username</label>
        <input id="legacy-username" name="username" required autoComplete="username" className="input-field"
          value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      </div>
      <div>
        <label htmlFor="legacy-password" className="field-label">Password</label>
        <input id="legacy-password" name="password" type="password" required autoComplete="current-password" className="input-field"
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </div>
      <button type="submit" disabled={submitting} className="btn-secondary">
        {submitting ? 'Signing in...' : 'Sign in with username'}
      </button>
    </form>
  );
}

// Signed in with Google but no organisation session yet (see Onboarding).
const ONBOARDING_STATUSES = ['NEEDS_ONBOARDING', 'ACCESS_PENDING', 'ACCESS_REJECTED'];

const ROLE_NAMES = {
  ORG_ADMIN: 'Organisation admin', FLEET_MANAGER: 'Transport officer', DRIVER: 'Driver', STUDENT: 'Student', PARENT: 'Parent',
};

// Development-only list of seeded demo users (shown when DEV_LOGIN=true).
function DemoAccounts({ onPick, busy }) {
  const [accounts, setAccounts] = useState(null);
  useEffect(() => { getDevAccounts().then((d) => setAccounts(d.accounts)).catch(() => setAccounts([])); }, []);
  if (!accounts) return null;
  return (
    <section className="mt-6 pt-5 border-t border-border" aria-labelledby="demo-title">
      <h2 id="demo-title" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        <KeyRound size={14} aria-hidden="true" /> Demo accounts · development only
      </h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No demo accounts yet. Run <code>npm run db:seed</code> in server/.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
          {accounts.map((a) => (
            <li key={a.email}>
              <button type="button" disabled={busy} onClick={() => onPick(a.email)}
                className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm min-h-11">
                <span className="block font-medium text-foreground">{a.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {a.superAdmin ? 'Platform admin' : a.memberships.map((m) => `${ROLE_NAMES[m.role] || m.role} · ${m.organization}`).join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Login() {
  const { signInWithGoogle, devLogin, session } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(REDIRECT_ERRORS[params.get('error')] || '');
  const [busy, setBusy] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);

  useEffect(() => {
    getAuthConfig().then(setConfig).catch(() => setError('Cannot reach the server. Please try again shortly.'));
  }, []);

  useEffect(() => {
    if (session) navigate(homeForRole(session.role), { replace: true });
  }, [session, navigate]);

  const goHome = (s) => navigate(homeForRole(s.role), { replace: true });

  const handleCredential = (credential) => complete(() => signInWithGoogle(credential));
  const handleDemo = (email) => complete(() => devLogin(email));

  const complete = async (signIn) => {
    setError('');
    setBusy(true);
    try {
      const result = await signIn();
      if (result.status === 'ACTIVE') return goHome(result.session);
      if (ONBOARDING_STATUSES.includes(result.status)) {
        return navigate('/onboarding', {
          state: { token: result.onboardingToken, user: result.user, status: result.status, organizations: result.organizations },
        });
      }
      setError(result.error || REDIRECT_ERRORS[result.status] || 'You cannot sign in right now.');
    } catch (err) {
      setError(err.response?.data?.error || 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 sm:px-6 h-16" style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <Brand />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-10 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full max-w-sm glass-card p-6 sm:p-7"
        >
          <h1 className="text-xl font-bold tracking-tight text-foreground">Sign in</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Transport and live tracking for universities, schools and companies.</p>

          <ErrorMessage message={error} />

          {!config ? (
            <div className="h-11 rounded-full skeleton" aria-hidden="true" />
          ) : config.googleClientId ? (
            <GoogleSignInButton clientId={config.googleClientId} onCredential={handleCredential} onError={setError} />
          ) : (
            <p className="text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3.5 py-2.5">
              Google sign-in isn't set up on this server yet. Set GOOGLE_CLIENT_ID (see README: “Creating the Google OAuth client”).
            </p>
          )}
          {busy && <p role="status" className="text-sm text-center text-muted-foreground mt-3">Signing you in...</p>}

          <p className="text-sm text-muted-foreground mt-5 leading-relaxed">
            Use the Google account your organisation invited. Not invited yet? Sign in, then ask your organisation for access.
          </p>

          {config?.devLogin && <DemoAccounts onPick={handleDemo} busy={busy} />}

          {config?.legacyPasswordLogin && (
            <div className="mt-4 text-center">
              {showLegacy
                ? <LegacyPasswordForm onSignedIn={goHome} onError={setError} />
                : <button type="button" onClick={() => setShowLegacy(true)} className="btn-ghost text-link">Use a username instead</button>}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
