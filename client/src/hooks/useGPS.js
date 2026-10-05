import { useEffect, useRef } from 'react';

// Used by the driver app. Watches the browser's geolocation and invokes
// onPosition(lat, lng) whenever a new coordinate is available.
export function useGPS(onPosition, active) {
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!active || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => onPosition(pos.coords.latitude, pos.coords.longitude),
      (err) => console.error('GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [active, onPosition]);
}
