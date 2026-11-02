import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../services/tokenStore';

// Opens (and reuses) a single Socket.io connection, authenticated with the
// in-memory access token. The token is read on every (re)connect, so a
// reconnect after a silent refresh uses the new one. The server places the
// socket in its organisation's rooms based on that token.
export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io('/', { auth: (cb) => cb({ token: getAccessToken() }) });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return socketRef;
}
