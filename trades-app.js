(() => {
  'use strict';

  const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  const ARBS = {
    'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', anchor: 'SOL', assets: ['BONK', 'WIF'] },
  };
  const STORAGE_KEY = 'cryptoArbSupabaseSession';
  const $ = id => document.getElementById(id);

  let session = loadSession();
  let currentTrades = [];

  function apiHeaders(accessToken = null) {
    const h = { 'apikey': cfg.anonKey, 'Content-Type': 'application/json' };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  }

  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  }

  async function authRequest(path, options = {}) {
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    const res = await fetch(`${cfg.url}${path}`, { ...options, headers: { ...apiHeaders(options.accessToken), ...(options.headers || {}) } });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error(body?.msg || body?.message || body?.error_description || `Supabase HTTP ${res.status}`);
    return body;
  }

  async function dbRequest(path, options = {}) {
    if (!session?.access_token) throw new Error('Faça login para acessar os trades.');
    const headers = { ...apiHeaders(session.access_token), Prefer: 'return=representation', ...(options.headers || {}) };
    const res = await fetch(`${cfg.url}/rest/v1${path}`, { ...options, headers });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const msg = body?.message || body?.hint || body?.details || `Supabase HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  function currentArb() {
    const select = $('arbitrageSelect');
    const name = String(select?.selectedOptions?.[0]?.textContent || '').trim().replace(/\s+/g, ' ');
    if (ARBS[name]) return { ...ARBS[name], name };
    const p = name.split('/').map(x => x.trim()).filter(Boolean);
    if (p.length >= 2) return { id: String(select?.value || 'current'), name, anchor: p[0], assets: p.slice(1, 3) };
    return { ...ARBS['ADA / NIGHT / SNEK'], name: 'ADA / NIGHT / SNEK' };
  }

  function strategies(arb) {
    const [a, b] = arb.assets;
    return [
      `${arb.anchor} → ${a} → ${arb.anchor}`,
      `${arb.anchor} → ${b} → ${arb.anchor}`,
      `${a} → ${b} → ${arb.anchor}`,
      `${b} → ${a} → ${arb.anchor}`,
    ];
  }

  function initialAsset(strategy, arb) {
    const [a, b] = arb.assets;
    const st = strategies(arb);
    if (strategy === st[0]) return a;
    if (strategy === st[1]) return b;
    if (strategy === st[2]) return b;
    return a;
  }

  function fmt(n) {
    return Number.isFinite(Number(n)) ? Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 8 }) : '—';
  }

  function localDateInput(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function ensureAuthArea() {
    const card = $('tradesPanel');
    if (!card || $('tradeAuthBar')) return;
    const bar = document.createElement('div');
    bar.id = 'tradeAuthBar';
    bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin:6px 0 10px;';
    bar.innerHTML = `<span id="tradeAuthStatus" class="note"></span><div class="actions" style="margin-top:0"><button id="tradeLoginBtn" class="btn" type="button">Entrar</button><button id="tradeLogoutBtn" class="btn" type="button" style="display:none">Sair</button></div>`;
    const head = card.querySelector('.section-head');
    head?.after(bar);
    document.addEventListener('click', e => {
      if (e.target?.id === 'tradeLoginBtn') openAuthModal();
      if (e.target?.id === 'tradeLogoutBtn') { saveSession(null); renderAuth(); renderTrades(); }
    }, { once: false });
    renderAuth();
  }

  function renderAuth() {
    const status = $('tradeAuthStatus');
    const login = $('tradeLoginBtn');
    const logout = $('tradeLogoutBtn');
    if (!status) return;
    if (session?.user?.email) {
      status.textContent = `Usuário: ${session.user.email}`;
      if (login) login.style.display = 'none';
      if (logout) logout.style.display = '';
      const btn = $('newTradeBtn'); if (btn) btn.disabled = false;
    } else {
      status.textContent = 'Faça login para gravar e consultar seus trades.';
      if (login) login.style.display = '';
      if (logout) logout.style.display = 'none';
    }
  }

  function createAuthModal() {
    if ($('tradeAuthModal')) return $('tradeAuthModal');
    const modal = document.createElement('div');
    modal.id = 'tradeAuthModal';
    modal.className = 'trade-modal hidden';
    modal.innerHTML = `<div class="trade-modal-backdrop" data-auth-close="1"></div><div class="trade-dialog" role="dialog" aria-modal="true"><div class="section-head"><div><h2>Acesso aos Trades</h2><div class="note">Supabase Auth</div></div><button class="btn" type="button" data-auth-close="1">Fechar</button></div><form id="tradeAuthForm"><div class="trade-form-grid"><div class="field"><label for="tradeAuthEmail">E-mail</label><input id="tradeAuthEmail" type="email" required autocomplete="email"></div><div class="field"><label for="tradeAuthPassword">Senha</label><input id="tradeAuthPassword" type="password" required minlength="6" autocomplete="current-password"></div></div><div class="actions"><button class="btn primary" type="submit">Entrar</button><button id="tradeSignupBtn" class="btn" type="button">Criar conta</button></div><div id="tradeAuthMsg" class="note" style="margin-top:10px"></div></form></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target.closest('[data-auth-close="1"]')) closeAuthModal(); });
    $('tradeAuthForm').addEventListener('submit', async e => { e.preventDefault(); await login(); });
    $('tradeSignupBtn').addEventListener('click', async () => { await signup(); });
    return modal;
  }

  function openAuthModal() { const m = createAuthModal(); m.classList.remove('hidden'); m.setAttribute('aria-hidden','false'); }
  function closeAuthModal() { const m = $('tradeAuthModal'); if (m) { m.classList.add('hidden'); m.setAttribute('aria-hidden','true'); } }

  async function login() {
    const email = $('tradeAuthEmail').value.trim();
    const password = $('tradeAuthPassword').value;
    const msg = $('tradeAuthMsg'); msg.textContent = 'Entrando…';
    try {
      const body = await authRequest('/auth/v1/token?grant_type=password', { method:'POST', body:JSON.stringify({ email, password }) });
      saveSession({ access_token: body.access_token, refresh_token: body.refresh_token, expires_at: body.expires_at, user: body.user });
      msg.textContent = 'Login realizado.';
      closeAuthModal(); renderAuth(); await renderTrades();
    } catch (e) { msg.textContent = `Erro: ${e.message}`; }
  }

  async function signup() {
    const email = $('tradeAuthEmail').value.trim();
    const password = $('tradeAuthPassword').value;
    const msg = $('tradeAuthMsg'); msg.textContent = 'Criando conta…';
    try {
      const body = await authRequest('/auth/v1/signup', { method:'POST', body:JSON.stringify({ email, password }) });
      if (body?.access_token) {
        saveSession({ access_token: body.access_token, refresh_token: body.refresh_token, expires_at: body.expires_at, user: body.user });
        msg.textContent = 'Conta criada.'; closeAuthModal(); renderAuth(); await renderTrades();
      } else {
        msg.textContent = 'Conta criada. Verifique o e-mail, se a confirmação estiver habilitada no Supabase.';
      }
    } catch (e) { msg.textContent = `Erro: ${e.message}`; }
  }

  function populateForm() {
    const arb = currentArb();
    $('tradeVisualArbitrage').innerHTML = Object.values(ARBS).map(a => `<option value="${a.id}" ${a.name===arb.name?'selected':''}>${a.name}</option>`).join('');
    const selected = currentArb();
    const opts = strategies(selected);
    $('tradeVisualStrategy').innerHTML = opts.map(s => `<option value="${s}">${s}</option>`).join('');
    $('tradeVisualOpenedAt').value = localDateInput();
    $('tradeVisualClosedAt').value=''; $('tradeVisualAnchorAmount').value=''; $('tradeVisualQuantity').value=''; $('tradeVisualExitAmount').value='';
    $('tradeVisualMessage').textContent=''; $('tradeVisualResult').classList.add('hidden');
    updateForm();
  }

  function updateForm() {
    const arb = currentArb();
    const strategy = $('tradeVisualStrategy')?.value || strategies(arb)[0];
    const asset = initialAsset(strategy, arb);
    $('tradeVisualInitialAsset').value = asset;
    $('tradeVisualAnchorLabel').textContent = `Quantidade utilizada (${arb.anchor})`;
    $('tradeVisualQuantityLabel').textContent = `Quantidade recebida (${asset})`;
    $('tradeVisualExitAmountLabel').textContent = `Quantidade recebida na âncora (${arb.anchor})`;
    const cap=Number($('tradeVisualAnchorAmount')?.value), qty=Number($('tradeVisualQuantity')?.value), out=Number($('tradeVisualExitAmount')?.value);
    $('tradeVisualEntryDerived').innerHTML = `Preço efetivo de entrada: <strong>${cap>0&&qty>0?fmt(cap/qty)+' '+arb.anchor+'/'+asset:'—'}</strong>`;
    $('tradeVisualExitDerived').innerHTML = `Preço efetivo de saída: <strong>${out>0&&qty>0?fmt(out/qty)+' '+arb.anchor+'/'+asset:'—'}</strong>`;
  }

  window.updateTradeVisualForm = updateForm;
  window.openTradeVisualForm = () => {
    if (!session?.access_token) { openAuthModal(); return; }
    populateForm();
    const m=$('tradeVisualModal'); m.classList.remove('hidden'); m.setAttribute('aria-hidden','false');
  };
  window.closeTradeVisualForm = () => { const m=$('tradeVisualModal'); if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');} };

  async function saveTrade(e) {
    e.preventDefault();
    const arb=currentArb(); const strategy=$('tradeVisualStrategy').value || strategies(arb)[0]; const asset=initialAsset(strategy,arb);
    const opened=$('tradeVisualOpenedAt').value; const closed=$('tradeVisualClosedAt').value;
    const cap=Number($('tradeVisualAnchorAmount').value); const qty=Number($('tradeVisualQuantity').value); const out=Number($('tradeVisualExitAmount').value);
    const msg=$('tradeVisualMessage'); const result=$('tradeVisualResult');
    if (!(cap>0) || !(qty>0)) { msg.textContent=`Preencha a quantidade utilizada em ${arb.anchor} e a quantidade recebida em ${asset}.`; return false; }
    if (closed || out>0) {
      if (!closed || !(out>0)) { msg.textContent='Para fechar, informe a data/hora de saída e a quantidade recebida na âncora.'; return false; }
      if (new Date(closed) < new Date(opened)) { msg.textContent='A saída não pode ser anterior à entrada.'; return false; }
    }
    if (!session?.access_token) { openAuthModal(); return false; }
    const payload={
      user_id: session.user.id,
      arbitrage_id: arb.id,
      arbitrage_name: arb.name,
      anchor_symbol: arb.anchor,
      strategy,
      opened_at: new Date(opened).toISOString(),
      initial_anchor_amount: cap,
      current_asset: asset,
      current_quantity: qty,
      entry_ratio_anchor_per_asset: cap/qty,
      entry_anchor_amount: cap,
      closed_at: closed ? new Date(closed).toISOString() : null,
      closed_anchor_amount: closed ? out : null,
    };
    msg.textContent='Gravando no PostgreSQL…';
    try {
      const saved=await dbRequest('/trades',{method:'POST',body:JSON.stringify(payload)});
      const trade=saved?.[0];
      if (trade) {
        await dbRequest('/trade_legs',{method:'POST',body:JSON.stringify({trade_id:trade.id,user_id:session.user.id,leg_order:1,from_asset:arb.anchor,to_asset:asset,from_amount:cap,to_amount:qty,ratio_from_to:qty/cap,captured_at:new Date(opened).toISOString()})});
        if (closed) await dbRequest('/trade_legs',{method:'POST',body:JSON.stringify({trade_id:trade.id,user_id:session.user.id,leg_order:2,from_asset:asset,to_asset:arb.anchor,from_amount:qty,to_amount:out,ratio_from_to:out/qty,captured_at:new Date(closed).toISOString()}),});
      }
      msg.textContent='Trade gravado no PostgreSQL.';
      const profit=closed ? out-cap : null;
      result.innerHTML = closed ? `<strong>Trade fechado salvo</strong><br>${fmt(cap)} ${arb.anchor} → ${fmt(qty)} ${asset} → ${fmt(out)} ${arb.anchor}<br>Resultado: <strong>${fmt(profit)} ${arb.anchor}</strong> (${(profit/cap*100).toLocaleString('pt-BR',{maximumFractionDigits:4)}%)` : `<strong>Trade aberto salvo</strong><br>${fmt(cap)} ${arb.anchor} → ${fmt(qty)} ${asset}<br>Preço efetivo de entrada: <strong>${fmt(cap/qty)} ${arb.anchor}/${asset}</strong>`;
      result.classList.remove('hidden'); await renderTrades();
    } catch (e) { msg.textContent=`Erro ao gravar: ${e.message}`; }
    return false;
  }

  async function renderTrades() {
    const open=$('tradesOpenEmpty'), closed=$('tradesClosedEmpty');
    if (!open || !closed) return;
    if (!session?.access_token) { open.textContent='Faça login para consultar seus trades.'; closed.textContent='Faça login para consultar seus trades.'; return; }
    const arb=currentArb();
    try {
      currentTrades=await dbRequest(`/trades?select=*&arbitrage_id=eq.${encodeURIComponent(arb.id)}&order=opened_at.desc`);
      const opened=currentTrades.filter(t=>!t.closed_at); const done=currentTrades.filter(t=>t.closed_at);
      open.parentElement?.querySelectorAll('.trade-row').forEach(x=>x.remove());
      closed.parentElement?.querySelectorAll('.trade-row').forEach(x=>x.remove());
      if (!opened.length) open.textContent='Nenhum trade aberto nesta arbitragem.'; else { open.textContent=''; opened.forEach(t=>open.insertAdjacentElement('beforebegin',tradeRow(t,false))); }
      if (!done.length) closed.textContent='Nenhum trade fechado nesta arbitragem.'; else { closed.textContent=''; done.forEach(t=>closed.insertAdjacentElement('beforebegin',tradeRow(t,true))); }
      bindTradeRows();
    } catch (e) { open.textContent=`Erro ao carregar trades: ${e.message}`; closed.textContent=''; }
  }

  function tradeRow(t,isClosed){
    const div=document.createElement('div'); div.className='trade-row';
    const profit=isClosed ? Number(t.closed_anchor_amount)-Number(t.initial_anchor_amount) : null;
    const pct=isClosed ? profit/Number(t.initial_anchor_amount)*100 : null;
    div.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;';
    div.innerHTML=`<div><strong>${t.strategy}</strong><br><span class="note">${fmt(t.initial_anchor_amount)} ${t.anchor_symbol} → ${fmt(t.current_quantity)} ${t.current_asset}${isClosed?` → ${fmt(t.closed_anchor_amount)} ${t.anchor_symbol}`:''}</span></div><div style="text-align:right"><strong>${isClosed?`${fmt(profit)} ${t.anchor_symbol}`:'ABERTO'}</strong><br><span class="note">${isClosed?`${pct.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`:`Entrada ${new Date(t.opened_at).toLocaleString('pt-BR')}`}</span><div class="actions" style="justify-content:flex-end;margin-top:5px"><button class="btn" data-edit-trade="${t.id}">Editar</button><button class="btn danger" data-delete-trade="${t.id}">Excluir</button>${!isClosed?`<button class="btn primary" data-close-trade="${t.id}">Fechar</button>`:''}</div></div>`;
    return div;
  }

  function bindTradeRows(){
    document.querySelectorAll('[data-delete-trade]').forEach(btn=>btn.onclick=()=>deleteTrade(btn.dataset.deleteTrade));
    document.querySelectorAll('[data-close-trade]').forEach(btn=>btn.onclick=()=>closeExistingTrade(btn.dataset.closeTrade));
    document.querySelectorAll('[data-edit-trade]').forEach(btn=>btn.onclick=()=>editTrade(btn.dataset.editTrade));
  }

  function findTrade(id){return currentTrades.find(t=>t.id===id)}

  async function deleteTrade(id){
    if(!confirm('Excluir este trade?')) return;
    try{await dbRequest(`/trades?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});await renderTrades();}catch(e){alert(`Erro ao excluir: ${e.message}`)}
  }

  async function closeExistingTrade(id){
    const t=findTrade(id); if(!t)return;
    populateForm();
    $('tradeVisualArbitrage').value=t.arbitrage_id;
    const arb=currentArb(); $('tradeVisualStrategy').value=t.strategy;
    $('tradeVisualOpenedAt').value=localDateInput(new Date(t.opened_at));
    $('tradeVisualAnchorAmount').value=t.initial_anchor_amount; $('tradeVisualQuantity').value=t.current_quantity;
    $('tradeVisualClosedAt').value=localDateInput();
    $('tradeVisualExitAmount').value=''; updateForm();
    $('tradeVisualMessage').textContent='Informe apenas a quantidade recebida na âncora para fechar 100% da posição.';
    const m=$('tradeVisualModal');m.classList.remove('hidden');m.setAttribute('aria-hidden','false');
    $('tradeVisualModal').dataset.editId=id;
  }

  async function editTrade(id){
    const t=findTrade(id);if(!t)return;
    populateForm();$('tradeVisualArbitrage').value=t.arbitrage_id;$('tradeVisualStrategy').value=t.strategy;
    $('tradeVisualOpenedAt').value=localDateInput(new Date(t.opened_at));$('tradeVisualAnchorAmount').value=t.initial_anchor_amount;$('tradeVisualQuantity').value=t.current_quantity;
    if(t.closed_at){$('tradeVisualClosedAt').value=localDateInput(new Date(t.closed_at));$('tradeVisualExitAmount').value=t.closed_anchor_amount;}
    updateForm();$('tradeVisualModal').dataset.editId=id; $('tradeVisualModal').dataset.editMode='1';
    const m=$('tradeVisualModal');m.classList.remove('hidden');m.setAttribute('aria-hidden','false');
  }

  async function upsertTrade(){
    const id=$('tradeVisualModal').dataset.editId; if(!id) return saveTrade({preventDefault(){}});
    const t=findTrade(id); if(!t) return saveTrade({preventDefault(){}});
    const arb=currentArb(), strategy=$('tradeVisualStrategy').value, asset=initialAsset(strategy,arb), opened=$('tradeVisualOpenedAt').value, closed=$('tradeVisualClosedAt').value;
    const cap=Number($('tradeVisualAnchorAmount').value), qty=Number($('tradeVisualQuantity').value), out=Number($('tradeVisualExitAmount').value);
    const msg=$('tradeVisualMessage');
    if(!(cap>0)||!(qty>0)){msg.textContent='Preencha os valores de entrada.';return;}
    const payload={arbitrage_id:arb.id,arbitrage_name:arb.name,anchor_symbol:arb.anchor,strategy,opened_at:new Date(opened).toISOString(),initial_anchor_amount:cap,current_asset:asset,current_quantity:qty,entry_ratio_anchor_per_asset:cap/qty,entry_anchor_amount:cap,closed_at:closed?new Date(closed).toISOString():null,closed_anchor_amount:closed?out:null};
    try{await dbRequest(`/trades?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)});msg.textContent='Trade atualizado no PostgreSQL.';await renderTrades();}catch(e){msg.textContent=`Erro ao atualizar: ${e.message}`}
  }

  window.validateTradeVisualForm = async e => {
    e.preventDefault();
    if ($('tradeVisualModal').dataset.editId) { await upsertTrade(); return false; }
    await saveTrade(e); return false;
  };

  function init(){
    if(!$('tradesPanel')) return;
    ensureAuthArea(); createAuthModal(); renderAuth();
    renderTrades();
    document.addEventListener('change', e=>{if(e.target?.id==='arbitrageSelect'){renderTrades();}});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
