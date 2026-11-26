import { useEffect, useState } from 'react';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ErrorMessage from '../../../components/common/ErrorMessage';
import ButtonSelect from '../../../components/common/ButtonSelect';
import StatusBadge from '../../../components/common/StatusBadge';
import { listBuses } from '../../../services/admin.service';
import { createFuelRecord, deleteFuelRecord, listFuelCards, listFuelRecords } from '../../../services/fuel.service';
import { Trash2 } from 'lucide-react';
import { Plus } from 'lucide-react';
import { formatMoney } from '../../../utils/format';
import { formatDate } from '../../../config/fleet';

const EMPTY = { busId: '', litres: '', pricePerLitre: '', totalCost: '', odometer: '', station: '', filledAt: '', fuelCardId: '' };
const kes = (v) => formatMoney(v, { cents: true });

export default function FuelRecords() {
  const [records, setRecords] = useState([]);
  const [buses, setBuses] = useState([]);
  const [cards, setCards] = useState([]);
  const [busFilter, setBusFilter] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = () => Promise.all([listFuelRecords(busFilter ? { busId: busFilter } : {}), listBuses(), listFuelCards()])
    .then(([r, b, c]) => { setRecords(r.records); setBuses(b.buses); setCards(c.cards.filter((x) => x.status === 'ACTIVE')); })
    .catch(() => setError('Could not load fuel records.'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, [busFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load depends only on busFilter

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
    try {
      await createFuelRecord(body);
      setForm(EMPTY);
      setAdding(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the record.');
    }
  };

  const remove = async (id) => {
    try {
      await deleteFuelRecord(id);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete the record.');
    }
  };

  if (loading) return <LoadingSpinner label="Loading fuel records..." />;
  const busOptions = buses.map((b) => ({ value: String(b.id), label: b.licensePlate }));

  return (
    <div className="flex flex-col gap-4">
      <ErrorMessage message={error} />

      {adding ? (
        <form onSubmit={submit} className="glass-card p-4 flex flex-col gap-3">
          <h2 className="section-title">New fuel-up</h2>
          <p className="field-label mb-0">Vehicle</p>
          <ButtonSelect ariaLabel="Vehicle" options={busOptions} value={form.busId} onChange={(busId) => setForm({ ...form, busId })} size="sm" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fuel-litres" className="field-label">Litres</label>
              <input id="fuel-litres" required type="number" inputMode="decimal" step="0.01" min="0.01" className="input-field" value={form.litres} onChange={set('litres')} />
            </div>
            <div>
              <label htmlFor="fuel-ppl" className="field-label">Price per litre (KES)</label>
              <input id="fuel-ppl" type="number" inputMode="decimal" step="0.01" min="0.01" className="input-field" value={form.pricePerLitre} onChange={set('pricePerLitre')} />
            </div>
            <div>
              <label htmlFor="fuel-total" className="field-label">Total cost (KES)</label>
              <input id="fuel-total" type="number" inputMode="decimal" step="0.01" min="0.01" className="input-field" value={form.totalCost} onChange={set('totalCost')} />
            </div>
            <div>
              <label htmlFor="fuel-odo" className="field-label">Odometer (km)</label>
              <input id="fuel-odo" type="number" inputMode="numeric" min="0" className="input-field" value={form.odometer} onChange={set('odometer')} />
            </div>
            <div>
              <label htmlFor="fuel-station" className="field-label">Station</label>
              <input id="fuel-station" className="input-field" value={form.station} onChange={set('station')} />
            </div>
            <div>
              <label htmlFor="fuel-when" className="field-label">Filled at</label>
              <input id="fuel-when" type="datetime-local" className="input-field" value={form.filledAt} onChange={set('filledAt')} />
            </div>
          </div>
          <p className="field-hint mt-0">Enter the price per litre or the total; the other is worked out.</p>
          {cards.length > 0 && <p className="field-label mb-0">Fuel card</p>}
          {cards.length > 0 && (
            <ButtonSelect ariaLabel="Fuel card" size="sm" allowClear clearLabel="No card"
              options={cards.map((c) => ({ value: String(c.id), label: `${c.label} ••${c.last4}` }))}
              value={form.fuelCardId} onChange={(fuelCardId) => setForm({ ...form, fuelCardId })} />
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={!form.busId} className="btn-primary flex-1">Save</button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-primary self-start"><Plus size={18} aria-hidden="true" /> Record a fuel-up</button>
      )}

      {buses.length > 1 && (
        <ButtonSelect ariaLabel="Filter by vehicle" size="sm" allowClear clearLabel="All vehicles"
          options={busOptions} value={busFilter} onChange={setBusFilter} />
      )}

      <div className="glass-card divide-y divide-border">
        {records.length === 0 && <p className="p-4 text-sm text-muted-foreground">No fuel records yet.</p>}
        {records.map((r) => (
          <div key={r.id} className="p-3.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground tabular-nums">{r.bus?.licensePlate} · {Number(r.litres)} L</span>
              <span className="text-foreground tabular-nums">{kes(r.totalCost)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
              <span>
                {new Date(r.filledAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                {r.station ? ` · ${r.station}` : ''}{r.odometer != null ? ` · ${r.odometer.toLocaleString()} km` : ''}
              </span>
              <span className="flex items-center gap-2">
                {r.source === 'FUEL_CARD' && <StatusBadge variant="info">Card ••{r.fuelCard?.last4}</StatusBadge>}
                {confirmDelete === r.id ? (
                  <>
                    <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => remove(r.id)}>Delete<span className="sr-only"> this fuel record</span></button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </>
                ) : (
                  <button type="button" className="icon-btn text-danger" onClick={() => setConfirmDelete(r.id)} aria-label={`Delete fuel record: ${r.bus?.licensePlate || 'vehicle'}, ${formatDate(r.filledAt)}`}>
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
