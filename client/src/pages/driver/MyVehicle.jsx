import { useEffect, useState } from 'react';
import { CheckCircle2, Gauge, TriangleAlert, XCircle } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import Modal from '../../components/common/Modal';
import DocumentList from '../../components/fleet/DocumentList';
import { DefectStatusBadge, DueBadge, SeverityBadge, VehicleStatusBadge } from '../../components/fleet/Badges';
import { useToast } from '../../context/ToastContext';
import { SEVERITY, apiError, describeDue, formatDate, formatKm } from '../../config/fleet';
import { getMyVehicle, reportDefect, reportOdometer } from '../../services/driver.service';
import { getSafetyChecklist, toggleSafetyCheck } from '../../services/vehicle.service';

export default function MyVehicle() {
  const { toast } = useToast();
  const [vehicle, setVehicle] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // defect | odometer
  const [defect, setDefect] = useState({ severity: 'MEDIUM', description: '' });
  const [odometer, setOdometer] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => Promise.all([getMyVehicle(), getSafetyChecklist()])
    .then(([v, c]) => { setVehicle(v.vehicle); setChecklist(c.items); })
    .catch((err) => setError(apiError(err, 'Could not load your vehicle.')));
  useEffect(() => { load(); }, []);

  const submit = async (fn, success) => {
    setSaving(true);
    try {
      await fn();
      toast.success(success);
      setDialog(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Not sent. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item, passed) => {
    setChecklist((c) => c.map((x) => (x.item === item ? { ...x, passed } : x)));
    try { await toggleSafetyCheck({ item, passed }); } catch { toast.error('Could not save the check.'); load(); }
  };

  if (error) return <div className="page-narrow"><ErrorMessage message={error} /></div>;
  if (!vehicle) return <div className="page-narrow"><LoadingSpinner label="Loading your vehicle..." /></div>;

  const checked = checklist.filter((c) => c.passed != null).length;
  const failed = checklist.filter((c) => c.passed === false).length;

  return (
    <div className="page-narrow flex flex-col gap-4">
      <h1 className="page-title">My vehicle</h1>

      <section className="glass-card p-5" aria-labelledby="veh-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="veh-title" className="text-2xl font-bold tabular-nums text-foreground">{vehicle.licensePlate}</h2>
            <p className="text-sm text-muted-foreground">{[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') || 'Vehicle'}</p>
          </div>
          <VehicleStatusBadge status={vehicle.status} />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-muted p-3">
          <span className="text-sm text-muted-foreground flex items-center gap-2"><Gauge size={16} aria-hidden="true" /> Odometer</span>
          <span className="font-semibold tabular-nums">{formatKm(vehicle.odometerKm)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button type="button" className="btn-secondary min-h-12" onClick={() => { setOdometer(String(vehicle.odometerKm ?? '')); setDialog('odometer'); }}>
            <Gauge size={18} aria-hidden="true" /> Update odometer
          </button>
          <button type="button" className="btn-primary min-h-12" onClick={() => { setDefect({ severity: 'MEDIUM', description: '' }); setDialog('defect'); }}>
            <TriangleAlert size={18} aria-hidden="true" /> Report a problem
          </button>
        </div>
      </section>

      <section aria-labelledby="check-title">
        <div className="flex items-baseline justify-between mb-2">
          <h2 id="check-title" className="section-title">Pre-trip check</h2>
          <span className="text-sm text-muted-foreground" role="status">{checked}/{checklist.length} checked{failed ? ` · ${failed} failed` : ''}</span>
        </div>
        <ul className="glass-card divide-y divide-border">
          {checklist.map((c) => (
            <li key={c.item} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="flex-1 text-foreground">{c.item}</span>
              <button type="button" aria-pressed={c.passed === true} aria-label={`${c.item} OK`} onClick={() => toggle(c.item, true)}
                className={`icon-btn border ${c.passed === true ? 'bg-emerald-600 text-white border-emerald-600' : 'border-border'}`}>
                <CheckCircle2 size={18} aria-hidden="true" />
              </button>
              <button type="button" aria-pressed={c.passed === false} aria-label={`${c.item} has a problem`} onClick={() => toggle(c.item, false)}
                className={`icon-btn border ${c.passed === false ? 'bg-red-600 text-white border-red-600' : 'border-border'}`}>
                <XCircle size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {failed > 0 && <p className="text-xs text-muted-foreground mt-2">Something failed? Use "Report a problem" so the transport office can fix it.</p>}
      </section>

      {vehicle.defects.length > 0 && (
        <section aria-labelledby="defects-title">
          <h2 id="defects-title" className="section-title mb-2">Reported problems</h2>
          <ul className="glass-card divide-y divide-border">
            {vehicle.defects.map((d) => (
              <li key={d.id} className="p-3 text-sm">
                <p className="text-foreground">{d.description}</p>
                <div className="mt-1 flex items-center gap-1">
                  <SeverityBadge severity={d.severity} /><DefectStatusBadge status={d.status} />
                  <span className="text-xs text-muted-foreground ml-1">{formatDate(d.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {vehicle.services.length > 0 && (
        <section aria-labelledby="svc-title">
          <h2 id="svc-title" className="section-title mb-2">Next services</h2>
          <ul className="glass-card divide-y divide-border">
            {vehicle.services.map((s) => (
              <li key={s.id} className="p-3 text-sm flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-foreground">{s.name}</span>
                  <span className="block text-xs text-muted-foreground">{describeDue(s.due)}</span>
                </span>
                <DueBadge status={s.due.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="vdocs-title">
        <h2 id="vdocs-title" className="section-title mb-2">Vehicle documents</h2>
        <DocumentList documents={vehicle.documents} readOnly driverView />
      </section>

      <Modal open={dialog === 'defect'} onClose={() => setDialog(null)} title="Report a problem">
        <p className="field-label">How serious is it?</p>
        <ButtonSelect ariaLabel="Severity" columns="grid grid-cols-2 gap-2" value={defect.severity}
          options={Object.entries(SEVERITY).map(([value, s]) => ({ value, label: value === 'CRITICAL' ? 'Critical: unsafe to drive' : s.label }))}
          onChange={(severity) => setDefect((d) => ({ ...d, severity }))} />
        <label htmlFor="defect-text" className="field-label mt-4">What is wrong?</label>
        <textarea id="defect-text" rows={3} maxLength={2000} className="input-field" placeholder="e.g. Front left tyre losing pressure"
          value={defect.description} onChange={(e) => setDefect((d) => ({ ...d, description: e.target.value }))} />
        <button type="button" className="btn-primary w-full mt-4" disabled={saving || !defect.description.trim()}
          onClick={() => submit(() => reportDefect(defect), 'Reported. The transport office has been told.')}>
          {saving ? 'Sending...' : 'Send report'}
        </button>
      </Modal>

      <Modal open={dialog === 'odometer'} onClose={() => setDialog(null)} title="Update odometer">
        <label htmlFor="drv-odo" className="field-label">Reading on the dashboard (km)</label>
        <input id="drv-odo" type="number" inputMode="numeric" min={vehicle.odometerKm || 0} className="input-field text-lg"
          value={odometer} onChange={(e) => setOdometer(e.target.value)} />
        <button type="button" className="btn-primary w-full mt-4" disabled={saving || !odometer}
          onClick={() => submit(() => reportOdometer(Number(odometer)), 'Odometer updated.')}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </Modal>
    </div>
  );
}
