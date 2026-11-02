import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { homeForRole } from '../../config/roles';

// Shows the active organisation and lets users who belong to several
// organisations switch between them. Switching issues a new session for
// the chosen organisation; the server checks the membership.
export default function OrgSwitcher() {
  const { session, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  if (!session) return null;
  const current = session.organization;
  const label = current ? (current.branding?.displayName || current.name) : 'Platform admin';
  const canSwitch = session.memberships.length > 1;

  const choose = async (organizationId) => {
    setOpen(false);
    if (organizationId === current?.id) return;
    setBusy(true);
    try {
      const next = await switchOrganization(organizationId);
      navigate(homeForRole(next.role), { replace: true });
    } finally {
      setBusy(false);
    }
  };

  if (!canSwitch) {
    return <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{label} · {session.roleLabel}</span>;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 max-w-[14rem]"
      >
        <span className="truncate">{busy ? 'Switching...' : `${label} · ${session.roleLabel}`}</span>
        <ChevronsUpDown size={14} className="shrink-0" />
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 mt-2 w-64 glass-card p-1 z-50 shadow-xl">
          {session.memberships.map((m) => (
            <li key={m.organizationId}>
              <button
                type="button"
                role="option"
                aria-selected={m.organizationId === current?.id}
                onClick={() => choose(m.organizationId)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-900/5 dark:hover:bg-white/10 flex items-center gap-2"
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-gray-800 dark:text-gray-100">{m.name}</span>
                  <span className="block text-xs text-gray-400">{m.roleLabel}</span>
                </span>
                {m.organizationId === current?.id && <Check size={16} className="text-primary-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
