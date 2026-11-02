import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeForRole } from '../../config/roles';

// Wraps a page and redirects to /login if not authenticated, or redirects
// away if the logged-in user's role doesn't match what the route requires.
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;

  return children;
}
