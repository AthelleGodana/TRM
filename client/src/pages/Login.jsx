import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import ErrorMessage from '../components/common/ErrorMessage';
import ThemeToggle from '../components/common/ThemeToggle';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { getAuthConfig } from '../services/auth.service';
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

export default function Login() {
  const { signInWithGoogle, session } = useAuth();
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

  const handleCredential = async (credential) => {
    setError('');
    setBusy(true);
    try {
      const result = await signInWithGoogle(credential);
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

        {config ? (
          <GoogleSignInButton clientId={config.googleClientId} onCredential={handleCredential} onError={setError} />
        ) : (
          <div className="h-11 rounded-full skeleton" />
        )}
        {busy && <p className="text-xs text-center text-gray-400 mt-3">Signing you in...</p>}

        <p className="text-xs text-center text-gray-400 mt-5 leading-relaxed">
          Use the Google account your organisation invited. New here? Sign in and you can request access or register your organisation.
        </p>

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
