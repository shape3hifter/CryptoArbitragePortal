// Compatibility bridge for the persistent Trades module.
// trades-ui.js owns the UI/state; this small global adapter only provides
// the legacy dbRequest name used by the inline form handlers in older builds.
(() => {
  'use strict';
  if (window.dbRequest) return;
  const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  window.dbRequest = async (path, options = {}) => {
    let session = null;
    try { session = JSON.parse(localStorage.getItem('cryptoArbSupabaseSession') || 'null'); } catch {}
    if (!session?.access_token) throw new Error('Faça login para acessar os trades.');
    const headers = {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    };
    const url = `${cfg.url}/rest/v1${path}`;
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error(body?.message || body?.hint || body?.details || `HTTP ${res.status}`);
    return body;
  };
})();
