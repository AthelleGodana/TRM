import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import PageHeader from '../../components/layout/PageHeader';
import { AttentionChips, DriverStatusBadge, ExpiryBadge } from '../../components/fleet/Badges';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DRIVER_STATUS, apiError, options } from '../../config/fleet';
import { listDriverProfiles } from '../../services/fleet.service';
import { removeDrivers } from '../../services/admin.service';
import DriverDetail from './DriverDetail';

function DriverList() {
  const { session } = useAuth();
  const { toast } = useToast();
  const isAdmin = session.role === 'ORG_ADMIN';
  const [drivers, setDrivers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => listDriverProfiles().then((d) => setDrivers(d.drivers))
    .catch(() => setError('Could not load drivers.')).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => drivers.filter((d) => (!status || d.status === status)
    && `${d.name} ${d.user.email || ''} ${d.licenseNumber || ''} ${d.vehicle?.licensePlate || ''}`.toLowerCase().includes(search.toLowerCase())),
  [drivers, search, status]);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const handleRemove = async () => {
    if (!selected.length || !window.confirm(`Remove ${selected.length} driver(s) from this organisation?`)) return;
    try {
      await removeDrivers(selected);
      setSelected([]);
      toast.success('Drivers removed.');
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to remove drivers.'));
    }
  };

  const header = <PageHeader title="Drivers" subtitle="Licences, vehicles and status. Drivers join through People & Access with the Driver role." />;
  if (loading) return <div className="page max-w-4xl">{header}<LoadingSpinner label="Loading drivers..." /></div>;

  return (
    <div className="page max-w-4xl">
      {header}
      <ErrorMessage message={error} />
      <div className="relative mb-3">
        <label htmlFor="driver-search" className="sr-only">Search drivers</label>
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <input id="driver-search" type="search" placeholder="Search name, licence or vehicle" value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10" />
      </div>
      <div className="mb-4">
        <ButtonSelect ariaLabel="Filter by status" size="sm" allowClear clearLabel="All" options={options(DRIVER_STATUS)} value={status} onChange={setStatus} />
      </div>

      <ul className="glass-card divide-y divide-border mb-4">
        {filtered.map((d) => (
          <li key={d.id} className="flex items-center gap-1 pl-2">
            {isAdmin && (
              <label className="flex items-center justify-center min-w-11 min-h-11">
                <input type="checkbox" className="w-5 h-5 accent-primary-600" checked={selected.includes(d.id)} onChange={() => toggle(d.id)}
                  aria-label={`Select ${d.name}`} />
              </label>
            )}
            <Link to={String(d.id)} className="flex-1 min-w-0 flex items-center gap-3 py-3 pr-4 pl-2 hover:bg-muted transition-colors rounded-lg">
              <span className="flex-1 min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{d.name}</span>
                  <DriverStatusBadge status={d.status} />
                </span>
                <span className="block text-xs text-muted-foreground truncate mt-0.5">
                  {d.vehicle ? `Drives ${d.vehicle.licensePlate}` : 'No vehicle'}{d.licenseNumber ? ` · Licence ${d.licenseNumber}` : ''}
                </span>
                <span className="flex flex-wrap gap-1 mt-1">
                  {['EXPIRED', 'EXPIRING'].includes(d.licenseStatus) && <ExpiryBadge status={d.licenseStatus} date={d.licenseExpiry} />}
                  <AttentionChips attention={d.attention} />
                </span>
              </span>
              <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
        {filtered.length === 0 && <li className="p-4 text-sm text-muted-foreground">No drivers match.</li>}
      </ul>

      {isAdmin && (
        <button type="button" onClick={handleRemove} disabled={selected.length === 0} className="btn-danger">
          Remove selected ({selected.length})
        </button>
      )}
    </div>
  );
}

export default function ManageDrivers() {
  return (
    <Routes>
      <Route index element={<DriverList />} />
      <Route path=":id" element={<DriverDetail />} />
    </Routes>
  );
}
