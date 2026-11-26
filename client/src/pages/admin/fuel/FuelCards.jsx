import { useEffect, useState } from 'react';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ErrorMessage from '../../../components/common/ErrorMessage';
import ButtonSelect from '../../../components/common/ButtonSelect';
import StatusBadge from '../../../components/common/StatusBadge';
import { listBuses } from '../../../services/admin.service';
import { createFuelCard, deleteFuelCard, listFuelCards, updateFuelCard } from '../../../services/fuel.service';
import { Trash2 } from 'lucide-react';
import { formatMoney } from '../../../utils/format';
import { Plus } from 'lucide-react';

const EMPTY = { label: '', provider: '', last4: '', busId: '', monthlyLimit: '' };
const STATUS_VARIANT = { ACTIVE: 'success', BLOCKED: 'danger', EXPIRED: 'neutral' };

// Fuel cards are stored by their last four digits only.
export default function FuelCards() {
  const [cards, setCards] = useState([]);
  const [buses, setBuses] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => Promise.all([listFuelCards(), listBuses()])
    .then(([c, b]) => { setCards(c.cards); setBuses(b.buses); })
    .catch(() => setError('Could not load fuel cards.'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'That did not work.');
      return false;
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
    if (await act(() => createFuelCard(body))) {
      setForm(EMPTY);
      setAdding(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading fuel cards..." />;

  return (
    <div className="flex flex-col gap-4">
      <ErrorMessage message={error} />
      {adding ? (
        <form onSubmit={submit} className="glass-card p-4 flex flex-col gap-3">
          <h2 className="section-title">New fuel card</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="card-label" className="field-label">Label</label>
              <input id="card-label" required placeholder="e.g. Bus 4 card" className="input-field" value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div>
              <label htmlFor="card-provider" className="field-label">Provider</label>
              <input id="card-provider" className="input-field" value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            </div>
            <div>
              <label htmlFor="card-last4" className="field-label">Last 4 digits</label>
              <input id="card-last4" required inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" className="input-field"
                value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value.replace(/\D/g, '') })} />
            </div>
            <div className="col-span-2">
              <label htmlFor="card-limit" className="field-label">Monthly limit (KES) <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input id="card-limit" type="number" inputMode="numeric" min="1" className="input-field" value={form.monthlyLimit}
                onChange={(e) => setForm({ ...form, monthlyLimit: e.target.value })} />
            </div>
          </div>
          <p className="field-label mb-0">Assigned vehicle</p>
          <ButtonSelect ariaLabel="Assigned vehicle" size="sm" allowClear clearLabel="Any vehicle"
            options={buses.map((b) => ({ value: String(b.id), label: b.licensePlate }))}
            value={form.busId} onChange={(busId) => setForm({ ...form, busId })} />
          <p className="field-hint mt-0">Never enter the full card number; only the last four digits are kept.</p>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">Save</button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-primary self-start"><Plus size={18} aria-hidden="true" /> Add fuel card</button>
      )}

      <div className="glass-card divide-y divide-border">
        {cards.length === 0 && <p className="p-4 text-sm text-gray-400">No fuel cards yet.</p>}
        {cards.map((c) => (
          <div key={c.id} className="p-3.5 text-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{c.label} <span className="font-mono text-gray-400">••{c.last4}</span></p>
              <p className="text-xs text-gray-400">
                {[c.provider, c.bus?.licensePlate, c.monthlyLimit && `limit ${formatMoney(c.monthlyLimit)}`].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge variant={STATUS_VARIANT[c.status]}>{c.status.toLowerCase()}</StatusBadge>
              <button type="button" className="btn-ghost btn-sm text-link"
                onClick={() => act(() => updateFuelCard(c.id, { status: c.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE' }))}>
                {c.status === 'ACTIVE' ? 'Block' : 'Activate'}<span className="sr-only"> {c.label}</span>
              </button>
              <button type="button" className="icon-btn text-danger" onClick={() => act(() => deleteFuelCard(c.id))} aria-label={`Delete ${c.label}`}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
