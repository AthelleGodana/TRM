import { Link, Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../../components/common/Navbar';
import { useAuth } from '../../context/AuthContext';
import { ADMIN_MENU, canSee, visibleMenu } from '../../config/navigation';
import ManageRoutes from './ManageRoutes';
import ManageBuses from './ManageBuses';
import ManageDrivers from './ManageDrivers';
import ManageStudents from './ManageStudents';
import Billing from './Billing';
import Members from './Members';

const PAGES = {
  routes: <ManageRoutes />,
  buses: <ManageBuses />,
  drivers: <ManageDrivers />,
  students: <ManageStudents />,
  members: <Members />,
  billing: <Billing />,
};

function Home() {
  const { session } = useAuth();
  const cards = visibleMenu(ADMIN_MENU, session);
  return (
    <div className="p-4 pb-8 grid grid-cols-2 gap-3 max-w-2xl mx-auto">
      {cards.map((c, i) => (
        <motion.div key={c.to} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
          className={cards.length % 2 === 1 && i === cards.length - 1 ? 'col-span-2' : ''}>
          <Link to={c.to} className={`block bg-gradient-to-br ${c.gradient} text-white rounded-2xl p-5 text-center shadow-lg hover:brightness-110 active:scale-[0.97] transition-all`}>
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-sm font-semibold">{c.label}</div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

// Staff area for ORG_ADMIN and FLEET_MANAGER. Each page is only routed when
// its menu entry is visible to the current role and feature flags.
export default function AdminDashboard({ onInstall, extraPages = {} }) {
  const { session } = useAuth();
  const pages = { ...PAGES, ...extraPages };
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-dark bg-mesh-light dark:bg-mesh-dark">
      <Navbar title="Transport Hub" onInstall={onInstall} />
      <Routes>
        <Route index element={<Home />} />
        {ADMIN_MENU.filter((item) => canSee(item, session) && pages[item.to]).map((item) => (
          <Route key={item.to} path={`${item.to}/*`} element={pages[item.to]} />
        ))}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  );
}
