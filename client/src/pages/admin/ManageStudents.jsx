import { useEffect, useMemo, useState } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import StatusBadge from '../../components/common/StatusBadge';
import Drawer from '../../components/common/Drawer';
import ButtonSelect from '../../components/common/ButtonSelect';
import { listStudents, removeStudents } from '../../services/admin.service';

const TIER_VARIANT = { ADAMS: 'info', LAVINGTON: 'warning', TOWN: 'neutral' };

export default function ManageStudents() {
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => listStudents().then((d) => setStudents(d.students)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => students.filter((s) => {
    const name = `${s.user.firstName} ${s.user.lastName} ${s.user.username}`.toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase());
    const matchesTier = !tierFilter || s.paymentTier === tierFilter;
    return matchesSearch && matchesTier;
  }), [students, search, tierFilter]);

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const handleRemove = async () => {
    if (selected.length === 0) return;
    try {
      await removeStudents(selected);
      setSelected([]);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove students.');
    }
  };

  if (loading) return <LoadingSpinner label="Loading students..." />;

  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto">
      <ErrorMessage message={error} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field flex-1 min-w-[180px]" />
        <ButtonSelect
          ariaLabel="Filter by payment tier"
          size="sm"
          allowClear
          clearLabel="All tiers"
          options={[
            { value: 'ADAMS', label: 'Adams' },
            { value: 'LAVINGTON', label: 'Lavington' },
            { value: 'TOWN', label: 'Town' },
          ]}
          value={tierFilter}
          onChange={setTierFilter}
        />
      </div>

      <div className="glass-card divide-y divide-gray-100 dark:divide-white/5 mb-4">
        {filtered.map((s) => (
          <div key={s.id} className="p-3.5 text-sm flex items-center gap-3">
            <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
            <button onClick={() => setActive(s)} className="flex-1 flex items-center justify-between text-left">
              <span className="text-gray-700 dark:text-gray-200">{s.user.firstName} {s.user.lastName}</span>
              <StatusBadge variant={TIER_VARIANT[s.paymentTier]}>{s.paymentTier}</StatusBadge>
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="p-4 text-sm text-gray-400">No students match.</p>}
      </div>

      <button onClick={handleRemove} disabled={selected.length === 0} className="btn-danger disabled:opacity-40">
        Remove Selected ({selected.length})
      </button>

      <Drawer open={!!active} onClose={() => setActive(null)} title="Student profile">
        {active && (
          <div className="flex flex-col gap-3 text-sm">
            <div><span className="text-gray-400">Name</span><p className="font-medium text-gray-800 dark:text-gray-100">{active.user.firstName} {active.user.lastName}</p></div>
            <div><span className="text-gray-400">Username</span><p>{active.user.username}</p></div>
            <div><span className="text-gray-400">Payment tier</span><p><StatusBadge variant={TIER_VARIANT[active.paymentTier]}>{active.paymentTier}</StatusBadge></p></div>
            <div><span className="text-gray-400">Route</span><p>{active.route?.name || 'Not registered'}</p></div>
            <div><span className="text-gray-400">Phone</span><p>{active.phone || '—'}</p></div>
            <div><span className="text-gray-400">Email</span><p>{active.email || '—'}</p></div>
            <div><span className="text-gray-400">Address</span><p>{active.address || '—'}</p></div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
