import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import StatusBadge from '../../components/common/StatusBadge';
import { getBillingOverview, listAllPayments } from '../../services/admin.service';

const TIER_COLORS = { TOWN: '#94a3b8', LAVINGTON: '#f59e0b', ADAMS: '#8b5cf6' };
const STATUS_VARIANT = { PAID: 'success', PENDING: 'warning', FAILED: 'danger' };

function StatCard({ label, value, sub, gradient }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl p-4 text-white bg-gradient-to-br ${gradient} shadow-lg`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
    </motion.div>
  );
}

export default function Billing() {
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getBillingOverview(), listAllPayments()])
      .then(([overview, p]) => { setData(overview); setPayments(p.payments.slice(0, 10)); })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load billing data.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner label="Loading billing overview..." />;

  return (
    <div className="p-4 pb-10 max-w-3xl mx-auto">
      <ErrorMessage message={error} />
      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total Revenue" value={`KES ${data.totalRevenue.toLocaleString()}`} gradient="from-primary-600 to-accent-cyan" />
            <StatCard label="Paid" value={data.counts.paid} gradient="from-emerald-600 to-emerald-500" />
            <StatCard label="Pending" value={data.counts.pending} gradient="from-amber-500 to-amber-400" />
            <StatCard label="Failed" value={data.counts.failed} gradient="from-rose-600 to-rose-500" />
          </div>

          <div className="glass-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Revenue by month</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.revenueByMonth}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Revenue by tier</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.revenueByTier}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="tier" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
                <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                  {data.revenueByTier.map((entry) => <Cell key={entry.tier} fill={TIER_COLORS[entry.tier]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">Recent transactions</h2>
          <div className="glass-card divide-y divide-gray-100 dark:divide-white/5">
            {payments.map((p) => (
              <div key={p.id} className="p-3.5 text-sm flex justify-between items-center">
                <span className="text-gray-700 dark:text-gray-200">{p.student.user.firstName} {p.student.user.lastName} — KES {p.amount}</span>
                <StatusBadge variant={STATUS_VARIANT[p.status]}>{p.status}</StatusBadge>
              </div>
            ))}
            {payments.length === 0 && <p className="p-4 text-sm text-gray-400">No transactions yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
