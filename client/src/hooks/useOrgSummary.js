import { useCallback, useEffect, useState } from 'react';
import { getOrgSummary } from '../services/org.service';

const REFRESH_MS = 60_000;
const EVENT = 'transtrack:org-summary';

// Pending access requests and invitations for the ORG_ADMIN badge. Polls
// gently while the tab is visible (an in-app notice instead of email).
export function useOrgSummary(enabled) {
  const [summary, setSummary] = useState(null);

  const refresh = useCallback(() => {
    if (enabled) getOrgSummary().then(setSummary).catch(() => {});
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setSummary(null); return undefined; }
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
    window.addEventListener(EVENT, refresh);
    return () => { clearInterval(timer); window.removeEventListener(EVENT, refresh); };
  }, [enabled, refresh]);

  return summary;
}

// Pages that change requests or invitations call this to update the badge.
export const refreshOrgSummary = () => window.dispatchEvent(new Event(EVENT));
