import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, GraduationCap, Hourglass, School, ShieldX } from 'lucide-react';
import ErrorMessage from '../components/common/ErrorMessage';
import ThemeToggle from '../components/common/ThemeToggle';
import ButtonSelect from '../components/common/ButtonSelect';
import Brand from '../components/layout/Brand';
import { registerOrganization, requestAccess } from '../services/auth.service';

const PROFILE_OPTIONS = [
  { value: 'UNIVERSITY', label: <span className="inline-flex items-center gap-1.5"><GraduationCap size={16} aria-hidden="true" /> University</span> },
  { value: 'SCHOOL', label: <span className="inline-flex items-center gap-1.5"><School size={16} aria-hidden="true" /> School</span> },
  { value: 'COMPANY', label: <span className="inline-flex items-center gap-1.5"><Building2 size={16} aria-hidden="true" /> Company</span> },
];

const listNames = (names = []) => (names.length <= 1 ? names[0] || ''
  : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

// The onboarding token and status come from the sign-in page (popup mode)
// or from the URL fragment (redirect mode); the fragment is never sent to
// a server.
function useOnboardingState() {
  const location = useLocation();
  const hash = new URLSearchParams(location.hash.slice(1));
  return {
    token: location.state?.token || hash.get('token'),
    user: location.state?.user,
    status: location.state?.status || hash.get('status') || 'NEEDS_ONBOARDING',
    organizations: location.state?.organizations || [],
  };
}

function StatusPanel({ tone, icon: Icon, title, children }) {
  const tones = {
    pending: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200',
    rejected: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200',
  };
  return (
    <div role="status" className={`flex gap-3 rounded-lg border p-4 ${tones[tone]}`}>
      <Icon size={22} className="shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-semibold">{title}</p>
        <div className="mt-1 opacity-90">{children}</div>
      </div>
    </div>
  );
}

// Shown to a Google user who has no organisation session: request access
// with an organisation code, register a new organisation, or see where an
// earlier request stands. Nobody gets in without an administrator's approval.
export default function Onboarding() {
  const initial = useOnboardingState();
  const { token, user } = initial;
  const [status, setStatus] = useState(initial.status);
  const [organizations, setOrganizations] = useState(initial.organizations);
  const [showForm, setShowForm] = useState(initial.status === 'NEEDS_ONBOARDING');
  const [mode, setMode] = useState('request');
  const [form, setForm] = useState({ organizationCode: '', message: '', name: '', profile: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => {
    setForm({ ...form, [key]: e.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: '' });
  };

  const validate = () => {
    const next = {};
    if (mode === 'request' && !form.organizationCode.trim()) next.organizationCode = 'Enter your organisation code.';
    if (mode === 'register') {
      if (form.name.trim().length < 3) next.name = 'Enter at least 3 characters.';
      if (!form.profile) next.profile = 'Choose the type of organisation.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = mode === 'request'
        ? await requestAccess(token, { organizationCode: form.organizationCode.trim(), message: form.message })
        : await registerOrganization(token, { name: form.name.trim(), profile: form.profile });
      setDone(result.message);
      setShowForm(false);
      if (mode === 'request') { setStatus('ACCESS_PENDING'); setOrganizations([]); }
    } catch (err) {
      const message = err.response?.data?.error || 'Something went wrong. Please try again.';
      if (mode === 'request' && err.response?.status === 404) setErrors({ organizationCode: message });
      else setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const firstName = user?.name?.split(' ')[0];

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 sm:px-6 h-16" style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <Link to="/" aria-label="Transtrack Kenya home" className="rounded-lg"><Brand /></Link>
        <ThemeToggle />
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-10 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full max-w-md glass-card p-6 sm:p-7"
        >
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {firstName ? `Hi ${firstName}` : 'Welcome to Transtrack'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            Your organisation's administrators decide who can use Transtrack.
          </p>

          {!token ? (
            <ErrorMessage message="Your sign-in has expired. Please sign in with Google again." />
          ) : (
            <div className="flex flex-col gap-4">
              {done && status !== 'ACCESS_PENDING' && (
                <StatusPanel tone="pending" icon={Hourglass} title="Registration received">{done}</StatusPanel>
              )}
              {status === 'ACCESS_PENDING' && (
                <StatusPanel tone="pending" icon={Hourglass} title="Your request is waiting for approval">
                  {done || (
                    <>An administrator at {listNames(organizations) || 'your organisation'} needs to approve it. Sign in again once they have.</>
                  )}
                </StatusPanel>
              )}
              {status === 'ACCESS_REJECTED' && !done && (
                <StatusPanel tone="rejected" icon={ShieldX} title="Your request was not approved">
                  {listNames(organizations) || 'The organisation'} declined your request. Contact the transport office if you think
                  this is a mistake, or ask again below.
                </StatusPanel>
              )}

              {!showForm ? (
                <button type="button" className="btn-secondary" onClick={() => { setShowForm(true); setDone(''); }}>
                  {status === 'ACCESS_REJECTED' ? 'Request access again' : 'Request access to another organisation'}
                </button>
              ) : (
                <>
                  <ButtonSelect
                    ariaLabel="What would you like to do?"
                    options={[
                      { value: 'request', label: 'Request access' },
                      { value: 'register', label: 'Register an organisation' },
                    ]}
                    value={mode}
                    onChange={(v) => { setMode(v); setError(''); setErrors({}); }}
                  />
                  <ErrorMessage message={error} />
                  <form onSubmit={submit} noValidate className="flex flex-col gap-4">
                    {mode === 'request' ? (
                      <>
                        <div>
                          <label className="field-label" htmlFor="org-code">Organisation code</label>
                          <input id="org-code" className="input-field" autoComplete="off" autoCapitalize="none"
                            placeholder="e.g. strathmore-university" aria-describedby="org-code-hint org-code-error"
                            aria-invalid={Boolean(errors.organizationCode)}
                            value={form.organizationCode} onChange={update('organizationCode')} />
                          {errors.organizationCode
                            ? <p id="org-code-error" role="alert" className="field-error">{errors.organizationCode}</p>
                            : <p id="org-code-hint" className="field-hint">Your transport office can give you this code.</p>}
                        </div>
                        <div>
                          <label className="field-label" htmlFor="org-message">Message for the administrator <span className="font-normal text-muted-foreground">(optional)</span></label>
                          <textarea id="org-message" className="input-field" rows={3} maxLength={500}
                            placeholder="e.g. I'm a second-year student on the Westlands route"
                            value={form.message} onChange={update('message')} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="field-label" htmlFor="org-name">Organisation name</label>
                          <input id="org-name" className="input-field" maxLength={120} autoComplete="organization"
                            aria-invalid={Boolean(errors.name)} aria-describedby="org-name-error"
                            value={form.name} onChange={update('name')} />
                          {errors.name && <p id="org-name-error" role="alert" className="field-error">{errors.name}</p>}
                        </div>
                        <fieldset>
                          <legend className="field-label">Type of organisation</legend>
                          <ButtonSelect ariaLabel="Type of organisation" options={PROFILE_OPTIONS} value={form.profile}
                            onChange={(profile) => { setForm({ ...form, profile }); setErrors({ ...errors, profile: '' }); }} />
                          {errors.profile
                            ? <p role="alert" className="field-error">{errors.profile}</p>
                            : <p className="field-hint">The Transtrack team reviews new organisations before anyone can sign in.</p>}
                        </fieldset>
                      </>
                    )}
                    <button type="submit" disabled={submitting} className="btn-primary">
                      {submitting ? 'Sending...' : mode === 'request' ? 'Send request' : 'Register organisation'}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
          <p className="text-sm text-center mt-6">
            <Link to="/login" className="font-medium text-link hover:underline">Back to sign in</Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
