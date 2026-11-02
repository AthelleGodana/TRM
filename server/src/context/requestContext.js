import { AsyncLocalStorage } from 'async_hooks';

// Per-request tenant context: { userId, organizationId, role }. It is only
// ever populated from a verified access token (HTTP middleware or Socket.io
// handshake) or by trusted system code, never from request input.
const storage = new AsyncLocalStorage();

export function runWithContext(ctx, fn) {
  return storage.run(Object.freeze({ ...ctx }), fn);
}

export function getContext() {
  return storage.getStore() || null;
}
