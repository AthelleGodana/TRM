import { Link, Routes, Route } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../../components/common/Navbar';
import ManageRoutes from './ManageRoutes';
import ManageBuses from './ManageBuses';
import ManageDrivers from './ManageDrivers';
import ManageStudents from './ManageStudents';
import Billing from './Billing';

const CARDS = [
  { to: 'routes', label: 'Routes & Stops', icon: '🗺️', gradient: 'from-primary-500 to-accent-cyan' },
  { to: 'buses', label: 'Fleet Management', icon: '🚌', gradient: 'from-accent-violet to-primary-600' },
  { to: 'drivers', label: 'Drivers', icon: '🧑‍✈️', gradient: 'from-emerald-500 to-accent-cyan' },
  { to: 'students', label: 'Students', icon: '🎓', gradient: 'from-accent-amber to-rose-500' },
  { to: 'billing', label: 'Billing & Revenue', icon: '💰', gradient: 'from-rose-500 to-accent-violet', wide: true },
];

function Home() {
  return (
    <div className="p-4 pb-8 grid grid-cols-2 gap-3 max-w-2xl mx-auto">
      {CARDS.map((c, i) => (
        <motion.div key={c.to} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
          className={c.wide ? 'col-span-2' : ''}>
          <Link to={c.to} className={`block bg-gradient-to-br ${c.gradient} text-white rounded-2xl p-5 text-center shadow-lg hover:brightness-110 active:scale-[0.97] transition-all`}>
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-sm font-semibold">{c.label}</div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

export default function AdminDashboard({ onInstall }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-dark bg-mesh-light dark:bg-mesh-dark">
      <Navbar title="Institutional Transport Hub" onInstall={onInstall} />
      <Routes>
        <Route index element={<Home />} />
        <Route path="routes" element={<ManageRoutes />} />
        <Route path="buses" element={<ManageBuses />} />
        <Route path="drivers" element={<ManageDrivers />} />
        <Route path="students" element={<ManageStudents />} />
        <Route path="billing" element={<Billing />} />
      </Routes>
    </div>
  );
}
