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

  if (loading) return <LoadingSpinner label={`Loading ${plural.toLowerCase()}...`} />;

  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto">
      <ErrorMessage message={error} />

      {adding ? (
        <form onSubmit={addPupil} className="glass-card p-4 mb-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Add a {singular.toLowerCase()} without an account</p>
          <div className="flex gap-2">
            <input required placeholder="First name" className="input-field flex-1" value={pupil.firstName}
              onChange={(e) => setPupil({ ...pupil, firstName: e.target.value })} />
            <input required placeholder="Last name" className="input-field flex-1" value={pupil.lastName}
              onChange={(e) => setPupil({ ...pupil, lastName: e.target.value })} />
          </div>
          <ButtonSelect ariaLabel="Route" size="sm" allowClear clearLabel="No route yet"
            options={routes.map((r) => ({ value: String(r.id), label: r.name }))}
            value={pupil.routeId} onChange={(routeId) => setPupil({ ...pupil, routeId })} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">Save</button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-secondary mb-4">+ Add {singular.toLowerCase()}</button>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input placeholder={`Search ${plural.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} className="input-field flex-1 min-w-[180px]" />
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
        {filtered.length === 0 && <p className="p-4 text-sm text-gray-400">No {plural.toLowerCase()} match.</p>}
      </div>

      <button onClick={handleRemove} disabled={selected.length === 0} className="btn-danger disabled:opacity-40">
        Remove Selected ({selected.length})
      </button>

      <Drawer open={!!active} onClose={() => setActive(null)} title={`${singular} profile`}>
        {active && (
          <div className="flex flex-col gap-3 text-sm">
            <div><span className="text-gray-400">Name</span><p className="font-medium text-gray-800 dark:text-gray-100">{active.user.firstName} {active.user.lastName}</p></div>
            <div><span className="text-gray-400">Email</span><p>{active.user.email}</p></div>
            <div><span className="text-gray-400">Payment tier</span><p><StatusBadge variant={TIER_VARIANT[active.paymentTier]}>{active.paymentTier}</StatusBadge></p></div>
            <div><span className="text-gray-400">Route</span><p>{active.route?.name || 'Not registered'}</p></div>
            <div><span className="text-gray-400">Phone</span><p>{active.phone || '—'}</p></div>
            <div><span className="text-gray-400">Email</span><p>{active.email || '—'}</p></div>
            <div><span className="text-gray-400">Address</span><p>{active.address || '—'}</p></div>
            {!active.hasAccount && (parents.length > 0 || active.guardians?.length > 0) && (
              <div className="border-t border-gray-100 dark:border-white/5 pt-3">
                <span className="text-gray-400">Parents</span>
                <ul className="mt-1 flex flex-col gap-1">
                  {active.guardians.map((g) => (
                    <li key={g.user.id} className="flex items-center justify-between">
                      <span>{parentName(g.user)} <span className="text-gray-400">{g.user.email}</span></span>
                      <button className="text-xs text-rose-500" onClick={() => attempt(() => unlinkGuardian(active.id, g.user.id))}>Unlink</button>
                    </li>
                  ))}
                  {active.guardians.length === 0 && <li className="text-gray-400">No parent linked yet.</li>}
                </ul>
                <div className="mt-2 flex flex-col gap-2">
                  <ButtonSelect ariaLabel="Parent to link" size="sm"
                    options={parents.filter((p) => !active.guardians.some((g) => g.user.id === p.id))
                      .map((p) => ({ value: String(p.id), label: parentName(p) }))}
                    value={linkTo} onChange={setLinkTo} />
                  <button disabled={!linkTo} className="btn-primary"
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
