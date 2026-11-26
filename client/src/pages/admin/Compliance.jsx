import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Paperclip, Plus } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/layout/PageHeader';
import { DocumentForm } from '../../components/fleet/DocumentList';
import { ExpiryBadge } from '../../components/fleet/Badges';
import { useToast } from '../../context/ToastContext';
import { DOCUMENT_KINDS, formatDate } from '../../config/fleet';
import { listDocuments, listDriverProfiles, listVehicles, openDocumentFile } from '../../services/fleet.service';

const GROUPS = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'all', label: 'All documents' },
];

// Every compliance document across vehicles and drivers, most urgent first.
export default function Compliance() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState('');
  const [group, setGroup] = useState('attention');
  const [entity, setEntity] = useState('');
  const [editing, setEditing] = useState(null); // document | null
  const [adding, setAdding] = useState(null); // { entityType, id } while choosing / adding
  const [picker, setPicker] = useState(false);

  const load = () => listDocuments().then(setData).catch(() => setError('Could not load documents.'));
  useEffect(() => {
    load();
    Promise.all([listVehicles(), listDriverProfiles()]).then(([v, d]) => { setVehicles(v.buses); setDrivers(d.drivers); }).catch(() => {});
  }, []);

  const shown = useMemo(() => (data?.documents || []).filter((d) => (group === 'all' || ['EXPIRED', 'EXPIRING'].includes(d.expiry))
    && (!entity || d.entityType === entity)), [data, group, entity]);

  // Drivers' licences live on the driver profile; show missing/expiring ones too.
  const licences = drivers.filter((d) => ['EXPIRED', 'EXPIRING'].includes(d.licenseStatus));

  const open = async (d) => {
    try { await openDocumentFile(d.id, { fileName: d.fileName }); } catch { toast.error('Could not open the file.'); }
  };

  return (
    <div className="page">
      <PageHeader title="Documents" subtitle="Insurance, registration, inspection and driver documents, with their expiry dates.">
        <button type="button" className="btn-primary" onClick={() => setPicker(true)}><Plus size={18} aria-hidden="true" /> Add document</button>
      </PageHeader>
      <ErrorMessage message={error} />

      {data && (
        <section aria-label="Summary" className="grid grid-cols-3 gap-3 mb-5">
          <div className="glass-card p-4"><p className="text-sm text-muted-foreground">Expired</p><p className="text-2xl font-bold text-danger tabular-nums">{data.summary.expired}</p></div>
          <div className="glass-card p-4"><p className="text-sm text-muted-foreground">Expiring ≤ {data.summary.expiringDays} days</p><p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">{data.summary.expiring}</p></div>
          <div className="glass-card p-4"><p className="text-sm text-muted-foreground">Valid</p><p className="text-2xl font-bold text-foreground tabular-nums">{data.summary.valid}</p></div>
        </section>
      )}

      {licences.length > 0 && (
        <section className="glass-card p-4 mb-5 border-amber-300 dark:border-amber-500/40" aria-labelledby="lic-title">
          <h2 id="lic-title" className="section-title mb-2">Driving licences</h2>
          <ul className="flex flex-col gap-2">
            {licences.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link to={`/admin/drivers/${d.id}`} className="font-medium text-link">{d.name}</Link>
                <ExpiryBadge status={d.licenseStatus} date={d.licenseExpiry} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <ButtonSelect ariaLabel="Documents shown" size="sm" options={GROUPS} value={group} onChange={setGroup} />
        <ButtonSelect ariaLabel="Documents for" size="sm" allowClear clearLabel="Vehicles & drivers" value={entity} onChange={setEntity}
          options={[{ value: 'VEHICLE', label: 'Vehicles' }, { value: 'DRIVER', label: 'Drivers' }]} />
      </div>

      {!data ? <LoadingSpinner label="Loading documents..." /> : shown.length === 0 ? (
        <p className="glass-card p-5 text-sm text-muted-foreground">
          {group === 'attention' ? 'No documents are expired or expiring soon.' : 'No documents yet.'}
        </p>
      ) : (
        <ul className="glass-card divide-y divide-border">
          {shown.map((d) => (
            <li key={d.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="flex-1 min-w-[12rem]">
                <p className="font-medium text-foreground">{d.title || DOCUMENT_KINDS[d.kind]}</p>
                <p className="text-xs text-muted-foreground">
                  {d.bus ? <Link to={`/admin/buses/${d.bus.id}`} className="text-link">{d.bus.licensePlate}</Link>
                    : d.driver ? <Link to={`/admin/drivers/${d.driver.id}`} className="text-link">{d.driver.name}</Link> : null}
                  {d.number ? ` · No. ${d.number}` : ''}{d.issuedAt ? ` · issued ${formatDate(d.issuedAt)}` : ''}
                </p>
              </div>
              <ExpiryBadge status={d.expiry} date={d.expiresAt} />
              {d.hasFile && (
                <button type="button" className="icon-btn" onClick={() => open(d)} aria-label={`Open file: ${DOCUMENT_KINDS[d.kind]}, ${d.bus?.licensePlate || d.driver?.name || ''}`} title="Open file">
                  <Paperclip size={18} aria-hidden="true" />
                </button>
              )}
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(d)}>{d.expiry === 'EXPIRED' ? 'Renew' : 'Edit'}</button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={picker} onClose={() => setPicker(false)} title="Add a document for">
        <p className="field-label">Vehicle</p>
        <ButtonSelect ariaLabel="Vehicle" size="sm" value="" options={vehicles.map((v) => ({ value: String(v.id), label: v.licensePlate }))}
          onChange={(id) => { setPicker(false); setAdding({ entityType: 'VEHICLE', id: Number(id) }); }} />
        <p className="field-label mt-4">Driver</p>
        <ButtonSelect ariaLabel="Driver" size="sm" value="" options={drivers.map((d) => ({ value: String(d.id), label: d.name }))}
          onChange={(id) => { setPicker(false); setAdding({ entityType: 'DRIVER', id: Number(id) }); }} />
      </Modal>

      <DocumentForm open={!!adding} onClose={() => setAdding(null)} entityType={adding?.entityType}
        busId={adding?.entityType === 'VEHICLE' ? adding.id : undefined}
        driverId={adding?.entityType === 'DRIVER' ? adding.id : undefined} onSaved={load} />
      <DocumentForm open={!!editing} onClose={() => setEditing(null)} entityType={editing?.entityType} document={editing} onSaved={load} />
    </div>
  );
}
