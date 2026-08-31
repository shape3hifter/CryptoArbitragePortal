(() => {
  'use strict';

  const SUPABASE_CONFIG = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  const SESSION_KEY = 'cryptoArbSupabaseSession';
  const SUPA_URL = String(SUPABASE_CONFIG.url || '').replace(/\/$/, '');
  const CORS_PROXY = 'https://corsproxy.io/?url=';
  const CMC_QUOTES = 'https://pro-api.coinmarketcap.com/public-api/v3/cryptocurrency/quotes/latest';
  const originalFetch = window.fetch.bind(window);
  let refreshInFlight = null;

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    const logout = document.getElementById('tradeLogoutBtn');
    if (logout && logout.style.display !== 'none') logout.click();
    window.dispatchEvent(new CustomEvent('crypto-arb-auth-expired'));
  }

  async function refreshSession() {
    const current = readSession();
    if (!current?.refresh_token || !SUPA_URL || !SUPABASE_CONFIG.anonKey) return false;
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const res = await originalFetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: SUPABASE_CONFIG.anonKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refresh_token: current.refresh_token })
        });
        if (!res.ok) return false;
        const body = await res.json();
        if (!body?.access_token) return false;
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          access_token: body.access_token,
          refresh_token: body.refresh_token || current.refresh_token,
          expires_at: body.expires_at,
          user: body.user || current.user
        }));
        return true;
      } catch { return false; }
    })().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  function supabaseRequest(url) {
    return SUPA_URL && url.startsWith(SUPA_URL + '/');
  }

  function extractCmcRequest(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== 'corsproxy.io') return null;
      const embedded = u.searchParams.get('url');
      if (!embedded) return null;
      const target = new URL(decodeURIComponent(embedded));
      if (target.hostname !== 'pro-api.coinmarketcap.com') return null;
      if (!target.pathname.endsWith('/public-api/v1/simple/price')) return null;
      const ids = target.searchParams.get('ids');
      const convert = target.searchParams.get('convert') || 'USD';
      if (!ids) return null;
      return `${CMC_QUOTES}?id=${encodeURIComponent(ids)}&convert=${encodeURIComponent(convert)}`;
    } catch { return null; }
  }

  function normalizeCmcPayload(payload) {
    const data = payload?.data;
    const records = Array.isArray(data) ? data : (data && typeof data === 'object' ? Object.values(data) : []);
    return records.map(item => {
      const id = Number(item?.id);
      const quote = item?.quote?.USD || {};
      return { id, price: Number(quote?.price) };
    }).filter(item => Number.isInteger(item.id) && Number.isFinite(item.price) && item.price > 0);
  }

  async function fetchCmcCompat(legacyUrl, init) {
    const target = extractCmcRequest(legacyUrl);
    if (!target) return originalFetch(legacyUrl, init);
    const proxied = CORS_PROXY + encodeURIComponent(target);
    const res = await originalFetch(proxied, { ...init, headers: { Accept: 'application/json', ...(init?.headers || {}) } });
    if (!res.ok) return res;
    let payload = null;
    try { payload = await res.json(); } catch { return res; }
    const normalized = normalizeCmcPayload(payload);
    return new Response(JSON.stringify({ data: normalized, status: payload?.status || { error_code: 0 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (extractCmcRequest(url)) return fetchCmcCompat(url, init);

    const isSupabase = supabaseRequest(url);
    const res = await originalFetch(input, init);
    if (res.status !== 401 || !isSupabase || init.__cryptoArbRetried) return res;

    const refreshed = await refreshSession();
    if (!refreshed) {
      clearSession();
      return res;
    }

    const nextInit = { ...init, __cryptoArbRetried: true };
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const current = readSession();
    if (current?.access_token) headers.set('Authorization', `Bearer ${current.access_token}`);
    nextInit.headers = headers;
    return originalFetch(input, nextInit);
  };

  window.addEventListener('crypto-arb-auth-expired', () => {
    const open = document.getElementById('tradesOpenEmpty');
    const closed = document.getElementById('tradesClosedEmpty');
    if (open) open.textContent = 'Sessão expirada. Entre novamente para consultar seus trades.';
    if (closed) closed.textContent = '';
  });
})();
