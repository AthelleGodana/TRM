import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeForRole } from '../../config/roles';

// Wraps a page and redirects to /login if not authenticated (remembering
// the page, so signing in returns there), or away if the user's role
// doesn't match what the route requires.
export default function ProtectedRoute({ children, roles }) {
  const { user, loading, expired } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) {
    const params = new URLSearchParams({ next: location.pathname + location.search });
    if (expired) params.set('expired', '1');
    return <Navigate to={`/login?${params}`} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;

  return children;
}
