import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import ErrorMessage from '../components/common/ErrorMessage';
import SuccessMessage from '../components/common/SuccessMessage';
import ThemeToggle from '../components/common/ThemeToggle';
import ButtonSelect from '../components/common/ButtonSelect';
import { registerOrganization, requestAccess } from '../services/auth.service';

const PROFILE_OPTIONS = [
  { value: 'UNIVERSITY', label: '🎓 University' },
  { value: 'SCHOOL', label: '🏫 School' },
  { value: 'COMPANY', label: '🏢 Company' },
];

// The onboarding token comes from the sign-in page (popup mode) or from the
// URL fragment (redirect mode); the fragment is never sent to a server.
function useOnboardingToken() {
  const location = useLocation();
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('token');
  return { token: location.state?.token || fromHash, user: location.state?.user };
}

// Shown to a Google user who is not a member of any organisation yet.
export default function Onboarding() {
  const { token, user } = useOnboardingToken();
  const [mode, setMode] = useState('request');
  const [form, setForm] = useState({ organizationCode: '', message: '', name: '', profile: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = mode === 'request'
        ? await requestAccess(token, { organizationCode: form.organizationCode, message: form.message })
        : await registerOrganization(token, { name: form.name, profile: form.profile });
      setDone(result.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-mesh-light dark:bg-mesh-dark bg-gray-50 dark:bg-surface-dark">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md glass-card p-7">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
          {user?.name ? `Hi ${user.name.split(' ')[0]}, welcome to Transtrack` : 'Welcome to Transtrack'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-5">
          Your Google account is not linked to an organisation yet.
        </p>

        {!token ? (
          <ErrorMessage message="Your sign-in has expired. Please sign in with Google again." />
        ) : done ? (
          <SuccessMessage message={done} />
        ) : (
          <>
            <ButtonSelect
              ariaLabel="What would you like to do?"
              options={[
                { value: 'request', label: '🙋 Request access' },
                { value: 'register', label: '🏗️ Register organisation' },
              ]}
              value={mode}
              onChange={(v) => { setMode(v); setError(''); }}
            />
            <ErrorMessage message={error} />
            <form onSubmit={submit} className="flex flex-col gap-3 mt-4">
              {mode === 'request' ? (
                <>
                  <label className="text-sm text-gray-600 dark:text-gray-300" htmlFor="org-code">Organisation code</label>
                  <input id="org-code" className="input-field" required placeholder="e.g. strathmore-university"
                    value={form.organizationCode} onChange={update('organizationCode')} />
                  <p className="text-xs text-gray-400 -mt-1">Ask your transport office for your organisation's code.</p>
                  <textarea className="input-field" rows={3} maxLength={500} placeholder="Message for the administrator (optional)"
                    value={form.message} onChange={update('message')} />
                </>
              ) : (
                <>
                  <label className="text-sm text-gray-600 dark:text-gray-300" htmlFor="org-name">Organisation name</label>
                  <input id="org-name" className="input-field" required minLength={3} maxLength={120}
                    value={form.name} onChange={update('name')} />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Type of organisation</span>
                  <ButtonSelect ariaLabel="Organisation type" options={PROFILE_OPTIONS} value={form.profile}
                    onChange={(profile) => setForm({ ...form, profile })} />
                  <p className="text-xs text-gray-400">New organisations are reviewed by the Transtrack team before you can sign in.</p>
                </>
              )}
              <button type="submit" disabled={submitting || (mode === 'register' && !form.profile)} className="btn-primary mt-1">
                {submitting ? 'Sending...' : mode === 'request' ? 'Send request' : 'Register organisation'}
              </button>
            </form>
          </>
        )}
        <p className="text-sm text-center text-gray-400 mt-5">
          <Link to="/login" className="text-primary-600 dark:text-primary-400 font-medium">Back to sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
