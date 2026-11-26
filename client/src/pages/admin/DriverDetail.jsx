import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import Modal from '../../components/common/Modal';
import DocumentList from '../../components/fleet/DocumentList';
import { DefectStatusBadge, DriverStatusBadge, ExpiryBadge, SeverityBadge } from '../../components/fleet/Badges';
import { useToast } from '../../context/ToastContext';
import { DRIVER_STATUS, apiError, formatDate, options, toDateInput } from '../../config/fleet';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { getDriverProfile, updateDriverProfile } from '../../services/fleet.service';

const FIELDS = ['phone', 'employeeNo', 'licenseNumber', 'licenseClass', 'licenseExpiry', 'hireDate', 'status', 'emergencyContact', 'notes'];

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground break-words">{children || '—'}</dd>
    </div>
  );
}

export default function DriverDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const latest = useLatestRequest();
  const load = () => {
    const isCurrent = latest();
    return getDriverProfile(id)
      .then((d) => { if (isCurrent()) { setDriver(d.driver); setError(''); } })
      .catch((err) => { if (isCurrent()) setError(apiError(err, 'Could not load this driver.')); });
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = () => {
    setForm(Object.fromEntries(FIELDS.map((f) => [f, ['licenseExpiry', 'hireDate'].includes(f) ? toDateInput(driver[f]) : (driver[f] ?? '')])));
    setEditing(true);
  };
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDriverProfile(driver.id, { ...form, licenseExpiry: form.licenseExpiry || null, hireDate: form.hireDate || null });
      toast.success('Driver updated.');
      setEditing(false);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="page"><ErrorMessage message={error} /></div>;
  if (!driver) return <div className="page"><LoadingSpinner label="Loading driver..." /></div>;

  return (
    <div className="page max-w-4xl">
      <Link to="/admin/drivers" className="btn-ghost btn-sm -ml-3 mb-2">
        <ArrowLeft size={16} aria-hidden="true" /> All drivers
      </Link>
      <div className="page-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">{driver.name}</h1>
            <DriverStatusBadge status={driver.status} />
          </div>
          <p className="page-subtitle break-all">{driver.user.email}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={startEdit}><Pencil size={16} aria-hidden="true" /> Edit profile</button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="glass-card p-5 lg:col-span-2" aria-labelledby="profile-title">
          <h2 id="profile-title" className="section-title mb-4">Profile</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Phone">{driver.phone}</Field>
            <Field label="Employee no.">{driver.employeeNo}</Field>
            <Field label="Hired">{driver.hireDate && formatDate(driver.hireDate)}</Field>
            <Field label="Licence no.">{driver.licenseNumber}</Field>
            <Field label="Licence class">{driver.licenseClass}</Field>
            <Field label="Licence expiry">
              {driver.licenseExpiry ? <ExpiryBadge status={driver.licenseStatus} date={driver.licenseExpiry} /> : null}
            </Field>
            <Field label="Emergency contact">{driver.emergencyContact}</Field>
          </dl>
          {driver.notes && <p className="mt-4 text-sm text-muted-foreground whitespace-pre-line">{driver.notes}</p>}
        </section>
        <section className="glass-card p-5" aria-labelledby="vehicle-title">
          <h2 id="vehicle-title" className="section-title mb-2">Vehicle</h2>
          {driver.vehicle ? (
            <Link to={`/admin/buses/${driver.vehicle.id}`} className="font-medium text-link tabular-nums">
              {driver.vehicle.licensePlate}{driver.vehicle.make ? ` · ${driver.vehicle.make} ${driver.vehicle.model || ''}` : ''}
            </Link>
          ) : <p className="text-sm text-muted-foreground">No vehicle. Assign one from the vehicle's page.</p>}
        </section>
      </div>

      <section className="mt-5" aria-labelledby="docs-title">
        <h2 id="docs-title" className="section-title mb-2">Documents</h2>
        <DocumentList documents={driver.documents} entityType="DRIVER" driverId={driver.id} onChange={load} />
      </section>

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="section-title mb-2">Vehicle history</h2>
          {driver.assignments.length === 0 ? <p className="glass-card p-4 text-sm text-muted-foreground">No vehicles assigned yet.</p> : (
            <ul className="glass-card divide-y divide-border">
              {driver.assignments.map((a) => (
                <li key={a.id} className="p-3 text-sm flex items-center justify-between gap-3">
                  <Link to={`/admin/buses/${a.bus.id}`} className="font-medium text-link tabular-nums">{a.bus.licensePlate}</Link>
                  <span className="text-xs text-muted-foreground">{formatDate(a.startedAt)} – {a.endedAt ? formatDate(a.endedAt) : 'now'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="defects-title">
          <h2 id="defects-title" className="section-title mb-2">Defects reported</h2>
          {driver.defects.length === 0 ? <p className="glass-card p-4 text-sm text-muted-foreground">None.</p> : (
            <ul className="glass-card divide-y divide-border">
              {driver.defects.map((d) => (
                <li key={d.id} className="p-3 text-sm">
                  <p className="text-foreground">{d.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{d.bus.licensePlate} · {formatDate(d.createdAt)}</p>
                  <div className="mt-1 flex gap-1"><SeverityBadge severity={d.severity} /><DefectStatusBadge status={d.status} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={`Edit ${driver.name}`}>
        <form onSubmit={save} className="flex flex-col gap-3">
          <div>
            <p className="field-label">Status</p>
            <ButtonSelect ariaLabel="Status" size="sm" options={options(DRIVER_STATUS)} value={form.status} onChange={(status) => setForm((f) => ({ ...f, status }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="d-phone" className="field-label">Phone</label>
              <input id="d-phone" type="tel" className="input-field" value={form.phone} onChange={set('phone')} />
            </div>
            <div>
              <label htmlFor="d-emp" className="field-label">Employee no.</label>
              <input id="d-emp" className="input-field" value={form.employeeNo} onChange={set('employeeNo')} />
            </div>
            <div>
              <label htmlFor="d-lic" className="field-label">Licence no.</label>
              <input id="d-lic" className="input-field" value={form.licenseNumber} onChange={set('licenseNumber')} />
            </div>
            <div>
              <label htmlFor="d-class" className="field-label">Licence class</label>
              <input id="d-class" className="input-field" placeholder="e.g. BCE" value={form.licenseClass} onChange={set('licenseClass')} />
            </div>
            <div>
              <label htmlFor="d-exp" className="field-label">Licence expiry</label>
              <input id="d-exp" type="date" className="input-field" value={form.licenseExpiry} onChange={set('licenseExpiry')} />
            </div>
            <div>
              <label htmlFor="d-hire" className="field-label">Hire date</label>
              <input id="d-hire" type="date" className="input-field" value={form.hireDate} onChange={set('hireDate')} />
            </div>
          </div>
          <div>
            <label htmlFor="d-emerg" className="field-label">Emergency contact</label>
            <input id="d-emerg" className="input-field" placeholder="Name and phone" value={form.emergencyContact} onChange={set('emergencyContact')} />
          </div>
          <div>
            <label htmlFor="d-notes" className="field-label">Notes</label>
            <textarea id="d-notes" rows={2} className="input-field" value={form.notes} onChange={set('notes')} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary mt-1">{saving ? 'Saving...' : 'Save'}</button>
        </form>
      </Modal>
    </div>
  );
}
