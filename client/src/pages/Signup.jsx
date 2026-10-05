import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import ErrorMessage from '../components/common/ErrorMessage';
import SuccessMessage from '../components/common/SuccessMessage';
import ThemeToggle from '../components/common/ThemeToggle';
import ButtonSelect from '../components/common/ButtonSelect';

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', firstName: '', lastName: '', role: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.role) {
      setError('Please select a role (Student or Driver).');
      return;
    }
    setSubmitting(true);
    try {
      await register(form);
      setMessage('Registration successful. Redirecting to login...');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
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
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">Create account</h1>
          <p className="text-xs text-gray-400 mt-1">Join as a student or driver</p>
        </div>

        <ErrorMessage message={error} />
        <SuccessMessage message={message} />

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input name="username" placeholder="Username" required minLength={3}
            value={form.username} onChange={handleChange} className="input-field" />
          <input name="password" type="password" placeholder="Password (min 8 characters)" required minLength={8}
            value={form.password} onChange={handleChange} className="input-field" />
          <div className="grid grid-cols-2 gap-3">
            <input name="firstName" placeholder="First name" required
              value={form.firstName} onChange={handleChange} className="input-field" />
            <input name="lastName" placeholder="Last name" required
              value={form.lastName} onChange={handleChange} className="input-field" />
          </div>
          {/* Admin excluded from public signup — created directly by a system administrator. */}
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300">I am a</label>
          <ButtonSelect
            ariaLabel="Role"
            options={[
              { value: 'student', label: '🎓 Student' },
              { value: 'driver', label: '🧑‍✈️ Driver' },
            ]}
            value={form.role}
            onChange={(v) => setForm({ ...form, role: v })}
          />
          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={submitting} className="btn-primary mt-2">
            {submitting ? 'Signing up...' : 'Sign Up'}
          </motion.button>
        </form>

        <p className="text-sm text-center text-gray-400 mt-5">
          Already have an account? <Link to="/login" className="text-primary-600 dark:text-primary-400 font-medium">Login</Link>
        </p>
      </motion.div>
    </div>
  );
}
