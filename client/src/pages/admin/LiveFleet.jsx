import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { BellRing, BusFront, Clock, Siren, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import ErrorMessage from '../../components/common/ErrorMessage';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import StatusBadge from '../../components/common/StatusBadge';
import ButtonSelect from '../../components/common/ButtonSelect';
import { busIcon, DEFAULT_CENTER } from '../../components/map/mapIcons';
import { getBusTrail, getLiveFleet } from '../../services/gps.service';
import { useConnectionState, useSocketEvent } from '../../hooks/useLive';
import { useNow } from '../../hooks/useNow';
import { useToast } from '../../context/ToastContext';
import { busStatus, timeAgo } from '../../utils/geo';

const STATUS_VARIANT = { moving: 'success', stopped: 'warning', offline: 'neutral' };
const MAX_ALERTS = 20;

// Fits the map to every bus once, then flies to the selected bus.
function MapController({ points, selected }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    fitted.current = true;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(points, { padding: [48, 48], maxZoom: 15 });
  }, [points, map]);
  useEffect(() => {
    if (!selected) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    map.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 15), { animate: !reduce });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Staff live map: every bus in the organisation, its status and last-seen
// time, today's trail for the selected bus, and driver alerts as they come.
export default function LiveFleet() {
  const { toast } = useToast();
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [trail, setTrail] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const now = useNow(5000);
  const connection = useConnectionState();

  const load = () => getLiveFleet()
    .then((d) => { setBuses(d.buses); setError(''); })
    .catch(() => setError('Could not load the fleet.'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  // Reload after a reconnect, since updates may have been missed.
  useEffect(() => { if (connection === 'connected' && !loading) load(); }, [connection]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (busId, fn) => setBuses((list) => list.map((b) => (b.id === busId ? fn(b) : b)));
  useSocketEvent('bus:location', (p) => {
    patch(p.busId, (b) => ({ ...b, last: p, online: true }));
    if (p.busId === selectedId) setTrail((t) => [...t, [p.lat, p.lng]]);
  });
  useSocketEvent('bus:offline', (p) => patch(p.busId, (b) => ({ ...b, online: false })));
  useSocketEvent('admin:alert', (a) => {
    const plate = buses.find((b) => b.id === a.busId)?.licensePlate || `Bus ${a.busId}`;
    const text = a.type === 'EMERGENCY' ? a.message : `Running about ${a.minutes} min late`;
    setAlerts((list) => [{ ...a, plate, text, key: `${a.at}-${a.busId}` }, ...list].slice(0, MAX_ALERTS));
    if (a.type === 'EMERGENCY') toast.emergency(`${plate}: ${text}`, { title: 'Emergency' });
    else toast.warning(`${plate}: ${text}`, { title: 'Delay' });
  });

  useEffect(() => {
    setTrail([]);
    if (!selectedId) return;
    getBusTrail(selectedId)
      .then((d) => setTrail(d.logs.map((l) => [l.lat, l.lng])))
      .catch(() => setTrail([]));
  }, [selectedId]);

  const withStatus = useMemo(() => buses.map((b) => ({
    ...b,
    state: busStatus(b.last, { offline: !b.online && b.last && now - new Date(b.last.recordedAt).getTime() > 60_000, now }),
  })), [buses, now]);
  const counts = withStatus.reduce((acc, b) => ({ ...acc, [b.state.key]: (acc[b.state.key] || 0) + 1 }), {});
  const shown = filter ? withStatus.filter((b) => b.state.key === filter) : withStatus;
  const selected = withStatus.find((b) => b.id === selectedId);
  const points = withStatus.filter((b) => b.last).map((b) => [b.last.lat, b.last.lng]);

  const filters = [
    { value: 'moving', label: `Moving (${counts.moving || 0})` },
    { value: 'stopped', label: `Stopped (${counts.stopped || 0})` },
    { value: 'offline', label: `Offline (${counts.offline || 0})` },
  ];

  return (
    <div className="page">
      <PageHeader title="Live map" subtitle="Where every vehicle is right now. Positions update every few seconds.">
        {connection !== 'connected' && <span role="status" className="badge-warning">Reconnecting...</span>}
      </PageHeader>
      <ErrorMessage message={error} />
      {loading ? <LoadingSpinner label="Loading the fleet..." /> : (
        <div className="grid lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 lg:order-2 flex flex-col gap-3">
            <div className="relative h-[360px] sm:h-[480px] lg:h-[600px] rounded-xl overflow-hidden border border-border">
              <MapContainer center={points[0] || DEFAULT_CENTER} zoom={13} className="w-full h-full z-0" aria-label="Map of all vehicles">
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.75 }} />}
                {withStatus.filter((b) => b.last).map((b) => (
                  <Marker
                    key={b.id}
                    position={[b.last.lat, b.last.lng]}
                    icon={busIcon(b.state.key, b.licensePlate, b.id === selectedId)}
                    zIndexOffset={b.id === selectedId ? 1000 : 0}
                    eventHandlers={{ click: () => setSelectedId(b.id) }}
                    title={`${b.licensePlate}: ${b.state.label}`}
                  >
                    <Tooltip direction="top" offset={[0, -22]}>{b.licensePlate} · {b.state.label}</Tooltip>
                  </Marker>
                ))}
                <MapController points={points} selected={selected?.last ? { id: selected.id, ...selected.last } : null} />
              </MapContainer>
            </div>

            {selected && (
              <section className="glass-card p-4" aria-labelledby="selected-title">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="selected-title" className="section-title tabular-nums">{selected.licensePlate}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selected.route?.name || 'No route'} · {selected.driver || 'No driver'}
                    </p>
                  </div>
                  <button type="button" className="icon-btn -m-2" onClick={() => setSelectedId(null)} aria-label="Close vehicle details">
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg bg-muted p-3">
                    <dt className="text-xs text-muted-foreground">Status</dt>
                    <dd><StatusBadge variant={STATUS_VARIANT[selected.state.key]} dot>{selected.state.label}</StatusBadge></dd>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <dt className="text-xs text-muted-foreground">Speed</dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {selected.last?.speedKmh != null && selected.state.key !== 'offline' ? `${selected.last.speedKmh} km/h` : '—'}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <dt className="text-xs text-muted-foreground">Last seen</dt>
                    <dd className="font-medium text-foreground">{selected.last ? timeAgo(selected.last.recordedAt, now) : 'Never'}</dd>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <dt className="text-xs text-muted-foreground">Today's trail</dt>
                    <dd className="font-medium text-foreground tabular-nums">{trail.length} points</dd>
                  </div>
                </dl>
              </section>
            )}
          </div>

          <div className="lg:order-1 flex flex-col gap-4">
            <ButtonSelect ariaLabel="Filter vehicles by status" options={filters} value={filter} onChange={setFilter}
              allowClear clearLabel={`All (${withStatus.length})`} size="sm" />
            <section className="glass-card overflow-hidden" aria-label="Vehicles">
              {shown.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  {withStatus.length === 0 ? 'No vehicles yet. Add them under Fleet.' : 'No vehicles in this group.'}
                </p>
              )}
              <ul className="divide-y divide-border max-h-[480px] overflow-y-auto">
                {shown.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}
                      aria-pressed={b.id === selectedId}
                      className={`w-full text-left flex items-center gap-3 min-h-14 px-4 py-3 transition-colors ${
                        b.id === selectedId ? 'bg-primary-50 dark:bg-primary-500/10' : 'hover:bg-muted'
                      }`}
                    >
                      <BusFront size={20} className="text-muted-foreground shrink-0" aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-foreground tabular-nums">{b.licensePlate}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {b.driver || 'No driver'} · {b.last ? timeAgo(b.last.recordedAt, now) : 'never seen'}
                        </span>
                      </span>
                      <StatusBadge variant={STATUS_VARIANT[b.state.key]} dot>{b.state.label}</StatusBadge>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass-card p-4" aria-labelledby="alerts-title">
              <h2 id="alerts-title" className="section-title flex items-center gap-2 mb-2">
                <BellRing size={18} aria-hidden="true" /> Driver alerts
              </h2>
              {alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Delays and emergencies reported by drivers appear here while this page is open.</p>
              ) : (
                <ul className="flex flex-col gap-2" aria-live="polite">
                  {alerts.map((a) => (
                    <li key={a.key} className="flex gap-2 text-sm">
                      {a.type === 'EMERGENCY'
                        ? <Siren size={16} className="text-danger shrink-0 mt-0.5" aria-hidden="true" />
                        : <Clock size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />}
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{a.plate}</span>
                        <span className="text-muted-foreground"> · {a.text} · {timeAgo(a.at, now)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
