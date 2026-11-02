import { useEffect, useState } from 'react';
import Navbar from '../../components/common/Navbar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import StatusBadge from '../../components/common/StatusBadge';
import { listOrganizations, setOrganizationStatus, updateOrganizationFeatures } from '../../services/org.service';

const FILTERS = [
  { value: 'PENDING', label: '⏳ Pending' },
  { value: 'ACTIVE', label: '✅ Active' },
  { value: 'SUSPENDED', label: '⛔ Suspended' },
  { value: '', label: 'All' },
];

const STATUS_VARIANT = { PENDING: 'warning', ACTIVE: 'success', SUSPENDED: 'danger' };
const PROFILE_ICON = { UNIVERSITY: '🎓', SCHOOL: '🏫', COMPANY: '🏢' };

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className={`flex items-center gap-2 text-xs ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" className="w-4 h-4 accent-primary-600" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
    </label>
  );
}

// SUPER_ADMIN console: approve new organisations, suspend or reactivate
// them, and switch Fuel Hub features on per organisation.
export default function PlatformDashboard({ onInstall }) {
  const [status, setStatus] = useState('PENDING');
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    return listOrganizations(status)
      .then((d) => setOrgs(d.organizations))
      .catch(() => setError('Could not load organisations.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status]);

  const act = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'That did not work.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-dark bg-mesh-light dark:bg-mesh-dark">
      <Navbar title="Platform" onInstall={onInstall} />
      <div className="p-4 pb-10 max-w-2xl mx-auto">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">Organisations</h1>
        <ButtonSelect ariaLabel="Filter by status" options={FILTERS} value={status} onChange={setStatus} size="sm" />
        <ErrorMessage message={error} />
        {loading ? <LoadingSpinner label="Loading organisations..." /> : orgs.length === 0 ? (
          <p className="text-sm text-gray-400 mt-6 text-center">No organisations here.</p>
        ) : (
          <ul className="flex flex-col gap-3 mt-4">
            {orgs.map((o) => (
              <li key={o.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">{PROFILE_ICON[o.profile]} {o.name}</p>
                    <p className="text-xs text-gray-400">
                      {o.slug} · {o.memberCount} members · {o.busCount} vehicles
                    </p>
                    {o.admins.length > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                        Admin: {o.admins.map((a) => a.email || a.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <StatusBadge variant={STATUS_VARIANT[o.status]} dot>{o.status.toLowerCase()}</StatusBadge>
                </div>
                <div className="flex flex-wrap gap-4 mt-3">
                  <Toggle label="Fuel Hub" checked={o.fuelHubEnabled}
                    onChange={(v) => act(() => updateOrganizationFeatures(o.id, { fuelHubEnabled: v }))} />
                  <Toggle label="AI fuel analytics" checked={o.aiFuelAnalyticsEnabled} disabled={!o.fuelHubEnabled}
                    onChange={(v) => act(() => updateOrganizationFeatures(o.id, { aiFuelAnalyticsEnabled: v }))} />
                </div>
                <div className="flex gap-2 mt-3">
                  {o.status === 'PENDING' && (
                    <button className="btn-primary flex-1" onClick={() => act(() => setOrganizationStatus(o.id, 'approve'))}>Approve</button>
                  )}
                  {o.status === 'ACTIVE' && (
                    <button className="btn-danger flex-1" onClick={() => act(() => setOrganizationStatus(o.id, 'suspend'))}>Suspend</button>
                  )}
                  {o.status === 'SUSPENDED' && (
                    <button className="btn-secondary flex-1" onClick={() => act(() => setOrganizationStatus(o.id, 'reactivate'))}>Reactivate</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
