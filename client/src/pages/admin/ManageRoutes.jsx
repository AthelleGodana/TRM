import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import StatusBadge from '../../components/common/StatusBadge';
import MapPicker from '../../components/map/MapPicker';
import ButtonSelect from '../../components/common/ButtonSelect';
import { createRoute, listRoutes } from '../../services/admin.service';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';

const emptyPoint = { name: '', tier: 'TOWN', lat: null, lng: null };
const TIER_VARIANT = { ADAMS: 'info', LAVINGTON: 'warning', TOWN: 'neutral' };

export default function ManageRoutes() {
  const [routes, setRoutes] = useState([]);
  const [name, setName] = useState('');
  const [schoolArrival, setSchoolArrival] = useState('');
  const [schoolDeparture, setSchoolDeparture] = useState('');
  const [points, setPoints] = useState([{ ...emptyPoint }]);
  const [activePointIdx, setActivePointIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = () => listRoutes().then((d) => setRoutes(d.routes)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const updatePoint = (i, field, value) => {
    const next = [...points];
    next[i] = { ...next[i], [field]: value };
    setPoints(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await createRoute({ name, schoolArrival, schoolDeparture, pickupPoints: points });
      setMessage('Route added successfully.');
      setName(''); setSchoolArrival(''); setSchoolDeparture(''); setPoints([{ ...emptyPoint }]); setActivePointIdx(0);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add route.');
    }
  };

  const header = <PageHeader title="Routes & Stops" subtitle="Create routes and pin their pickup points on the map." />;
  if (loading) return <div className="page max-w-3xl">{header}<LoadingSpinner label="Loading routes..." /></div>;

  return (
    <div className="page max-w-3xl">
      {header}
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />

      <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="glass-card p-5 flex flex-col gap-3 mb-6">
        <h2 className="section-title">New route</h2>
        <div>
          <label htmlFor="route-name" className="field-label">Route name</label>
          <input id="route-name" placeholder="e.g. Route A - Westlands" required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="route-arrival" className="field-label">Arrival time</label>
            <input id="route-arrival" type="time" value={schoolArrival} onChange={(e) => setSchoolArrival(e.target.value)} className="input-field" />
          </div>
          <div>
            <label htmlFor="route-departure" className="field-label">Departure time</label>
            <input id="route-departure" type="time" value={schoolDeparture} onChange={(e) => setSchoolDeparture(e.target.value)} className="input-field" />
          </div>
        </div>

        <h3 className="text-sm font-semibold text-foreground mt-2">Pickup points</h3>
        {points.map((p, i) => (
          <div key={i} className={`rounded-lg p-3 border ${activePointIdx === i ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-500/5' : 'border-border'}`}>
            <div className="grid sm:grid-cols-2 gap-2 mb-2">
              <label htmlFor={`stop-${i}`} className="sr-only">Pickup point {i + 1} name</label>
              <input id={`stop-${i}`} placeholder={`Stop ${i + 1} name`} required value={p.name}
                onFocus={() => setActivePointIdx(i)}
                onChange={(e) => updatePoint(i, 'name', e.target.value)} className="input-field" />
<ButtonSelect
                ariaLabel="Pickup point tier"
                size="sm"
                options={[
                  { value: 'TOWN', label: 'Town' },
                  { value: 'LAVINGTON', label: 'Lavington' },
                  { value: 'ADAMS', label: 'Adams' },
                ]}
                value={p.tier}
                onFocus={() => setActivePointIdx(i)}
                onChange={(v) => updatePoint(i, 'tier', v)}
              />
            </div>
            <p className="text-xs text-muted-foreground mb-1">
              {p.lat ? `Pinned: ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : 'Click the map below to pin this stop'}
            </p>
          </div>
        ))}

        <MapPicker
          value={points[activePointIdx]?.lat ? { lat: points[activePointIdx].lat, lng: points[activePointIdx].lng } : null}
          onChange={({ lat, lng }) => { updatePoint(activePointIdx, 'lat', lat); updatePoint(activePointIdx, 'lng', lng); }}
        />

        <button type="button" onClick={() => { setPoints([...points, { ...emptyPoint }]); setActivePointIdx(points.length); }}
          className="btn-ghost text-link self-start -ml-3"><Plus size={18} aria-hidden="true" /> Add another pickup point</button>

        <button type="submit" className="btn-primary mt-2">Create route</button>
      </motion.form>

      <h2 className="section-title mb-2">Routes ({routes.length})</h2>
      {routes.length === 0 && <div className="glass-card p-5 text-sm text-muted-foreground">No routes yet. Create your first one above.</div>}
      <div className={routes.length ? 'glass-card divide-y divide-border' : 'hidden'}>
        {routes.map((r) => (
          <div key={r.id} className="p-4 text-sm">
            <p className="font-medium text-foreground mb-1.5">{r.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {r.pickupPoints.map((p) => <StatusBadge key={p.id} variant={TIER_VARIANT[p.tier]}>{p.name}</StatusBadge>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
