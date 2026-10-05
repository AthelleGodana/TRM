import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../../components/common/Navbar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import StatusBadge from '../../components/common/StatusBadge';
import { getMyRoute } from '../../services/driver.service';
import { useSocket } from '../../hooks/useSocket';
import { useGPS } from '../../hooks/useGPS';

function CapacityMeter({ current, max }) {
  const pct = max ? Math.min(100, Math.round((current / max) * 100)) : 0;
  const color = pct > 85 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Capacity</span><span>{current}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className={`h-full ${color}`} />
      </div>
    </div>
  );
}

export default function DriverDashboard({ onInstall }) {
  const [bus, setBus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [tripActive, setTripActive] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const socketRef = useSocket();

  useEffect(() => {
    getMyRoute()
      .then((data) => setBus(data.bus))
      .catch((err) => setError(err.response?.data?.error || 'Could not load your route.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!bus || !tripActive) return;
    socketRef.current?.emit('driver:join', { busId: bus.id });
  }, [bus, tripActive, socketRef]);

  const handlePosition = useCallback((lat, lng) => {
    if (!bus) return;
    socketRef.current?.emit('driver:location', { busId: bus.id, lat, lng });
    setLastSent({ lat, lng, at: new Date().toLocaleTimeString() });
  }, [bus, socketRef]);

  useGPS(handlePosition, tripActive);

  if (loading) return <LoadingSpinner label="Loading your route..." />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-dark bg-mesh-light dark:bg-mesh-dark pb-10">
<Navbar title="Driver Command Center" onInstall={onInstall} />
      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">
        <ErrorMessage message={error} />

        {bus && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{bus.licensePlate}</p>
                <p className="text-xs text-gray-400">{bus.route?.name}</p>
              </div>
              <StatusBadge variant={available ? 'success' : 'neutral'} dot>
                {available ? 'Available' : 'Off duty'}
              </StatusBadge>
            </div>

            <CapacityMeter current={bus.passengerCount} max={bus.capacity} />

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => setAvailable((v) => !v)}
                className={`text-xs font-medium py-2.5 rounded-xl transition-colors ${
                  available ? 'bg-gray-900/5 dark:bg-white/10 text-gray-600 dark:text-gray-300' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {available ? 'Go Off Duty' : 'Go Available'}
              </button>
              <button
                onClick={() => setTripActive((v) => !v)}
                className={`text-xs font-medium py-2.5 rounded-xl text-white transition-colors ${
                  tripActive ? 'bg-gradient-to-r from-rose-600 to-rose-500' : 'bg-gradient-to-r from-emerald-600 to-emerald-500'
                }`}
              >
                {tripActive ? 'End Trip' : 'Start Broadcasting'}
              </button>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {tripActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="glass-card p-4 flex items-center gap-3"
            >
              <div className="relative w-3 h-3">
                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse-ring" />
                <span className="absolute inset-0 rounded-full bg-emerald-500" />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {lastSent ? `Broadcasting — last sent ${lastSent.at}` : 'Waiting for GPS signal...'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {bus?.route?.pickupPoints?.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">Pickup points</h2>
            <div className="glass-card divide-y divide-gray-100 dark:divide-white/5">
              {bus.route.pickupPoints.map((p) => (
                <div key={p.id} className="p-3.5 text-sm flex justify-between items-center">
                  <span className="text-gray-700 dark:text-gray-200">{p.name}</span>
                  <StatusBadge variant="neutral">{p.tier}</StatusBadge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
