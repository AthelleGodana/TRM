import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Opens (and reuses) a single Socket.io connection, authenticated with the
// stored JWT. The connection is created once per component lifetime and
// cleaned up on unmount.
export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('tms_token');
    socketRef.current = io('/', { auth: { token } });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return socketRef;
}
