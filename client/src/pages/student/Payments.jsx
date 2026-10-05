import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import StatusBadge from '../../components/common/StatusBadge';
import ButtonSelect from '../../components/common/ButtonSelect';
import { getPaymentHistory, initiatePayment } from '../../services/payment.service';

const TIERS = [
  { value: 'TOWN', label: 'Town — KES 1,500' },
  { value: 'LAVINGTON', label: 'Lavington — KES 2,500' },
  { value: 'ADAMS', label: 'Adams — KES 4,000' },
];

const STATUS_VARIANT = { PAID: 'success', PENDING: 'warning', FAILED: 'danger' };

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [currentTier, setCurrentTier] = useState(null);
  const [tier, setTier] = useState('TOWN');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadHistory = () => {
    getPaymentHistory()
      .then((data) => { setPayments(data.payments); setCurrentTier(data.currentTier); })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load payment history.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadHistory(); }, []);

  const handlePay = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      const data = await initiatePayment({ tier, phoneNumber });
      setMessage(data.message);
      loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Payment could not be initiated.');
    }
  };

  if (loading) return <LoadingSpinner label="Loading payments..." />;

  return (
    <div className="p-4 pb-24 sm:pb-8 max-w-md mx-auto">
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">Current tier</span>
        <StatusBadge variant={currentTier === 'ADAMS' ? 'info' : currentTier === 'LAVINGTON' ? 'warning' : 'neutral'}>{currentTier}</StatusBadge>
      </motion.div>

      <form onSubmit={handlePay} className="glass-card p-5 flex flex-col gap-3 mb-4">
<label className="text-sm font-medium text-gray-600 dark:text-gray-300">Select tier</label>
        <ButtonSelect
          ariaLabel="Select payment tier"
          options={TIERS}
          value={tier}
          onChange={setTier}
        />
        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">M-Pesa phone number</label>
        <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="2547XXXXXXXX" required className="input-field" />
        <motion.button whileTap={{ scale: 0.97 }} type="submit" className="btn-primary">Pay with M-Pesa</motion.button>
      </form>

      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">Payment history</h2>
      <div className="glass-card divide-y divide-gray-100 dark:divide-white/5">
        {payments.length === 0 && <p className="p-4 text-sm text-gray-400">No payments yet.</p>}
        {payments.map((p) => (
          <div key={p.id} className="p-3.5 text-sm flex justify-between items-center">
            <span className="font-medium text-gray-700 dark:text-gray-200">KES {p.amount}</span>
            <StatusBadge variant={STATUS_VARIANT[p.status]}>{p.status}</StatusBadge>
          </div>
        ))}
      </div>
    </div>
  );
}
