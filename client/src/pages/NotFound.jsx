import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';

// Shown for unknown addresses, inside the signed-in layout (homePath = the
// area's home) or on its own.
export default function NotFound({ homePath = '/', standalone = false }) {
  usePageTitle('Page not found');
  const body = (
    <div className="page-narrow py-12">
      <div className="glass-card p-6 flex flex-col items-start gap-3">
        <MapPinOff size={28} className="text-muted-foreground" aria-hidden="true" />
        <h1 className="page-title">Page not found</h1>
        <p className="text-sm text-muted-foreground">This address does not exist or has moved. Check the link, or go back to the start.</p>
        <Link to={homePath} className="btn-primary mt-1">Go to home</Link>
      </div>
    </div>
  );
  return standalone ? <main id="main" className="min-h-dvh bg-background">{body}</main> : body;
}
