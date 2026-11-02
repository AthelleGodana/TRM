import { useEffect, useState } from 'react';

// Watches the device's location while `active`. Returns the latest fix
// ({ lat, lng, accuracy, speed, heading, at }) and an error state:
//   'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout' | null
// A timeout or lost signal is temporary; the watch keeps running.
export function useGPS(active) {
  const [fix, setFix] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    if (!window.isSecureContext) { setError('insecure'); return undefined; }
    if (!navigator.geolocation) { setError('unsupported'); return undefined; }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        setError(null);
        setFix({
          lat: c.latitude,
          lng: c.longitude,
          accuracy: c.accuracy,
          speed: c.speed ?? null,
          heading: Number.isFinite(c.heading) ? c.heading : null,
          at: pos.timestamp || Date.now(),
        });
      },
      (err) => setError(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  return { fix, error };
}

// Keeps the screen on while `active` (browsers pause GPS when the screen
// turns off). Re-acquired when the page becomes visible again. Returns
// whether the lock is held.
export function useWakeLock(active) {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) { lock.release(); return; }
        setHeld(true);
        lock.addEventListener('release', () => setHeld(false));
      } catch {
        setHeld(false);
      }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, [active]);

  return held;
}
