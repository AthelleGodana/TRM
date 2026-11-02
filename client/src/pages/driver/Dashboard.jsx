import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gauge, Radio, Square } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import StatusBadge from '../../components/common/StatusBadge';
import { getMyRoute } from '../../services/driver.service';
import { useSocket } from '../../hooks/useSocket';
import { useGPS } from '../../hooks/useGPS';

function CapacityMeter({ current, max }) {
  const pct = max ? Math.min(100, Math.round((current / max) * 100)) : 0;
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-sm text-muted-foreground mb-1.5">
        <span className="flex items-center gap-1.5"><Gauge size={16} aria-hidden="true" /> Passengers</span>
        <span className="tabular-nums">{current}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={max || 0}
        aria-valuenow={current} aria-label="Passengers on board">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
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

  return (
    <AppShell onInstall={onInstall}>
      <div className="page-narrow flex flex-col gap-4">
        <div>
          <h1 className="page-title">My trip</h1>
          <p className="page-subtitle">Share your location while you drive so passengers can see the bus.</p>
        </div>

        {loading && <LoadingSpinner label="Loading your route..." />}
        <ErrorMessage message={error} />
        {!loading && !bus && !error && (
          <div className="glass-card p-5 text-sm text-muted-foreground">
            No vehicle is assigned to you yet. Ask your transport officer to assign one.
          </div>
        )}

        {bus && (
          <section className="glass-card p-5" aria-labelledby="bus-title">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 id="bus-title" className="text-lg font-bold text-foreground tabular-nums">{bus.licensePlate}</h2>
                <p className="text-sm text-muted-foreground">{bus.route?.name || 'No route assigned'}</p>
              </div>
              <StatusBadge variant={available ? 'success' : 'neutral'} dot>
                {available ? 'Available' : 'Off duty'}
              </StatusBadge>
            </div>

            <CapacityMeter current={bus.passengerCount} max={bus.capacity} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
              <button
                type="button"
                onClick={() => setTripActive((v) => !v)}
                aria-pressed={tripActive}
                className={tripActive ? 'btn-danger' : 'btn-primary'}
              >
                {tripActive
                  ? <><Square size={18} aria-hidden="true" /> End trip</>
                  : <><Radio size={18} aria-hidden="true" /> Start sharing location</>}
              </button>
              <button type="button" onClick={() => setAvailable((v) => !v)} aria-pressed={!available} className="btn-secondary">
                {available ? 'Go off duty' : 'Go available'}
              </button>
            </div>
          </section>
        )}

        <AnimatePresence>
          {tripActive && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="glass-card p-4 flex items-center gap-3"
              role="status"
            >
              <span className="relative w-3 h-3 shrink-0" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse-ring" />
                <span className="absolute inset-0 rounded-full bg-emerald-500" />
              </span>
              <span className="text-sm text-muted-foreground">
                {lastSent ? `Sharing location. Last sent at ${lastSent.at}.` : 'Waiting for a GPS signal...'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {bus?.route?.pickupPoints?.length > 0 && (
          <section aria-labelledby="stops-title">
            <h2 id="stops-title" className="section-title mb-2">Pickup points</h2>
            <ol className="glass-card divide-y divide-border">
              {bus.route.pickupPoints.map((p, i) => (
                <li key={p.id} className="px-4 py-3 text-sm flex items-center gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-foreground">{p.name}</span>
                  <StatusBadge variant="neutral">{p.tier}</StatusBadge>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </AppShell>
  );
}
