import { useEffect, useMemo, useState } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import Drawer from '../../components/common/Drawer';
import { listDrivers, removeDrivers } from '../../services/admin.service';

export default function ManageDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => listDrivers().then((d) => setDrivers(d.drivers)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => drivers.filter((d) =>
    `${d.user.firstName} ${d.user.lastName} ${d.user.username}`.toLowerCase().includes(search.toLowerCase())
  ), [drivers, search]);

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const handleRemove = async () => {
    if (selected.length === 0) return;
    try {
      await removeDrivers(selected);
      setSelected([]);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove drivers.');
    }
  };

  if (loading) return <LoadingSpinner label="Loading drivers..." />;

  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto">
      <ErrorMessage message={error} />
      <input placeholder="Search drivers..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field mb-4" />

      <div className="glass-card divide-y divide-gray-100 dark:divide-white/5 mb-4">
        {filtered.map((d) => (
          <div key={d.id} className="p-3.5 text-sm flex items-center gap-3">
            <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
            <button onClick={() => setActive(d)} className="flex-1 text-left text-gray-700 dark:text-gray-200">
              {d.user.firstName} {d.user.lastName} <span className="text-gray-400">({d.user.username})</span>
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="p-4 text-sm text-gray-400">No drivers match.</p>}
      </div>

      <button onClick={handleRemove} disabled={selected.length === 0} className="btn-danger disabled:opacity-40">
        Remove Selected ({selected.length})
      </button>

      <Drawer open={!!active} onClose={() => setActive(null)} title="Driver profile">
        {active && (
          <div className="flex flex-col gap-3 text-sm">
            <div><span className="text-gray-400">Name</span><p className="font-medium text-gray-800 dark:text-gray-100">{active.user.firstName} {active.user.lastName}</p></div>
            <div><span className="text-gray-400">Username</span><p>{active.user.username}</p></div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
