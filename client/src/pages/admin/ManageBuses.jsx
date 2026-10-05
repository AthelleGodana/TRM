import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import ButtonSelect from '../../components/common/ButtonSelect';
import { createBus, listBuses, listDrivers, listRoutes, updateBusAssignment } from '../../services/admin.service';

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

  if (loading) return <LoadingSpinner label="Loading buses..." />;

  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto">
      <ErrorMessage message={error} />
      <SuccessMessage message={message} />

      <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="glass-card p-5 flex flex-col gap-3 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Add bus</h2>
        <input name="licensePlate" placeholder="License plate" required value={form.licensePlate} onChange={handleChange} className="input-field" />
        <input name="capacity" type="number" placeholder="Capacity" value={form.capacity} onChange={handleChange} className="input-field" />
<label className="text-xs font-medium text-gray-500">Assign driver (optional)</label>
        <ButtonSelect
          ariaLabel="Assign driver"
          allowClear
          clearLabel="No driver"
          options={drivers.map((d) => ({ value: String(d.id), label: `${d.user.firstName} ${d.user.lastName}` }))}
          value={String(form.driverId || '')}
          onChange={(v) => setForm({ ...form, driverId: v })}
        />
        <label className="text-xs font-medium text-gray-500">Assign route (optional)</label>
        <ButtonSelect
          ariaLabel="Assign route"
          allowClear
          clearLabel="No route"
          options={routes.map((r) => ({ value: String(r.id), label: r.name }))}
          value={String(form.routeId || '')}
          onChange={(v) => setForm({ ...form, routeId: v })}
        />
        <motion.button whileTap={{ scale: 0.97 }} type="submit" className="btn-primary">Add Bus</motion.button>
      </motion.form>

      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">Fleet</h2>
      <div className="glass-card divide-y divide-gray-100 dark:divide-white/5">
        {buses.map((b) => (
          <div key={b.id} className="p-4 text-sm flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-100">{b.licensePlate}</p>
              <p className="text-xs text-gray-400">{b.capacity} seats · {b.route?.name || 'Unassigned route'}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge variant={b.driver ? 'success' : 'warning'} dot>
                {b.driver ? `${b.driver.user.firstName} ${b.driver.user.lastName}` : 'No driver'}
              </StatusBadge>
              <button onClick={() => openAssign(b)} className="text-xs font-medium text-primary-600 dark:text-primary-400">Edit</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!assignBus} onClose={() => setAssignBus(null)} title={`Assign — ${assignBus?.licensePlate || ''}`}>
        <div className="flex flex-col gap-3">
<label className="text-xs font-medium text-gray-500">Driver</label>
          <ButtonSelect
            ariaLabel="Assign driver"
            allowClear
            clearLabel="Unassigned"
            options={drivers.map((d) => ({ value: String(d.id), label: `${d.user.firstName} ${d.user.lastName}` }))}
            value={String(assignForm.driverId || '')}
            onChange={(v) => setAssignForm((f) => ({ ...f, driverId: v }))}
          />
          <label className="text-xs font-medium text-gray-500">Route</label>
          <ButtonSelect
            ariaLabel="Assign route"
            allowClear
            clearLabel="Unassigned"
            options={routes.map((r) => ({ value: String(r.id), label: r.name }))}
            value={String(assignForm.routeId || '')}
            onChange={(v) => setAssignForm((f) => ({ ...f, routeId: v }))}
          />
          <label className="text-xs font-medium text-gray-500">Capacity</label>
          <input type="number" value={assignForm.capacity} onChange={(e) => setAssignForm({ ...assignForm, capacity: e.target.value })} className="input-field" />
          <motion.button whileTap={{ scale: 0.97 }} onClick={handleAssignSave} className="btn-primary mt-2">Save Assignment</motion.button>
        </div>
      </Modal>
    </div>
  );
}
