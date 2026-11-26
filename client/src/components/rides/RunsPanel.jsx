import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import ButtonSelect from '../common/ButtonSelect';
import ErrorMessage from '../common/ErrorMessage';
import { useToast } from '../../context/ToastContext';
import { WEEKDAYS, apiError } from '../../config/fleet';
import { createRun, deleteRun, listRuns, updateRun } from '../../services/rides.service';

const DIRECTIONS = [
  { value: 'PICKUP', label: 'Pickup (to campus / site)' },
  { value: 'DROPOFF', label: 'Drop-off (home run)' },
];
const NEW_RUN = { direction: 'PICKUP', time: '06:30', daysOfWeek: [1, 2, 3, 4, 5], capacity: 30, busId: '', label: '' };

function DaysPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days the run operates">
      {WEEKDAYS.map((d) => {
        const on = value.includes(d.value);
        return (
          <button key={d.value} type="button" aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d.value) : [...value, d.value].sort())}
            className={`min-h-9 min-w-11 px-2 rounded-lg text-xs font-semibold border transition-colors ${
              on ? 'bg-primary-600 text-white border-primary-600' : 'bg-card text-muted-foreground border-border hover:border-primary-400'}`}>
            {d.short}
          </button>
        );
      })}
    </div>
  );
}

const daysText = (days) => (days.length === 7 ? 'Every day' : days.join(',') === '1,2,3,4,5' ? 'Mon–Fri'
  : WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.short).join(' '));

// One run: summary row, expandable stop timetable with editable times.
function RunRow({ run, buses, onChanged }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [times, setTimes] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTimes(Object.fromEntries(run.stops.map((s) => [s.pickupPointId, s.overridden ? s.time : ''])));
  }, [run]);

  const saveTimes = async () => {
    setSaving(true);
    try {
      await updateRun(run.id, { stopTimeOverrides: times });
      toast.success('Stop times saved.');
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Could not save the stop times.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const warn = run.standingBookings ? ` ${run.standingBookings} passenger(s) booked on it will need to choose another run.` : '';
    if (!window.confirm(`Stop the ${run.label} run?${warn}`)) return;
    try {
      const res = await deleteRun(run.id);
      toast.success(res.message);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Could not stop the run.'));
    }
  };

  const bus = buses.find((b) => b.id === run.busId);
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-2 text-left min-h-11 rounded-lg px-2 -mx-2 hover:bg-muted">
          <span className={run.direction === 'PICKUP' ? 'badge-info' : 'badge-warning'}>{run.direction === 'PICKUP' ? 'Pickup' : 'Drop-off'}</span>
          <span className="font-semibold text-foreground tabular-nums">{run.time}</span>
          <span className="text-sm text-muted-foreground truncate">
            {run.label} · {daysText(run.daysOfWeek)} · {run.standingBookings}/{run.capacity} booked{bus ? ` · ${bus.licensePlate}` : ''}
          </span>
          {open ? <ChevronUp size={16} className="ml-auto shrink-0" aria-hidden="true" /> : <ChevronDown size={16} className="ml-auto shrink-0" aria-hidden="true" />}
        </button>
        <button type="button" className="icon-btn" onClick={remove} aria-label={`Stop the ${run.label} run`}><Trash2 size={16} aria-hidden="true" /></button>
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-2">
            Times are worked out from the road route. Type a time to override a stop; leave it blank to use the worked-out time.
            {run.runsToday ? ` Today: ${run.ridersOnDay} passenger(s).` : ''}
          </p>
          <ol className="flex flex-col gap-2">
            {run.stops.map((s, i) => (
              <li key={s.pickupPointId} className="flex items-center gap-2 text-sm">
                <span className="w-6 h-6 shrink-0 rounded-full bg-muted text-xs font-semibold flex items-center justify-center tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-foreground">{s.name}</span>
                {run.runsToday && <span className="text-xs text-muted-foreground tabular-nums">{s.riders} today</span>}
                <label className="sr-only" htmlFor={`run-${run.id}-stop-${s.pickupPointId}`}>Time at {s.name}</label>
                <input id={`run-${run.id}-stop-${s.pickupPointId}`} type="time" className="input-field w-32 min-h-9 py-1"
                  value={times[s.pickupPointId] || ''} placeholder={s.time}
                  onChange={(e) => setTimes((t) => ({ ...t, [s.pickupPointId]: e.target.value }))} />
                <span className="w-12 text-xs text-muted-foreground tabular-nums">{times[s.pickupPointId] ? '' : s.time}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="btn-secondary btn-sm mt-3" disabled={saving} onClick={saveTimes}>{saving ? 'Saving...' : 'Save stop times'}</button>
        </div>
      )}
    </li>
  );
}

// Runs of one route: the scheduled pickup and drop-off trips passengers book.
export default function RunsPanel({ route, buses = [] }) {
  const { toast } = useToast();
  const [runs, setRuns] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(NEW_RUN);
  const [error, setError] = useState('');

  const load = () => listRuns(route.id).then((d) => setRuns(d.slots.filter((s) => s.isActive))).catch(() => setError('Could not load runs.'));
  useEffect(() => { load(); }, [route.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createRun({ ...form, routeId: route.id, busId: form.busId || null, label: form.label || undefined });
      toast.success('Run added.');
      setAdding(false);
      setForm(NEW_RUN);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not add the run.'));
    }
  };

  const routeBuses = buses.filter((b) => b.routeId === route.id);
  return (
    <div className="mt-3">
      <ErrorMessage message={error} />
      {!route.pickupPoints?.length && <p className="text-sm text-muted-foreground">Add stops to this route before scheduling runs.</p>}
      {runs === null ? <div className="skeleton h-10" aria-hidden="true" /> : (
        runs.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet. Add the times passengers can book.</p> : (
          <ul className="divide-y divide-border">
            {runs.map((r) => <RunRow key={r.id} run={r} buses={buses} onChanged={load} />)}
          </ul>
        )
      )}
      {adding ? (
        <form onSubmit={add} className="mt-3 rounded-lg border border-border p-3 flex flex-col gap-3">
          <ButtonSelect ariaLabel="Direction" size="sm" options={DIRECTIONS} value={form.direction} onChange={(direction) => setForm((f) => ({ ...f, direction }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`new-run-time-${route.id}`} className="field-label">{form.direction === 'PICKUP' ? 'Leaves first stop' : 'Leaves campus / site'}</label>
              <input id={`new-run-time-${route.id}`} type="time" required className="input-field" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={`new-run-cap-${route.id}`} className="field-label">Seats</label>
              <input id={`new-run-cap-${route.id}`} type="number" min="1" inputMode="numeric" className="input-field" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
          </div>
          <DaysPicker value={form.daysOfWeek} onChange={(daysOfWeek) => setForm((f) => ({ ...f, daysOfWeek }))} />
          <div>
            <label htmlFor={`new-run-label-${route.id}`} className="field-label">Name <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id={`new-run-label-${route.id}`} className="input-field" placeholder="e.g. Early morning" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          </div>
          {routeBuses.length > 0 && (
            <div>
              <p className="field-label">Vehicle</p>
              <ButtonSelect ariaLabel="Vehicle" size="sm" allowClear clearLabel="Any on this route" value={String(form.busId)}
                options={routeBuses.map((b) => ({ value: String(b.id), label: b.licensePlate }))} onChange={(busId) => setForm((f) => ({ ...f, busId }))} />
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={!form.daysOfWeek.length}>Add run</button>
          </div>
        </form>
      ) : (
        route.pickupPoints?.length > 0 && (
          <button type="button" className="btn-ghost btn-sm text-link mt-2 -ml-3" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden="true" /> Add a run
          </button>
        )
      )}
    </div>
  );
}
