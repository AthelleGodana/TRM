import { useCallback, useEffect, useRef } from 'react';

// Guards against out-of-order responses: when a page reloads data (a new
// :id, a filter change, a reload after saving), only the newest request may
// update state, and nothing updates after the page has gone.
//
//   const latest = useLatestRequest();
//   const load = () => {
//     const isCurrent = latest();
//     getVehicle(id).then((d) => { if (isCurrent()) setBus(d.bus); });
//   };
export function useLatestRequest() {
  const seq = useRef(0);
  useEffect(() => () => { seq.current += 1; }, []);
  return useCallback(() => {
    const mine = ++seq.current;
    return () => mine === seq.current;
  }, []);
}
