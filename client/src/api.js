let _token = import.meta.env.VITE_DEVCOST_TOKEN || '';

// Base URL for API calls. Empty in dev so requests are relative and ride the
// Vite proxy. In the packaged app the UI loads from file://, where relative
// paths resolve to file:/// and never reach the server — so we build an
// absolute loopback URL from the per-launch port the Electron main reports.
let _base = '';

export async function initToken() {
  if (typeof window !== 'undefined' && window.devcost?.getToken) {
    _token = await window.devcost.getToken();
    if (import.meta.env.PROD && window.devcost.getPort) {
      const port = await window.devcost.getPort();
      _base = `http://127.0.0.1:${port}`;
    }
  } else {
    console.warn('[initToken] window.devcost not available — token will be empty');
  }
}

function getToken() { return _token; }

export async function apiFetch(path, opts = {}) {
  const res = await fetch(_base + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-devcost-token': getToken(),
      ...opts.headers,
    },
  })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json()
}
