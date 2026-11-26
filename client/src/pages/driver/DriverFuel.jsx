import { useEffect, useState } from 'react';
import { Fuel } from 'lucide-react';
import ErrorMessage from '../../components/common/ErrorMessage';
import { useToast } from '../../context/ToastContext';
import { apiError, formatDate, formatMoney } from '../../config/fleet';
import { createFuelRecord, listFuelRecords } from '../../services/fuel.service';

const EMPTY = { litres: '', totalCost: '', odometer: '', station: '' };

// Drivers log fill-ups for their own vehicle (Fuel Hub organisations).
export default function DriverFuel() {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => listFuelRecords().then((d) => setRecords(d.records || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createFuelRecord({
        litres: Number(form.litres),
        totalCost: form.totalCost ? Number(form.totalCost) : undefined,
        odometer: form.odometer ? Number(form.odometer) : undefined,
        station: form.station || undefined,
      });
      toast.success('Fill-up saved.');
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not save the fill-up.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-narrow flex flex-col gap-4">
      <h1 className="page-title">Fuel</h1>
      <form onSubmit={save} className="glass-card p-5 flex flex-col gap-3">
        <h2 className="section-title flex items-center gap-2"><Fuel size={18} aria-hidden="true" /> Log a fill-up</h2>
        <ErrorMessage message={error} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="f-litres" className="field-label">Litres</label>
            <input id="f-litres" required type="number" inputMode="decimal" min="0.1" step="0.01" className="input-field text-lg" value={form.litres} onChange={set('litres')} />
          </div>
          <div>
            <label htmlFor="f-cost" className="field-label">Total (KES)</label>
            <input id="f-cost" type="number" inputMode="decimal" min="0" step="0.01" className="input-field text-lg" value={form.totalCost} onChange={set('totalCost')} />
          </div>
          <div>
            <label htmlFor="f-odo" className="field-label">Odometer (km)</label>
            <input id="f-odo" type="number" inputMode="numeric" min="0" className="input-field" value={form.odometer} onChange={set('odometer')} />
          </div>
          <div>
            <label htmlFor="f-station" className="field-label">Station</label>
            <input id="f-station" className="input-field" value={form.station} onChange={set('station')} />
          </div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary min-h-12">{saving ? 'Saving...' : 'Save fill-up'}</button>
      </form>

      <section aria-labelledby="recent-title">
        <h2 id="recent-title" className="section-title mb-2">Recent fill-ups</h2>
        {records.length === 0 ? <p className="glass-card p-4 text-sm text-muted-foreground">None yet.</p> : (
          <ul className="glass-card divide-y divide-border">
            {records.slice(0, 10).map((r) => (
              <li key={r.id} className="p-3 text-sm flex items-center justify-between gap-3">
                <span>{formatDate(r.filledAt)} · {Number(r.litres).toLocaleString()} L{r.station ? ` · ${r.station}` : ''}</span>
                <span className="tabular-nums">{r.totalCost != null ? formatMoney(r.totalCost) : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
