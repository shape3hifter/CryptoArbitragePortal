(() => {
  'use strict';

  const SUPABASE_CONFIG = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  const SESSION_KEY = 'cryptoArbSupabaseSession';
  const SUPA_URL = String(SUPABASE_CONFIG.url || '').replace(/\/$/, '');
  const originalFetch = window.fetch.bind(window);
  let refreshInFlight = null;

  const LIVE_CG_BASE = 'https://api.coingecko.com/api/v3/simple/price';
  const LIVE_FN = '/functions/v1/live-prices';
  const CMC_TO_CG = { 2010: 'cardano', 39064: 'midnight-3', 25264: 'snek', 5426: 'solana', 23095: 'bonk', 28752: 'dogwifcoin' };

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
        const res = await originalFetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: SUPABASE_CONFIG.anonKey, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ refresh_token: current.refresh_token }) });
        if (!res.ok) return false;
        const body = await res.json();
        if (!body?.access_token) return false;
        localStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: body.access_token, refresh_token: body.refresh_token || current.refresh_token, expires_at: body.expires_at, user: body.user || current.user }));
        return true;
      } catch { return false; }
    })().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  function supabaseRequest(url) { return SUPA_URL && url.startsWith(SUPA_URL + '/'); }

  function isDirectCoinGeckoRequest(url) {
    try { const u = new URL(url); return u.origin === 'https://api.coingecko.com' && u.pathname === '/api/v3/simple/price'; } catch { return false; }
  }

  async function fetchBackendQuote(url) {
    if (!SUPA_URL || !SUPABASE_CONFIG.anonKey) return null;
    try {
      const target = new URL(url);
      const endpoint = `${SUPA_URL}${LIVE_FN}${target.search}`;
      const res = await originalFetch(endpoint, { cache: 'no-store', headers: { apikey: SUPABASE_CONFIG.anonKey, Accept: 'application/json' } });
      return res.ok ? res : null;
    } catch { return null; }
  }

  async function fetchCoinGeckoWithFallback(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const backend = await fetchBackendQuote(url);
    if (backend) return backend;
    return originalFetch(input, init);
  }

  function extractLegacyLiveRequest(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== 'corsproxy.io') return null;
      const embedded = u.searchParams.get('url');
      if (!embedded) return null;
      const target = new URL(decodeURIComponent(embedded));
      if (target.hostname !== 'pro-api.coinmarketcap.com' || !target.pathname.endsWith('/public-api/v1/simple/price')) return null;
      const ids = target.searchParams.get('ids');
      const convert = (target.searchParams.get('convert') || 'USD').toLowerCase();
      if (!ids || convert !== 'usd') return null;
      const cmcIds = ids.split(',').map(x => x.trim()).filter(Boolean);
      const cgIds = cmcIds.map(id => CMC_TO_CG[id]);
      if (cgIds.some(id => !id)) return null;
      return { cmcIds, cgIds };
    } catch { return null; }
  }

  async function fetchLegacyLiveCompat(legacyUrl) {
    const request = extractLegacyLiveRequest(legacyUrl);
    if (!request) return originalFetch(legacyUrl, { cache: 'no-store' });
    const target = `${LIVE_CG_BASE}?ids=${encodeURIComponent(request.cgIds.join(','))}&vs_currencies=usd`;
    const res = await fetchBackendQuote(target);
    if (!res) return originalFetch(legacyUrl, { cache: 'no-store' });
    const payload = await res.json();
    const data = request.cmcIds.map((cmcId, index) => ({ id: Number(cmcId), price: Number(payload?.[request.cgIds[index]]?.usd) })).filter(item => Number.isFinite(item.price) && item.price > 0);
    return new Response(JSON.stringify({ data, status: { error_code: 0, error_message: null } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const liveRequest = extractLegacyLiveRequest(url);
    if (liveRequest) return fetchLegacyLiveCompat(url);
    if (isDirectCoinGeckoRequest(url)) return fetchCoinGeckoWithFallback(input, init);

    const isSupabase = supabaseRequest(url);
    const res = await originalFetch(input, init);
    if (res.status !== 401 || !isSupabase || init.__cryptoArbRetried) return res;
    const refreshed = await refreshSession();
    if (!refreshed) { clearSession(); return res; }
    const nextInit = { ...init };
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
