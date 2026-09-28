/** Network is deliberately opt-in. Production builds can remove the client
 * feature by omitting VITE_ENABLE_NETWORK or setting it to any value except
 * "true". */
export const NETWORK_ENABLED = import.meta.env.VITE_ENABLE_NETWORK === 'true';

export const DEFAULT_NETWORK_URL =
  typeof window !== 'undefined'
    ? `ws://${window.location.hostname}:8787`
    : 'ws://localhost:8787';