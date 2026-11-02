import { io } from 'socket.io-client';
import { refreshSession } from './api';
import { getAccessToken, onAccessTokenChange } from './tokenStore';

// One Socket.IO connection for the whole app, authenticated with the
// in-memory access token (read again on every reconnect).
//
// Reliability:
// - Bus subscriptions are kept in a registry and re-sent after every
//   (re)connect, because the server forgets rooms when a socket drops.
// - A handshake refused for an expired token is not retried by
//   Socket.IO, so we refresh the session and reconnect ourselves.
// - Switching organisation or signing out reconnects or closes the socket.

let socket = null;
let state = 'idle'; // idle | connecting | connected | offline
let retryDelay = 1000;
const watches = new Map(); // busId -> Set<(last) => void>
const stateListeners = new Set();

function setState(next) {
  if (next === state) return;
  state = next;
  stateListeners.forEach((fn) => fn(state));
}

function sendWatch(busId) {
  socket.emit('student:watchBus', { busId }, (res) => {
    if (!res?.ok) return;
    watches.get(busId)?.forEach((fn) => fn(res.last || null));
  });
}

async function recoverFromRefusal() {
  try {
    await refreshSession();
  } catch {
    setState('offline'); // signed out; the app will return to sign-in
    return;
  }
  setTimeout(() => socket?.connect(), retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30_000);
}

export function getSocket() {
  if (socket) return socket;
  setState('connecting');
  socket = io('/', {
    auth: (cb) => cb({ token: getAccessToken() }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
  socket.on('connect', () => {
    retryDelay = 1000;
    setState('connected');
    watches.forEach((_listeners, busId) => sendWatch(busId));
  });
  socket.on('disconnect', (reason) => {
    setState('connecting');
    // The server closed us on purpose (e.g. restart); come back.
    if (reason === 'io server disconnect') socket.connect();
  });
  socket.on('connect_error', () => {
    setState('connecting');
    // socket.active is false when the server refused the handshake.
    if (!socket.active) recoverFromRefusal();
  });
  return socket;
}

// Organisation of an access token, read without verifying (the server
// verifies); used only to notice an organisation switch.
function orgOf(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).organizationId ?? null;
  } catch {
    return null;
  }
}

let currentOrg = null;
onAccessTokenChange((token) => {
  if (!socket) { currentOrg = token ? orgOf(token) : null; return; }
  if (!token) {
    socket.disconnect();
    socket = null;
    watches.clear();
    setState('idle');
    currentOrg = null;
    return;
  }
  const org = orgOf(token);
  if (currentOrg !== null && org !== currentOrg) {
    // New organisation: the server must place us in different rooms.
    socket.disconnect();
    socket.connect();
  }
  currentOrg = org;
});

// Follows a bus. onLast receives the latest known position each time the
// subscription is (re)established. Returns an unsubscribe function.
export function watchBus(busId, onLast) {
  const s = getSocket();
  if (!watches.has(busId)) watches.set(busId, new Set());
  watches.get(busId).add(onLast);
  if (s.connected) sendWatch(busId);
  return () => {
    const set = watches.get(busId);
    set?.delete(onLast);
    if (set && set.size === 0) {
      watches.delete(busId);
      if (s.connected) s.emit('student:unwatchBus', { busId });
    }
  };
}

// Emits with an acknowledgement; resolves null if there is no reply in time.
export function send(event, payload, timeoutMs = 8000) {
  const s = getSocket();
  return new Promise((resolve) => {
    if (!s.connected) { resolve(null); return; }
    s.timeout(timeoutMs).emit(event, payload, (err, res) => resolve(err ? null : res));
  });
}

export const getConnectionState = () => state;
export function onConnectionState(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}
