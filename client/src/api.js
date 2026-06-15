let _token = import.meta.env.VITE_LEVEE_TOKEN || '';

// Base URL for API calls. Empty in dev so requests are relative and ride the
// Vite proxy. In the packaged app the UI loads from file://, where relative
// paths resolve to file:/// and never reach the server — so we build an
// absolute loopback URL from the per-launch port the Electron main reports.
let _base = '';

export async function initToken() {
  if (typeof window !== 'undefined' && window.levee?.getToken) {
    _token = await window.levee.getToken();
    if (import.meta.env.PROD && window.levee.getPort) {
      const port = await window.levee.getPort();
      _base = `http://127.0.0.1:${port}`;
    }
  } else {
    console.warn('[initToken] window.levee not available — token will be empty');
  }
}

function getToken() { return _token; }

export async function apiFetch(path, opts = {}) {
  const res = await fetch(_base + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-levee-token': getToken(),
      ...opts.headers,
    },
  })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json()
}
