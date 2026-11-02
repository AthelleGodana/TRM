import { useEffect, useState } from 'react';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ErrorMessage from '../../../components/common/ErrorMessage';
import ButtonSelect from '../../../components/common/ButtonSelect';
import StatusBadge from '../../../components/common/StatusBadge';
import { listBuses } from '../../../services/admin.service';
import { createFuelRecord, deleteFuelRecord, listFuelCards, listFuelRecords } from '../../../services/fuel.service';

const EMPTY = { busId: '', litres: '', pricePerLitre: '', totalCost: '', odometer: '', station: '', filledAt: '', fuelCardId: '' };
const kes = (v) => (v == null ? '—' : `KES ${Number(v).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`);

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
  useEffect(() => { load(); }, [busFilter]);

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
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">New fuel-up</p>
          <ButtonSelect ariaLabel="Vehicle" options={busOptions} value={form.busId} onChange={(busId) => setForm({ ...form, busId })} size="sm" />
          <div className="grid grid-cols-2 gap-2">
            <input required type="number" step="0.01" min="0.01" placeholder="Litres" className="input-field" value={form.litres} onChange={set('litres')} />
            <input type="number" step="0.01" min="0.01" placeholder="Price / litre (KES)" className="input-field" value={form.pricePerLitre} onChange={set('pricePerLitre')} />
            <input type="number" step="0.01" min="0.01" placeholder="Total cost (KES)" className="input-field" value={form.totalCost} onChange={set('totalCost')} />
            <input type="number" min="0" placeholder="Odometer (km)" className="input-field" value={form.odometer} onChange={set('odometer')} />
            <input placeholder="Station" className="input-field" value={form.station} onChange={set('station')} />
            <input type="datetime-local" aria-label="Filled at" className="input-field" value={form.filledAt} onChange={set('filledAt')} />
          </div>
          <p className="text-xs text-gray-400 -mt-1">Enter the price per litre or the total; the other is worked out.</p>
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
        <button onClick={() => setAdding(true)} className="btn-primary">+ Record a fuel-up</button>
      )}

      {buses.length > 1 && (
        <ButtonSelect ariaLabel="Filter by vehicle" size="sm" allowClear clearLabel="All vehicles"
          options={busOptions} value={busFilter} onChange={setBusFilter} />
      )}

      <div className="glass-card divide-y divide-gray-100 dark:divide-white/5">
        {records.length === 0 && <p className="p-4 text-sm text-gray-400">No fuel records yet.</p>}
        {records.map((r) => (
          <div key={r.id} className="p-3.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-gray-800 dark:text-gray-100">{r.bus?.licensePlate} · {Number(r.litres)} L</span>
              <span className="text-gray-700 dark:text-gray-200">{kes(r.totalCost)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1 text-xs text-gray-400">
              <span>
                {new Date(r.filledAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                {r.station ? ` · ${r.station}` : ''}{r.odometer != null ? ` · ${r.odometer.toLocaleString()} km` : ''}
              </span>
              <span className="flex items-center gap-2">
                {r.source === 'FUEL_CARD' && <StatusBadge variant="info">Card ••{r.fuelCard?.last4}</StatusBadge>}
                {confirmDelete === r.id ? (
                  <>
                    <button className="text-rose-500 font-medium" onClick={() => remove(r.id)}>Delete</button>
                    <button onClick={() => setConfirmDelete(null)}>Keep</button>
                  </>
                ) : (
                  <button className="text-rose-500" onClick={() => setConfirmDelete(r.id)} aria-label="Delete record">✕</button>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
