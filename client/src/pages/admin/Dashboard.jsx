import { useEffect, useState } from 'react';
import { Link, Routes, Route, Navigate } from 'react-router-dom';
import { Activity, ArrowRight, Bus, ChevronRight, Gauge, GraduationCap, UserPlus } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import ErrorMessage from '../../components/common/ErrorMessage';
import { useAuth } from '../../context/AuthContext';
import { useOrgSummary } from '../../hooks/useOrgSummary';
import { ADMIN_HOME, ADMIN_MENU, canSee, visibleMenu } from '../../config/navigation';
import { getFleetOverview } from '../../services/vehicle.service';
import ManageRoutes from './ManageRoutes';
import ManageBuses from './ManageBuses';
import ManageDrivers from './ManageDrivers';
import ManageStudents from './ManageStudents';
import Billing from './Billing';
import Members from './Members';
import FuelHub from './fuel/FuelHub';
import LiveFleet from './LiveFleet';

const PAGES = {
  live: <LiveFleet />,
  routes: <ManageRoutes />,
  buses: <ManageBuses />,
  drivers: <ManageDrivers />,
  students: <ManageStudents />,
  fuel: <FuelHub />,
  members: <Members />,
  billing: <Billing />,
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Kpi({ icon: Icon, label, value, detail, to }) {
  const Box = to ? Link : 'div';
  return (
    <Box {...(to ? { to } : {})} className={to ? 'card-link p-4' : 'glass-card p-4'}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={18} aria-hidden="true" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
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

function RouteUtilisation({ routes }) {
  if (!routes.length) {
    return <p className="text-sm text-muted-foreground">No routes yet. Add one under Routes &amp; Stops.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {routes.map((r) => {
        const pct = Math.min(100, r.utilization);
        const tone = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-primary-600';
        return (
          <li key={r.routeId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-foreground truncate">{r.routeName}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {r.occupied}/{r.capacity} seats · {r.utilization}%
              </span>
            </div>
            <div
              className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden"
              role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
              aria-label={`${r.routeName} seat utilisation`}
            >
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
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const pages = visibleMenu(ADMIN_MENU, session);
  const orgName = session.organization?.branding?.displayName || session.organization?.name;
  const passengerLabel = session.organization?.passengerLabel || 'Passengers';

  const load = () => {
    setError('');
    getFleetOverview().then(setData).catch(() => setError('Could not load the fleet overview.'));
  };
  useEffect(load, []);

  const health = data?.fleetHealth;

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
            <span className="block text-sm font-semibold text-foreground">
              {plural(waiting, 'person is', 'people are')} waiting for access
            </span>
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
            <Kpi icon={Bus} label="Vehicles" value={data.totalBuses}
              detail={health ? `${health.operational} operational · ${health.inService} in service` : undefined} />
            <Kpi icon={Activity} label="Reporting live" value={`${data.onTimePerformance}%`} detail="GPS in the last 30 min · open live map" to="/admin/live" />
            <Kpi icon={GraduationCap} label={passengerLabel} value={data.totalStudents} />
            <Kpi icon={Gauge} label="Seat utilisation" value={`${data.fleetUtilization}%`} detail="Across all routes" />
          </>
        )}
      </section>

      <div className="grid lg:grid-cols-5 gap-5 mt-5">
        <section className="glass-card p-5 lg:col-span-3" aria-labelledby="util-title">
          <h2 id="util-title" className="section-title mb-4">Seat utilisation by route</h2>
          {data ? <RouteUtilisation routes={data.utilizationByRoute} /> : <div className="skeleton h-24" aria-hidden="true" />}
        </section>

        <section className="lg:col-span-2" aria-labelledby="shortcuts-title">
          <h2 id="shortcuts-title" className="section-title mb-3">Manage</h2>
          <ul className="glass-card divide-y divide-border overflow-hidden">
            {pages.map((p) => (
              <li key={p.to}>
                <Link to={p.to} className="flex items-center gap-3 min-h-14 px-4 py-3 hover:bg-muted transition-colors">
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
        {ADMIN_MENU.filter((item) => canSee(item, session) && PAGES[item.to]).map((item) => (
          <Route key={item.to} path={`${item.to}/*`} element={PAGES[item.to]} />
        ))}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AppShell>
  );
}
