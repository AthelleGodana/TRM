import { useEffect, useRef, useState } from 'react';
import { Clock, Gauge, MonitorSmartphone, Siren, TriangleAlert, Wifi, WifiOff } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import ButtonSelect from '../../components/common/ButtonSelect';
import { useToast } from '../../context/ToastContext';
import { getMyRoute } from '../../services/driver.service';
import { send } from '../../services/socket';
import { useConnectionState } from '../../hooks/useLive';
import { useGPS, useWakeLock } from '../../hooks/useGPS';
import { useNow } from '../../hooks/useNow';
import { distanceMeters, timeAgo } from '../../utils/geo';

// Location is shared whenever this screen is open: drivers use devices
// provided by their employer for the job. About every 5 s, or sooner after
// moving 50 m; only the latest reading is ever sent, so nothing piles up
// while offline.
const SEND_EVERY_MS = 5000;
const SEND_AFTER_METERS = 50;
const FRESH_FIX_MS = 10_000;

const GPS_PROBLEMS = {
  denied: {
    title: 'Location is blocked',
    text: 'Allow location for this site in the browser settings (padlock icon next to the address), then reload the page.',
  },
  insecure: {
    title: 'Location needs a secure connection',
    text: 'Open the app over https (or on localhost). Browsers block GPS on plain http addresses.',
  },
  unsupported: { title: 'This device cannot share location', text: 'Use a phone with GPS and an up-to-date browser.' },
  unavailable: { title: 'No GPS signal', text: 'Move to an open area and make sure location services are on.' },
  timeout: { title: 'Waiting for a GPS signal', text: 'This can take a minute indoors.' },
};

function CapacityMeter({ current, max }) {
  const pct = max ? Math.min(100, Math.round((current / max) * 100)) : 0;
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-sm text-muted-foreground mb-1.5">
        <span className="flex items-center gap-1.5"><Gauge size={16} aria-hidden="true" /> Registered passengers</span>
        <span className="tabular-nums">{current}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={max || 0}
        aria-valuenow={current} aria-label="Registered passengers">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SharingPanel({ fix, error, lastSent, connection, wakeLock, now }) {
  const problem = error && GPS_PROBLEMS[error];
  const blocking = ['denied', 'insecure', 'unsupported'].includes(error);
  if (blocking) {
    return (
      <div role="alert" className="glass-card p-5 border-red-300 dark:border-red-500/40 flex gap-3">
        <TriangleAlert size={22} className="text-danger shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">{problem.title}</p>
          <p className="text-sm text-muted-foreground mt-1">{problem.text}</p>
        </div>
      </div>
    );
  }

  const live = fix && connection === 'connected' && lastSent && now - lastSent < 30_000;
  return (
    <section className="glass-card p-5" aria-labelledby="sharing-title">
      <div className="flex items-center gap-3">
        <span className="relative w-3 h-3 shrink-0" aria-hidden="true">
          {live && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse-ring" />}
          <span className={`absolute inset-0 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        </span>
        <h2 id="sharing-title" className="section-title" role="status">
          {live ? 'Sharing your location' : !fix ? 'Waiting for a GPS signal...' : 'Reconnecting...'}
        </h2>
      </div>
      {problem && !blocking && <p className="text-sm text-muted-foreground mt-2">{problem.text}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Last sent</dt>
          <dd className="font-medium text-foreground">{lastSent ? timeAgo(lastSent, now) : '—'}</dd>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-xs text-muted-foreground">GPS accuracy</dt>
          <dd className="font-medium text-foreground tabular-nums">{fix ? `± ${Math.round(fix.accuracy)} m` : '—'}</dd>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Connection</dt>
          <dd className="font-medium text-foreground flex items-center gap-1.5">
            {connection === 'connected'
              ? <><Wifi size={14} aria-hidden="true" /> Online</>
              : <><WifiOff size={14} aria-hidden="true" /> Reconnecting</>}
          </dd>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Screen</dt>
          <dd className="font-medium text-foreground">{wakeLock ? 'Stays on' : 'May turn off'}</dd>
        </div>
      </dl>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <MonitorSmartphone size={16} className="shrink-0" aria-hidden="true" />
        Keep this app open on this screen while you drive. Phones pause location sharing when the app is in the background.
      </p>
    </section>
  );
}

export default function DriverDashboard({ onInstall }) {
  const { toast } = useToast();
  const [bus, setBus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastSent, setLastSent] = useState(null);
  const [dialog, setDialog] = useState(null); // 'delay' | 'emergency' | null
  const [delayMinutes, setDelayMinutes] = useState('10');
  const [emergencyText, setEmergencyText] = useState('');
  const [sending, setSending] = useState(false);
  const now = useNow(5000);

  useEffect(() => {
    getMyRoute()
      .then((data) => setBus(data.bus))
      .catch((err) => setError(err.response?.data?.error || 'Could not load your route.'))
      .finally(() => setLoading(false));
  }, []);

  const active = Boolean(bus);
  const { fix, error: gpsError } = useGPS(active);
  const wakeLock = useWakeLock(active);
  const connection = useConnectionState();

  const latest = useRef(null);
  const sentAt = useRef({ time: 0, point: null });
  latest.current = fix;

  const sendLatest = async () => {
    const f = latest.current;
    if (!f) return;
    const at = Date.now() - f.at < FRESH_FIX_MS ? f.at : Date.now();
    sentAt.current = { time: Date.now(), point: f };
    const res = await send('driver:location', {
      lat: f.lat, lng: f.lng, accuracy: f.accuracy, speed: f.speed, heading: f.heading, at,
    });
    if (res?.ok) setLastSent(Date.now());
  };

  // Send straight away after real movement...
  useEffect(() => {
    if (!fix || connection !== 'connected') return;
    const prev = sentAt.current.point;
    if (!prev || distanceMeters(prev, fix) >= SEND_AFTER_METERS) sendLatest();
  }, [fix, connection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ...and otherwise every few seconds, so a waiting bus still shows as live.
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => {
      if (Date.now() - sentAt.current.time >= SEND_EVERY_MS - 250) sendLatest();
    }, 1000);
    return () => clearInterval(id);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const report = async (event, payload, success) => {
    setSending(true);
    const res = await send(event, payload);
    setSending(false);
    if (res?.ok) {
      toast.success(success);
      setDialog(null);
      setEmergencyText('');
    } else {
      toast.error('Not sent. Check your connection and try again.');
    }
  };

  return (
    <AppShell onInstall={onInstall}>
      <div className="page-narrow flex flex-col gap-4">
        <div>
          <h1 className="page-title">My trip</h1>
          <p className="page-subtitle">Your location is shared with your passengers and the transport office while this app is open.</p>
        </div>

        {loading && <LoadingSpinner label="Loading your route..." />}
        <ErrorMessage message={error} />
        {!loading && !bus && !error && (
          <div className="glass-card p-5 text-sm text-muted-foreground">
            No vehicle is assigned to you yet. Ask your transport officer to assign one.
          </div>
        )}

        {bus && (
          <>
            <SharingPanel fix={fix} error={gpsError} lastSent={lastSent} connection={connection} wakeLock={wakeLock} now={now} />

            <section className="glass-card p-5" aria-labelledby="bus-title">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 id="bus-title" className="text-lg font-bold text-foreground tabular-nums">{bus.licensePlate}</h2>
                  <p className="text-sm text-muted-foreground">{bus.route?.name || 'No route assigned'}</p>
                </div>
                <StatusBadge variant={fix ? 'success' : 'neutral'} dot>{fix ? 'On the map' : 'Not on the map yet'}</StatusBadge>
              </div>
              <CapacityMeter current={bus.passengerCount} max={bus.capacity} />
              <div className="grid grid-cols-2 gap-3 mt-5">
                <button type="button" className="btn-secondary" onClick={() => setDialog('delay')}>
                  <Clock size={18} aria-hidden="true" /> Report delay
                </button>
                <button type="button" className="btn-danger" onClick={() => setDialog('emergency')}>
                  <Siren size={18} aria-hidden="true" /> Emergency
                </button>
              </div>
            </section>

            {bus.route?.pickupPoints?.length > 0 && (
              <section aria-labelledby="stops-title">
                <h2 id="stops-title" className="section-title mb-2">Pickup points</h2>
                <ol className="glass-card divide-y divide-border">
                  {bus.route.pickupPoints.map((p, i) => {
                    const dist = fix && p.lat != null ? distanceMeters(fix, p) : null;
                    return (
                      <li key={p.id} className="px-4 py-3 text-sm flex items-center gap-3">
                        <span className="w-6 h-6 shrink-0 rounded-full bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center tabular-nums">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-foreground">{p.name}</span>
                        {dist != null && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
          </>
        )}
      </div>

      <Modal open={dialog === 'delay'} onClose={() => setDialog(null)} title="Report a delay">
        <p className="text-sm text-muted-foreground mb-3">Your passengers and the transport office will be told.</p>
        <p className="field-label">How late will you be?</p>
        <ButtonSelect
          ariaLabel="Minutes late"
          options={['5', '10', '15', '30'].map((m) => ({ value: m, label: `${m} min` }))}
          value={delayMinutes}
          onChange={setDelayMinutes}
        />
        <button type="button" disabled={sending} className="btn-primary w-full mt-5"
          onClick={() => report('driver:delay', { minutes: Number(delayMinutes) }, 'Delay reported.')}>
          {sending ? 'Sending...' : `Report ${delayMinutes} minute delay`}
        </button>
      </Modal>

      <Modal open={dialog === 'emergency'} onClose={() => setDialog(null)} title="Report an emergency">
        <p className="text-sm text-muted-foreground mb-3">
          An alert goes to your passengers and the transport office immediately. In danger, call 999 or 112 first.
        </p>
        <label htmlFor="emergency-text" className="field-label">What happened? <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea id="emergency-text" rows={3} maxLength={500} className="input-field"
          placeholder="e.g. Breakdown near Lavington Mall, everyone is safe"
          value={emergencyText} onChange={(e) => setEmergencyText(e.target.value)} />
        <button type="button" disabled={sending} className="btn-danger w-full mt-4"
          onClick={() => report('driver:emergency', { message: emergencyText }, 'Emergency alert sent.')}>
          <Siren size={18} aria-hidden="true" /> {sending ? 'Sending...' : 'Send emergency alert'}
        </button>
      </Modal>
    </AppShell>
  );
}
