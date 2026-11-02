import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import ErrorMessage from '../components/common/ErrorMessage';
import ThemeToggle from '../components/common/ThemeToggle';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
      <input name="username" placeholder="Username" required autoComplete="username" className="input-field"
        value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      <input name="password" type="password" placeholder="Password" required autoComplete="current-password" className="input-field"
        value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button type="submit" disabled={submitting} className="btn-secondary">
        {submitting ? 'Signing in...' : 'Sign in with username'}
      </button>
    </form>
  );
}

const ROLE_NAMES = {
  ORG_ADMIN: 'Organisation admin', FLEET_MANAGER: 'Transport officer', DRIVER: 'Driver', STUDENT: 'Student', PARENT: 'Parent',
};

// Development-only list of seeded demo users (shown when DEV_LOGIN=true).
function DemoAccounts({ onPick, busy }) {
  const [accounts, setAccounts] = useState(null);
  useEffect(() => { getDevAccounts().then((d) => setAccounts(d.accounts)).catch(() => setAccounts([])); }, []);
  if (!accounts) return null;
  return (
    <div className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Demo accounts · development only</p>
      {accounts.length === 0 ? (
        <p className="text-xs text-gray-500">No demo accounts yet. Run <code>npm run db:seed</code> in server/.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {accounts.map((a) => (
            <li key={a.email}>
              <button type="button" disabled={busy} onClick={() => onPick(a.email)}
                className="w-full text-left px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-900/5 dark:hover:bg-white/5 text-sm min-h-11">
                <span className="block font-medium text-gray-800 dark:text-gray-100">{a.name}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  {a.superAdmin ? 'Platform admin' : a.memberships.map((m) => `${ROLE_NAMES[m.role] || m.role} · ${m.organization}`).join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      if (result.status === 'NEEDS_ONBOARDING') {
        return navigate('/onboarding', { state: { token: result.onboardingToken, user: result.user } });
      }
      setError(result.error || REDIRECT_ERRORS[result.status] || 'You cannot sign in right now.');
    } catch (err) {
      setError(err.response?.data?.error || 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-mesh-light dark:bg-mesh-dark bg-gray-50 dark:bg-surface-dark relative overflow-hidden">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm glass-card p-7"
      >
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-primary-500 to-accent-violet flex items-center justify-center text-xl shadow-glow mb-3">🚌</div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">Welcome to Transtrack</h1>
          <p className="text-xs text-gray-400 mt-1">Transport for universities, schools and companies</p>
        </div>

        <ErrorMessage message={error} />

        {!config ? (
          <div className="h-11 rounded-full skeleton" />
        ) : config.googleClientId ? (
          <GoogleSignInButton clientId={config.googleClientId} onCredential={handleCredential} onError={setError} />
        ) : (
          <p className="text-sm text-center text-amber-700 dark:text-amber-400">
            Google sign-in isn't set up on this server yet. Set GOOGLE_CLIENT_ID (see README: “Creating the Google OAuth client”).
          </p>
        )}
        {busy && <p className="text-xs text-center text-gray-400 mt-3">Signing you in...</p>}

        <p className="text-xs text-center text-gray-400 mt-5 leading-relaxed">
          Use the Google account your organisation invited. New here? Sign in and you can request access or register your organisation.
        </p>

        {config?.devLogin && <DemoAccounts onPick={handleDemo} busy={busy} />}

        {config?.legacyPasswordLogin && (
          <div className="mt-4 text-center">
            {showLegacy
              ? <LegacyPasswordForm onSignedIn={goHome} onError={setError} />
              : <button type="button" onClick={() => setShowLegacy(true)} className="text-xs text-primary-600 dark:text-primary-400">Use a username instead</button>}
          </div>
        )}
      </motion.div>
    </div>
  );
}
