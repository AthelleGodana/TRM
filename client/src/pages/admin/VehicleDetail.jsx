import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, Gauge, Pencil, Plus, RotateCcw, Wrench } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import Modal from '../../components/common/Modal';
import VehicleForm from '../../components/fleet/VehicleForm';
import DocumentList from '../../components/fleet/DocumentList';
import { ScheduleForm, ServiceForm } from '../../components/fleet/MaintenanceForms';
import {
  AttentionChips, DefectStatusBadge, DueBadge, SeverityBadge, VehicleStatusBadge,
} from '../../components/fleet/Badges';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  FUEL_TYPES, OWNERSHIP, SERVICE_TYPES, VEHICLE_STATUS, VEHICLE_TYPES, apiError, describeDue, formatDate, formatKm,
  formatMoney, options,
} from '../../config/fleet';
import {
  archiveVehicle, assignVehicleDriver, getVehicle, listDriverProfiles, restoreVehicle, setVehicleStatus, updateDefect,
  updateOdometer,
} from '../../services/fleet.service';
import { listRoutes } from '../../services/admin.service';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { TabPanel, Tabs } from '../../components/common/Tabs';
import { plural } from '../../utils/format';
import { timeAgo } from '../../utils/geo';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'documents', label: 'Documents' },
  { value: 'defects', label: 'Defects' },
  { value: 'drivers', label: 'Driver history' },
];

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children || 'â€”'}</dd>
    </div>
  );
}

export default function VehicleDetail() {
  const { id } = useParams();
  const { session } = useAuth();
  const { toast } = useToast();
  const [bus, setBus] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [dialog, setDialog] = useState(null); // edit | driver | odometer | schedule | service
  const [driverChoice, setDriverChoice] = useState('');
  const [odometer, setOdometer] = useState('');
  const [servicePreset, setServicePreset] = useState(null);

  const latest = useLatestRequest();
  const load = () => {
    const isCurrent = latest();
    return getVehicle(id)
      .then((d) => { if (isCurrent()) { setBus(d.bus); setError(''); } })
      .catch((err) => { if (isCurrent()) setError(apiError(err, 'Could not load this vehicle.')); });
  };
  useEffect(() => {
    load();
    Promise.all([listDriverProfiles(), listRoutes()]).then(([d, r]) => { setDrivers(d.drivers); setRoutes(r.routes); }).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, success) => {
    try {
      await fn();
      if (success) toast.success(success);
      setDialog(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'That did not work. Try again.'));
    }
  };

  if (error) return <div className="page"><ErrorMessage message={error} /><Link to=".." className="btn-secondary">Back to vehicles</Link></div>;
  if (!bus) return <div className="page"><LoadingSpinner label="Loading vehicle..." /></div>;

  const tabs = session.organization?.features?.fuelHub ? [...TABS, { value: 'fuel', label: 'Fuel' }] : TABS;
  const openDefects = bus.defects.filter((d) => d.status !== 'RESOLVED');

  return (
    <div className="page">
      <Link to="/admin/buses" className="btn-ghost btn-sm -ml-3 mb-2">
        <ArrowLeft size={16} aria-hidden="true" /> All vehicles
      </Link>

      <div className="page-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title tabular-nums">{bus.licensePlate}</h1>
            <VehicleStatusBadge status={bus.status} />
            {bus.archivedAt && <span className="badge-neutral">Retired</span>}
          </div>
          <p className="page-subtitle">
            {VEHICLE_TYPES[bus.vehicleType]}{bus.make ? ` Â· ${bus.make} ${bus.model || ''}` : ''}{bus.year ? ` Â· ${bus.year}` : ''}
          </p>
          <div className="mt-2"><AttentionChips attention={bus.attention} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setDialog('edit')}><Pencil size={16} aria-hidden="true" /> Edit</button>
          {bus.archivedAt ? (
            <button type="button" className="btn-secondary" onClick={() => run(() => restoreVehicle(bus.id), 'Vehicle restored.')}>
              <RotateCcw size={16} aria-hidden="true" /> Restore
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => {
              if (window.confirm(`Retire ${bus.licensePlate}? It leaves the active fleet and its driver is unassigned. History is kept.`)) {
                run(() => archiveVehicle(bus.id), 'Vehicle retired.');
              }
            }}>
              <Archive size={16} aria-hidden="true" /> Retire
            </button>
          )}
        </div>
      </div>

      <Tabs id="vehicle" label={`${bus.licensePlate} sections`} className="mb-4" tabs={tabs.map((t) => (
        t.value === 'defects' && openDefects.length ? { ...t, label: `Defects (${openDefects.length})` } : t
      ))} value={tab} onChange={setTab} />

      <TabPanel id="vehicle" value={tab}>
      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <section className="glass-card p-5 lg:col-span-2" aria-labelledby="details-title">
            <h2 id="details-title" className="section-title mb-4">Details</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Odometer">{formatKm(bus.odometerKm)}</Field>
              <Field label="Seats">{bus.capacity}</Field>
              <Field label="Fuel">{FUEL_TYPES[bus.fuelType]}</Field>
              <Field label="VIN / chassis"><span className="break-all">{bus.vin}</span></Field>
              <Field label="Colour">{bus.color}</Field>
              <Field label="Ownership">{OWNERSHIP[bus.ownership]}</Field>
              <Field label="In the fleet since">{bus.acquiredAt && formatDate(bus.acquiredAt)}</Field>
              <Field label="Route">{bus.route?.name}</Field>
              <Field label="Last GPS signal">{bus.lastLocation ? timeAgo(bus.lastLocation.recordedAt) : 'Never'}</Field>
              <Field label="Service spend this year">{formatMoney(bus.serviceCostYtd)}</Field>
            </dl>
            {bus.notes && <p className="mt-4 text-sm text-muted-foreground whitespace-pre-line">{bus.notes}</p>}
          </section>

          <div className="flex flex-col gap-4">
            <section className="glass-card p-5" aria-labelledby="driver-title">
              <h2 id="driver-title" className="section-title mb-2">Driver</h2>
              {bus.driver ? (
                <Link to={`/admin/drivers/${bus.driver.id}`} className="font-medium text-link">{bus.driverName}</Link>
              ) : <p className="text-sm text-muted-foreground">No driver assigned.</p>}
              <button type="button" className="btn-secondary w-full mt-3" onClick={() => { setDriverChoice(String(bus.driverId || '')); setDialog('driver'); }}>
                {bus.driver ? 'Change driver' : 'Assign a driver'}
              </button>
            </section>
            <section className="glass-card p-5" aria-labelledby="status-title">
              <h2 id="status-title" className="section-title mb-3">Status</h2>
              <ButtonSelect ariaLabel="Vehicle status" size="sm" arrowSelects={false} options={options(VEHICLE_STATUS)} value={bus.status}
                onChange={(status) => run(() => setVehicleStatus(bus.id, status), 'Status updated.')} />
              <button type="button" className="btn-ghost btn-sm mt-3 -ml-3" onClick={() => { setOdometer(String(bus.odometerKm ?? '')); setDialog('odometer'); }}>
                <Gauge size={16} aria-hidden="true" /> Update odometer
              </button>
            </section>
          </div>
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="flex flex-col gap-5">
          <section aria-labelledby="sched-title">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 id="sched-title" className="section-title">Service schedule</h2>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" onClick={() => setDialog('schedule')}><Plus size={16} aria-hidden="true" /> Schedule</button>
                <button type="button" className="btn-primary btn-sm" onClick={() => { setServicePreset(null); setDialog('service'); }}>
                  <Wrench size={16} aria-hidden="true" /> Record service
                </button>
              </div>
            </div>
            {bus.maintenanceSchedules.length === 0 ? (
              <p className="glass-card p-4 text-sm text-muted-foreground">No recurring services yet. Schedule oil changes, inspections and the like to be reminded when they are due.</p>
            ) : (
              <ul className="glass-card divide-y divide-border">
                {bus.maintenanceSchedules.map((s) => (
                  <li key={s.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Every {[s.intervalKm && formatKm(s.intervalKm), s.intervalDays && plural(s.intervalDays, 'day')].filter(Boolean).join(' or ')}
                        {s.lastDoneAt && ` Â· last ${formatDate(s.lastDoneAt)}`} Â· {describeDue(s.due)}
                      </p>
                    </div>
                    <DueBadge status={s.due.status} />
                    <button type="button" className="btn-ghost btn-sm" onClick={() => { setServicePreset({ scheduleId: s.id, description: s.name }); setDialog('service'); }}>
                      Mark done<span className="sr-only">: {s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="history-title">
            <h2 id="history-title" className="section-title mb-2">Service history</h2>
            {bus.serviceRecords.length === 0 ? (
              <p className="glass-card p-4 text-sm text-muted-foreground">No services recorded yet.</p>
            ) : (
              <ul className="glass-card divide-y divide-border">
                {bus.serviceRecords.map((r) => (
                  <li key={r.id} className="p-3 text-sm flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{r.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(r.servicedAt)} Â· {SERVICE_TYPES[r.type]}{r.odometerKm != null ? ` Â· ${formatKm(r.odometerKm)}` : ''}{r.vendor ? ` Â· ${r.vendor}` : ''}
                      </p>
                    </div>
                    <span className="tabular-nums text-foreground shrink-0">{r.totalCost != null ? formatMoney(r.totalCost) : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'documents' && (
        <DocumentList documents={bus.documents} entityType="VEHICLE" busId={bus.id} onChange={load} />
      )}

      {tab === 'defects' && (
        bus.defects.length === 0 ? <p className="glass-card p-4 text-sm text-muted-foreground">No defects reported for this vehicle.</p> : (
          <ul className="glass-card divide-y divide-border">
            {bus.defects.map((d) => (
              <li key={d.id} className="p-3 text-sm flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[12rem]">
                  <p className="font-medium text-foreground">{d.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(d.createdAt)}{d.driverName ? ` Â· reported by ${d.driverName}` : ''}</p>
                  <div className="mt-1 flex gap-1"><SeverityBadge severity={d.severity} /><DefectStatusBadge status={d.status} /></div>
                </div>
                {d.status !== 'RESOLVED' && (
                  <div className="flex gap-2">
                    {d.status === 'OPEN' && (
                      <button type="button" className="btn-secondary btn-sm" onClick={() => run(() => updateDefect(d.id, { status: 'IN_PROGRESS' }))}>Start work<span className="sr-only"> on: {d.description}</span></button>
                    )}
                    <button type="button" className="btn-secondary btn-sm" onClick={() => run(() => updateDefect(d.id, { status: 'RESOLVED' }), 'Defect resolved.')}>Resolve<span className="sr-only">: {d.description}</span></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'drivers' && (
        bus.assignments.length === 0 ? <p className="glass-card p-4 text-sm text-muted-foreground">No driver has been assigned yet.</p> : (
          <ul className="glass-card divide-y divide-border">
            {bus.assignments.map((a) => (
              <li key={a.id} className="p-3 text-sm flex items-center justify-between gap-3">
                <Link to={`/admin/drivers/${a.driverId}`} className="font-medium text-link">{a.driverName}</Link>
                <span className="text-xs text-muted-foreground text-right">
                  {formatDate(a.startedAt)} â€“ {a.endedAt ? formatDate(a.endedAt) : <span className="badge-success">Current</span>}
                </span>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'fuel' && (
        bus.fuelRecords.length === 0 ? <p className="glass-card p-4 text-sm text-muted-foreground">No fuel records yet.</p> : (
          <ul className="glass-card divide-y divide-border">
            {bus.fuelRecords.map((f) => (
              <li key={f.id} className="p-3 text-sm flex items-center justify-between gap-3">
                <span>{formatDate(f.filledAt)} Â· {Number(f.litres).toLocaleString()} L{f.station ? ` Â· ${f.station}` : ''}</span>
                <span className="tabular-nums">{formatMoney(f.totalCost)}</span>
              </li>
            ))}
          </ul>
        )
      )}

      </TabPanel>

      <VehicleForm open={dialog === 'edit'} onClose={() => setDialog(null)} vehicle={bus} routes={routes}
        onSaved={() => { toast.success('Vehicle updated.'); load(); }} />

      <Modal open={dialog === 'driver'} onClose={() => setDialog(null)} title={`Driver for ${bus.licensePlate}`}>
        <p className="text-sm text-muted-foreground mb-3">A driver drives one vehicle at a time; choosing someone moves them off any other vehicle.</p>
        <ButtonSelect ariaLabel="Driver" size="sm" allowClear clearLabel="No driver" value={driverChoice}
          options={drivers.filter((d) => d.status === 'ACTIVE' || String(d.id) === driverChoice).map((d) => ({
            value: String(d.id), label: d.vehicle && d.vehicle.id !== bus.id ? `${d.name} (${d.vehicle.licensePlate})` : d.name,
          }))}
          onChange={setDriverChoice} />
        <button type="button" className="btn-primary w-full mt-4" onClick={() => run(() => assignVehicleDriver(bus.id, driverChoice), 'Driver updated.')}>Save</button>
      </Modal>

      <Modal open={dialog === 'odometer'} onClose={() => setDialog(null)} title="Update odometer">
        <label htmlFor="odo" className="field-label">Reading (km)</label>
        <input id="odo" type="number" inputMode="numeric" min={bus.odometerKm || 0} className="input-field" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
        <button type="button" className="btn-primary w-full mt-4" onClick={() => run(() => updateOdometer(bus.id, odometer), 'Odometer updated.')}>Save</button>
      </Modal>

      <ScheduleForm open={dialog === 'schedule'} onClose={() => setDialog(null)} busId={bus.id} onSaved={load} />
      <ServiceForm open={dialog === 'service'} onClose={() => setDialog(null)} vehicle={bus}
        schedules={bus.maintenanceSchedules} defects={openDefects} preset={servicePreset} onSaved={load} />
    </div>
  );
}
