import { useEffect, useState } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import { listAllPayments } from '../../services/admin.service';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    listAllPayments(status || undefined)
      .then((d) => setPayments(d.payments))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load payments.'))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="p-4 max-w-2xl mx-auto">
<ErrorMessage message={error} />
      <div className="mb-4">
        <ButtonSelect
          ariaLabel="Filter by payment status"
          size="sm"
          allowClear
          clearLabel="All statuses"
          options={[
            { value: 'PAID', label: 'Paid' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'FAILED', label: 'Failed' },
          ]}
          value={status}
          onChange={setStatus}
        />
      </div>

      {loading ? <LoadingSpinner label="Loading payments..." /> : (
        <div className="bg-white rounded-lg shadow divide-y">
          {payments.map((p) => (
            <div key={p.id} className="p-3 text-sm flex justify-between">
              <span>{p.student.user.firstName} {p.student.user.lastName} — KES {p.amount}</span>
              <span className={p.status === 'PAID' ? 'text-green-600' : p.status === 'FAILED' ? 'text-red-600' : 'text-amber-600'}>
                {p.status}
              </span>
            </div>
          ))}
          {payments.length === 0 && <p className="p-3 text-sm text-gray-500">No payments found.</p>}
        </div>
      )}
    </div>
  );
}
