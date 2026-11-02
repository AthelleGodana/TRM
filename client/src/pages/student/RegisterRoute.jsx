import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import StatusBadge from '../../components/common/StatusBadge';
import ButtonSelect from '../../components/common/ButtonSelect';
import { listAvailableRoutes, registerForRoute } from '../../services/student.service';
import PageHeader from '../../components/layout/PageHeader';

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

  const header = <PageHeader title="My route" subtitle="Choose your route and the stops where you board." />;
  if (loading) return <div className="page-narrow">{header}<LoadingSpinner label="Loading routes..." /></div>;

  return (
    <div className="page-narrow">
      {header}
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />
      <motion.form
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit} className="glass-card p-5 flex flex-col gap-3"
      >
        <p className="field-label mb-0">Route</p>
        <ButtonSelect
          ariaLabel="Route"
          options={routes.map((r) => ({ value: String(r.id), label: r.name }))}
          value={String(routeId)}
          onChange={(v) => { setRouteId(v); setArrivePoint(''); setDepartPoint(''); }}
        />

        {selectedRoute && (
          <>
            <p className="field-label mb-0">Morning pickup point</p>
            <ButtonSelect
              ariaLabel="Arrival pickup point"
              allowClear
              clearLabel="None"
              options={selectedRoute.pickupPoints.map((p) => ({ value: String(p.id), label: `${p.name} (${p.tier})` }))}
              value={String(arrivePoint)}
              onChange={setArrivePoint}
            />

            <p className="field-label mb-0">Evening drop-off point</p>
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
            <p className="field-hint">
              Your payment tier determines which pickup points you can select. Adams tier can use
              any point; Lavington tier can use Lavington and Town; Town tier can only use Town.
            </p>
          </>
        )}

        <button type="submit" className="btn-primary mt-2">Save my route</button>
      </motion.form>
    </div>
  );
}
