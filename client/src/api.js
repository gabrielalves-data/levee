let _token = import.meta.env.VITE_DEVCOST_TOKEN || '';

export async function initToken() {
  console.log('[initToken] window.devcost =', window.devcost);
  if (typeof window !== 'undefined' && window.devcost?.getToken) {
    _token = await window.devcost.getToken();
    console.log('[initToken] token acquired, length =', _token?.length);
  } else {
    console.warn('[initToken] window.devcost not available — token will be empty');
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
