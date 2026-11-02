import { useEffect, useState } from 'react';
import { Building2, GraduationCap, School } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import StatusBadge from '../../components/common/StatusBadge';
import { listOrganizations, setOrganizationStatus, updateOrganizationFeatures } from '../../services/org.service';

const FILTERS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: '', label: 'All' },
];

const STATUS_VARIANT = { PENDING: 'warning', ACTIVE: 'success', SUSPENDED: 'danger' };
const PROFILE = {
  UNIVERSITY: { Icon: GraduationCap, label: 'University' },
  SCHOOL: { Icon: School, label: 'School' },
  COMPANY: { Icon: Building2, label: 'Company' },
};

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className={`flex items-center gap-2.5 min-h-11 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" className="w-5 h-5 accent-primary-600" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span className="text-foreground">{label}</span>
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
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    return listOrganizations(status)
      .then((d) => setOrgs(d.organizations))
      .catch(() => setError('Could not load organisations.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status]);

  const act = async (id, fn) => {
    setError('');
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'That did not work.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell onInstall={onInstall}>
      <div className="page-narrow">
        <div className="page-header">
          <div>
            <h1 className="page-title">Organisations</h1>
            <p className="page-subtitle">Approve new organisations and manage their features.</p>
          </div>
        </div>
        <ButtonSelect ariaLabel="Filter by status" options={FILTERS} value={status} onChange={setStatus} size="sm" />
        <div className="mt-3"><ErrorMessage message={error} /></div>
        {loading ? <LoadingSpinner label="Loading organisations..." /> : orgs.length === 0 ? (
          <div className="glass-card p-6 mt-4 text-center text-sm text-muted-foreground">No organisations here.</div>
        ) : (
          <ul className="flex flex-col gap-3 mt-4">
            {orgs.map((o) => {
              const profile = PROFILE[o.profile] || PROFILE.COMPANY;
              const busy = busyId === o.id;
              return (
                <li key={o.id} className="glass-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-10 h-10 shrink-0 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
                        <profile.Icon size={20} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-foreground truncate">{o.name}</h2>
                        <p className="text-xs text-muted-foreground">
                          {profile.label} · code <span className="font-mono">{o.slug}</span> · {o.memberCount} members · {o.busCount} vehicles
                        </p>
                        {o.admins.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            Admin: {o.admins.map((a) => a.email || a.name).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <StatusBadge variant={STATUS_VARIANT[o.status]} dot>{o.status.toLowerCase()}</StatusBadge>
                  </div>
                  <div className="flex flex-wrap gap-x-6 mt-2">
                    <Toggle label="Fuel Hub" checked={o.fuelHubEnabled} disabled={busy}
                      onChange={(v) => act(o.id, () => updateOrganizationFeatures(o.id, { fuelHubEnabled: v }))} />
                    <Toggle label="AI fuel analytics" checked={o.aiFuelAnalyticsEnabled} disabled={busy || !o.fuelHubEnabled}
                      onChange={(v) => act(o.id, () => updateOrganizationFeatures(o.id, { aiFuelAnalyticsEnabled: v }))} />
                  </div>
                  <div className="flex gap-2 mt-2">
                    {o.status === 'PENDING' && (
                      <button type="button" disabled={busy} className="btn-primary flex-1 sm:flex-none"
                        onClick={() => act(o.id, () => setOrganizationStatus(o.id, 'approve'))}>Approve</button>
                    )}
                    {o.status === 'ACTIVE' && (
                      <button type="button" disabled={busy} className="btn-secondary flex-1 sm:flex-none text-red-700 dark:text-red-300"
                        onClick={() => act(o.id, () => setOrganizationStatus(o.id, 'suspend'))}>Suspend</button>
                    )}
                    {o.status === 'SUSPENDED' && (
                      <button type="button" disabled={busy} className="btn-secondary flex-1 sm:flex-none"
                        onClick={() => act(o.id, () => setOrganizationStatus(o.id, 'reactivate'))}>Reactivate</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
