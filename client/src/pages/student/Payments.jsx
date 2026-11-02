import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import StatusBadge from '../../components/common/StatusBadge';
import ButtonSelect from '../../components/common/ButtonSelect';
import { getPaymentHistory, initiatePayment } from '../../services/payment.service';
import PageHeader from '../../components/layout/PageHeader';

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

  const header = <PageHeader title="Payments" subtitle="Pay your transport fee with M-Pesa." />;
  if (loading) return <div className="page-narrow">{header}<LoadingSpinner label="Loading payments..." /></div>;

  return (
    <div className="page-narrow">
      {header}
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Current tier</span>
        <StatusBadge variant={currentTier === 'ADAMS' ? 'info' : currentTier === 'LAVINGTON' ? 'warning' : 'neutral'}>{currentTier}</StatusBadge>
      </motion.div>

      <form onSubmit={handlePay} className="glass-card p-5 flex flex-col gap-3 mb-4">
        <p className="field-label mb-0">Tier</p>
        <ButtonSelect
          ariaLabel="Select payment tier"
          options={TIERS}
          value={tier}
          onChange={setTier}
        />
        <div>
          <label htmlFor="mpesa-phone" className="field-label">M-Pesa phone number</label>
          <input id="mpesa-phone" type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="2547XXXXXXXX" required aria-describedby="mpesa-hint" className="input-field" />
          <p id="mpesa-hint" className="field-hint">You will get a prompt on this phone to enter your M-Pesa PIN.</p>
        </div>
        <button type="submit" className="btn-primary">Pay with M-Pesa</button>
      </form>

      <h2 className="section-title mb-2">Payment history</h2>
      <div className="glass-card divide-y divide-border">
        {payments.length === 0 && <p className="p-4 text-sm text-muted-foreground">No payments yet.</p>}
        {payments.map((p) => (
          <div key={p.id} className="p-3.5 text-sm flex justify-between items-center">
            <span className="font-medium text-foreground tabular-nums">KES {p.amount}</span>
            <StatusBadge variant={STATUS_VARIANT[p.status]}>{p.status}</StatusBadge>
          </div>
        ))}
      </div>
    </div>
  );
}
