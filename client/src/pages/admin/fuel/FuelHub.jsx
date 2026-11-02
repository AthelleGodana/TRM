import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import FuelRecords from './FuelRecords';
import FuelCards from './FuelCards';
import FuelInsights from './FuelInsights';
import { CreditCard, Fuel, Sparkles } from 'lucide-react';

const TABS = [
  { to: 'records', label: 'Records', icon: Fuel },
  { to: 'cards', label: 'Fuel cards', icon: CreditCard },
  { to: 'insights', label: 'Insights', icon: Sparkles },
];

// Fuel Hub (staff, behind the organisation's fuelHub feature flag).
export default function FuelHub() {
  return (
    <div className="page max-w-3xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fuel Hub</h1>
          <p className="page-subtitle">Fill-ups, fuel cards and consumption insights.</p>
        </div>
      </div>
      <nav className="flex gap-1 mb-5 overflow-x-auto border-b border-border" aria-label="Fuel Hub sections">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `inline-flex items-center gap-2 min-h-11 px-3 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive ? 'border-primary-600 text-link' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={16} aria-hidden="true" />
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
