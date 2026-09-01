(() => {
  'use strict';

  const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  const ARBS = {
    'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', name: 'ADA / NIGHT / SNEK', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', name: 'SOL / BONK / WIF', anchor: 'SOL', assets: ['BONK', 'WIF'] }
  };
  const LIVE_CG_BASE = 'https://api.coingecko.com/api/v3/simple/price';
  const CG_IDS = { ADA: 'cardano', NIGHT: 'midnight-3', SNEK: 'snek', SOL: 'solana', BONK: 'bonk', WIF: 'dogwifcoin' };
  const SESSION_KEY = 'cryptoArbSupabaseSession';
  let session = loadSession();
  let simulationState = null;
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
    if (ARBS[name]) return { ...ARBS[name] };
    const p = name.split('/').map(x => x.trim()).filter(Boolean);
    return p.length >= 2 ? { id: String(select?.value || 'current'), name, anchor: p[0], assets: p.slice(1, 3) } : { ...ARBS['ADA / NIGHT / SNEK'] };
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
  function fmt(value, maxFractionDigits = 8) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: maxFractionDigits }) : '—';
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
    const headers = { apikey: cfg.anonKey, Authorization: `Bearer ${token || cfg.anonKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(`${cfg.url}${path}`, { ...options, headers });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error(body?.msg || body?.message || body?.hint || body?.details || `HTTP ${res.status}`);
    return body;
  }

  function injectSimulationStyles() {
    if ($('tradeSimulationStyles')) return;
    const style = document.createElement('style');
    style.id = 'tradeSimulationStyles';
    style.textContent = `
      .trade-sim-btn{background:#18243e;color:var(--text);border:1px solid var(--border);padding:7px 9px;border-radius:10px;cursor:pointer;font-size:11px}
      .trade-sim-btn.primary{background:var(--accent);color:#09101f;border-color:var(--accent)}
      .trade-sim-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}
      .trade-sim-modal.hidden{display:none}
      .trade-sim-backdrop{position:absolute;inset:0;background:rgba(3,7,18,.72)}
      .trade-sim-dialog{position:relative;width:min(720px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px;box-shadow:0 20px 70px rgba(0,0,0,.45)}
      .trade-sim-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .trade-sim-card{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:12px}
      .trade-sim-card .k{font-size:11px;color:var(--muted)}
      .trade-sim-card .v{font-size:18px;font-weight:700;margin-top:4px}
      .trade-sim-result{margin-top:14px;border:1px solid var(--border);border-radius:14px;padding:14px;background:rgba(122,162,255,.06)}
      .trade-sim-profit{font-size:28px;font-weight:800;margin-top:4px}
      .trade-sim-meta{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.45}
      .trade-sim-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}
      @media(max-width:600px){.trade-sim-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
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
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const b = await api('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: $('authEmail').value.trim(), password: $('authPassword').value, options: { emailRedirectTo: redirectTo } }) }, false);
      if (b?.access_token) {
        saveSession({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at, user: b.user });
        $('tradeAuthModal').classList.add('hidden'); authUi(); await renderTrades();
      } else msg.textContent = 'Conta criada. Se a confirmação por e-mail estiver habilitada, confirme o e-mail e depois entre.';
    } catch (e) { msg.textContent = `Erro: ${e.message}`; }
  }

  function populateArbitrageSelect(select, selectedId) {
    if (!select) return;
    select.innerHTML = Object.values(ARBS).map(x => `<option value="${x.id}" ${x.id === selectedId ? 'selected' : ''}>${x.name}</option>`).join('');
  }
  function prepareForm() {
    const a = currentArb();
    populateArbitrageSelect($('tradeVisualArbitrage'), a.id);
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
    const payload = { user_id: session.user.id, arbitrage_id: a.id, arbitrage_name: a.name, anchor_symbol: a.anchor, strategy: s, opened_at: new Date(opened).toISOString(), initial_anchor_amount: cap, current_asset: asset, current_quantity: qty, entry_ratio_anchor_per_asset: cap / qty, entry_anchor_amount: cap, closed_at: closed ? new Date(closed).toISOString() : null, closed_anchor_amount: closed ? out : null };
    msg.textContent = id ? 'Atualizando no PostgreSQL…' : 'Gravando no PostgreSQL…';
    try {
      const saved = await api(id ? `/rest/v1/trades?id=eq.${encodeURIComponent(id)}` : '/rest/v1/trades', { method: id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
      if (!id && saved?.[0]) {
        await api('/rest/v1/trade_legs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ trade_id: saved[0].id, user_id: session.user.id, leg_order: 1, from_asset: a.anchor, to_asset: asset, from_amount: cap, to_amount: qty, ratio_from_to: qty / cap, captured_at: new Date(opened).toISOString() }) });
      }
      msg.textContent = id ? 'Trade atualizado no PostgreSQL.' : 'Trade gravado no PostgreSQL.';
      const profit = closed ? out - cap : 0;
      result.innerHTML = closed ? `<strong>Trade fechado salvo</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset} → ${fmt(out)} ${a.anchor}<br>Resultado: ${fmt(profit)} ${a.anchor} (${fmt(cap > 0 ? (profit / cap) * 100 : NaN, 4)}%)` : `<strong>Trade aberto salvo</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset}<br>Preço efetivo: ${fmt(cap / qty)} ${a.anchor}/${asset}`;
      result.classList.remove('hidden');
      await renderTrades();
    } catch (e) {
      msg.textContent = `Erro ao salvar: ${e.message}`;
    }
    return false;
  }

  function ensureSimulationModal() {
    if ($('tradeSimModal')) return;
    const modal = document.createElement('div');
    modal.id = 'tradeSimModal';
    modal.className = 'trade-sim-modal hidden';
    modal.innerHTML = '<div class="trade-sim-backdrop"></div><div class="trade-sim-dialog"><div class="section-head"><div><h2>Simular fechamento</h2><div id="tradeSimSubtitle" class="note"></div></div><button id="tradeSimCloseTop" class="btn" type="button">Fechar</button></div><div id="tradeSimBody"></div><div class="trade-sim-actions"><button id="tradeSimRefresh" class="btn primary" type="button">⚡ Cotação agora</button><button id="tradeSimClose" class="btn" type="button">Fechar</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.trade-sim-backdrop').onclick = closeSimulationModal;
    $('tradeSimCloseTop').onclick = closeSimulationModal;
    $('tradeSimClose').onclick = closeSimulationModal;
    $('tradeSimRefresh').onclick = refreshSimulationQuote;
  }
  function openSimulationModal() { ensureSimulationModal(); $('tradeSimModal').classList.remove('hidden'); }
  function closeSimulationModal() { $('tradeSimModal')?.classList.add('hidden'); }
  function assetId(symbol) {
    const s = String(symbol || '').toUpperCase();
    const id = CG_IDS[s];
    return id || null;
  }
  async function fetchLivePrices(symbols) {
    const normalized = [...new Set(symbols.map(s => String(s || '').toUpperCase()))];
    const ids = normalized.map(assetId);
    if (ids.some(id => !id)) {
      const symbol = normalized.find((s, i) => !ids[i]);
      throw new Error(`Não há CoinGecko ID configurado para ${symbol || 'um dos ativos'}.`);
    }
    const url = `${LIVE_CG_BASE}?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd`;
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      if (res.status === 429) throw new Error('Limite temporário da consulta de cotação. Tente novamente em alguns segundos.');
      throw new Error(`HTTP ${res.status}`);
    }
    const payload = await res.json();
    const out = {};
    normalized.forEach((symbol, i) => {
      const row = payload?.[ids[i]];
      const price = Number(row?.usd);
      if (Number.isFinite(price) && price > 0) out[symbol] = price;
    });
    const missing = normalized.filter(s => !Number.isFinite(out[s]));
    if (missing.length) throw new Error(`Cotação não disponível para ${missing.join(', ')} agora.`);
    return out;
  }
  function renderSimulationLoading(t) {
    const anchor = String(t.anchor_symbol || '').toUpperCase();
    const asset = String(t.current_asset || '').toUpperCase();
    $('tradeSimSubtitle').textContent = `${t.strategy} · posição aberta`;
    $('tradeSimBody').innerHTML = `<div class="trade-sim-meta">Consultando a cotação atual de ${asset} e ${anchor}…</div>`;
  }
  function renderSimulationError(message) {
    $('tradeSimBody').innerHTML = `<div class="trade-sim-result"><strong>Não foi possível simular agora.</strong><div class="trade-sim-meta">${message}</div></div>`;
  }
  function renderSimulation(t, prices) {
    const anchor = String(t.anchor_symbol || '').toUpperCase();
    const asset = String(t.current_asset || '').toUpperCase();
    const initial = Number(t.initial_anchor_amount);
    const qty = Number(t.current_quantity);
    const assetPrice = Number(prices[asset]);
    const anchorPrice = Number(prices[anchor]);
    const simulatedClose = qty * assetPrice / anchorPrice;
    const profit = simulatedClose - initial;
    const pct = initial > 0 ? (profit / initial) * 100 : NaN;
    const entry = Number(t.entry_ratio_anchor_per_asset);
    const currentRatio = assetPrice > 0 && anchorPrice > 0 ? assetPrice / anchorPrice : NaN;
    const captured = new Date().toLocaleString('pt-BR');
    const resultClass = profit >= 0 ? 'good' : 'bad';
    $('tradeSimSubtitle').textContent = `${t.strategy} · cotação capturada em ${captured}`;
    $('tradeSimBody').innerHTML = `<div class="trade-sim-grid"><div class="trade-sim-card"><div class="k">Posição atual</div><div class="v">${fmt(qty)} ${asset}</div></div><div class="trade-sim-card"><div class="k">Capital inicial</div><div class="v">${fmt(initial)} ${anchor}</div></div><div class="trade-sim-card"><div class="k">${asset} agora</div><div class="v">${fmt(assetPrice, 10)} USD</div></div><div class="trade-sim-card"><div class="k">${anchor} agora</div><div class="v">${fmt(anchorPrice, 10)} USD</div></div><div class="trade-sim-card"><div class="k">Entrada registrada</div><div class="v">${fmt(entry, 10)} ${anchor}/${asset}</div></div><div class="trade-sim-card"><div class="k">Relação atual</div><div class="v">${fmt(currentRatio, 10)} ${anchor}/${asset}</div></div></div><div class="trade-sim-result"><div class="k">Fechamento simulado</div><div class="trade-sim-profit ${resultClass}">${fmt(simulatedClose)} ${anchor}</div><div class="trade-sim-meta">Resultado potencial: <strong>${fmt(profit)} ${anchor}</strong> · <strong>${Number.isFinite(pct) ? pct.toLocaleString('pt-BR',{maximumFractionDigits:4}) : '—'}%</strong></div><div class="trade-sim-meta">Cálculo: ${fmt(qty)} ${asset} × ${fmt(assetPrice, 10)} USD ÷ ${fmt(anchorPrice, 10)} USD = ${fmt(simulatedClose)} ${anchor}.</div><div class="trade-sim-meta">Simulação não grava o trade e não considera taxas, slippage, spread ou impacto de mercado.</div></div>`;
  }
  async function refreshSimulationQuote() {
    const t = simulationState?.trade;
    if (!t) return;
    $('tradeSimRefresh').disabled = true;
    $('tradeSimRefresh').textContent = 'Consultando…';
    renderSimulationLoading(t);
    try {
      const prices = await fetchLivePrices([t.current_asset, t.anchor_symbol]);
      simulationState = { trade: t, prices, capturedAt: new Date().toISOString() };
      renderSimulation(t, prices);
    } catch (e) {
      renderSimulationError(e.message || 'Erro desconhecido.');
    } finally {
      $('tradeSimRefresh').disabled = false;
      $('tradeSimRefresh').textContent = '⚡ Cotação agora';
    }
  }
  async function simulateCloseTrade(t) {
    if (t.closed_at) return;
    simulationState = { trade: t, prices: null };
    openSimulationModal();
    renderSimulationLoading(t);
    await refreshSimulationQuote();
  }

  async function renderTrades() {
    const open = $('tradesOpenEmpty'), closed = $('tradesClosedEmpty');
    if (!open || !closed) return;
    document.querySelectorAll('.trade-row').forEach(el => el.remove());
    if (!session?.access_token) { open.textContent = 'Faça login para consultar seus trades.'; closed.textContent = 'Faça login para consultar seus trades.'; return; }
    try {
      const rows = await api(`/rest/v1/trades?select=*&arbitrage_id=eq.${encodeURIComponent(currentArb().id)}&order=opened_at.desc`);
      const openRows = rows.filter(t => !t.closed_at);
      const closedRows = rows.filter(t => t.closed_at);
      open.textContent = openRows.length ? '' : 'Nenhum trade aberto nesta arbitragem.';
      closed.textContent = closedRows.length ? '' : 'Nenhum trade fechado nesta arbitragem.';
      openRows.forEach(t => open.before(tradeRow(t, false)));
      closedRows.forEach(t => closed.before(tradeRow(t, true)));
    } catch (e) {
      const message = e?.message || 'Erro ao carregar trades.';
      open.textContent = message;
      closed.textContent = '';
    }
  }
  window.refreshTrades = renderTrades;

  function tradeRow(t, closed) {
    const a = ARBS[t.arbitrage_name] || currentArb();
    const row = document.createElement('div');
    row.className = 'trade-row';
    const cap = Number(t.initial_anchor_amount);
    const qty = Number(t.current_quantity);
    const out = Number(t.closed_anchor_amount);
    const asset = String(t.current_asset || '').toUpperCase();
    const anchor = String(t.anchor_symbol || a.anchor).toUpperCase();
    const profit = closed ? out - cap : null;
    const pct = closed && cap > 0 ? (profit / cap) * 100 : null;
    row.innerHTML = `<div><strong>${t.strategy}</strong><div class="note">${fmt(cap)} ${anchor} → ${fmt(qty)} ${asset}${closed ? ` → ${fmt(out)} ${anchor}` : ''}</div></div><div class="trade-row-side"><strong>${closed ? `${fmt(profit)} ${anchor}` : 'ABERTO'}</strong>${closed ? `<span class="note">${pct.toLocaleString('pt-BR',{maximumFractionDigits:4})}%</span>` : `<span class="note">${new Date(t.opened_at).toLocaleString('pt-BR')}</span>`}<div class="actions" style="margin-top:4px"><button class="btn" data-action="edit" type="button">Editar</button><button class="btn danger" data-action="delete" type="button">Excluir</button>${closed ? '' : '<button class="btn primary" data-action="simulate" type="button">Simular fechamento</button><button class="btn primary" data-action="close" type="button">Fechar</button>'}</div></div>`;
    row.querySelector('[data-action="edit"]').onclick = () => editTrade(t);
    row.querySelector('[data-action="delete"]').onclick = () => deleteTrade(t);
    row.querySelector('[data-action="simulate"]')?.addEventListener('click', () => simulateCloseTrade(t));
    row.querySelector('[data-action="close"]')?.addEventListener('click', () => editTrade(t, true));
    return row;
  }

  function showForm(t, closeMode = false) {
    if (!t) { window.openTradeVisualForm(); return; }
    const modal = $('tradeVisualModal');
    populateArbitrageSelect($('tradeVisualArbitrage'), t.arbitrage_id);
    $('tradeVisualStrategy').innerHTML = strategies(ARBS[t.arbitrage_name] || currentArb()).map(x => `<option value="${x}" ${x === t.strategy ? 'selected' : ''}>${x}</option>`).join('');
    $('tradeVisualOpenedAt').value = localDate(new Date(t.opened_at));
    $('tradeVisualAnchorAmount').value = t.initial_anchor_amount ?? '';
    $('tradeVisualQuantity').value = t.current_quantity ?? '';
    $('tradeVisualClosedAt').value = closeMode ? localDate() : (t.closed_at ? localDate(new Date(t.closed_at)) : '');
    $('tradeVisualExitAmount').value = closeMode ? '' : (t.closed_anchor_amount ?? '');
    $('tradeVisualMessage').textContent = closeMode ? 'Informe somente a quantidade recebida na âncora para fechar 100% da posição.' : '';
    modal.dataset.tradeId = t.id;
    updateForm();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function editTrade(t, closeMode = false) {
    showForm(t, closeMode);
  }

  async function deleteTrade(t) {
    if (!session?.access_token) return showAuth();
    if (!confirm(`Excluir o trade ${t.strategy}?`)) return;
    try {
      await api(`/rest/v1/trades?id=eq.${encodeURIComponent(t.id)}`, { method: 'DELETE' });
      await renderTrades();
    } catch (e) { alert(`Erro ao excluir: ${e.message}`); }
  }

  function init() {
    authUi();
    $('tradeNewBtn')?.addEventListener('click', window.openTradeVisualForm);
    document.addEventListener('input', e => {
      if (e.target?.closest('#tradeVisualModal')) updateForm();
    });
    document.addEventListener('change', e => {
      if (e.target?.id === 'tradeVisualStrategy' || e.target?.id === 'tradeVisualArbitrage') updateForm();
    });
    document.getElementById('tradeVisualForm')?.addEventListener('submit', submitForm);
    if (session?.access_token) renderTrades();
  }
  window.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();