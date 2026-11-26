import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, LogOut, Menu, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { homeForRole } from '../../config/roles';
import Brand from './Brand';
import Drawer from '../common/Drawer';
import OrgSwitcher from '../common/OrgSwitcher';
import ThemeToggle from '../common/ThemeToggle';
import { PageBoundary } from '../common/ErrorBoundary';

const MAX_TABS = 5;

// Layout for every signed-in area.
// - Desktop (lg+): fixed sidebar with the organisation, navigation and account.
// - Mobile: sticky top bar, a bottom tab bar of at most five items (the
//   rest move behind "More"), and the full menu in a drawer.
// nav: [{ to, label, icon: LucideIcon, end?, badge?: number, badgeLabel?: string }]
export default function AppShell({ nav = [], onInstall, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef(null);
  const firstRender = useRef(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Move focus to the page on navigation so keyboard and screen reader
  // users start at the new content (not on first load).
  useEffect(() => {
    setMenuOpen(false);
    if (firstRender.current) { firstRender.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const homePath = user ? homeForRole(user.role) : '/';
  const onNavRoot = location.pathname === homePath || nav.some((n) => n.to === location.pathname);
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(homePath));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const showTabs = nav.length >= 2;
  const tabs = nav.length > MAX_TABS ? nav.slice(0, MAX_TABS - 1) : nav;
  const hasMore = nav.length > MAX_TABS;
  const announcements = nav.filter((n) => n.badge > 0 && n.badgeLabel).map((n) => n.badgeLabel).join('. ');
  const name = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : '';

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] btn-primary"
      >
        Skip to content
      </a>
      {/* One contextual status message for badge counts (not a bare number). */}
      <p role="status" aria-atomic="true" className="sr-only">{announcements}</p>

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-border bg-card">
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <Brand />
          <div className="mt-3"><OrgSwitcher /></div>
        </div>
        {nav.length > 0 ? (
          <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
            <NavList items={nav} />
          </nav>
        ) : <div className="flex-1" />}
        <div className="border-t border-border p-3">
          {name && (
            <div className="px-2 pb-2 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{name}</p>
              {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
            </div>
          )}
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {onInstall && (
              <button type="button" onClick={onInstall} className="icon-btn" aria-label="Install app" title="Install app">
                <Download size={20} aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={handleLogout} className="btn-ghost ml-auto">
              <LogOut size={18} aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────────── */}
      <header
        className="lg:hidden sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center gap-1 h-14 px-2">
          {!onNavRoot ? (
            <button type="button" onClick={goBack} className="icon-btn" aria-label="Go back">
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
          ) : (
            <span className="pl-2"><Brand compact /></span>
          )}
          <div className="min-w-0 flex-1 px-2">
            <p className="text-sm font-bold text-foreground leading-tight truncate">Transtrack Kenya</p>
            <OrgSwitcher />
          </div>
          <ThemeToggle />
          <button type="button" onClick={() => setMenuOpen(true)} className="icon-btn" aria-label="Open menu" aria-expanded={menuOpen}>
            <Menu size={22} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className={`lg:pl-64 focus:outline-none ${showTabs ? 'pb-24 lg:pb-0' : 'pb-6'}`}
      >
        {/* A page that fails to render, or is still loading, keeps the
            navigation usable. Navigating clears the error. */}
        <PageBoundary resetKey={location.pathname} homePath={homePath}>{children}</PageBoundary>
      </main>

      {/* ── Mobile bottom tabs ──────────────────────────────────────── */}
      {showTabs && (
        <nav
          aria-label="Quick navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <ul className="flex">
            {tabs.map((item) => (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `relative flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-link' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="relative">
                    <item.icon size={22} aria-hidden="true" />
                    {item.badge > 0 && <Dot />}
                  </span>
                  <span className="truncate max-w-full">{item.short || item.label}</span>
                  {item.badge > 0 && <span className="sr-only">, {item.badgeLabel}</span>}
                </NavLink>
              </li>
            ))}
            {hasMore && (
              <li className="flex-1">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="relative w-full flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <span className="relative">
                    <MoreHorizontal size={22} aria-hidden="true" />
                    {nav.slice(MAX_TABS - 1).some((n) => n.badge > 0) && <Dot />}
                  </span>
                  More
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}

      {/* ── Mobile menu ─────────────────────────────────────────────── */}
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" side="left">
        {nav.length > 0 && (
          <nav aria-label="Main">
            <NavList items={nav} />
          </nav>
        )}
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2">
          {name && (
            <div className="px-1 pb-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{name}</p>
              {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
            </div>
          )}
          {onInstall && (
            <button type="button" onClick={() => { setMenuOpen(false); onInstall(); }} className="btn-secondary justify-start">
              <Download size={18} aria-hidden="true" /> Install app
            </button>
          )}
          <button type="button" onClick={handleLogout} className="btn-secondary justify-start">
            <LogOut size={18} aria-hidden="true" /> Sign out
          </button>
        </div>
      </Drawer>
    </div>
  );
}

function Dot() {
  return <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-card" aria-hidden="true" />;
}

function NavList({ items }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) => `flex items-center gap-3 min-h-11 px-3 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <item.icon size={20} aria-hidden="true" className="shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge > 0 && (
              <>
                <span className="badge-danger tabular-nums" aria-hidden="true">{item.badge}</span>
                <span className="sr-only">, {item.badgeLabel}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
