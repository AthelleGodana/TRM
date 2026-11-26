import { Link } from 'react-router-dom';

// Privacy and terms links, shown in public page footers.
export default function LegalLinks({ className = '' }) {
  return (
    <nav aria-label="Legal" className={className}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <li><Link to="/privacy" className="text-link">Privacy policy</Link></li>
        <li><Link to="/terms" className="text-link">Terms of service</Link></li>
      </ul>
    </nav>
  );
}
