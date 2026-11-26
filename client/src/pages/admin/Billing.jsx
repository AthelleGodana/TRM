import { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import StatusBadge from '../../components/common/StatusBadge';
import { getBillingOverview, listAllPayments } from '../../services/admin.service';
import { formatMoney } from '../../config/fleet';
import PageHeader from '../../components/layout/PageHeader';

// 3:1 or better against both the light and the dark card.
const TIER_COLORS = { TOWN: '#64748b', LAVINGTON: '#d97706', ADAMS: '#7c3aed' };
const AXIS = { fontSize: 12, fill: 'rgb(var(--c-muted-fg))' };
const TOOLTIP = {
  contentStyle: { borderRadius: 12, border: '1px solid rgb(var(--c-border))', fontSize: 12, background: 'rgb(var(--c-card))', color: 'rgb(var(--c-fg))' },
  labelStyle: { color: 'rgb(var(--c-fg))' },
  itemStyle: { color: 'rgb(var(--c-fg))' },
};
const STATUS_VARIANT = { PAID: 'success', PENDING: 'warning', FAILED: 'danger' };

// The charts' data as a table for screen readers (the charts are hidden
// from assistive technology).
function ChartTable({ caption, rows, label }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr><th scope="col">{label === 'month' ? 'Month' : 'Tier'}</th><th scope="col">Revenue (KES)</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r[label]}><th scope="row">{r[label]}</th><td>{formatMoney(r.revenue)}</td></tr>)}</tbody>
    </table>
  );
}

// tone: a small coloured marker so status is not conveyed by colour alone
// (the label always says it).
function StatCard({ label, value, sub, tone = 'bg-primary-600' }) {
  return (
    <div className="glass-card p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className={`w-2 h-2 rounded-full ${tone}`} aria-hidden="true" />{label}
      </p>
      <p className="text-2xl font-bold tracking-tight text-foreground mt-2 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
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

  const header = <PageHeader title="Billing & Revenue" subtitle="M-Pesa payments received from passengers." />;
  if (loading) return <div className="page">{header}<LoadingSpinner label="Loading billing overview..." /></div>;

  return (
    <div className="page">
      {header}
      <ErrorMessage message={error} />
      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total revenue" value={formatMoney(data.totalRevenue)} />
            <StatCard label="Paid" value={data.counts.paid} tone="bg-emerald-500" />
            <StatCard label="Pending" value={data.counts.pending} tone="bg-amber-500" />
            <StatCard label="Failed" value={data.counts.failed} tone="bg-red-500" />
          </div>

          <div className="glass-card p-5 mb-6">
            <h2 className="section-title mb-4">Revenue by month</h2>
            <ChartTable caption="Revenue by month" rows={data.revenueByMonth} label="month" />
            <ResponsiveContainer width="100%" height={220} aria-hidden="true">
              <AreaChart data={data.revenueByMonth}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="month" tick={AXIS} stroke="rgb(var(--c-input))" />
                <YAxis tick={AXIS} stroke="rgb(var(--c-input))" />
                <Tooltip {...TOOLTIP} />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card p-5 mb-6">
            <h2 className="section-title mb-4">Revenue by tier</h2>
            <ChartTable caption="Revenue by tier" rows={data.revenueByTier} label="tier" />
            <ResponsiveContainer width="100%" height={200} aria-hidden="true">
              <BarChart data={data.revenueByTier}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="tier" tick={AXIS} stroke="rgb(var(--c-input))" />
                <YAxis tick={AXIS} stroke="rgb(var(--c-input))" />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                  {data.revenueByTier.map((entry) => <Cell key={entry.tier} fill={TIER_COLORS[entry.tier]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h2 className="section-title mb-2">Recent transactions</h2>
          <div className="glass-card divide-y divide-border">
            {payments.map((p) => (
              <div key={p.id} className="p-3.5 text-sm flex justify-between items-center gap-3">
                <span className="text-foreground">{p.student.user.firstName} {p.student.user.lastName} · <span className="tabular-nums">{formatMoney(p.amount)}</span></span>
                <StatusBadge variant={STATUS_VARIANT[p.status]}>{p.status}</StatusBadge>
              </div>
            ))}
            {payments.length === 0 && <p className="p-4 text-sm text-muted-foreground">No transactions yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
