import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Wrench } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import PageHeader from '../../components/layout/PageHeader';
import { ScheduleForm, ServiceForm } from '../../components/fleet/MaintenanceForms';
import { DefectStatusBadge, DueBadge, SeverityBadge } from '../../components/fleet/Badges';
import { useToast } from '../../context/ToastContext';
import {
  DEFECT_STATUS, SERVICE_TYPES, apiError, describeDue, formatDate, formatKm, formatMoney,
} from '../../config/fleet';
import { TabPanel, Tabs } from '../../components/common/Tabs';
import { plural } from '../../utils/format';
import {
  deleteSchedule, deleteServiceRecord, listDefects, listDue, listSchedules, listServiceRecords, listVehicles, updateDefect,
} from '../../services/fleet.service';

const TABS = [
  { value: 'due', label: 'Due' },
  { value: 'schedules', label: 'Schedules' },
  { value: 'history', label: 'History' },
  { value: 'defects', label: 'Defects' },
];

const VehicleLink = ({ bus }) => <Link to={`/admin/buses/${bus.id}`} className="font-semibold text-link tabular-nums">{bus.licensePlate}</Link>;

export default function Maintenance() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'due';
  const [due, setDue] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [records, setRecords] = useState({ records: [], totalCost: 0 });
  const [defects, setDefects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // schedule | service
  const [preset, setPreset] = useState(null);
  const [defectFilter, setDefectFilter] = useState('open');

  const load = () => Promise.all([listDue(), listSchedules(), listServiceRecords(), listDefects(), listVehicles()])
    .then(([d, s, r, f, v]) => { setDue(d.items); setSchedules(s.schedules); setRecords(r); setDefects(f.defects); setVehicles(v.buses); })
    .catch(() => setError('Could not load maintenance.'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const act = async (fn, success) => {
    try { await fn(); if (success) toast.success(success); load(); } catch (err) { toast.error(apiError(err, 'That did not work.')); }
  };

  const openDefects = defects.filter((d) => d.status !== 'RESOLVED');
  const shownDefects = defectFilter === 'open' ? openDefects : defects;
  const overdue = due.filter((d) => d.due.status === 'OVERDUE').length;
  const tabs = useMemo(() => TABS.map((t) => {
    if (t.value === 'due' && due.length) return { ...t, label: `Due (${due.length})` };
    if (t.value === 'defects' && openDefects.length) return { ...t, label: `Defects (${openDefects.length})` };
    return t;
  }), [due.length, openDefects.length]);

  const recordFor = (item) => { setPreset({ busId: item.busId, scheduleId: item.id, description: item.name }); setDialog('service'); };

  return (
    <div className="page">
      <PageHeader title="Maintenance" subtitle="Keep every vehicle serviced, safe and on the road.">
        <button type="button" className="btn-secondary" onClick={() => setDialog('schedule')}><Plus size={18} aria-hidden="true" /> Schedule</button>
        <button type="button" className="btn-primary" onClick={() => { setPreset(null); setDialog('service'); }}><Wrench size={18} aria-hidden="true" /> Record service</button>
      </PageHeader>
      <ErrorMessage message={error} />

      <Tabs id="maintenance" label="Maintenance sections" className="mb-4" tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />

      <TabPanel id="maintenance" value={tab}>
      {loading ? <LoadingSpinner label="Loading maintenance..." /> : (
        <>
          {tab === 'due' && (
            due.length === 0 ? (
              <p className="glass-card p-5 text-sm text-muted-foreground">
                Nothing is due in the next 14 days or 500 km. {schedules.length === 0 && 'Add service schedules to get reminders.'}
              </p>
            ) : (
              <>
                {overdue > 0 && <p className="text-sm text-danger font-medium mb-2" role="status">{overdue} overdue</p>}
                <ul className="glass-card divide-y divide-border">
                  {due.map((item) => (
                    <li key={item.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex-1 min-w-[12rem]">
                        <p><VehicleLink bus={item.bus} /> <span className="text-foreground">· {item.name}</span></p>
                        <p className="text-xs text-muted-foreground">{describeDue(item.due)}{item.bus.odometerKm != null ? ` · now ${formatKm(item.bus.odometerKm)}` : ''}</p>
                      </div>
                      <DueBadge status={item.due.status} />
                      <button type="button" className="btn-secondary btn-sm" onClick={() => recordFor(item)}>Mark done<span className="sr-only">: {item.name}, {item.bus.licensePlate}</span></button>
                    </li>
                  ))}
                </ul>
              </>
            )
          )}

          {tab === 'schedules' && (
            schedules.length === 0 ? <p className="glass-card p-5 text-sm text-muted-foreground">No service schedules yet.</p> : (
              <ul className="glass-card divide-y divide-border">
                {schedules.map((s) => (
                  <li key={s.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                    <div className="flex-1 min-w-[12rem]">
                      <p><VehicleLink bus={s.bus} /> <span className="text-foreground">· {s.name}</span></p>
                      <p className="text-xs text-muted-foreground">
                        Every {[s.intervalKm && formatKm(s.intervalKm), s.intervalDays && plural(s.intervalDays, 'day')].filter(Boolean).join(' or ')} · {describeDue(s.due)}
                      </p>
                    </div>
                    <DueBadge status={s.due.status} />
                    <button type="button" className="icon-btn" aria-label={`Delete ${s.name} schedule`}
                      onClick={() => window.confirm(`Delete the ${s.name} schedule for ${s.bus.licensePlate}?`) && act(() => deleteSchedule(s.id), 'Schedule deleted.')}>
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === 'history' && (
            <>
              <p className="text-sm text-muted-foreground mb-2">{plural(records.records.length, 'service')} · total {formatMoney(records.totalCost)}</p>
              {records.records.length === 0 ? <p className="glass-card p-5 text-sm text-muted-foreground">No services recorded yet.</p> : (
                <div className="glass-card overflow-x-auto">
                  <table className="data-table" aria-label="Service history">
                    <thead><tr><th scope="col">Date</th><th scope="col">Vehicle</th><th scope="col">Work</th><th scope="col" className="text-right">Cost</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {records.records.map((r) => (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap">{formatDate(r.servicedAt)}</td>
                          <td><VehicleLink bus={r.bus} /></td>
                          <td>
                            {r.description}
                            <p className="text-xs text-muted-foreground">{SERVICE_TYPES[r.type]}{r.vendor ? ` · ${r.vendor}` : ''}{r.odometerKm != null ? ` · ${formatKm(r.odometerKm)}` : ''}</p>
                          </td>
                          <td className="text-right tabular-nums whitespace-nowrap">{formatMoney(r.totalCost)}</td>
                          <td>
                            <button type="button" className="icon-btn" aria-label={`Delete service record: ${r.bus.licensePlate}, ${formatDate(r.servicedAt)}`}
                              onClick={() => window.confirm('Delete this service record?') && act(() => deleteServiceRecord(r.id), 'Deleted.')}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'defects' && (
            <>
              <div className="mb-3">
                <ButtonSelect ariaLabel="Defects shown" size="sm" value={defectFilter} onChange={setDefectFilter}
                  options={[{ value: 'open', label: `Open (${openDefects.length})` }, { value: 'all', label: 'All' }]} />
              </div>
              {shownDefects.length === 0 ? <p className="glass-card p-5 text-sm text-muted-foreground">No open defects.</p> : (
                <ul className="glass-card divide-y divide-border">
                  {shownDefects.map((d) => (
                    <li key={d.id} className="p-3 text-sm flex flex-wrap items-start gap-3">
                      <div className="flex-1 min-w-[12rem]">
                        <p><VehicleLink bus={d.bus} /> <span className="text-foreground">· {d.description}</span></p>
                        <p className="text-xs text-muted-foreground">{formatDate(d.createdAt)}{d.driverName ? ` · ${d.driverName}` : ''}</p>
                        <div className="mt-1 flex gap-1"><SeverityBadge severity={d.severity} /><DefectStatusBadge status={d.status} /></div>
                      </div>
                      {d.status !== 'RESOLVED' && (
                        <ButtonSelect ariaLabel={`Status of defect on ${d.bus.licensePlate}`} size="sm" arrowSelects={false} value={d.status}
                          options={Object.entries(DEFECT_STATUS).map(([value, s]) => ({ value, label: s.label }))}
                          onChange={(status) => act(() => updateDefect(d.id, { status }), status === 'RESOLVED' ? 'Defect resolved.' : undefined)} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
      </TabPanel>

      <ScheduleForm open={dialog === 'schedule'} onClose={() => setDialog(null)} vehicles={vehicles} onSaved={load} />
      <ServiceForm open={dialog === 'service'} onClose={() => setDialog(null)} vehicles={vehicles}
        schedules={schedules} defects={defects} preset={preset} onSaved={load} />
    </div>
  );
}
