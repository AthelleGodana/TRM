import { Link, Routes, Route } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../../components/common/Navbar';
import BottomNav from '../../components/common/BottomNav';
import TrackBus from './TrackBus';
import RegisterRoute from './RegisterRoute';
import Payments from './Payments';
import Profile from './Profile';

const NAV_ITEMS = [
  { to: '/student', label: 'Home', icon: '🏠', end: true },
  { to: '/student/track', label: 'Track', icon: '📍' },
  { to: '/student/register-route', label: 'Route', icon: '🗺️' },
  { to: '/student/payments', label: 'Pay', icon: '💳' },
  { to: '/student/profile', label: 'Profile', icon: '👤' },
];

const CARDS = [
  { to: 'track', label: 'Track My Bus', icon: '📍', gradient: 'from-primary-500 to-accent-cyan' },
  { to: 'register-route', label: 'Register Route', icon: '🗺️', gradient: 'from-accent-violet to-primary-600' },
  { to: 'payments', label: 'Payments', icon: '💳', gradient: 'from-emerald-500 to-accent-cyan' },
  { to: 'profile', label: 'My Profile', icon: '👤', gradient: 'from-accent-amber to-rose-500' },
];

function Home() {
  return (
    <div className="p-4 pb-24 sm:pb-8 grid grid-cols-2 gap-3 max-w-md mx-auto">
      {CARDS.map((c, i) => (
        <motion.div key={c.to} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
          <Link
            to={c.to}
            className={`block bg-gradient-to-br ${c.gradient} text-white rounded-2xl p-5 text-center shadow-lg hover:brightness-110 active:scale-[0.97] transition-all`}
          >
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-sm font-semibold">{c.label}</div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

export default function StudentDashboard({ onInstall }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-dark bg-mesh-light dark:bg-mesh-dark">
      <Navbar title="Student Dashboard" onInstall={onInstall} />
      <Routes>
        <Route index element={<Home />} />
        <Route path="track" element={<TrackBus />} />
        <Route path="register-route" element={<RegisterRoute />} />
        <Route path="payments" element={<Payments />} />
        <Route path="profile" element={<Profile />} />
      </Routes>
      <BottomNav items={NAV_ITEMS} />
    </div>
  );
}
