import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import FuelRecords from './FuelRecords';
import FuelCards from './FuelCards';
import FuelInsights from './FuelInsights';

const TABS = [
  { to: 'records', label: '⛽ Records' },
  { to: 'cards', label: '💳 Fuel cards' },
  { to: 'insights', label: '✨ Insights' },
];

// Fuel Hub (staff, behind the organisation's fuelHub feature flag).
export default function FuelHub() {
  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto">
      <nav className="flex gap-2 mb-4 overflow-x-auto" aria-label="Fuel Hub sections">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              isActive ? 'bg-primary-600 text-white shadow' : 'bg-gray-900/5 dark:bg-white/10 text-gray-600 dark:text-gray-300'
            }`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="records" replace />} />
        <Route path="records" element={<FuelRecords />} />
        <Route path="cards" element={<FuelCards />} />
        <Route path="insights" element={<FuelInsights />} />
      </Routes>
    </div>
  );
}
