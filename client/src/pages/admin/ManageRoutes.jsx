import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import StatusBadge from '../../components/common/StatusBadge';
import MapPicker from '../../components/map/MapPicker';
import ButtonSelect from '../../components/common/ButtonSelect';
import { createRoute, listRoutes } from '../../services/admin.service';

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

  if (loading) return <LoadingSpinner label="Loading routes..." />;

  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto">
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />

      <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="glass-card p-5 flex flex-col gap-3 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Route builder</h2>
        <input placeholder="Route name" required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        <div className="grid grid-cols-2 gap-3">
          <input type="time" value={schoolArrival} onChange={(e) => setSchoolArrival(e.target.value)} className="input-field" />
          <input type="time" value={schoolDeparture} onChange={(e) => setSchoolDeparture(e.target.value)} className="input-field" />
        </div>

        <h3 className="text-xs font-semibold text-gray-400 uppercase mt-2">Pickup points</h3>
        {points.map((p, i) => (
          <div key={i} className={`rounded-xl p-3 border ${activePointIdx === i ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-500/5' : 'border-gray-100 dark:border-white/5'}`}>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input placeholder="Pickup point name" required value={p.name}
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
            <p className="text-[11px] text-gray-400 mb-1">
              {p.lat ? `Pinned: ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : 'Click the map below to pin this stop'}
            </p>
          </div>
        ))}

        <MapPicker
          value={points[activePointIdx]?.lat ? { lat: points[activePointIdx].lat, lng: points[activePointIdx].lng } : null}
          onChange={({ lat, lng }) => { updatePoint(activePointIdx, 'lat', lat); updatePoint(activePointIdx, 'lng', lng); }}
        />

        <button type="button" onClick={() => { setPoints([...points, { ...emptyPoint }]); setActivePointIdx(points.length); }}
          className="text-xs text-primary-600 dark:text-primary-400 text-left font-medium">+ Add another pickup point</button>

        <motion.button whileTap={{ scale: 0.97 }} type="submit" className="btn-primary mt-2">Create Route</motion.button>
      </motion.form>

      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">Existing routes</h2>
      <div className="glass-card divide-y divide-gray-100 dark:divide-white/5">
        {routes.map((r) => (
          <div key={r.id} className="p-4 text-sm">
            <p className="font-medium text-gray-800 dark:text-gray-100 mb-1.5">{r.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {r.pickupPoints.map((p) => <StatusBadge key={p.id} variant={TIER_VARIANT[p.tier]}>{p.name}</StatusBadge>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
