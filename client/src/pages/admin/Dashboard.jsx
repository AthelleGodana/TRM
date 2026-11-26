import { lazy, useEffect, useState } from 'react';
import { Link, Routes, Route } from 'react-router-dom';
import {
  Activity, ArrowRight, Bus, ChevronRight, FileWarning, Gauge, GraduationCap, IdCard, TriangleAlert, UserPlus, Wrench,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import ErrorMessage from '../../components/common/ErrorMessage';
import { useAuth } from '../../context/AuthContext';
import { useOrgSummary } from '../../hooks/useOrgSummary';
import { ADMIN_HOME, ADMIN_MENU, canSee, visibleMenu } from '../../config/navigation';
import { VEHICLE_STATUS, formatDate } from '../../config/fleet';
import { getFleetOverview } from '../../services/fleet.service';
import { plural } from '../../utils/format';
import NotFound from '../NotFound';

// Each section loads on first visit (maps, charts and forms stay out of the
// overview's download).
const PAGES = {
  live: lazy(() => import('./LiveFleet')),
  routes: lazy(() => import('./ManageRoutes')),
  buses: lazy(() => import('./ManageBuses')),
  drivers: lazy(() => import('./ManageDrivers')),
  maintenance: lazy(() => import('./Maintenance')),
  compliance: lazy(() => import('./Compliance')),
  students: lazy(() => import('./ManageStudents')),
  fuel: lazy(() => import('./fuel/FuelHub')),
  members: lazy(() => import('./Members')),
  billing: lazy(() => import('./Billing')),
};


function Kpi({ icon: Icon, label, value, detail, to, tone }) {
  const Box = to ? Link : 'div';
  const toneClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-foreground';
  return (
    <Box {...(to ? { to } : {})} className={to ? 'card-link p-4' : 'glass-card p-4'}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={18} aria-hidden="true" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${toneClass}`}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </Box>
  );
}

function KpiSkeleton() {
  return (
    <div className="glass-card p-4" aria-hidden="true">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-7 w-16 mt-3" />
      <div className="skeleton h-3 w-32 mt-2" />
    </div>
  );
}

// Where each "needs attention" item leads.
function attentionLink(item) {
  if (item.kind === 'DEFECT') return '/admin/maintenance?tab=defects';
  if (item.kind === 'MAINTENANCE') return `/admin/buses/${item.busId}`;
  if (item.kind === 'LICENCE') return `/admin/drivers/${item.driverId}`;
  if (item.busId) return `/admin/buses/${item.busId}`;
  if (item.driverId) return `/admin/drivers/${item.driverId}`;
  return '/admin/compliance';
}

const KIND_ICON = { MAINTENANCE: Wrench, DOCUMENT: FileWarning, LICENCE: IdCard, DEFECT: TriangleAlert };

function NeedsAttention({ items }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nothing needs attention. Services, documents and licences are all up to date.</p>;
  }
  return (
    <ul className="divide-y divide-border -mx-5">
      {items.slice(0, 12).map((item, i) => {
        const Icon = KIND_ICON[item.kind] || TriangleAlert;
        const date = item.expiresAt ? formatDate(item.expiresAt) : null;
        return (
          <li key={`${item.kind}-${i}`}>
            <Link to={attentionLink(item)} className="flex items-center gap-3 px-5 py-3 hover:bg-muted transition-colors">
              <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
                item.level === 'danger'
                  ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'}`}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-foreground first-letter:uppercase truncate">{item.title}</span>
                <span className="block text-xs text-muted-foreground truncate">{item.subject}{date ? ` · ${date}` : ''}</span>
              </span>
              <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function FleetStatus({ fleet, total }) {
  if (!total) return <p className="text-sm text-muted-foreground">No vehicles yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {Object.entries(VEHICLE_STATUS).map(([key, s]) => {
        const n = fleet.byStatus[key] || 0;
        const pct = Math.round((n / total) * 100);
        const tone = s.variant === 'success' ? 'bg-emerald-500' : s.variant === 'info' ? 'bg-primary-600' : s.variant === 'warning' ? 'bg-amber-500' : 'bg-red-500';
        return (
          <li key={key}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-foreground">{s.label}</span>
              <span className="text-muted-foreground tabular-nums">{n}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${s.label}: ${plural(n, 'vehicle')}`}>
              <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RouteUtilisation({ routes }) {
  if (!routes.length) return <p className="text-sm text-muted-foreground">No routes yet. Add one under Routes &amp; Runs.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {routes.map((r) => {
        const pct = Math.min(100, r.utilization);
        const tone = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-primary-600';
        return (
          <li key={r.routeId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-foreground truncate">{r.routeName}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">{r.occupied}/{r.capacity} seats · {r.utilization}%</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={pct} aria-label={`${r.routeName} seat utilisation`}>
              <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Overview({ waiting }) {
  const { session } = useAuth();
  const isAdmin = session.role === 'ORG_ADMIN';
  const features = session.organization?.features || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const pages = visibleMenu(ADMIN_MENU, session);
  const orgName = session.organization?.branding?.displayName || session.organization?.name;
  const passengerLabel = session.organization?.passengerLabel || 'Passengers';
  const vehiclesLabel = session.organization?.vehiclesLabel || 'Vehicles';

  const load = () => {
    setError('');
    getFleetOverview().then(setData).catch(() => setError('Could not load the fleet overview.'));
  };
  useEffect(load, []);

  const attentionCount = data?.attention?.length || 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">{orgName} · {session.roleLabel}</p>
        </div>
      </div>

      {isAdmin && waiting > 0 && (
        <Link to="/admin/members" className="card-link mb-5 p-4 flex items-center gap-3 border-amber-300 dark:border-amber-500/40">
          <span className="w-10 h-10 shrink-0 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 flex items-center justify-center">
            <UserPlus size={20} aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-foreground">{plural(waiting, 'person is', 'people are')} waiting for access</span>
            <span className="block text-xs text-muted-foreground">Review their requests in People &amp; Access.</span>
          </span>
          <ArrowRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
        </Link>
      )}

      {error && (
        <div className="mb-5">
          <ErrorMessage message={error} />
          <button type="button" className="btn-secondary" onClick={load}>Try again</button>
        </div>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {!data ? (
          [0, 1, 2, 3].map((i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            <Kpi icon={Bus} label={vehiclesLabel} value={`${data.fleet.available}/${data.totalBuses}`}
              detail={`${data.fleet.availabilityPct}% available · ${data.fleet.activeNow} live now`} to="/admin/buses" />
            <Kpi icon={Wrench} label="Services" value={data.maintenance.overdue}
              tone={data.maintenance.overdue ? 'danger' : undefined}
              detail={`overdue · ${data.maintenance.dueSoon} due soon`} to="/admin/maintenance" />
            <Kpi icon={FileWarning} label="Documents" value={data.documents.expired + data.drivers.licenseExpired}
              tone={data.documents.expired + data.drivers.licenseExpired ? 'danger' : undefined}
              detail={`expired · ${data.documents.expiring + data.drivers.licenseExpiring} expiring in 30 days`} to="/admin/compliance" />
            {features.passengers ? (
              <Kpi icon={GraduationCap} label={passengerLabel} value={data.totalStudents} detail={`${data.fleetUtilization}% of seats used`} to="/admin/students" />
            ) : (
              <Kpi icon={IdCard} label="Drivers" value={data.drivers.active}
                detail={`active · ${data.drivers.unassigned} without a vehicle`} to="/admin/drivers" />
            )}
          </>
        )}
      </section>

      <div className="grid lg:grid-cols-5 gap-5 mt-5">
        <section className="glass-card p-5 lg:col-span-3" aria-labelledby="attention-title">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 id="attention-title" className="section-title">Needs attention</h2>
            {data && attentionCount > 0 && <span className="badge-danger tabular-nums">{attentionCount}</span>}
          </div>
          {data ? <NeedsAttention items={data.attention} /> : <div className="skeleton h-32" aria-hidden="true" />}
        </section>

        <div className="lg:col-span-2 flex flex-col gap-5">
          <section className="glass-card p-5" aria-labelledby="status-title">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 id="status-title" className="section-title">Fleet status</h2>
              {data && (
                <Link to="/admin/live" className="text-sm font-medium text-link inline-flex items-center gap-1">
                  <Activity size={16} aria-hidden="true" /> Live map
                </Link>
              )}
            </div>
            {data ? <FleetStatus fleet={data.fleet} total={data.totalBuses} /> : <div className="skeleton h-24" aria-hidden="true" />}
          </section>
          {features.passengers && (
            <section className="glass-card p-5" aria-labelledby="util-title">
              <h2 id="util-title" className="section-title mb-4 flex items-center gap-2"><Gauge size={18} aria-hidden="true" /> Seat utilisation</h2>
              {data ? <RouteUtilisation routes={data.utilizationByRoute} /> : <div className="skeleton h-24" aria-hidden="true" />}
            </section>
          )}
        </div>
      </div>

      <section className="mt-5" aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title" className="section-title mb-3">Manage</h2>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pages.map((p) => (
            <li key={p.to}>
              <Link to={p.to} className="card-link flex items-center gap-3 min-h-16 px-4 py-3">
                <p.icon size={20} className="text-muted-foreground shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground">{p.label}</span>
                  <span className="block text-xs text-muted-foreground truncate">{p.description}</span>
                </span>
                {p.to === 'members' && waiting > 0 && <span className="badge-danger tabular-nums">{waiting}</span>}
                <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// Staff area for ORG_ADMIN and FLEET_MANAGER. Each page is only routed when
// its menu entry is visible to the current role and feature flags.
export default function AdminDashboard({ onInstall }) {
  const { session } = useAuth();
  const summary = useOrgSummary(session.role === 'ORG_ADMIN');
  const waiting = summary?.pendingAccessRequests || 0;
  const nav = [
    ADMIN_HOME,
    ...visibleMenu(ADMIN_MENU, session).map((item) => ({
      ...item,
      to: `/admin/${item.to}`,
      ...(item.to === 'members' && waiting > 0
        ? { badge: waiting, badgeLabel: `${plural(waiting, 'pending access request', 'pending access requests')}` }
        : {}),
    })),
  ];

  return (
    <AppShell nav={nav} onInstall={onInstall}>
      <Routes>
        <Route index element={<Overview waiting={waiting} />} />
        {ADMIN_MENU.filter((item) => canSee(item, session) && PAGES[item.to]).map((item) => {
          const Page = PAGES[item.to];
          return <Route key={item.to} path={`${item.to}/*`} element={<Page />} />;
        })}
        <Route path="*" element={<NotFound homePath="/admin" />} />
      </Routes>
    </AppShell>
  );
}
