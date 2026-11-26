import { useState } from 'react';
import Modal from '../common/Modal';
import ButtonSelect from '../common/ButtonSelect';
import ErrorMessage from '../common/ErrorMessage';
import { useToast } from '../../context/ToastContext';
import { SERVICE_TYPES, apiError, options, toDateInput } from '../../config/fleet';
import { createSchedule, createServiceRecord, updateSchedule } from '../../services/fleet.service';

// Resets a form's state each time its dialog opens for a new subject.
function useOpenReset(open, key, reset) {
  const [openedFor, setOpenedFor] = useState(null);
  const k = open ? key : null;
  if (k !== openedFor) {
    setOpenedFor(k);
    if (open) reset();
  }
}

const PRESETS = [
  { name: 'Oil & filter change', intervalKm: 5000, intervalDays: 180 },
  { name: 'Full service', intervalKm: 20000, intervalDays: 365 },
  { name: 'Tyre rotation', intervalKm: 10000, intervalDays: '' },
  { name: 'Brake inspection', intervalKm: 15000, intervalDays: 180 },
  { name: 'Annual inspection', intervalKm: '', intervalDays: 365 },
];

// Add or edit a recurring service. vehicles: needed when busId is not fixed.
export function ScheduleForm({ open, onClose, busId, vehicles = [], schedule, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useOpenReset(open, schedule?.id ?? 'new', () => {
    setError('');
    setForm(schedule ? {
      busId: String(schedule.busId), name: schedule.name, intervalKm: schedule.intervalKm ?? '', intervalDays: schedule.intervalDays ?? '',
      lastDoneAt: toDateInput(schedule.lastDoneAt), lastDoneOdometer: schedule.lastDoneOdometer ?? '',
    } : { busId: busId ? String(busId) : '', name: '', intervalKm: '', intervalDays: '', lastDoneAt: '', lastDoneOdometer: '' });
  });
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        busId: Number(form.busId),
        intervalKm: form.intervalKm || null,
        intervalDays: form.intervalDays || null,
        lastDoneAt: form.lastDoneAt || undefined,
        lastDoneOdometer: form.lastDoneOdometer === '' ? undefined : form.lastDoneOdometer,
      };
      if (schedule) await updateSchedule(schedule.id, body);
      else await createSchedule(body);
      toast.success('Service schedule saved.');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(apiError(err, 'Could not save the schedule.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={schedule ? 'Edit service schedule' : 'Schedule a service'}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <ErrorMessage message={error} />
        {!busId && !schedule && (
          <div>
            <p className="field-label">Vehicle</p>
            <ButtonSelect ariaLabel="Vehicle" size="sm" value={form.busId}
              options={vehicles.map((v) => ({ value: String(v.id), label: v.licensePlate }))}
              onChange={(v) => setForm((f) => ({ ...f, busId: v }))} />
          </div>
        )}
        {!schedule && (
          <div>
            <p className="field-label">Common services</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.name} type="button" className="btn-secondary btn-sm"
                  onClick={() => setForm((f) => ({ ...f, name: p.name, intervalKm: p.intervalKm, intervalDays: p.intervalDays }))}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label htmlFor="sch-name" className="field-label">Service</label>
          <input id="sch-name" required className="input-field" value={form.name || ''} onChange={set('name')} placeholder="e.g. Oil change" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sch-km" className="field-label">Every (km)</label>
            <input id="sch-km" type="number" inputMode="numeric" min="1" className="input-field" value={form.intervalKm ?? ''} onChange={set('intervalKm')} />
          </div>
          <div>
            <label htmlFor="sch-days" className="field-label">Every (days)</label>
            <input id="sch-days" type="number" inputMode="numeric" min="1" className="input-field" value={form.intervalDays ?? ''} onChange={set('intervalDays')} />
          </div>
        </div>
        <p className="field-hint -mt-1">Set either or both; the service is due at whichever comes first.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sch-last" className="field-label">Last done</label>
            <input id="sch-last" type="date" className="input-field" value={form.lastDoneAt || ''} onChange={set('lastDoneAt')} />
          </div>
          <div>
            <label htmlFor="sch-last-km" className="field-label">At (km)</label>
            <input id="sch-last-km" type="number" inputMode="numeric" min="0" className="input-field" value={form.lastDoneOdometer ?? ''} onChange={set('lastDoneOdometer')} />
          </div>
        </div>
        {!schedule && <p className="field-hint -mt-1">Leave blank to count from today and the current odometer.</p>}
        <button type="submit" disabled={saving || !form.busId} className="btn-primary mt-1">{saving ? 'Saving...' : 'Save schedule'}</button>
      </form>
    </Modal>
  );
}

// Record work done on a vehicle. Linking a schedule resets it; ticking
// open defects resolves them.
export function ServiceForm({ open, onClose, vehicle, vehicles = [], schedules = [], defects = [], preset, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useOpenReset(open, `${vehicle?.id ?? ''}-${preset?.scheduleId ?? ''}`, () => {
    setError('');
    setForm({
      busId: vehicle ? String(vehicle.id) : (preset?.busId ? String(preset.busId) : ''),
      scheduleId: preset?.scheduleId ? String(preset.scheduleId) : '',
      type: 'SERVICE',
      description: preset?.description || '',
      servicedAt: toDateInput(new Date()),
      odometerKm: vehicle?.odometerKm ?? '',
      vendor: '', partsCost: '', labourCost: '',
      defectIds: [],
      setVehicleStatus: '',
    });
  });
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const busSchedules = schedules.filter((s) => String(s.busId) === form.busId);
  const busDefects = defects.filter((d) => String(d.busId) === form.busId && d.status !== 'RESOLVED');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createServiceRecord({
        ...form,
        busId: Number(form.busId),
        scheduleId: form.scheduleId || null,
        odometerKm: form.odometerKm === '' ? null : form.odometerKm,
        setVehicleStatus: form.setVehicleStatus || undefined,
      });
      toast.success('Service recorded.');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(apiError(err, 'Could not record the service.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Record a service${vehicle ? ` · ${vehicle.licensePlate}` : ''}`}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <ErrorMessage message={error} />
        {!vehicle && (
          <div>
            <p className="field-label">Vehicle</p>
            <ButtonSelect ariaLabel="Vehicle" size="sm" value={form.busId}
              options={vehicles.map((v) => ({ value: String(v.id), label: v.licensePlate }))}
              onChange={(v) => setForm((f) => ({ ...f, busId: v, scheduleId: '', defectIds: [] }))} />
          </div>
        )}
        <div>
          <p className="field-label">Type</p>
          <ButtonSelect ariaLabel="Service type" size="sm" options={options(SERVICE_TYPES)} value={form.type}
            onChange={(type) => setForm((f) => ({ ...f, type }))} />
        </div>
        {busSchedules.length > 0 && (
          <div>
            <p className="field-label">Completes schedule <span className="font-normal text-muted-foreground">(optional)</span></p>
            <ButtonSelect ariaLabel="Schedule" size="sm" allowClear clearLabel="None" value={form.scheduleId}
              options={busSchedules.map((s) => ({ value: String(s.id), label: s.name }))}
              onChange={(scheduleId) => setForm((f) => ({
                ...f, scheduleId, description: f.description || busSchedules.find((s) => String(s.id) === scheduleId)?.name || '',
              }))} />
          </div>
        )}
        <div>
          <label htmlFor="svc-desc" className="field-label">Work done</label>
          <textarea id="svc-desc" required rows={2} className="input-field" value={form.description || ''} onChange={set('description')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="svc-date" className="field-label">Date</label>
            <input id="svc-date" type="date" className="input-field" value={form.servicedAt || ''} onChange={set('servicedAt')} />
          </div>
          <div>
            <label htmlFor="svc-odo" className="field-label">Odometer (km)</label>
            <input id="svc-odo" type="number" inputMode="numeric" min="0" className="input-field" value={form.odometerKm ?? ''} onChange={set('odometerKm')} />
          </div>
        </div>
        <div>
          <label htmlFor="svc-vendor" className="field-label">Garage / vendor</label>
          <input id="svc-vendor" className="input-field" value={form.vendor || ''} onChange={set('vendor')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="svc-parts" className="field-label">Parts (KES)</label>
            <input id="svc-parts" type="number" inputMode="decimal" min="0" className="input-field" value={form.partsCost || ''} onChange={set('partsCost')} />
          </div>
          <div>
            <label htmlFor="svc-labour" className="field-label">Labour (KES)</label>
            <input id="svc-labour" type="number" inputMode="decimal" min="0" className="input-field" value={form.labourCost || ''} onChange={set('labourCost')} />
          </div>
        </div>
        {busDefects.length > 0 && (
          <fieldset>
            <legend className="field-label">Fixes these defects</legend>
            <div className="flex flex-col gap-1">
              {busDefects.map((d) => (
                <label key={d.id} className="flex items-start gap-2 text-sm min-h-9">
                  <input type="checkbox" className="w-4 h-4 mt-0.5 accent-primary-600" checked={form.defectIds?.includes(d.id)}
                    onChange={(e) => setForm((f) => ({
                      ...f, defectIds: e.target.checked ? [...f.defectIds, d.id] : f.defectIds.filter((x) => x !== d.id),
                    }))} />
                  <span>{d.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <p className="field-label">Vehicle status afterwards</p>
          <ButtonSelect ariaLabel="Vehicle status afterwards" size="sm" allowClear clearLabel="Unchanged" value={form.setVehicleStatus}
            options={[{ value: 'OPERATIONAL', label: 'Back on the road' }, { value: 'IN_MAINTENANCE', label: 'Still in maintenance' }]}
            onChange={(v) => setForm((f) => ({ ...f, setVehicleStatus: v }))} />
        </div>
        <button type="submit" disabled={saving || !form.busId} className="btn-primary mt-1">{saving ? 'Saving...' : 'Save service record'}</button>
      </form>
    </Modal>
  );
}
