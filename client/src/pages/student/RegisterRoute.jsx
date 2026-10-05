import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import StatusBadge from '../../components/common/StatusBadge';
import ButtonSelect from '../../components/common/ButtonSelect';
import { listAvailableRoutes, registerForRoute } from '../../services/student.service';

const TIER_VARIANT = { ADAMS: 'info', LAVINGTON: 'warning', TOWN: 'neutral' };

export default function RegisterRoute() {
  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [arrivePoint, setArrivePoint] = useState('');
  const [departPoint, setDepartPoint] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    listAvailableRoutes()
      .then((data) => setRoutes(data.routes))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load routes.'))
      .finally(() => setLoading(false));
  }, []);

  const selectedRoute = routes.find((r) => r.id === Number(routeId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await registerForRoute({ routeId, arrivePickupPointId: arrivePoint || null, departPickupPointId: departPoint || null });
      setMessage('Route registration successful.');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    }
  };

  if (loading) return <LoadingSpinner label="Loading routes..." />;

  return (
    <div className="p-4 pb-24 sm:pb-8 max-w-md mx-auto">
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />
      <motion.form
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit} className="glass-card p-5 flex flex-col gap-3"
      >
<label className="text-sm font-medium text-gray-600 dark:text-gray-300">Route</label>
        <ButtonSelect
          ariaLabel="Route"
          options={routes.map((r) => ({ value: String(r.id), label: r.name }))}
          value={String(routeId)}
          onChange={(v) => { setRouteId(v); setArrivePoint(''); setDepartPoint(''); }}
        />

        {selectedRoute && (
          <>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Arrival pickup point</label>
            <ButtonSelect
              ariaLabel="Arrival pickup point"
              allowClear
              clearLabel="None"
              options={selectedRoute.pickupPoints.map((p) => ({ value: String(p.id), label: `${p.name} (${p.tier})` }))}
              value={String(arrivePoint)}
              onChange={setArrivePoint}
            />

            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Departure pickup point</label>
            <ButtonSelect
              ariaLabel="Departure pickup point"
              allowClear
              clearLabel="None"
              options={selectedRoute.pickupPoints.map((p) => ({ value: String(p.id), label: `${p.name} (${p.tier})` }))}
              value={String(departPoint)}
              onChange={setDepartPoint}
            />

            <div className="flex flex-wrap gap-1.5 mt-1">
              {selectedRoute.pickupPoints.map((p) => (
                <StatusBadge key={p.id} variant={TIER_VARIANT[p.tier]}>{p.name} · {p.tier}</StatusBadge>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Your payment tier determines which pickup points you can select. Adams tier can use
              any point; Lavington tier can use Lavington and Town; Town tier can only use Town.
            </p>
          </>
        )}

        <motion.button whileTap={{ scale: 0.97 }} type="submit" className="btn-primary mt-2">Register</motion.button>
      </motion.form>
    </div>
  );
}
