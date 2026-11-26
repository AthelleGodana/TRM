import { useState } from 'react';
import Modal from '../common/Modal';
import ButtonSelect from '../common/ButtonSelect';
import ErrorMessage from '../common/ErrorMessage';
import { FUEL_TYPES, OWNERSHIP, VEHICLE_TYPES, apiError, options, toDateInput } from '../../config/fleet';
import { createVehicle, updateVehicle } from '../../services/fleet.service';

const EMPTY = {
  licensePlate: '', vehicleType: 'BUS', make: '', model: '', year: '', vin: '', color: '', capacity: '',
  fuelType: '', odometerKm: '', ownership: '', acquiredAt: '', driverId: '', routeId: '', notes: '',
};

function fromVehicle(v) {
  if (!v) return EMPTY;
  return {
    ...EMPTY,
    ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, v[k] == null ? '' : String(v[k])])),
    acquiredAt: toDateInput(v.acquiredAt),
  };
}

// Add or edit a vehicle. Two steps for a new vehicle (identity, then
// details and assignment) so the form fits on a phone.
export default function VehicleForm({ open, onClose, vehicle, drivers = [], routes = [], onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [openedFor, setOpenedFor] = useState(null);
  const key = open ? (vehicle?.id ?? 'new') : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (open) { setForm(fromVehicle(vehicle)); setStep(1); setError(''); }
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const choose = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const editing = Boolean(vehicle);

  const submit = async (e) => {
    e.preventDefault();
    if (!editing && step === 1) { setStep(2); return; }
    setSaving(true);
    setError('');
    try {
      const body = { ...form, acquiredAt: form.acquiredAt || null };
      const saved = editing ? await updateVehicle(vehicle.id, body) : await createVehicle(body);
      onSaved?.(saved.bus);
      onClose();
    } catch (err) {
      setError(apiError(err, 'Could not save the vehicle.'));
      if (!editing) setStep(1);
    } finally {
      setSaving(false);
    }
  };

  const identity = (
    <>
      <div>
        <label htmlFor="v-plate" className="field-label">Registration</label>
        <input id="v-plate" required autoCapitalize="characters" className="input-field" placeholder="e.g. KDA 123X"
          value={form.licensePlate} onChange={set('licensePlate')} />
      </div>
      <div>
        <p className="field-label">Type</p>
        <ButtonSelect ariaLabel="Vehicle type" size="sm" options={options(VEHICLE_TYPES)} value={form.vehicleType} onChange={choose('vehicleType')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="v-make" className="field-label">Make</label>
          <input id="v-make" className="input-field" placeholder="e.g. Isuzu" value={form.make} onChange={set('make')} />
        </div>
        <div>
          <label htmlFor="v-model" className="field-label">Model</label>
          <input id="v-model" className="input-field" placeholder="e.g. NQR" value={form.model} onChange={set('model')} />
        </div>
        <div>
          <label htmlFor="v-year" className="field-label">Year</label>
          <input id="v-year" type="number" inputMode="numeric" min="1950" className="input-field" value={form.year} onChange={set('year')} />
        </div>
        <div>
          <label htmlFor="v-odo" className="field-label">Odometer (km)</label>
          <input id="v-odo" type="number" inputMode="numeric" min="0" className="input-field" value={form.odometerKm} onChange={set('odometerKm')} />
        </div>
      </div>
      <div>
        <label htmlFor="v-vin" className="field-label">VIN / chassis number <span className="font-normal text-muted-foreground">(optional)</span></label>
        <input id="v-vin" autoCapitalize="characters" className="input-field" value={form.vin} onChange={set('vin')} />
      </div>
    </>
  );

  const details = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="v-seats" className="field-label">Seats <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="v-seats" type="number" inputMode="numeric" min="1" className="input-field" value={form.capacity} onChange={set('capacity')} />
        </div>
        <div>
          <label htmlFor="v-color" className="field-label">Colour</label>
          <input id="v-color" className="input-field" value={form.color} onChange={set('color')} />
        </div>
      </div>
      <div>
        <p className="field-label">Fuel</p>
        <ButtonSelect ariaLabel="Fuel type" size="sm" allowClear clearLabel="Not set" options={options(FUEL_TYPES)} value={form.fuelType} onChange={choose('fuelType')} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <p className="field-label">Ownership</p>
          <ButtonSelect ariaLabel="Ownership" size="sm" allowClear clearLabel="Not set" options={options(OWNERSHIP)} value={form.ownership} onChange={choose('ownership')} />
        </div>
        <div>
          <label htmlFor="v-acq" className="field-label">In the fleet since</label>
          <input id="v-acq" type="date" className="input-field" value={form.acquiredAt} onChange={set('acquiredAt')} />
        </div>
      </div>
      {!editing && drivers.length > 0 && (
        <div>
          <p className="field-label">Driver <span className="font-normal text-muted-foreground">(optional)</span></p>
          <ButtonSelect ariaLabel="Driver" size="sm" allowClear clearLabel="No driver"
            options={drivers.map((d) => ({ value: String(d.id), label: d.name }))} value={form.driverId} onChange={choose('driverId')} />
        </div>
      )}
      {routes.length > 0 && (
        <div>
          <p className="field-label">Route <span className="font-normal text-muted-foreground">(optional)</span></p>
          <ButtonSelect ariaLabel="Route" size="sm" allowClear clearLabel="No route"
            options={routes.map((r) => ({ value: String(r.id), label: r.name }))} value={form.routeId} onChange={choose('routeId')} />
        </div>
      )}
      <div>
        <label htmlFor="v-notes" className="field-label">Notes</label>
        <textarea id="v-notes" rows={2} className="input-field" value={form.notes} onChange={set('notes')} />
      </div>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${vehicle.licensePlate}` : `Add a vehicle${step === 2 ? ' · details' : ''}`}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <ErrorMessage message={error} />
        {editing ? <>{identity}{details}</> : step === 1 ? identity : details}
        <div className="flex gap-2 mt-1">
          {!editing && step === 2 && <button type="button" className="btn-secondary" onClick={() => setStep(1)}>Back</button>}
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving...' : editing ? 'Save changes' : step === 1 ? 'Next' : 'Add vehicle'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
