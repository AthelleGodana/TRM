import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, Flag, Navigation, RotateCcw, Users, X } from 'lucide-react';
import LiveMap from '../../components/map/LiveMap';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ButtonSelect from '../../components/common/ButtonSelect';
import { useToast } from '../../context/ToastContext';
import { apiError } from '../../config/fleet';
import { getRoster, getTodayRuns, setRosterStatus } from '../../services/driver.service';
import { distanceMeters, etaMinutes, formatDistance, todayAt } from '../../utils/geo';
import { useNow } from '../../hooks/useNow';
import { useDriver } from './DriverContext';

// A stop counts as reached when the vehicle comes this close.
const ARRIVED_METERS = 75;

const storageKey = (date, runId) => `transtrack:visited:${date}:${runId ?? 'route'}`;
function readVisited(key) {
  try { return new Set(JSON.parse(sessionStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function writeVisited(key, set) {
  try { sessionStorage.setItem(key, JSON.stringify([...set])); } catch { /* storage unavailable */ }
}

const directionsUrl = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving`;

export default function RouteMap() {
  const { toast } = useToast();
  const { bus, fix } = useDriver();
  const [params, setParams] = useSearchParams();
  const now = useNow(30_000);
  const [today, setToday] = useState(null);
  const [roster, setRoster] = useState([]);
  const [visited, setVisited] = useState(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!bus) return;
    getTodayRuns().then(setToday).catch(() => setToday({ runs: [], route: null, date: null }));
  }, [bus?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The run being driven: from the URL, else the next one today, else the first.
  const runs = today?.runs || [];
  const defaultRun = runs.find((r) => (todayAt(r.stops[r.stops.length - 1]?.time)?.getTime() ?? 0) > now) || runs[0];
  const runId = Number(params.get('run')) || defaultRun?.id || null;
  const run = runs.find((r) => r.id === runId) || null;

  const stops = useMemo(() => {
    if (run) return run.stops.map((s) => ({ id: s.pickupPointId, name: s.name, lat: s.lat, lng: s.lng, time: s.time, riders: s.riders }));
    return (bus?.route?.pickupPoints || []).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng }));
  }, [run, bus]);

  const key = storageKey(today?.date, run?.id);
  useEffect(() => { setVisited(readVisited(key)); }, [key]);
  useEffect(() => {
    if (!run) { setRoster([]); return; }
    getRoster(run.id).then((d) => setRoster(d.roster)).catch(() => setRoster([]));
  }, [run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = stops.find((s) => !visited.has(s.id)) || null;
  const markVisited = (id, on = true) => {
    setVisited((prev) => {
      const set = new Set(prev);
      if (on) set.add(id); else set.delete(id);
      writeVisited(key, set);
      return set;
    });
  };

  // Arriving at the next stop ticks it off automatically.
  useEffect(() => {
    if (fix && next?.lat != null && distanceMeters(fix, next) <= ARRIVED_METERS) markVisited(next.id);
  }, [fix?.lat, fix?.lng, next?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (studentId, status) => {
    setRoster((r) => r.map((p) => (p.id === studentId ? { ...p, status } : p)));
    try {
      await setRosterStatus({ studentId, status, slotId: run?.id });
    } catch (err) {
      toast.error(apiError(err, 'Could not update.'));
    }
  };

  if (!bus) return <div className="page-narrow"><p className="glass-card p-5 text-sm text-muted-foreground">No vehicle is assigned to you yet.</p></div>;
  if (!today) return <div className="page-narrow"><LoadingSpinner label="Loading your route..." /></div>;

  const geometry = today.route?.geometry || bus.route?.geometry || null;
  const position = fix ? { lat: fix.lat, lng: fix.lng, speedKmh: fix.speed != null ? fix.speed * 3.6 : null, recordedAt: new Date().toISOString() } : null;
  const meters = fix && next?.lat != null ? distanceMeters(fix, next) : null;
  const atNext = roster.filter((p) => p.pickupPointId === next?.id);
  const indexOf = new Map(stops.map((s, i) => [s.id, i]));
  const done = stops.length > 0 && !next;

  return (
    <div className="page max-w-5xl flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="page-title">Route map</h1>
          <p className="page-subtitle">{today.route?.name || bus.route?.name || 'No route assigned'}</p>
        </div>
        {runs.length > 1 && (
          <ButtonSelect ariaLabel="Run" size="sm" value={String(runId || '')}
            options={runs.map((r) => ({ value: String(r.id), label: `${r.time} ${r.direction === 'PICKUP' ? 'pickup' : 'drop-off'}` }))}
            onChange={(v) => setParams({ run: v })} />
        )}
      </div>

      {stops.length === 0 ? (
        <p className="glass-card p-5 text-sm text-muted-foreground">Your route has no stops yet.</p>
      ) : (
        <div className="grid lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <LiveMap position={position} status="moving" label={bus.licensePlate} stops={stops} geometry={geometry}
              myStopId={next?.id} className="h-[55dvh] min-h-[320px] lg:h-[70dvh]"
              stopTooltip={(s, isNext) => `${isNext ? 'Next: ' : ''}${(indexOf.get(s.id) ?? 0) + 1}. ${s.name}${s.time ? ` · ${s.time}` : ''}${s.riders ? ` · ${s.riders} boarding` : ''}`} />
          </div>

          <div className="flex flex-col gap-3">
            {/* Next stop */}
            {/* Announced only when the next stop changes, not on every GPS fix. */}
            <p role="status" aria-atomic="true" className="sr-only">
              {done ? 'All stops done.' : next ? `Next stop: ${next.name}${next.time ? `, due ${next.time}` : ''}.` : ''}
            </p>
            <section className="glass-card p-4" aria-labelledby="next-title">
              {done ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={28} className="text-emerald-600 shrink-0" aria-hidden="true" />
                  <div>
                    <h2 id="next-title" className="section-title">All stops done</h2>
                    <button type="button" className="btn-ghost btn-sm -ml-3" onClick={() => { const s = new Set(); writeVisited(key, s); setVisited(s); }}>
                      <RotateCcw size={14} aria-hidden="true" /> Start again
                    </button>
                  </div>
                </div>
              ) : next && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-link">Next stop · {(indexOf.get(next.id) ?? 0) + 1} of {stops.length}</p>
                  <h2 id="next-title" className="text-xl font-bold text-foreground mt-0.5">{next.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {next.time && <span><span className="text-muted-foreground">Due</span> <span className="font-semibold tabular-nums">{next.time}</span></span>}
                    {meters != null && (
                      <span className="tabular-nums">
                        <span className="font-semibold">{formatDistance(meters)}</span>
                        <span className="text-muted-foreground"> · about {etaMinutes(meters, position?.speedKmh)} min</span>
                      </span>
                    )}
                    {run && <span className="flex items-center gap-1"><Users size={14} aria-hidden="true" /> {next.riders || 0} boarding</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {next.lat != null ? (
                      <a href={directionsUrl(next)} target="_blank" rel="noreferrer" className="btn-primary min-h-12">
                        <Navigation size={18} aria-hidden="true" /> Navigate<span className="sr-only"> to {next.name} (opens Google Maps)</span>
                      </a>
                    ) : <span className="text-xs text-muted-foreground self-center">This stop is not pinned on the map.</span>}
                    <button type="button" className="btn-secondary min-h-12" onClick={() => markVisited(next.id)}>
                      <Flag size={18} aria-hidden="true" /> Done
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Passengers at the next stop */}
            {run && next && (
              <section className="glass-card p-4" aria-labelledby="board-title">
                <h2 id="board-title" className="section-title mb-2">Boarding at {next.name}</h2>
                {atNext.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is booked at this stop.</p> : (
                  <ul className="flex flex-col gap-2">
                    {atNext.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 min-w-0 truncate text-foreground">{p.name}</span>
                        <button type="button" aria-pressed={p.status === 'BOARDED'} aria-label={`${p.name} boarded`}
                          onClick={() => setStatus(p.id, p.status === 'BOARDED' ? 'PENDING' : 'BOARDED')}
                          className={`icon-btn border ${p.status === 'BOARDED' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-border'}`}>
                          <Check size={18} aria-hidden="true" />
                        </button>
                        <button type="button" aria-pressed={p.status === 'NO_SHOW'} aria-label={`${p.name} did not show`}
                          onClick={() => setStatus(p.id, p.status === 'NO_SHOW' ? 'PENDING' : 'NO_SHOW')}
                          className={`icon-btn border ${p.status === 'NO_SHOW' ? 'bg-red-600 text-white border-red-600' : 'border-border'}`}>
                          <X size={18} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* All stops */}
            <section className="glass-card" aria-labelledby="stops-title">
              <h2 id="stops-title" className="section-title">
                <button type="button" className="w-full flex items-center justify-between gap-3 p-4 text-left" aria-expanded={showAll} onClick={() => setShowAll((s) => !s)}>
                  <span>All stops</span>
                  <span className="text-sm font-normal text-muted-foreground">{visited.size} of {stops.length} done</span>
                </button>
              </h2>
              {showAll && (
                <ol className="border-t border-border divide-y divide-border">
                  {stops.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className={`w-6 h-6 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center tabular-nums ${
                        visited.has(s.id) ? 'bg-emerald-600 text-white' : s.id === next?.id ? 'bg-primary-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                        {visited.has(s.id) ? <Check size={14} aria-hidden="true" /> : i + 1}
                      </span>
                      <span className={`flex-1 min-w-0 truncate ${visited.has(s.id) ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{s.name}</span>
                      {s.time && <span className="text-xs tabular-nums text-muted-foreground">{s.time}</span>}
                      {visited.has(s.id) && (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => markVisited(s.id, false)} aria-label={`Undo ${s.name}`}>Undo</button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
