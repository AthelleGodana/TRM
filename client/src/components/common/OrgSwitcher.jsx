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
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  // Opening moves focus to the current organisation in the list.
  useEffect(() => {
    if (!open) return;
    const items = [...(listRef.current?.querySelectorAll('[role="menuitemradio"]') || [])];
    (items.find((el) => el.getAttribute('aria-checked') === 'true') || items[0])?.focus();
  }, [open]);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape' && ref.current?.contains(document.activeElement)) { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!session) return null;
  const current = session.organization;
  const label = current ? (current.branding?.displayName || current.name) : 'Platform admin';
  const canSwitch = session.memberships.length > 1;

  // Arrow keys move through the organisations; Tab leaves the menu.
  const onMenuKey = (e) => {
    const items = [...listRef.current.querySelectorAll('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement);
    const moves = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 };
    if (e.key === 'Tab') { setOpen(false); return; }
    if (!(e.key in moves)) return;
    e.preventDefault();
    items[(moves[e.key] + items.length) % items.length]?.focus();
  };

  const choose = async (organizationId) => {
    setOpen(false);
    triggerRef.current?.focus();
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
    return <span className="block text-xs text-muted-foreground truncate">{label} · {session.roleLabel}</span>;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Organisation: ${label}, ${session.roleLabel}. Switch organisation`}
        className="flex items-center gap-1 -mx-2 px-2 min-h-11 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted max-w-[15rem]"
      >
        <span className="truncate">{busy ? 'Switching...' : `${label} · ${session.roleLabel}`}</span>
        <ChevronsUpDown size={14} className="shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <ul ref={listRef} role="menu" aria-label="Your organisations" onKeyDown={onMenuKey} className="absolute left-0 mt-1 w-64 glass-card p-1 z-50 shadow-lg">
          {session.memberships.map((m) => (
            <li key={m.organizationId} role="none">
              <button
                type="button"
                role="menuitemradio"
                tabIndex={-1}
                aria-checked={m.organizationId === current?.id}
                onClick={() => choose(m.organizationId)}
                className="w-full text-left min-h-11 px-3 py-2 rounded-lg text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-foreground">{m.name}</span>
                  <span className="block text-xs text-muted-foreground">{m.roleLabel}</span>
                </span>
                {m.organizationId === current?.id && <Check size={16} className="text-link" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
