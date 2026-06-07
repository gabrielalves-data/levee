let _token = import.meta.env.VITE_DEVCOST_TOKEN || '';

export async function initToken() {
  if (typeof window !== 'undefined' && window.devcost?.getToken) {
    _token = await window.devcost.getToken();
  }
}

function getToken() { return _token; }

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
