(() => {
  'use strict';

  const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  const ARBS = {
    'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', anchor: 'SOL', assets: ['BONK', 'WIF'] }
  };
  const SESSION_KEY = 'cryptoArbSupabaseSession';
  let session = loadSession();
  const $ = id => document.getElementById(id);

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  }
  function currentArb() {
    const select = $('arbitrageSelect');
    const name = String(select?.selectedOptions?.[0]?.textContent || '').trim().replace(/\s+/g, ' ');
    if (ARBS[name]) return { ...ARBS[name], name };
    const p = name.split('/').map(x => x.trim()).filter(Boolean);
    return p.length >= 2 ? { id: String(select?.value || 'current'), name, anchor: p[0], assets: p.slice(1, 3) } : { ...ARBS['ADA / NIGHT / SNEK'], name: 'ADA / NIGHT / SNEK' };
  }
  function strategies(a) {
    const [x, y] = a.assets;
    return [`${a.anchor} → ${x} → ${a.anchor}`, `${a.anchor} → ${y} → ${a.anchor}`, `${x} → ${y} → ${a.anchor}`, `${y} → ${x} → ${a.anchor}`];
  }
  function initialAsset(strategy, a) {
    const [x, y] = a.assets;
    const s = strategies(a);
    return strategy === s[0] ? x : strategy === s[1] ? y : strategy === s[2] ? y : x;
  }
  function fmt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 8 }) : '—';
  }
  function localDate(value = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const d = new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  async function api(path, options = {}, auth = true) {
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    const token = auth ? session?.access_token : null;
    if (auth && !token) throw new Error('Faça login para acessar os trades.');
    const headers = {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${token || cfg.anonKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const res = await fetch(`${cfg.url}${path}`, { ...options, headers });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error(body?.msg || body?.message || body?.hint || body?.details || `HTTP ${res.status}`);
    return body;
  }

  function authUi() {
    const card = $('tradesPanel');
    if (!card) return;
    if (!$('tradeAuthBar')) {
      const bar = document.createElement('div');
      bar.id = 'tradeAuthBar';
      bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin:6px 0 10px;';
      bar.innerHTML = '<span id="tradeAuthStatus" class="note"></span><div class="actions" style="margin-top:0"><button id="tradeLoginBtn" class="btn" type="button">Entrar</button><button id="tradeLogoutBtn" class="btn" type="button" style="display:none">Sair</button></div>';
      card.querySelector('.section-head')?.after(bar);
      $('tradeLoginBtn').onclick = showAuth;
      $('tradeLogoutBtn').onclick = () => { saveSession(null); authUi(); renderTrades(); };
    }
    const logged = !!session?.access_token;
    $('tradeAuthStatus').textContent = logged ? `Usuário: ${session.user?.email || 'autenticado'}` : 'Faça login para gravar e consultar seus trades.';
    $('tradeLoginBtn').style.display = logged ? 'none' : '';
    $('tradeLogoutBtn').style.display = logged ? '' : 'none';
  }

  function showAuth() {
    if (!$('tradeAuthModal')) {
      const modal = document.createElement('div');
      modal.id = 'tradeAuthModal';
      modal.className = 'trade-modal hidden';
      modal.innerHTML = '<div class="trade-modal-backdrop"></div><div class="trade-dialog" role="dialog" aria-modal="true"><div class="section-head"><div><h2>Acesso aos Trades</h2><div class="note">Supabase Auth</div></div><button id="authClose" class="btn" type="button">Fechar</button></div><form id="authForm"><div class="trade-form-grid"><div class="field"><label>E-mail</label><input id="authEmail" type="email" autocomplete="email" required></div><div class="field"><label>Senha</label><input id="authPassword" type="password" minlength="6" autocomplete="current-password" required></div></div><div class="actions"><button class="btn primary" type="submit">Entrar</button><button id="signupBtn" class="btn" type="button">Criar conta</button></div><div id="authMsg" class="note" style="margin-top:10px"></div></form></div>';
      document.body.appendChild(modal);
      $('authClose').onclick = () => modal.classList.add('hidden');
      modal.querySelector('.trade-modal-backdrop').onclick = () => modal.classList.add('hidden');
      $('authForm').onsubmit = async e => { e.preventDefault(); await login(); };
      $('signupBtn').onclick = signup;
    }
    $('tradeAuthModal').classList.remove('hidden');
  }
  async function login() {
    const msg = $('authMsg'); msg.textContent = 'Entrando…';
    try {
      const b = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: $('authEmail').value.trim(), password: $('authPassword').value }) }, false);
      saveSession({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at, user: b.user });
      $('tradeAuthModal').classList.add('hidden'); authUi(); await renderTrades();
    } catch (e) { msg.textContent = `Erro: ${e.message}`; }
  }
  async function signup() {
    const msg = $('authMsg'); msg.textContent = 'Criando conta…';
    try {
      const b = await api('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: $('authEmail').value.trim(), password: $('authPassword').value }) }, false);
      if (b?.access_token) {
        saveSession({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at, user: b.user });
        $('tradeAuthModal').classList.add('hidden'); authUi(); await renderTrades();
      } else msg.textContent = 'Conta criada. Se a confirmação por e-mail estiver habilitada, confirme o e-mail e depois entre.';
    } catch (e) { msg.textContent = `Erro: ${e.message}`; }
  }

  function prepareForm() {
    const a = currentArb();
    $('tradeVisualArbitrage').innerHTML = Object.values(ARBS).map(x => `<option value="${x.id}" ${x.id === a.id ? 'selected' : ''}>${x.name}</option>`).join('');
    $('tradeVisualStrategy').innerHTML = strategies(a).map(x => `<option value="${x}">${x}</option>`).join('');
    $('tradeVisualOpenedAt').value = localDate();
    $('tradeVisualClosedAt').value = '';
    $('tradeVisualAnchorAmount').value = '';
    $('tradeVisualQuantity').value = '';
    $('tradeVisualExitAmount').value = '';
    $('tradeVisualMessage').textContent = '';
    $('tradeVisualResult').classList.add('hidden');
    updateForm();
  }
  function updateForm() {
    const a = currentArb();
    const s = $('tradeVisualStrategy')?.value || strategies(a)[0];
    const asset = initialAsset(s, a);
    const cap = Number($('tradeVisualAnchorAmount')?.value);
    const qty = Number($('tradeVisualQuantity')?.value);
    const out = Number($('tradeVisualExitAmount')?.value);
    $('tradeVisualInitialAsset').value = asset;
    $('tradeVisualAnchorLabel').textContent = `Quantidade utilizada (${a.anchor})`;
    $('tradeVisualQuantityLabel').textContent = `Quantidade recebida (${asset})`;
    $('tradeVisualExitAmountLabel').textContent = `Quantidade recebida na âncora (${a.anchor})`;
    $('tradeVisualEntryDerived').innerHTML = `Preço efetivo de entrada: <strong>${cap > 0 && qty > 0 ? `${fmt(cap / qty)} ${a.anchor}/${asset}` : '—'}</strong>`;
    $('tradeVisualExitDerived').innerHTML = `Preço efetivo de saída: <strong>${out > 0 && qty > 0 ? `${fmt(out / qty)} ${a.anchor}/${asset}` : '—'}</strong>`;
  }

  window.updateTradeVisualForm = updateForm;
  window.openTradeVisualForm = () => {
    if (!session?.access_token) { showAuth(); return; }
    prepareForm();
    $('tradeVisualModal').dataset.tradeId = '';
    $('tradeVisualModal').classList.remove('hidden');
    $('tradeVisualModal').setAttribute('aria-hidden', 'false');
  };
  window.closeTradeVisualForm = () => { $('tradeVisualModal').classList.add('hidden'); $('tradeVisualModal').setAttribute('aria-hidden', 'true'); };

  async function submitForm(e) {
    e.preventDefault();
    if (!session?.access_token) { showAuth(); return false; }
    const a = currentArb();
    const s = $('tradeVisualStrategy').value || strategies(a)[0];
    const asset = initialAsset(s, a);
    const opened = $('tradeVisualOpenedAt').value;
    const closed = $('tradeVisualClosedAt').value;
    const cap = Number($('tradeVisualAnchorAmount').value);
    const qty = Number($('tradeVisualQuantity').value);
    const out = Number($('tradeVisualExitAmount').value);
    const id = $('tradeVisualModal').dataset.tradeId || '';
    const msg = $('tradeVisualMessage');
    const result = $('tradeVisualResult');
    if (!(cap > 0) || !(qty > 0)) { msg.textContent = `Preencha a quantidade utilizada em ${a.anchor} e a quantidade recebida em ${asset}.`; return false; }
    if (closed || out > 0) {
      if (!closed || !(out > 0)) { msg.textContent = 'Para fechar, informe a data/hora de saída e a quantidade recebida na âncora.'; return false; }
      if (new Date(closed) < new Date(opened)) { msg.textContent = 'A saída não pode ser anterior à entrada.'; return false; }
    }
    const payload = {
      user_id: session.user.id,
      arbitrage_id: a.id,
      arbitrage_name: a.name,
      anchor_symbol: a.anchor,
      strategy: s,
      opened_at: new Date(opened).toISOString(),
      initial_anchor_amount: cap,
      current_asset: asset,
      current_quantity: qty,
      entry_ratio_anchor_per_asset: cap / qty,
      entry_anchor_amount: cap,
      closed_at: closed ? new Date(closed).toISOString() : null,
      closed_anchor_amount: closed ? out : null
    };
    msg.textContent = id ? 'Atualizando no PostgreSQL…' : 'Gravando no PostgreSQL…';
    try {
      const saved = await api(id ? `/rest/v1/trades?id=eq.${encodeURIComponent(id)}` : '/rest/v1/trades', {
        method: id ? 'PATCH' : 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      if (!id && saved?.[0]) {
        await api('/rest/v1/trade_legs', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            trade_id: saved[0].id,
            user_id: session.user.id,
            leg_order: 1,
            from_asset: a.anchor,
            to_asset: asset,
            from_amount: cap,
            to_amount: qty,
            ratio_from_to: qty / cap,
            captured_at: new Date(opened).toISOString()
          })
        });
      }
      msg.textContent = id ? 'Trade atualizado no PostgreSQL.' : 'Trade gravado no PostgreSQL.';
      const profit = closed ? out - cap : 0;
      result.innerHTML = closed
        ? `<strong>Trade fechado salvo</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset} → ${fmt(out)} ${a.anchor}<br>Resultado: <strong>${fmt(profit)} ${a.anchor}</strong> (${(100 * profit / cap).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%)`
        : `<strong>Trade aberto salvo</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset}<br>Preço efetivo: <strong>${fmt(cap / qty)} ${a.anchor}/${asset}</strong>`;
      result.classList.remove('hidden');
      await renderTrades();
    } catch (err) { msg.textContent = `Erro ao gravar: ${err.message}`; }
    return false;
  }
  window.validateTradeVisualForm = submitForm;

  async function renderTrades() {
    const open = $('tradesOpenEmpty'), closed = $('tradesClosedEmpty');
    if (!open || !closed) return;
    document.querySelectorAll('.trade-row').forEach(el => el.remove());
    if (!session?.access_token) {
      open.textContent = 'Faça login para consultar seus trades.';
      closed.textContent = 'Faça login para consultar seus trades.';
      return;
    }
    try {
      const rows = await api(`/rest/v1/trades?select=*&arbitrage_id=eq.${encodeURIComponent(currentArb().id)}&order=opened_at.desc`);
      const openRows = rows.filter(t => !t.closed_at);
      const closedRows = rows.filter(t => t.closed_at);
      if (openRows.length) { open.textContent = ''; openRows.forEach(t => open.before(renderRow(t))); }
      else open.textContent = 'Nenhum trade aberto nesta arbitragem.';
      if (closedRows.length) { closed.textContent = ''; closedRows.forEach(t => closed.before(renderRow(t))); }
      else closed.textContent = 'Nenhum trade fechado nesta arbitragem.';
    } catch (e) {
      open.textContent = `Erro ao carregar trades: ${e.message}`;
      closed.textContent = '';
    }
  }

  function renderRow(t) {
    const isClosed = !!t.closed_at;
    const profit = isClosed ? Number(t.closed_anchor_amount) - Number(t.initial_anchor_amount) : 0;
    const pct = isClosed && Number(t.initial_anchor_amount) ? 100 * profit / Number(t.initial_anchor_amount) : 0;
    const row = document.createElement('div');
    row.className = 'trade-row';
    row.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--border);font-size:12px';
    row.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px"><div><strong>${t.strategy}</strong><br><span class="note">${fmt(t.initial_anchor_amount)} ${t.anchor_symbol} → ${fmt(t.current_quantity)} ${t.current_asset}${isClosed ? ` → ${fmt(t.closed_anchor_amount)} ${t.anchor_symbol}` : ''}</span></div><div style="text-align:right"><strong>${isClosed ? `${fmt(profit)} ${t.anchor_symbol}` : 'ABERTO'}</strong><br><span class="note">${isClosed ? `${pct.toLocaleString('pt-BR',{maximumFractionDigits:2})}%` : new Date(t.opened_at).toLocaleString('pt-BR')}</span></div></div><div class="actions" style="justify-content:flex-end;margin-top:6px"><button class="btn" data-edit>Editar</button><button class="btn danger" data-delete>Excluir</button>${isClosed ? '' : '<button class="btn primary" data-close>Fechar</button>'}</div>`;
    row.querySelector('[data-edit]').onclick = () => editTrade(t);
    row.querySelector('[data-delete]').onclick = () => deleteTrade(t.id);
    row.querySelector('[data-close]')?.addEventListener('click', () => closeTrade(t));
    return row;
  }

  function openRecord(t, closing = false) {
    prepareForm();
    $('tradeVisualModal').dataset.tradeId = t.id;
    $('tradeVisualArbitrage').value = t.arbitrage_id;
    $('tradeVisualStrategy').value = t.strategy;
    $('tradeVisualOpenedAt').value = localDate(t.opened_at);
    $('tradeVisualAnchorAmount').value = t.initial_anchor_amount;
    $('tradeVisualQuantity').value = t.current_quantity;
    $('tradeVisualClosedAt').value = closing ? localDate() : (t.closed_at ? localDate(t.closed_at) : '');
    $('tradeVisualExitAmount').value = t.closed_anchor_amount ?? '';
    updateForm();
    $('tradeVisualModal').classList.remove('hidden');
    $('tradeVisualModal').setAttribute('aria-hidden', 'false');
  }
  function editTrade(t) { openRecord(t, false); }
  function closeTrade(t) {
    openRecord(t, true);
    $('tradeVisualExitAmount').focus();
    $('tradeVisualMessage').textContent = 'Informe somente a quantidade recebida na âncora para fechar 100% da posição.';
  }
  async function deleteTrade(id) {
    if (!confirm('Excluir este trade?')) return;
    try { await api(`/rest/v1/trades?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }); await renderTrades(); }
    catch (e) { alert(`Erro ao excluir: ${e.message}`); }
  }

  function init() {
    authUi();
    renderTrades();
    const arb = $('arbitrageSelect');
    arb?.addEventListener('change', () => { authUi(); renderTrades(); });
    const form = $('tradeVisualForm');
    if (form) form.onsubmit = submitForm;
    $('tradeVisualArbitrage')?.addEventListener('change', updateForm);
    $('tradeVisualStrategy')?.addEventListener('change', updateForm);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
