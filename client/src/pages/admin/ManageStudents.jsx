import { useEffect, useMemo, useState } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import StatusBadge from '../../components/common/StatusBadge';
import Drawer from '../../components/common/Drawer';
import ButtonSelect from '../../components/common/ButtonSelect';
import { useAuth } from '../../context/AuthContext';
import {
  listStudents, removeStudents, listRoutes, createPupil, listParents, linkGuardian, unlinkGuardian,
} from '../../services/admin.service';
import { Plus, Search } from 'lucide-react';
import { setStudentRoute } from '../../services/rides.service';
import PageHeader from '../../components/layout/PageHeader';

const TIER_VARIANT = { ADAMS: 'info', LAVINGTON: 'warning', TOWN: 'neutral' };

// Passenger list. Wording comes from the session ("Students", "Pupils"...).
// Passengers without an account can be added here and linked to parents;
// the parent section appears whenever the organisation has PARENT members.
export default function ManageStudents() {
  const { session } = useAuth();
  const plural = session.organization?.passengerLabel || 'Passengers';
  const singular = plural.replace(/s$/, '');
  const [students, setStudents] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [parents, setParents] = useState([]);
  const [adding, setAdding] = useState(false);
  const [pupil, setPupil] = useState({ firstName: '', lastName: '', routeId: '' });
  const [linkTo, setLinkTo] = useState('');
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => Promise.all([listStudents(), listRoutes(), listParents()])
    .then(([s, r, p]) => {
      setStudents(s.students);
      setRoutes(r.routes);
      setParents(p.parents);
      setActive((a) => (a ? s.students.find((x) => x.id === a.id) || null : null));
    })
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const attempt = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'That did not work. Please try again.');
      return false;
    }
  };

  const addPupil = async (e) => {
    e.preventDefault();
    if (await attempt(() => createPupil(pupil))) {
      setPupil({ firstName: '', lastName: '', routeId: '' });
      setAdding(false);
    }
  };

  const parentName = (u) => u.name || `${u.firstName} ${u.lastName}`;

  const filtered = useMemo(() => students.filter((s) => {
    const name = `${s.user.firstName} ${s.user.lastName} ${s.user.email}`.toLowerCase();
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
      setError(err.response?.data?.error || `Failed to remove ${plural.toLowerCase()}.`);
    }
  };

  const header = (
    <PageHeader title={plural} subtitle={`Passenger records, their routes and payment tiers.`}>
      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="btn-secondary">
          <Plus size={18} aria-hidden="true" /> Add {singular.toLowerCase()}
        </button>
      )}
    </PageHeader>
  );
  if (loading) return <div className="page max-w-3xl">{header}<LoadingSpinner label={`Loading ${plural.toLowerCase()}...`} /></div>;

  return (
    <div className="page max-w-3xl">
      {header}
      <ErrorMessage message={error} />

      {adding ? (
        <form onSubmit={addPupil} className="glass-card p-5 mb-5 flex flex-col gap-4">
          <h2 className="section-title">Add a {singular.toLowerCase()} without an account</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pupil-first" className="field-label">First name</label>
              <input id="pupil-first" required autoComplete="off" className="input-field" value={pupil.firstName}
                onChange={(e) => setPupil({ ...pupil, firstName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pupil-last" className="field-label">Last name</label>
              <input id="pupil-last" required autoComplete="off" className="input-field" value={pupil.lastName}
                onChange={(e) => setPupil({ ...pupil, lastName: e.target.value })} />
            </div>
          </div>
          <p className="field-label mb-0">Route</p>
          <ButtonSelect ariaLabel="Route" size="sm" allowClear clearLabel="No route yet"
            options={routes.map((r) => ({ value: String(r.id), label: r.name }))}
            value={pupil.routeId} onChange={(routeId) => setPupil({ ...pupil, routeId })} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">Save</button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label htmlFor="passenger-search" className="sr-only">Search {plural.toLowerCase()}</label>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input id="passenger-search" type="search" placeholder={`Search ${plural.toLowerCase()}`} value={search}
            onChange={(e) => setSearch(e.target.value)} className="input-field pl-10" />
        </div>
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

      <div className="glass-card divide-y divide-border mb-4">
        {filtered.map((s) => (
          <div key={s.id} className="px-2 text-sm flex items-center gap-1">
            <label className="flex items-center justify-center min-w-11 min-h-11">
              <input type="checkbox" className="w-5 h-5 accent-primary-600" checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
                aria-label={`Select ${s.user.firstName} ${s.user.lastName}`} />
            </label>
            <button type="button" onClick={() => setActive(s)} className="flex-1 min-h-12 py-2 px-2 rounded-lg flex items-center justify-between gap-2 text-left hover:bg-muted transition-colors">
              <span className="font-medium text-foreground">{s.user.firstName} {s.user.lastName}</span>
              <StatusBadge variant={TIER_VARIANT[s.paymentTier]}>{s.paymentTier}</StatusBadge>
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground">No {plural.toLowerCase()} match.</p>}
      </div>

      <button type="button" onClick={handleRemove} disabled={selected.length === 0} className="btn-danger">
        Remove selected ({selected.length})
      </button>

      <Drawer open={!!active} onClose={() => setActive(null)} title={`${singular} profile`}>
        {active && (
          <div className="flex flex-col gap-3 text-sm">
            <div><span className="text-muted-foreground">Name</span><p className="font-medium text-foreground">{active.user.firstName} {active.user.lastName}</p></div>
            <div><span className="text-muted-foreground">Email</span><p>{active.user.email}</p></div>
            <div><span className="text-muted-foreground">Payment tier</span><p><StatusBadge variant={TIER_VARIANT[active.paymentTier]}>{active.paymentTier}</StatusBadge></p></div>
            <div>
              <span className="text-muted-foreground">Standard route</span>
              <div className="mt-1">
                <ButtonSelect ariaLabel="Standard route" size="sm" allowClear clearLabel="None"
                  options={routes.map((r) => ({ value: String(r.id), label: r.name }))}
                  value={String(active.routeId || '')}
                  onChange={(routeId) => {
                    if (active.rideBookings?.length && !window.confirm('Changing the route removes this passenger\'s pickup and drop-off bookings. Continue?')) return;
                    attempt(() => setStudentRoute(active.id, routeId));
                  }} />
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Rides</span>
              {active.rideBookings?.length ? (
                <ul className="mt-1 flex flex-col gap-1">
                  {active.rideBookings.map((b) => (
                    <li key={b.id}>
                      <span className="font-medium">{b.direction === 'PICKUP' ? 'Pickup' : 'Drop-off'}:</span> {b.pickupPoint?.name} · {b.slot?.label}
                    </li>
                  ))}
                </ul>
              ) : <p>No pickup or drop-off chosen yet.</p>}
            </div>
            <div><span className="text-muted-foreground">Phone</span><p>{active.phone || '—'}</p></div>
            <div><span className="text-muted-foreground">Email</span><p>{active.email || '—'}</p></div>
            <div><span className="text-muted-foreground">Address</span><p>{active.address || '—'}</p></div>
            {!active.hasAccount && (parents.length > 0 || active.guardians?.length > 0) && (
              <div className="border-t border-border pt-3">
                <span className="text-muted-foreground">Parents</span>
                <ul className="mt-1 flex flex-col gap-1">
                  {active.guardians.map((g) => (
                    <li key={g.user.id} className="flex items-center justify-between">
                      <span>{parentName(g.user)} <span className="text-muted-foreground">{g.user.email}</span></span>
                      <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => attempt(() => unlinkGuardian(active.id, g.user.id))}>Unlink</button>
                    </li>
                  ))}
                  {active.guardians.length === 0 && <li className="text-muted-foreground">No parent linked yet.</li>}
                </ul>
                <div className="mt-2 flex flex-col gap-2">
                  <ButtonSelect ariaLabel="Parent to link" size="sm"
                    options={parents.filter((p) => !active.guardians.some((g) => g.user.id === p.id))
                      .map((p) => ({ value: String(p.id), label: parentName(p) }))}
                    value={linkTo} onChange={setLinkTo} />
                  <button type="button" disabled={!linkTo} className="btn-primary"
                    onClick={() => attempt(() => linkGuardian(active.id, Number(linkTo))).then(() => setLinkTo(''))}>
                    Link parent
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
