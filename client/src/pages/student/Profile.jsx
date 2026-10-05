import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import { getStudentProfile, updateStudentProfile } from '../../services/student.service';

export default function Profile() {
  const [form, setForm] = useState({ address: '', phone: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    getStudentProfile()
      .then((data) => setForm({ address: data.student.address || '', phone: data.student.phone || '', email: data.student.email || '' }))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await updateStudentProfile(form);
      setMessage('Information updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed.');
    }
  };

  if (loading) return <LoadingSpinner label="Loading profile..." />;

  return (
    <div className="p-4 pb-24 sm:pb-8 max-w-md mx-auto">
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />
      <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="glass-card p-5 flex flex-col gap-3">
        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Address</label>
        <input name="address" value={form.address} onChange={handleChange} className="input-field" />
        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Phone</label>
        <input name="phone" value={form.phone} onChange={handleChange} className="input-field" />
        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Email</label>
        <input name="email" type="email" value={form.email} onChange={handleChange} className="input-field" />
        <motion.button whileTap={{ scale: 0.97 }} type="submit" className="btn-primary mt-2">Update Information</motion.button>
      </motion.form>
    </div>
  );
}
