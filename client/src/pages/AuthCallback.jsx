import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { homeForRole } from '../config/roles';

// Landing page after a redirect-mode Google sign-in. The server already set
// the refresh cookie; exchange it for a session and continue.
export default function AuthCallback() {
  const { restore } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    restore().then((session) => {
      navigate(session ? homeForRole(session.role) : '/login?error=GOOGLE', { replace: true });
    });
  }, [restore, navigate]);

  return <LoadingSpinner label="Signing you in..." />;
}
