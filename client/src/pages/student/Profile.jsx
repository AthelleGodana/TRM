import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import { getStudentProfile, updateStudentProfile } from '../../services/student.service';
import PageHeader from '../../components/layout/PageHeader';

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

  const header = <PageHeader title="Profile" subtitle="How the transport office can reach you." />;
  if (loading) return <div className="page-narrow">{header}<LoadingSpinner label="Loading profile..." /></div>;

  return (
    <div className="page-narrow">
      {header}
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />
      <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="glass-card p-5 flex flex-col gap-3">
        <div>
          <label htmlFor="profile-address" className="field-label">Address</label>
          <input id="profile-address" name="address" autoComplete="street-address" value={form.address} onChange={handleChange} className="input-field" />
        </div>
        <div>
          <label htmlFor="profile-phone" className="field-label">Phone</label>
          <input id="profile-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={handleChange} className="input-field" />
        </div>
        <div>
          <label htmlFor="profile-email" className="field-label">Contact email</label>
          <input id="profile-email" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} className="input-field" />
        </div>
        <button type="submit" className="btn-primary mt-2">Save changes</button>
      </motion.form>
    </div>
  );
}
