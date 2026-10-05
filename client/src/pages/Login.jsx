import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import ErrorMessage from '../components/common/ErrorMessage';
import ThemeToggle from '../components/common/ThemeToggle';
import ButtonSelect from '../components/common/ButtonSelect';

const ROLE_HINTS = {
  student: 'student1',
  driver: 'driver1',
  admin: 'admin',
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!role) {
      setError('Please select whether you are signing in as a Student, Driver, or Admin.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await login(form.username, form.password);
      if (user.role !== role) {
        setSubmitting(false);
        setError(`This account is registered as a ${user.role}. Please select the correct role and try again.`);
        return;
      }
      navigate(`/${user.role}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
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
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">Welcome back</h1>
          <p className="text-xs text-gray-400 mt-1">Sign in to track your shuttle</p>
        </div>

<ErrorMessage message={error} />

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300">I am a</label>
          <ButtonSelect
            ariaLabel="Role"
            options={[
              { value: 'student', label: '🎓 Student' },
              { value: 'driver', label: '🧑‍✈️ Driver' },
              { value: 'admin', label: '🛡️ Admin' },
            ]}
            value={role}
            onChange={(v) => { setRole(v); setError(''); }}
          />
          <input
            name="username" placeholder="Username" required autoComplete="username"
            value={form.username} onChange={handleChange}
            className="input-field"
          />
          <input
            name="password" type="password" placeholder="Password" required
            autoComplete="current-password"
            value={form.password} onChange={handleChange}
            className="input-field"
          />
          {role && (
            <p className="text-xs text-gray-400 -mt-1">
              Demo? Try username <span className="font-semibold text-primary-600 dark:text-primary-400">{ROLE_HINTS[role]}</span> with password <span className="font-semibold text-primary-600 dark:text-primary-400">{role === 'student' ? '12345678' : 'password123'}</span>
            </p>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit" disabled={submitting}
            className="btn-primary mt-2"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </motion.button>
        </form>

        <p className="text-sm text-center text-gray-400 mt-5">
          Don't have an account? <Link to="/signup" className="text-primary-600 dark:text-primary-400 font-medium">Sign up</Link>
        </p>
      </motion.div>
    </div>
  );
}
