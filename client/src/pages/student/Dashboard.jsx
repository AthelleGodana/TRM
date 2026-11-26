import { lazy } from 'react';
import { Link, Routes, Route, Navigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import { useAuth } from '../../context/AuthContext';
import { STUDENT_MENU } from '../../config/navigation';
import NotFound from '../NotFound';

const TrackBus = lazy(() => import('./TrackBus'));
const MyRides = lazy(() => import('./MyRides'));
const Payments = lazy(() => import('./Payments'));
const Profile = lazy(() => import('./Profile'));

const DESCRIPTIONS = {
  '/student/track': 'See where your bus is right now',
  '/student/rides': 'Choose your pickup and drop-off stop and time',
  '/student/payments': 'Pay with M-Pesa and see receipts',
  '/student/profile': 'Your details and contact information',
};

function Home() {
  const { user } = useAuth();
  const shortcuts = STUDENT_MENU.filter((item) => DESCRIPTIONS[item.to]);
  return (
    <div className="page-narrow">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hello{user?.firstName ? `, ${user.firstName}` : ''}</h1>
          <p className="page-subtitle">What would you like to do?</p>
        </div>
      </div>
      <ul className="glass-card divide-y divide-border overflow-hidden">
        {shortcuts.map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="flex items-center gap-3 min-h-16 px-4 py-3 hover:bg-muted transition-colors">
              <span className="w-10 h-10 shrink-0 rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 flex items-center justify-center">
                <item.icon size={20} aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{DESCRIPTIONS[item.to]}</span>
              </span>
              <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StudentDashboard({ onInstall }) {
  return (
    <AppShell nav={STUDENT_MENU} onInstall={onInstall}>
      <Routes>
        <Route index element={<Home />} />
        <Route path="track" element={<TrackBus />} />
        <Route path="rides" element={<MyRides />} />
        <Route path="register-route" element={<Navigate to="/student/rides" replace />} />
        <Route path="payments" element={<Payments />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound homePath="/student" />} />
      </Routes>
    </AppShell>
  );
}
