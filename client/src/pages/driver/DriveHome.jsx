import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Clock, FileWarning, Map, MonitorSmartphone, Siren, TriangleAlert, Users, Wifi, WifiOff,
} from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import { useToast } from '../../context/ToastContext';
import { useNow } from '../../hooks/useNow';
import { DOCUMENT_KINDS, VEHICLE_STATUS, apiError } from '../../config/fleet';
import { getMe, getMyVehicle, getTodayRuns } from '../../services/driver.service';
import { setBusStatus } from '../../services/vehicle.service';
import { timeAgo, todayAt } from '../../utils/geo';
import { plural } from '../../utils/format';
import { useDriver } from './DriverContext';

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

// Statuses a driver can set from the road.
const DRIVER_STATUSES = ['OPERATIONAL', 'IN_SERVICE', 'OUT_OF_FUEL'];
const WARN_DAYS = 14;

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
    <section className={`rounded-xl p-5 border ${live ? 'bg-emerald-700 border-emerald-700 text-white' : 'glass-card'}`} aria-labelledby="sharing-title">
      <div className="flex items-center gap-3">
        <span className="relative w-3.5 h-3.5 shrink-0" aria-hidden="true">
          {live && <span className="absolute inset-0 rounded-full bg-white animate-pulse-ring" />}
          <span className={`absolute inset-0 rounded-full ${live ? 'bg-white' : 'bg-amber-500'}`} />
        </span>
        <h2 id="sharing-title" className="text-lg font-bold">
          {live ? 'You are live on the map' : !fix ? 'Waiting for a GPS signal...' : 'Reconnecting...'}
        </h2>
        {/* Separate live region: a heading must keep its heading role. */}
        <p role="status" className="sr-only">{live ? 'You are live on the map.' : !fix ? 'Waiting for a GPS signal.' : 'Reconnecting.'}</p>
      </div>
      {problem && !blocking && <p className="text-sm mt-2">{problem.text}</p>}
      <dl className={`mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm ${live ? '' : 'text-foreground'}`}>
        {[
          ['Last sent', lastSent ? timeAgo(lastSent, now) : '—'],
          ['GPS accuracy', fix ? `± ${Math.round(fix.accuracy)} m` : '—'],
          ['Connection', connection === 'connected'
            ? <span className="flex items-center gap-1.5"><Wifi size={14} aria-hidden="true" /> Online</span>
            : <span className="flex items-center gap-1.5"><WifiOff size={14} aria-hidden="true" /> Reconnecting</span>],
          ['Screen', wakeLock ? 'Stays on' : 'May turn off'],
        ].map(([label, value]) => (
          <div key={label} className={`rounded-lg p-2.5 ${live ? 'bg-white/15' : 'bg-muted'}`}>
            <dt className={`text-xs ${live ? 'text-emerald-50' : 'text-muted-foreground'}`}>{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className={`mt-3 flex items-start gap-2 text-xs ${live ? 'text-emerald-50' : 'text-muted-foreground'}`}>
        <MonitorSmartphone size={16} className="shrink-0" aria-hidden="true" />
        Keep this app open while you drive. Phones pause location sharing when the app is in the background.
      </p>
    </section>
  );
}

// Licence and vehicle documents expiring soon.
function ExpiryBanner({ me, vehicle }) {
  const items = [];
  if (me && ['EXPIRED', 'EXPIRING'].includes(me.licenseStatus) && me.licenseDaysLeft <= WARN_DAYS) {
    items.push(me.licenseStatus === 'EXPIRED' ? 'Your driving licence has expired' : `Your driving licence expires in ${plural(me.licenseDaysLeft, 'day')}`);
  }
  for (const d of [...(me?.documents || []), ...(vehicle?.documents || [])]) {
    if (d.expiry === 'EXPIRED') items.push(`${d.title || DOCUMENT_KINDS[d.kind]} has expired`);
    else if (d.expiry === 'EXPIRING' && (new Date(d.expiresAt) - Date.now()) / 864e5 <= WARN_DAYS) items.push(`${d.title || DOCUMENT_KINDS[d.kind]} expires ${new Date(d.expiresAt).toLocaleDateString()}`);
  }
  if (!items.length) return null;
  return (
    <div role="alert" className="glass-card p-4 border-amber-300 dark:border-amber-500/40 flex gap-3">
      <FileWarning size={20} className="text-amber-600 shrink-0" aria-hidden="true" />
      <div className="text-sm">
        <ul className="font-medium text-foreground">{items.map((t) => <li key={t}>{t}</li>)}</ul>
        <p className="text-muted-foreground mt-1">Tell your transport office so they can renew it.</p>
      </div>
    </div>
  );
}

export default function DriveHome() {
  const { toast } = useToast();
  const {
    bus, setBus, loading, error, fix, gpsError, wakeLock, connection, lastSent, openDialog,
  } = useDriver();
  const now = useNow(5000);
  const [runs, setRuns] = useState(null);
  const [me, setMe] = useState(null);
  const [vehicle, setVehicle] = useState(null);

  useEffect(() => {
    if (!bus) return;
    getTodayRuns().then((d) => setRuns(d.runs)).catch(() => setRuns([]));
    getMe().then((d) => setMe(d.driver)).catch(() => {});
    getMyVehicle().then((d) => setVehicle(d.vehicle)).catch(() => {});
  }, [bus?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeStatus = async (status) => {
    const prev = bus.status;
    setBus({ ...bus, status });
    try {
      await setBusStatus({ status });
    } catch (err) {
      setBus({ ...bus, status: prev });
      toast.error(apiError(err, 'Could not update the status.'));
    }
  };

  const nextRun = runs?.find((r) => (todayAt(r.stops[r.stops.length - 1]?.time)?.getTime() ?? 0) > now) || null;

  return (
    <div className="page-narrow flex flex-col gap-4">
      <div>
        <h1 className="page-title">Drive</h1>
        <p className="page-subtitle">Your location is shared with passengers and the transport office while this app is open.</p>
      </div>

      {loading && <LoadingSpinner label="Loading your vehicle..." />}
      <ErrorMessage message={error} />
      {!loading && !bus && !error && (
        <div className="glass-card p-5 text-sm text-muted-foreground">No vehicle is assigned to you yet. Ask your transport office to assign one.</div>
      )}

      {bus && (
        <>
          <SharingPanel fix={fix} error={gpsError} lastSent={lastSent} connection={connection} wakeLock={wakeLock} now={now} />
          <ExpiryBanner me={me} vehicle={vehicle} />

          <section className="glass-card p-5" aria-labelledby="bus-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="bus-title" className="text-2xl font-bold text-foreground tabular-nums">{bus.licensePlate}</h2>
                <p className="text-sm text-muted-foreground">{[bus.make, bus.model].filter(Boolean).join(' ') || 'Vehicle'} · {bus.route?.name || 'No route assigned'}</p>
              </div>
              {bus.passengerCount > 0 && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground"><Users size={16} aria-hidden="true" /> {bus.passengerCount}</span>
              )}
            </div>
            <p className="field-label mt-4">Vehicle status</p>
            {DRIVER_STATUSES.includes(bus.status) ? (
              <ButtonSelect ariaLabel="Vehicle status" columns="grid grid-cols-3 gap-2"
                options={DRIVER_STATUSES.map((s) => ({ value: s, label: VEHICLE_STATUS[s].label }))} value={bus.status} onChange={changeStatus} />
            ) : (
              <p className="text-sm text-foreground">{VEHICLE_STATUS[bus.status]?.label}. The transport office will put it back on the road.</p>
            )}
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button type="button" className="btn-secondary min-h-14 text-base" onClick={() => openDialog('delay')}>
                <Clock size={20} aria-hidden="true" /> Delay
              </button>
              <button type="button" className="btn-danger min-h-14 text-base" onClick={() => openDialog('emergency')}>
                <Siren size={20} aria-hidden="true" /> Emergency
              </button>
            </div>
          </section>

          <section aria-labelledby="runs-title">
            <h2 id="runs-title" className="section-title mb-2">Today's runs</h2>
            {runs === null ? <div className="skeleton h-16" aria-hidden="true" /> : runs.length === 0 ? (
              <div className="glass-card p-4 text-sm text-muted-foreground">
                No scheduled runs today. <Link to="/driver/map" className="text-link font-medium">Open the route map</Link>
              </div>
            ) : (
              <ul className="glass-card divide-y divide-border overflow-hidden">
                {runs.map((r) => (
                  <li key={r.id}>
                    <Link to={`/driver/map?run=${r.id}`} className="flex items-center gap-3 px-4 py-3 min-h-16 hover:bg-muted transition-colors">
                      <span className="text-xl font-bold tabular-nums text-foreground w-16">{r.time}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{r.label}</span>
                          {nextRun?.id === r.id && <span className="badge-info">Next</span>}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {r.direction === 'PICKUP' ? 'Pickup' : 'Drop-off'} · {plural(r.stops.length, 'stop')} · {plural(r.passengers, 'passenger')}
                        </span>
                      </span>
                      <Map size={18} className="text-muted-foreground" aria-hidden="true" />
                      <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
