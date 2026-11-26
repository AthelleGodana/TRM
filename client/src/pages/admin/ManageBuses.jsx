import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import PageHeader from '../../components/layout/PageHeader';
import VehicleForm from '../../components/fleet/VehicleForm';
import { AttentionChips, VehicleStatusBadge } from '../../components/fleet/Badges';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { VEHICLE_STATUS, VEHICLE_TYPES, formatKm, options } from '../../config/fleet';
import { listDriverProfiles, listVehicles } from '../../services/fleet.service';
import { listRoutes } from '../../services/admin.service';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import VehicleDetail from './VehicleDetail';

const needsAttention = (v) => Object.values(v.attention || {}).some(Boolean);

function VehicleList() {
  const { session } = useAuth();
  const { toast } = useToast();
  const label = session.organization?.vehiclesLabel || 'Vehicles';
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [archived, setArchived] = useState(false);
  const [adding, setAdding] = useState(false);

  const latest = useLatestRequest();
  const load = () => {
    setError('');
    const isCurrent = latest();
    return Promise.all([listVehicles(archived ? { archived: true } : {}), listDriverProfiles(), listRoutes()])
      .then(([v, d, r]) => { if (isCurrent()) { setVehicles(v.buses); setDrivers(d.drivers); setRoutes(r.routes); } })
      .catch(() => { if (isCurrent()) setError('Could not load vehicles.'); })
      .finally(() => { if (isCurrent()) setLoading(false); });
  };
  useEffect(() => { load(); }, [archived]); // eslint-disable-line react-hooks/exhaustive-deps

  const types = useMemo(() => [...new Set(vehicles.map((v) => v.vehicleType))], [vehicles]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter((v) => (!status || v.status === status)
      && (!type || v.vehicleType === type)
      && (!attentionOnly || needsAttention(v))
      && (!q || `${v.licensePlate} ${v.make || ''} ${v.model || ''} ${v.vin || ''} ${v.driverName || ''}`.toLowerCase().includes(q)));
  }, [vehicles, query, status, type, attentionOnly]);
  const attentionCount = vehicles.filter(needsAttention).length;

  return (
    <div className="page">
      <PageHeader title={label} subtitle="Every vehicle, its driver, status and what needs doing.">
        <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" /> Add vehicle
        </button>
      </PageHeader>
      <ErrorMessage message={error} />

      <div className="flex flex-col gap-3 mb-4">
        <div className="relative">
          <label htmlFor="vehicle-search" className="sr-only">Search vehicles</label>
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input id="vehicle-search" type="search" className="input-field pl-10" placeholder="Search registration, make, VIN or driver"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonSelect ariaLabel="Filter by status" size="sm" allowClear clearLabel="All statuses"
            options={options(VEHICLE_STATUS)} value={status} onChange={setStatus} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {types.length > 1 && (
            <ButtonSelect ariaLabel="Filter by type" size="sm" allowClear clearLabel="All types"
              options={types.map((t) => ({ value: t, label: VEHICLE_TYPES[t] || t }))} value={type} onChange={setType} />
          )}
          <label className="inline-flex items-center gap-2 text-sm min-h-9 px-1">
            <input type="checkbox" className="w-4 h-4 accent-primary-600" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
            Needs attention ({attentionCount})
          </label>
          <label className="inline-flex items-center gap-2 text-sm min-h-9 px-1">
            <input type="checkbox" className="w-4 h-4 accent-primary-600" checked={archived} onChange={(e) => { setLoading(true); setArchived(e.target.checked); }} />
            Show retired
          </label>
        </div>
      </div>

      {loading ? <LoadingSpinner label="Loading vehicles..." /> : (
        <>
          <p className="text-sm text-muted-foreground mb-2" role="status">{shown.length} of {vehicles.length} {label.toLowerCase()}</p>
          {shown.length === 0 ? (
            <div className="glass-card p-5 text-sm text-muted-foreground">
              {vehicles.length ? 'No vehicles match these filters.' : 'No vehicles yet. Add your first one.'}
            </div>
          ) : (
            <>
              {/* Table on larger screens */}
              <div className="hidden md:block glass-card overflow-x-auto">
                <table className="data-table" aria-label={label}>
                  <thead>
                    <tr><th scope="col">Vehicle</th><th scope="col">Driver</th><th scope="col">Status</th><th scope="col" className="text-right">Odometer</th><th scope="col">Attention</th></tr>
                  </thead>
                  <tbody>
                    {shown.map((v) => (
                      <tr key={v.id} className="hover:bg-muted/50">
                        <td>
                          <Link to={String(v.id)} className="font-semibold text-link tabular-nums">{v.licensePlate}</Link>
                          <p className="text-xs text-muted-foreground">
                            {VEHICLE_TYPES[v.vehicleType]}{v.make ? ` · ${v.make} ${v.model || ''}` : ''}{v.year ? ` (${v.year})` : ''}
                          </p>
                        </td>
                        <td>{v.driverName || <span className="text-muted-foreground">No driver</span>}
                          {v.route && <p className="text-xs text-muted-foreground">{v.route.name}</p>}
                        </td>
                        <td><VehicleStatusBadge status={v.status} /></td>
                        <td className="text-right tabular-nums">{formatKm(v.odometerKm)}</td>
                        <td><AttentionChips attention={v.attention} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Cards on phones */}
              <ul className="md:hidden glass-card divide-y divide-border overflow-hidden">
                {shown.map((v) => (
                  <li key={v.id}>
                    <Link to={String(v.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors">
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-foreground tabular-nums">{v.licensePlate}</span>
                          <VehicleStatusBadge status={v.status} />
                        </span>
                        <span className="block text-xs text-muted-foreground truncate mt-0.5">
                          {VEHICLE_TYPES[v.vehicleType]}{v.make ? ` · ${v.make} ${v.model || ''}` : ''} · {v.driverName || 'No driver'}
                        </span>
                        <span className="block mt-1"><AttentionChips attention={v.attention} /></span>
                      </span>
                      <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <VehicleForm open={adding} onClose={() => setAdding(false)} drivers={drivers} routes={routes}
        onSaved={(bus) => { toast.success(`${bus.licensePlate} added.`); load(); }} />
    </div>
  );
}

export default function ManageBuses() {
  return (
    <Routes>
      <Route index element={<VehicleList />} />
      <Route path=":id" element={<VehicleDetail />} />
    </Routes>
  );
}
