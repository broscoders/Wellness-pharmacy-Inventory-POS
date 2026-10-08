// Small fetch wrapper: keeps the short-lived access token in memory and silently renews it
// with the httpOnly refresh cookie when it expires.
let accessToken = null;
let refreshing = null;

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const setAccessToken = (t) => { accessToken = t; };

export async function refreshSession() {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        accessToken = data.accessToken;
        return data;
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

function buildUrl(path, params) {
  const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const qs = new URLSearchParams(clean).toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const run = () =>
    fetch(buildUrl(path, params), {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await run();
  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const renewed = await refreshSession();
    if (renewed) res = await run();
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const first = json.details?.[0];
    const msg = first ? `${json.message}: ${first.field ? `${first.field} - ` : ''}${first.message}` : json.message;
    throw new ApiError(msg || 'Request failed', res.status, json.details);
  }
  return json;
}
