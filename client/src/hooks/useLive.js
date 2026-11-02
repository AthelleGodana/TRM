import { useEffect, useRef, useState } from 'react';
import { getConnectionState, getSocket, onConnectionState, watchBus } from '../services/socket';

// 'connecting' | 'connected' | 'offline' | 'idle' for the shared socket.
export function useConnectionState() {
  const [state, setState] = useState(getConnectionState);
  useEffect(() => {
    getSocket();
    setState(getConnectionState());
    return onConnectionState(setState);
  }, []);
  return state;
}

// Subscribes to a socket event for the component's lifetime. The latest
// handler is always used, so callers need not memoise it.
export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    const listener = (payload) => ref.current(payload);
    s.on(event, listener);
    return () => { s.off(event, listener); };
  }, [event]);
}

// Live position of one bus: starts from `initial` (e.g. from the REST
// response), is refreshed from the server on every (re)connect, then
// follows 'bus:location'. `offline` is set when the driver disconnects.
export function useBusFeed(busId, initial = null) {
  const [position, setPosition] = useState(initial);
  const [offline, setOffline] = useState(false);

  useEffect(() => { setPosition(initial); }, [busId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!busId) return undefined;
    return watchBus(busId, (last) => { if (last) setPosition(last); });
  }, [busId]);

  useSocketEvent('bus:location', (p) => {
    if (p.busId !== busId) return;
    setPosition(p);
    setOffline(false);
  });
  useSocketEvent('bus:offline', (p) => { if (p.busId === busId) setOffline(true); });

  return { position, offline };
}
