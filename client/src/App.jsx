import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, useRef } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import InstallPrompt from './components/common/InstallPrompt';
import ToastContainer from './components/common/ToastContainer';

import Login from './pages/Login';
import Signup from './pages/Signup';
import StudentDashboard from './pages/student/Dashboard';
import DriverDashboard from './pages/driver/Dashboard';
import AdminDashboard from './pages/admin/Dashboard';

function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const installTriggerRef = useRef(() => {});

  // Handle the Navbar "install" button by asking the global InstallPrompt to open.
  const handleInstallRequest = () => installTriggerRef.current?.();

return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <InstallPrompt triggerRef={installTriggerRef} />
          <ToastContainer />
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
              <Route path="/signup" element={<PageTransition><Signup /></PageTransition>} />

              <Route
                path="/student/*"
                element={
                  <ProtectedRoute role="student">
                    <StudentDashboard onInstall={handleInstallRequest} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/driver/*"
                element={
                  <ProtectedRoute role="driver">
                    <DriverDashboard onInstall={handleInstallRequest} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute role="admin">
                    <AdminDashboard onInstall={handleInstallRequest} />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </AnimatePresence>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
