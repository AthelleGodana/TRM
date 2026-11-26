import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Siren } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Modal from '../../components/common/Modal';
import ButtonSelect from '../../components/common/ButtonSelect';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DRIVER_MENU, canSee } from '../../config/navigation';
import { getMyRoute } from '../../services/driver.service';
import { send } from '../../services/socket';
import { useConnectionState } from '../../hooks/useLive';
import { useGPS, useWakeLock } from '../../hooks/useGPS';
import { distanceMeters } from '../../utils/geo';
import { DriverContext } from './DriverContext';
import DriveHome from './DriveHome';
import NotFound from '../NotFound';

const RouteMap = lazy(() => import('./RouteMap'));
const MyVehicle = lazy(() => import('./MyVehicle'));
const DriverFuel = lazy(() => import('./DriverFuel'));
const DriverMe = lazy(() => import('./DriverMe'));

// Location is shared whenever the driver area is open (any tab): drivers
// use devices provided by their employer for the job. About every 5 s, or
// sooner after moving 50 m; only the latest reading is ever sent, so
// nothing piles up while offline.
const SEND_EVERY_MS = 5000;
const SEND_AFTER_METERS = 50;
const FRESH_FIX_MS = 10_000;

export default function DriverDashboard({ onInstall }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [bus, setBus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastSent, setLastSent] = useState(null);
  const [dialog, setDialog] = useState(null); // 'delay' | 'emergency' | null
  const [delayMinutes, setDelayMinutes] = useState('10');
  const [emergencyText, setEmergencyText] = useState('');
  const [sending, setSending] = useState(false);

  const reload = useCallback(() => getMyRoute()
    .then((data) => { setBus(data.bus); setError(''); })
    .catch((err) => { if (err.response?.status !== 404) setError(err.response?.data?.error || 'Could not load your route.'); setBus(null); })
    .finally(() => setLoading(false)), []);
  useEffect(() => { reload(); }, [reload]);

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
  }, [fix, connection]);

  // ...and otherwise every few seconds, so a waiting vehicle still shows as live.
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => {
      if (Date.now() - sentAt.current.time >= SEND_EVERY_MS - 250) sendLatest();
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

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

  const value = useMemo(() => ({
    bus, setBus, reload, loading, error, fix, gpsError, wakeLock, connection, lastSent, openDialog: setDialog,
  }), [bus, reload, loading, error, fix, gpsError, wakeLock, connection, lastSent]);

  const nav = DRIVER_MENU.filter((item) => canSee(item, session));

  return (
    <DriverContext.Provider value={value}>
      <AppShell nav={nav} onInstall={onInstall}>
        <Routes>
          <Route index element={<DriveHome />} />
          <Route path="map" element={<RouteMap />} />
          <Route path="vehicle" element={<MyVehicle />} />
          {session.organization?.features?.fuelHub && <Route path="fuel" element={<DriverFuel />} />}
          <Route path="me" element={<DriverMe />} />
          <Route path="*" element={<NotFound homePath="/driver" />} />
        </Routes>
      </AppShell>

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
    </DriverContext.Provider>
  );
}
