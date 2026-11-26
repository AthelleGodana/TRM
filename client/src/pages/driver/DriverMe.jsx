import { useEffect, useState } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import DocumentList from '../../components/fleet/DocumentList';
import { DriverStatusBadge, ExpiryBadge } from '../../components/fleet/Badges';
import { apiError, formatDate } from '../../config/fleet';
import { getMe } from '../../services/driver.service';

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children || '—'}</dd>
    </div>
  );
}

// The driver's own profile, licence, documents and vehicle history.
export default function DriverMe() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { getMe().then((d) => setMe(d.driver)).catch((err) => setError(apiError(err, 'Could not load your profile.'))); }, []);

  if (error) return <div className="page-narrow"><ErrorMessage message={error} /></div>;
  if (!me) return <div className="page-narrow"><LoadingSpinner label="Loading..." /></div>;

  return (
    <div className="page-narrow flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title">{me.user.firstName} {me.user.lastName}</h1>
        <DriverStatusBadge status={me.status} />
      </div>

      <section className="glass-card p-5" aria-labelledby="lic-title">
        <h2 id="lic-title" className="section-title mb-3">Driving licence</h2>
        <dl className="grid grid-cols-2 gap-4">
          <Field label="Number">{me.licenseNumber}</Field>
          <Field label="Class">{me.licenseClass}</Field>
          <Field label="Expiry">{me.licenseExpiry ? <ExpiryBadge status={me.licenseStatus} date={me.licenseExpiry} /> : null}</Field>
          <Field label="Employee no.">{me.employeeNo}</Field>
        </dl>
        {!me.licenseNumber && <p className="text-xs text-muted-foreground mt-3">Your transport office records your licence details.</p>}
      </section>

      <section aria-labelledby="mydocs-title">
        <h2 id="mydocs-title" className="section-title mb-2">My documents</h2>
        <DocumentList documents={me.documents} readOnly driverView />
      </section>

      <section aria-labelledby="hist-title">
        <h2 id="hist-title" className="section-title mb-2">Vehicles I have driven</h2>
        {me.assignments.length === 0 ? <p className="glass-card p-4 text-sm text-muted-foreground">None yet.</p> : (
          <ul className="glass-card divide-y divide-border">
            {me.assignments.map((a) => (
              <li key={a.id} className="p-3 text-sm flex items-center justify-between gap-3">
                <span className="font-medium tabular-nums">{a.bus.licensePlate}{a.bus.make ? ` · ${a.bus.make} ${a.bus.model || ''}` : ''}</span>
                <span className="text-xs text-muted-foreground">{formatDate(a.startedAt)} – {a.endedAt ? formatDate(a.endedAt) : 'now'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
