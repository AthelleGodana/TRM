import { useEffect, useMemo, useState } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import Drawer from '../../components/common/Drawer';
import { listDrivers, removeDrivers } from '../../services/admin.service';
import { Search } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';

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
    `${d.user.firstName} ${d.user.lastName} ${d.user.email}`.toLowerCase().includes(search.toLowerCase())
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

  const header = (
    <PageHeader title="Drivers" subtitle="Drivers join through People & Access with the Driver role." />
  );
  if (loading) return <div className="page max-w-3xl">{header}<LoadingSpinner label="Loading drivers..." /></div>;

  return (
    <div className="page max-w-3xl">
      {header}
      <ErrorMessage message={error} />
      <label htmlFor="driver-search" className="sr-only">Search drivers</label>
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <input id="driver-search" type="search" placeholder="Search drivers" value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10" />
      </div>

      <div className="glass-card divide-y divide-border mb-4">
        {filtered.map((d) => (
          <div key={d.id} className="px-2 text-sm flex items-center gap-1">
            <label className="flex items-center justify-center min-w-11 min-h-11">
              <input type="checkbox" className="w-5 h-5 accent-primary-600" checked={selected.includes(d.id)} onChange={() => toggle(d.id)}
                aria-label={`Select ${d.user.firstName} ${d.user.lastName}`} />
            </label>
            <button type="button" onClick={() => setActive(d)} className="flex-1 min-h-12 py-2 text-left rounded-lg px-2 hover:bg-muted transition-colors min-w-0">
              <span className="block font-medium text-foreground truncate">{d.user.firstName} {d.user.lastName}</span>
              <span className="block text-xs text-muted-foreground truncate">{d.user.email}</span>
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground">No drivers match.</p>}
      </div>

      <button type="button" onClick={handleRemove} disabled={selected.length === 0} className="btn-danger">
        Remove selected ({selected.length})
      </button>

      <Drawer open={!!active} onClose={() => setActive(null)} title="Driver profile">
        {active && (
          <div className="flex flex-col gap-3 text-sm">
            <div><span className="text-muted-foreground">Name</span><p className="font-medium text-foreground">{active.user.firstName} {active.user.lastName}</p></div>
            <div><span className="text-muted-foreground">Email</span><p className="text-foreground break-all">{active.user.email}</p></div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
