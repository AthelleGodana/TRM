import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

// App-like bottom tab bar for mobile. items: [{ to, label, icon }]
export default function BottomNav({ items }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass rounded-none border-x-0 border-b-0 px-2 py-2 flex justify-around sm:hidden"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
              isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.div layoutId="bottomNavIndicator" className="absolute inset-0 bg-primary-500/10 rounded-xl" />
              )}
              <span className="text-base relative">{item.icon}</span>
              <span className="relative">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
