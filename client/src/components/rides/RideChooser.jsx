import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Lock, MapPin, Moon, Pencil, Sun } from 'lucide-react';
import LiveMap from '../map/LiveMap';
import Modal from '../common/Modal';
import ErrorMessage from '../common/ErrorMessage';
import LoadingSpinner from '../common/LoadingSpinner';
import ButtonSelect from '../common/ButtonSelect';
import { useToast } from '../../context/ToastContext';
import { WEEKDAYS, apiError } from '../../config/fleet';
import { ridesApi } from '../../services/rides.service';
import { plural } from '../../utils/format';
import { listAvailableRoutes, registerForRoute } from '../../services/student.service';

const DIRECTIONS = {
  PICKUP: { title: 'Pickup', hint: 'Where and when you are picked up', icon: Sun },
  DROPOFF: { title: 'Drop-off', hint: 'Where and when you are dropped off', icon: Moon },
};

const daysText = (days) => (days.length === 7 ? 'every day' : days.join(',') === '1,2,3,4,5' ? 'Mon–Fri'
  : WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.short).join(' '));

function dayLabel(date, i) {
  if (i === 0) return 'Today';
  if (i === 1) return 'Tomorrow';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function SeatsBar({ left, capacity }) {
  const pct = capacity ? Math.round(((capacity - left) / capacity) * 100) : 0;
  const tone = left === 0 ? 'bg-red-500' : left <= 3 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="w-16 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      {left === 0 ? 'Full' : `${left} seat${left === 1 ? '' : 's'} left`}
    </span>
  );
}

// Two-step picker: stop first, then a run showing the time it reaches that
// stop. `seatsFor(run)` gives seats left (standing, or for one date).
function StopAndRun({ data, direction, initial, seatsFor, onPick, saving, submitLabel, onStopChange }) {
  const [stopId, setStopId] = useState(initial?.pickupPointId || null);
  const [runId, setRunId] = useState(initial?.slotId || null);
  const stops = data.route.pickupPoints;
  const runs = data.directions[direction].runs;
  useEffect(() => { onStopChange?.(stopId); }, [stopId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!runs.length) return <p className="text-sm text-muted-foreground">No {DIRECTIONS[direction].title.toLowerCase()} runs are scheduled on your route yet.</p>;

  if (!stopId) {
    return (
      <div>
        <p className="field-label">1. Choose your stop</p>
        <ul className="flex flex-col gap-2">
          {stops.map((s) => (
            <li key={s.id}>
              <button type="button" disabled={!s.allowed} onClick={() => setStopId(s.id)}
                className="w-full min-h-12 px-3 py-2 rounded-lg border border-border text-left flex items-center gap-3 hover:border-primary-400 disabled:opacity-60 disabled:hover:border-border">
                <MapPin size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground">{s.name}</span>
                  {!s.allowed && <span className="block text-xs text-muted-foreground">Not included in your plan ({s.tier.toLowerCase()} stop)</span>}
                </span>
                {!s.allowed && <Lock size={16} className="text-muted-foreground" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const stop = stops.find((s) => s.id === stopId);
  return (
    <div>
      <button type="button" className="btn-ghost btn-sm -ml-3 mb-1" onClick={() => { setStopId(null); setRunId(null); }}>
        <ArrowLeft size={16} aria-hidden="true" /> {stop?.name} · change stop
      </button>
      <p className="field-label">2. Choose a time</p>
      <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Run">
        {runs.map((r) => {
          const left = seatsFor(r);
          const full = left === 0 && r.id !== initial?.slotId;
          const selected = runId === r.id;
          return (
            <li key={r.id}>
              <button type="button" role="radio" aria-checked={selected} disabled={full || left == null} onClick={() => setRunId(r.id)}
                className={`w-full min-h-14 px-3 py-2 rounded-lg border text-left flex items-center gap-3 transition-colors disabled:opacity-60 ${
                  selected ? 'border-primary-600 bg-primary-50 dark:bg-primary-500/10' : 'border-border hover:border-primary-400'}`}>
                <span className="text-lg font-bold tabular-nums text-foreground w-16">{r.stopTimes[stopId] || r.time}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-foreground">{r.label}{r.bus ? ` · ${r.bus.licensePlate}` : ''}</span>
                  <span className="block text-xs text-muted-foreground">{left == null ? 'Does not run that day' : daysText(r.daysOfWeek)}</span>
                </span>
                {left != null && <SeatsBar left={left} capacity={r.capacity} />}
                {selected && <Check size={18} className="text-link shrink-0" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn-primary w-full mt-4" disabled={!runId || saving} onClick={() => onPick(stopId, runId)}>
        {saving ? 'Saving...' : submitLabel}
      </button>
    </div>
  );
}

function RoutePicker({ onChosen }) {
  const { toast } = useToast();
  const [routes, setRoutes] = useState(null);
  const [choice, setChoice] = useState('');
  useEffect(() => { listAvailableRoutes().then((d) => setRoutes(d.routes)).catch(() => setRoutes([])); }, []);
  if (!routes) return <LoadingSpinner label="Loading routes..." />;
  const save = async () => {
    try {
      await registerForRoute({ routeId: Number(choice) });
      onChosen();
    } catch (err) {
      toast.error(apiError(err, 'Could not save your route.'));
    }
  };
  return (
    <section className="glass-card p-5">
      <h2 className="section-title">Choose your standard route</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-3">You choose it once; your transport office can change it later.</p>
      {routes.length === 0 ? <p className="text-sm text-muted-foreground">No routes are available yet.</p> : (
        <>
          <ButtonSelect ariaLabel="Route" options={routes.map((r) => ({ value: String(r.id), label: r.name }))} value={choice} onChange={setChoice} />
          <button type="button" className="btn-primary w-full mt-4" disabled={!choice} onClick={save}>Use this route</button>
        </>
      )}
    </section>
  );
}

// Pickup and drop-off for one passenger: standing choice per direction and
// the next two weeks with one-day changes. childId: a parent acting for a child.
export default function RideChooser({ childId = null, passengerName = null }) {
  const { toast } = useToast();
  const api = useMemo(() => ridesApi(childId), [childId]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // 'PICKUP' | 'DROPOFF'
  const [day, setDay] = useState(null); // { date, direction, index }
  const [dayMode, setDayMode] = useState('menu'); // menu | change
  const [saving, setSaving] = useState(false);
  const [mapStop, setMapStop] = useState(null);

  const load = useCallback(() => api.get().then(setData).catch((err) => setError(apiError(err, 'Could not load rides.'))), [api]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, success) => {
    setSaving(true);
    try {
      const next = await fn();
      if (next?.directions) setData(next); else await load();
      toast.success(success || next?.message || 'Saved.');
      setEditing(null);
      setDay(null);
    } catch (err) {
      toast.error(apiError(err, 'That did not work. Try again.'));
      load();
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorMessage message={error} />;
  if (!data) return <LoadingSpinner label="Loading rides..." />;
  if (data.needsRoute) {
    return childId
      ? <p className="glass-card p-5 text-sm text-muted-foreground">No standard route is set for {passengerName || 'this child'} yet. Ask the transport office to assign one.</p>
      : <RoutePicker onChosen={load} />;
  }

  const who = passengerName || 'you';
  const dayInfo = day && data.days[day.index]?.[day.direction];

  return (
    <div className="flex flex-col gap-5">
      <section className="glass-card p-4" aria-labelledby="route-title">
        <p className="text-xs text-muted-foreground">Standard route</p>
        <h2 id="route-title" className="section-title">{data.route.name}</h2>
        <LiveMap stops={data.route.pickupPoints} geometry={data.route.geometry} myStopId={mapStop || data.directions.PICKUP.booking?.pickupPointId}
          label="Route" className="h-48 sm:h-64 mt-3" />
      </section>

      <div className="grid sm:grid-cols-2 gap-4">
        {Object.entries(DIRECTIONS).map(([direction, meta]) => {
          const b = data.directions[direction].booking;
          const Icon = meta.icon;
          return (
            <section key={direction} className="glass-card p-5" aria-labelledby={`${direction}-title`}>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon size={18} aria-hidden="true" />
                <h2 id={`${direction}-title`} className="text-sm font-semibold">{meta.title}</h2>
              </div>
              {b ? (
                <>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{b.time}</p>
                  <p className="text-sm text-foreground">{b.stopName}</p>
                  <p className="text-xs text-muted-foreground">{b.slotLabel}</p>
                </>
              ) : <p className="mt-2 text-sm text-muted-foreground">Not chosen yet. {meta.hint}.</p>}
              <div className="flex gap-2 mt-4">
                <button type="button" className={b ? 'btn-secondary flex-1' : 'btn-primary flex-1'} onClick={() => setEditing(direction)}>
                  {b ? <><Pencil size={16} aria-hidden="true" /> Change</> : `Choose ${meta.title.toLowerCase()}`}
                </button>
                {b && (
                  <button type="button" className="btn-ghost" onClick={() => window.confirm(`Stop the usual ${meta.title.toLowerCase()} for ${who}?`)
                    && act(() => api.clearStanding(direction), 'Removed.')}>Remove</button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="days-title">
        <h2 id="days-title" className="section-title">Next {data.days.length} days</h2>
        <p className="text-sm text-muted-foreground mb-2">Tap a ride to skip it or change it for that day only. Changes close {plural(data.cutoffMinutes, 'minute')} before pickup.</p>
        <ul className="glass-card divide-y divide-border">
          {data.days.map((d, i) => (
            <li key={d.date} className="px-4 py-2 flex flex-wrap items-center gap-2">
              <span className="w-28 text-sm font-medium text-foreground">{dayLabel(d.date, i)}</span>
              {Object.keys(DIRECTIONS).map((direction) => {
                const r = d[direction];
                const hasRuns = data.directions[direction].runs.length > 0;
                const text = r.status === 'SKIPPED' ? 'Skipped' : r.status === 'NONE' ? 'No ride' : `${r.time} ${r.stopName}`;
                const tone = r.status === 'SKIPPED' ? 'border-dashed text-muted-foreground line-through'
                  : r.status === 'CHANGED' ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10'
                    : r.status === 'NONE' ? 'text-muted-foreground' : '';
                return (
                  <button key={direction} type="button" disabled={r.locked || !hasRuns}
                    onClick={() => { setDay({ date: d.date, direction, index: i }); setDayMode('menu'); }}
                    aria-label={`${DIRECTIONS[direction].title} ${dayLabel(d.date, i)}: ${text}${r.status === 'CHANGED' ? ' (changed)' : ''}${r.locked ? ', changes closed' : ''}`}
                    className={`flex-1 min-w-[9rem] min-h-10 px-3 py-1.5 rounded-lg border border-border text-left text-sm flex items-center gap-2 hover:border-primary-400 disabled:hover:border-border disabled:opacity-70 ${tone}`}>
                    {direction === 'PICKUP' ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
                    <span className="truncate tabular-nums">{text}</span>
                    {r.locked && <Lock size={12} className="ml-auto shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </li>
          ))}
        </ul>
      </section>

      <Modal open={!!editing} onClose={() => { setEditing(null); setMapStop(null); }} title={`Usual ${editing ? DIRECTIONS[editing].title.toLowerCase() : ''}`}>
        {editing && (
          <StopAndRun data={data} direction={editing} initial={data.directions[editing].booking} saving={saving}
            seatsFor={(r) => r.seatsLeft} submitLabel="Save as usual ride" onStopChange={setMapStop}
            onPick={(stopId, runId) => act(() => api.setStanding(editing, stopId, runId), 'Saved. This is now the usual ride.')} />
        )}
      </Modal>

      <Modal open={!!day} onClose={() => setDay(null)} title={day ? `${DIRECTIONS[day.direction].title} · ${dayLabel(day.date, day.index)}` : ''}>
        {day && dayMode === 'menu' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground mb-2">
              {dayInfo?.status === 'NONE' ? 'No ride booked this day.' : dayInfo?.status === 'SKIPPED' ? 'This ride is skipped.' : `${dayInfo?.time} at ${dayInfo?.stopName} (${dayInfo?.slotLabel}).`}
            </p>
            {dayInfo?.status !== 'SKIPPED' && dayInfo?.status !== 'NONE' && (
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => act(() => api.setDay(day.direction, day.date, { skip: true }), 'Skipped for that day.')}>
                Skip this day
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => setDayMode('change')}>Change stop or time for this day</button>
            {(dayInfo?.status === 'SKIPPED' || dayInfo?.status === 'CHANGED') && data.directions[day.direction].booking && (
              <button type="button" className="btn-primary" disabled={saving} onClick={() => act(() => api.clearDay(day.direction, day.date))}>Back to usual ride</button>
            )}
          </div>
        )}
        {day && dayMode === 'change' && (
          <StopAndRun data={data} direction={day.direction} initial={dayInfo?.slotId ? dayInfo : null} saving={saving}
            seatsFor={(r) => r.seatsByDay[day.date]} submitLabel="Save for this day only"
            onPick={(stopId, runId) => act(() => api.setDay(day.direction, day.date, { pickupPointId: stopId, slotId: runId }), 'Changed for that day.')} />
        )}
      </Modal>
    </div>
  );
}
