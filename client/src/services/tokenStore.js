// The access token lives only in memory (never localStorage), so a script
// injected into the page cannot read a long-lived credential. A page reload
// gets a fresh access token from the httpOnly refresh cookie.
let accessToken = null;
const listeners = new Set();

export const getAccessToken = () => accessToken;

export function setAccessToken(token) {
  accessToken = token || null;
  listeners.forEach((fn) => fn(accessToken));
}

export function onAccessTokenChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
