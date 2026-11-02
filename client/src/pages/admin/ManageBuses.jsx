import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import ButtonSelect from '../../components/common/ButtonSelect';
import { createBus, listBuses, listDrivers, listRoutes, updateBusAssignment } from '../../services/admin.service';
import PageHeader from '../../components/layout/PageHeader';

export default function ManageBuses() {
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState({ licensePlate: '', capacity: 30, driverId: '', routeId: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [assignBus, setAssignBus] = useState(null);
  const [assignForm, setAssignForm] = useState({ driverId: '', routeId: '', capacity: '' });

  const load = () => Promise.all([listBuses(), listDrivers(), listRoutes()])
    .then(([b, d, r]) => { setBuses(b.buses); setDrivers(d.drivers); setRoutes(r.routes); })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await createBus(form);
      setMessage('Bus added successfully.');
      setForm({ licensePlate: '', capacity: 30, driverId: '', routeId: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add bus.');
    }
  };

  const openAssign = (bus) => {
    setAssignBus(bus);
    setAssignForm({ driverId: bus.driverId || '', routeId: bus.routeId || '', capacity: bus.capacity });
  };

  const handleAssignSave = async () => {
    try {
      await updateBusAssignment(assignBus.id, assignForm);
      setAssignBus(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update assignment.');
    }
  };

  const header = <PageHeader title="Fleet" subtitle="Vehicles, their drivers and routes." />;
  if (loading) return <div className="page max-w-3xl">{header}<LoadingSpinner label="Loading buses..." /></div>;

  return (
    <div className="page max-w-3xl">
      {header}
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />

      <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="glass-card p-5 flex flex-col gap-3 mb-6">
        <h2 className="section-title">Add a vehicle</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="bus-plate" className="field-label">Licence plate</label>
            <input id="bus-plate" name="licensePlate" placeholder="e.g. KDA 123X" required autoCapitalize="characters"
              value={form.licensePlate} onChange={handleChange} className="input-field" />
          </div>
          <div>
            <label htmlFor="bus-capacity" className="field-label">Seats</label>
            <input id="bus-capacity" name="capacity" type="number" inputMode="numeric" min="1" value={form.capacity} onChange={handleChange} className="input-field" />
          </div>
        </div>
        <p className="field-label mb-0">Driver <span className="font-normal text-muted-foreground">(optional)</span></p>
        <ButtonSelect
          ariaLabel="Assign driver"
          allowClear
          clearLabel="No driver"
          options={drivers.map((d) => ({ value: String(d.id), label: `${d.user.firstName} ${d.user.lastName}` }))}
          value={String(form.driverId || '')}
          onChange={(v) => setForm({ ...form, driverId: v })}
        />
        <p className="field-label mb-0">Route <span className="font-normal text-muted-foreground">(optional)</span></p>
        <ButtonSelect
          ariaLabel="Assign route"
          allowClear
          clearLabel="No route"
          options={routes.map((r) => ({ value: String(r.id), label: r.name }))}
          value={String(form.routeId || '')}
          onChange={(v) => setForm({ ...form, routeId: v })}
        />
        <button type="submit" className="btn-primary">Add vehicle</button>
      </motion.form>

      <h2 className="section-title mb-2">Vehicles ({buses.length})</h2>
      {buses.length === 0 && <div className="glass-card p-5 text-sm text-muted-foreground">No vehicles yet. Add your first one above.</div>}
      <div className={buses.length ? 'glass-card divide-y divide-border' : 'hidden'}>
        {buses.map((b) => (
          <div key={b.id} className="p-4 text-sm flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground tabular-nums">{b.licensePlate}</p>
              <p className="text-xs text-muted-foreground">{b.capacity} seats · {b.route?.name || 'Unassigned route'}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge variant={b.driver ? 'success' : 'warning'} dot>
                {b.driver ? `${b.driver.user.firstName} ${b.driver.user.lastName}` : 'No driver'}
              </StatusBadge>
              <button type="button" onClick={() => openAssign(b)} className="btn-ghost btn-sm text-link" aria-label={`Edit ${b.licensePlate}`}>Edit</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!assignBus} onClose={() => setAssignBus(null)} title={`Edit ${assignBus?.licensePlate || ''}`}>
        <div className="flex flex-col gap-3">
          <p className="field-label mb-0">Driver</p>
          <ButtonSelect
            ariaLabel="Assign driver"
            allowClear
            clearLabel="Unassigned"
            options={drivers.map((d) => ({ value: String(d.id), label: `${d.user.firstName} ${d.user.lastName}` }))}
            value={String(assignForm.driverId || '')}
            onChange={(v) => setAssignForm((f) => ({ ...f, driverId: v }))}
          />
          <p className="field-label mb-0">Route</p>
          <ButtonSelect
            ariaLabel="Assign route"
            allowClear
            clearLabel="Unassigned"
            options={routes.map((r) => ({ value: String(r.id), label: r.name }))}
            value={String(assignForm.routeId || '')}
            onChange={(v) => setAssignForm((f) => ({ ...f, routeId: v }))}
          />
          <label htmlFor="assign-capacity" className="field-label mb-0">Seats</label>
          <input id="assign-capacity" type="number" inputMode="numeric" min="1" value={assignForm.capacity} onChange={(e) => setAssignForm({ ...assignForm, capacity: e.target.value })} className="input-field" />
          <button type="button" onClick={handleAssignSave} className="btn-primary mt-2">Save changes</button>
        </div>
      </Modal>
    </div>
  );
}
