// In dev: set VITE_DEVCOST_TOKEN to the token printed by the server on startup.
// In Electron (Phase 3): preload injects window.__devcost_token before any fetch.
function getToken() {
  return (typeof window !== 'undefined' && window.__devcost_token)
    || import.meta.env.VITE_DEVCOST_TOKEN
    || ''
}

export async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
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
