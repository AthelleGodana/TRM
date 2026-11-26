import { lazy, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import InstallPrompt from './components/common/InstallPrompt';
import ToastContainer from './components/common/ToastContainer';
import GlobalErrorToasts from './components/common/GlobalErrorToasts';
import { PageBoundary } from './components/common/ErrorBoundary';
import NotFound from './pages/NotFound';

// Each area is its own chunk, so signing in as a passenger never downloads
// the admin pages, charts or fleet tools.
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const PlatformDashboard = lazy(() => import('./pages/platform/Dashboard'));
const ParentDashboard = lazy(() => import('./pages/parent/Dashboard'));
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const DriverDashboard = lazy(() => import('./pages/driver/Dashboard'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));

function PageTransition({ children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {children}
    </motion.div>
  );
}

function AppRoutes({ onInstall }) {
  const location = useLocation();
  const area = (roles, Page) => (
    <ProtectedRoute roles={roles}><Page onInstall={onInstall} /></ProtectedRoute>
  );
  return (
    <PageBoundary resetKey={location.pathname.split('/')[1]} homePath="/">
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
          <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/onboarding" element={<PageTransition><Onboarding /></PageTransition>} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />

          <Route path="/platform/*" element={area(['SUPER_ADMIN'], PlatformDashboard)} />
          <Route path="/student/*" element={area(['STUDENT'], StudentDashboard)} />
          <Route path="/driver/*" element={area(['DRIVER'], DriverDashboard)} />
          <Route path="/admin/*" element={area(['ORG_ADMIN', 'FLEET_MANAGER'], AdminDashboard)} />
          <Route path="/parent/*" element={area(['PARENT'], ParentDashboard)} />

          <Route path="*" element={<NotFound standalone />} />
        </Routes>
      </AnimatePresence>
    </PageBoundary>
  );
}

export default function App() {
  const installTriggerRef = useRef(() => {});
  // The menu's "Install app" button asks the global InstallPrompt to open.
  const handleInstallRequest = () => installTriggerRef.current?.();

  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <InstallPrompt triggerRef={installTriggerRef} />
          <ToastContainer />
          <GlobalErrorToasts />
          <AppRoutes onInstall={handleInstallRequest} />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
