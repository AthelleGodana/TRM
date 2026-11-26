import { lazy, useCallback, useEffect, useState } from 'react';
import { Link, Routes, Route, useParams } from 'react-router-dom';
import { CalendarClock, MapPin } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import NotFound from '../NotFound';
import RideChooser from '../../components/rides/RideChooser';
import { useAuth } from '../../context/AuthContext';
import { getChildBus, listChildren } from '../../services/parent.service';

const TrackBus = lazy(() => import('../student/TrackBus'));

function Children() {
  const { session } = useAuth();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listChildren()
      .then((d) => setChildren(d.children))
      .catch(() => setError('Could not load your children.'))
      .finally(() => setLoading(false));
  }, []);

  const label = session.organization?.passengerLabel?.toLowerCase() || 'children';

  return (
    <div className="page-narrow">
      <div className="page-header">
        <div>
          <h1 className="page-title">My children</h1>
          <p className="page-subtitle">See a child's bus live, or set their pickup and drop-off.</p>
        </div>
      </div>
      {loading && <LoadingSpinner label="Loading..." />}
      <ErrorMessage message={error} />
      {!loading && children.length === 0 && !error && (
        <div className="glass-card p-5 text-sm text-muted-foreground">
          No {label} are linked to your account yet. Ask the transport office to link your child.
        </div>
      )}
      {children.length > 0 && (
        <ul className="glass-card divide-y divide-border overflow-hidden">
          {children.map((c) => (
            <li key={c.id} className="flex items-center gap-2 pr-3">
              <Link to={`track/${c.id}`} className="flex-1 min-w-0 flex items-center gap-3 min-h-16 px-4 py-3 hover:bg-muted transition-colors">
                <span className="w-10 h-10 shrink-0 rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 flex items-center justify-center">
                  <MapPin size={20} aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{c.user.firstName} {c.user.lastName}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {c.route ? `${c.route.name}${c.arrivePickupPoint ? ` · ${c.arrivePickupPoint.name}` : ''}` : 'No route assigned yet'}
                  </span>
                </span>
                <span className="sr-only">Track bus</span>
              </Link>
              <Link to={`rides/${c.id}`} className="btn-secondary btn-sm shrink-0">
                <CalendarClock size={16} aria-hidden="true" /> Rides
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChildRides() {
  const { id } = useParams();
  const [name, setName] = useState(null);
  useEffect(() => {
    listChildren().then((d) => setName(d.children.find((c) => String(c.id) === id)?.user.firstName || null)).catch(() => {});
  }, [id]);
  return (
    <div className="page max-w-4xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">{name ? `${name}'s rides` : 'Rides'}</h1>
          <p className="page-subtitle">Usual pickup and drop-off, and changes for particular days.</p>
        </div>
      </div>
      <RideChooser childId={id} passengerName={name} />
    </div>
  );
}

function TrackChild() {
  const { id } = useParams();
  const loadBus = useCallback(() => getChildBus(id), [id]);
  return <TrackBus loadBus={loadBus} />;
}

// PARENT area: your children and live tracking of the bus on their route.
export default function ParentDashboard({ onInstall }) {
  return (
    <AppShell onInstall={onInstall}>
      <Routes>
        <Route index element={<Children />} />
        <Route path="track/:id" element={<TrackChild />} />
        <Route path="rides/:id" element={<ChildRides />} />
        <Route path="*" element={<NotFound homePath="/parent" />} />
      </Routes>
    </AppShell>
  );
}
