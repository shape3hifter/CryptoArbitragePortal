(() => {
  'use strict';

  const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  const ARBS = {
    'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', anchor: 'SOL', assets: ['BONK', 'WIF'] },
  };
  const STORAGE_KEY = 'cryptoArbSupabaseSession';
  let session = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } })();
  let currentTrades = [];
  const $ = id => document.getElementById(id);

  const headers = token => ({
    apikey: cfg.anonKey,
    Authorization: `Bearer ${token || cfg.anonKey}`,
    'Content-Type': 'application/json',
  });

  async function request(path, options = {}, auth = true) {
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    const token = auth ? session?.access_token : null;
    if (auth && !token) throw new Error('Faça login para acessar os trades.');
    const res = await fetch(`${cfg.url}${path}`, { ...options, headers: { ...headers(token), ...(options.headers || {}) } });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error(body?.msg || body?.message || body?.hint || body?.details || `HTTP ${res.status}`);
    return body;
  }

  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  }

  function currentArb() {
    const s = $('arbitrageSelect');
    const name = String(s?.selectedOptions?.[0]?.textContent || '').trim().replace(/\s+/g, ' ');
    if (ARBS[name]) return { ...ARBS[name], name };
    const p = name.split('/').map(x => x.trim()).filter(Boolean);
    return p.length >= 2 ? { id: String(s?.value || 'current'), name, anchor: p[0], assets: p.slice(1, 3) } : { ...ARBS['ADA / NIGHT / SNEK'], name: 'ADA / NIGHT / SNEK' };
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
    const [a, b] = arb.assets, st = strategies(arb);
    return strategy === st[0] ? a : strategy === st[1] ? b : strategy === st[2] ? b : a;
  }

  function fmt(n) {
    return Number.isFinite(Number(n)) ? Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 8 }) : '—';
  }

  function localDateInput(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function renderAuthBar() {
    const card = $('tradesPanel');
    if (!card || $('tradeAuthBar')) return;
    const bar = document.createElement('div');
    bar.id = 'tradeAuthBar';
    bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin:6px 0 10px;';
    bar.innerHTML = `<span id="tradeAuthStatus" class="note"></span><div class="actions" style="margin-top:0"><button id="tradeLoginBtn" class="btn" type="button">Entrar</button><button id="tradeLogoutBtn" class="btn" type="button" style="display:none">Sair</button></div>`;
    card.querySelector('.section-head')?.after(bar);
    $('tradeLoginBtn').onclick = openAuthModal;
    $('tradeLogoutBtn').onclick = () => { saveSession(null); renderAuthState(); renderTrades(); };
    renderAuthState();
  }

  function renderAuthState() {
    const status=$('tradeAuthStatus'), login=$('tradeLoginBtn'), logout=$('tradeLogoutBtn');
    if (!status) return;
    if (session?.user?.email) {
      status.textContent = `Usuário: ${session.user.email}`;
      login.style.display='none'; logout.style.display='';
    } else {
      status.textContent='Faça login para gravar e consultar seus trades.';
      login.style.display=''; logout.style.display='none';
    }
  }

  function openAuthModal() {
    let m=$('tradeAuthModal');
    if (!m) {
      m=document.createElement('div'); m.id='tradeAuthModal'; m.className='trade-modal hidden';
      m.innerHTML=`<div class="trade-modal-backdrop"></div><div class="trade-dialog" role="dialog" aria-modal="true"><div class="section-head"><div><h2>Acesso aos Trades</h2><div class="note">Supabase Auth</div></div><button class="btn" id="tradeAuthClose" type="button">Fechar</button></div><form id="tradeAuthForm"><div class="trade-form-grid"><div class="field"><label>E-mail</label><input id="tradeAuthEmail" type="email" autocomplete="email" required></div><div class="field"><label>Senha</label><input id="tradeAuthPassword" type="password" minlength="6" autocomplete="current-password" required></div></div><div class="actions"><button class="btn primary" type="submit">Entrar</button><button class="btn" id="tradeSignupBtn" type="button">Criar conta</button></div><div id="tradeAuthMsg" class="note" style="margin-top:10px"></div></form></div>`;
      document.body.appendChild(m);
      $('tradeAuthClose').onclick=()=>m.classList.add('hidden');
      m.querySelector('.trade-modal-backdrop').onclick=()=>m.classList.add('hidden');
      $('tradeAuthForm').onsubmit=async e=>{e.preventDefault();await login();};
      $('tradeSignupBtn').onclick=signup;
    }
    m.classList.remove('hidden'); m.setAttribute('aria-hidden','false');
  }

  async function login() {
    const msg=$('tradeAuthMsg'); msg.textContent='Entrando…';
    try {
      const b=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('tradeAuthEmail').value.trim(),password:$('tradeAuthPassword').value})},false);
      saveSession({access_token:b.access_token,refresh_token:b.refresh_token,expires_at:b.expires_at,user:b.user});
      $('tradeAuthModal').classList.add('hidden'); renderAuthState(); await renderTrades();
    } catch(e){msg.textContent=`Erro: ${e.message}`;}
  }

  async function signup() {
    const msg=$('tradeAuthMsg'); msg.textContent='Criando conta…';
    try {
      const b=await request('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:$('tradeAuthEmail').value.trim(),password:$('tradeAuthPassword').value})},false);
      if (b?.access_token) { saveSession({access_token:b.access_token,refresh_token:b.refresh_token,expires_at:b.expires_at,user:b.user}); $('tradeAuthModal').classList.add('hidden'); renderAuthState(); await renderTrades(); }
      else msg.textContent='Conta criada. Verifique seu e-mail caso a confirmação esteja habilitada no Supabase.';
    } catch(e){msg.textContent=`Erro: ${e.message}`;}
  }

  function fillFormFromCurrent() {
    const arb=currentArb();
    $('tradeVisualArbitrage').innerHTML=Object.values(ARBS).map(a=>`<option value="${a.id}" ${a.id===arb.id?'selected':''}>${a.name}</option>`).join('');
    const st=strategies(arb);
    $('tradeVisualStrategy').innerHTML=st.map(s=>`<option value="${s}">${s}</option>`).join('');
    $('tradeVisualOpenedAt').value=localDateInput(); $('tradeVisualClosedAt').value=''; $('tradeVisualAnchorAmount').value=''; $('tradeVisualQuantity').value=''; $('tradeVisualExitAmount').value='';
    $('tradeVisualMessage').textContent=''; $('tradeVisualResult').classList.add('hidden'); updateFormFields();
  }

  function updateFormFields() {
    const arb=currentArb(), s=$('tradeVisualStrategy')?.value || strategies(arb)[0], asset=initialAsset(s,arb);
    $('tradeVisualInitialAsset').value=asset;
    $('tradeVisualAnchorLabel').textContent=`Quantidade utilizada (${arb.anchor})`;
    $('tradeVisualQuantityLabel').textContent=`Quantidade recebida (${asset})`;
    $('tradeVisualExitAmountLabel').textContent=`Quantidade recebida na âncora (${arb.anchor})`;
    const cap=Number($('tradeVisualAnchorAmount')?.value), qty=Number($('tradeVisualQuantity')?.value), out=Number($('tradeVisualExitAmount')?.value);
    $('tradeVisualEntryDerived').innerHTML=`Preço efetivo de entrada: <strong>${cap>0&&qty>0?fmt(cap/qty)+' '+arb.anchor+'/'+asset:'—'}</strong>`;
    $('tradeVisualExitDerived').innerHTML=`Preço efetivo de saída: <strong>${out>0&&qty>0?fmt(out/qty)+' '+arb.anchor+'/'+asset:'—'}</strong>`;
  }

  async function persistTrade(e) {
    e.preventDefault();
    if(!session?.access_token){openAuthModal();return false;}
    const arb=currentArb(), strategy=$('tradeVisualStrategy').value, asset=initialAsset(strategy,arb), opened=$('tradeVisualOpenedAt').value, closed=$('tradeVisualClosedAt').value;
    const cap=Number($('tradeVisualAnchorAmount').value), qty=Number($('tradeVisualQuantity').value), out=Number($('tradeVisualExitAmount').value);
    const msg=$('tradeVisualMessage'), result=$('tradeVisualResult');
    if(!(cap>0)||!(qty>0)){msg.textContent=`Preencha a quantidade utilizada em ${arb.anchor} e a quantidade recebida em ${asset}.`;return false;}
    if((closed||out>0)&&(!closed||!(out>0))){msg.textContent='Para fechar, informe a data/hora de saída e a quantidade recebida na âncora.';return false;}
    if(closed&&new Date(closed)<new Date(opened)){msg.textContent='A saída não pode ser anterior à entrada.';return false;}
    const editId=$('tradeVisualModal').dataset.editId || null;
    const payload={user_id:session.user.id,arbitrage_id:arb.id,arbitrage_name:arb.name,anchor_symbol:arb.anchor,strategy,opened_at:new Date(opened).toISOString(),initial_anchor_amount:cap,current_asset:asset,current_quantity:qty,entry_ratio_anchor_per_asset:cap/qty,entry_anchor_amount:cap,closed_at:closed?new Date(closed).toISOString():null,closed_anchor_amount:closed?out:null};
    msg.textContent=editId?'Atualizando no PostgreSQL…':'Gravando no PostgreSQL…';
    try{
      let saved;
      if(editId) saved=await request(`/rest/v1/trades?id=eq.${encodeURIComponent(editId)}`,{method:'PATCH',body:JSON.stringify(payload)});
      else saved=await request('/rest/v1/trades',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
      const trade=editId?findTrade(editId):saved?.[0];
      if(trade && !editId){await request('/rest/v1/trade_legs',{method:'POST',body:JSON.stringify({trade_id:trade.id,user_id:session.user.id,leg_order:1,from_asset:arb.anchor,to_asset:asset,from_amount:cap,to_amount:qty,ratio_from_to:qty/cap,captured_at:new Date(opened).toISOString()})});}
      msg.textContent=editId?'Trade atualizado no PostgreSQL.':'Trade gravado no PostgreSQL.';
      result.innerHTML=closed?`<strong>Trade fechado salvo</strong><br>${fmt(cap)} ${arb.anchor} → ${fmt(qty)} ${asset} → ${fmt(out)} ${arb.anchor}<br>Resultado: <strong>${fmt(out-cap)} ${arb.anchor}</strong> (${(100*(out-cap)/cap).toLocaleString('pt-BR',{maximumFractionDigits:4)}%)`:`<strong>Trade aberto salvo</strong><br>${fmt(cap)} ${arb.anchor} → ${fmt(qty)} ${asset}<br>Preço efetivo de entrada: <strong>${fmt(cap/qty)} ${arb.anchor}/${asset}</strong>`;
      result.classList.remove('hidden'); await renderTrades();
    }catch(e){msg.textContent=`Erro ao gravar: ${e.message}`;}
    return false;
  }

  function tradeRow(t) {
    const closed=!!t.closed_at, profit=closed?Number(t.closed_anchor_amount)-Number(t.initial_anchor_amount):null, pct=closed?profit/Number(t.initial_anchor_amount)*100:null;
    const d=document.createElement('div'); d.className='trade-row'; d.style.cssText='padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;';
    d.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px"><div><strong>${t.strategy}</strong><br><span class="note">${fmt(t.initial_anchor_amount)} ${t.anchor_symbol} → ${fmt(t.current_quantity)} ${t.current_asset}${closed?` → ${fmt(t.closed_anchor_amount)} ${t.anchor_symbol}`:''}</span></div><div style="text-align:right"><strong>${closed?`${fmt(profit)} ${t.anchor_symbol}`:'ABERTO'}</strong><br><span class="note">${closed?`${pct.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`:`${new Date(t.opened_at).toLocaleString('pt-BR')}`}</span></div></div><div class="actions" style="justify-content:flex-end;margin-top:6px"><button class="btn" data-trade-edit="${t.id}">Editar</button><button class="btn danger" data-trade-delete="${t.id}">Excluir</button>${closed?'':'<button class="btn primary" data-trade-close="'+t.id+'">Fechar</button>'}</div>`;
    d.querySelector('[data-trade-edit]').onclick=()=>editTrade(t.id);
    d.querySelector('[data-trade-delete]').onclick=()=>deleteTrade(t.id);
    if(!closed)d.querySelector('[data-trade-close]').onclick=()=>closeTrade(t.id);
    return d;
  }

  function findTrade(id){return currentTrades.find(t=>t.id===id);}

  async function renderTrades(){
    const open=$('tradesOpenEmpty'), done=$('tradesClosedEmpty'); if(!open||!done)return;
    document.querySelectorAll('.trade-row').forEach(x=>x.remove());
    if(!session?.access_token){open.textContent='Faça login para consultar seus trades.';done.textContent='Faça login para consultar seus trades.';return;}
    try{
      currentTrades=await request(`/rest/v1/trades?select=*&arbitrage_id=eq.${encodeURIComponent(currentArb().id)}&order=opened_at.desc`);
      const opened=currentTrades.filter(t=>!t.closed_at), closed=currentTrades.filter(t=>t.closed_at);
      if(opened.length){open.textContent='';opened.forEach(t=>open.before(tradeRow(t)));}else open.textContent='Nenhum trade aberto nesta arbitragem.';
      if(closed.length){done.textContent='';closed.forEach(t=>done.before(tradeRow(t)));}else done.textContent='Nenhum trade fechado nesta arbitragem.';
    }catch(e){open.textContent=`Erro ao carregar trades: ${e.message}`;done.textContent='';}
  }

  function editTrade(id){
    const t=findTrade(id);if(!t)return; fillFormFromCurrent(); $('tradeVisualArbitrage').value=t.arbitrage_id; $('tradeVisualStrategy').value=t.strategy; $('tradeVisualOpenedAt').value=localDateInput(new Date(t.opened_at)); $('tradeVisualAnchorAmount').value=t.initial_anchor_amount; $('tradeVisualQuantity').value=t.current_quantity; $('tradeVisualClosedAt').value=t.closed_at?localDateInput(new Date(t.closed_at)):''; $('tradeVisualExitAmount').value=t.closed_anchor_amount||''; updateFormFields(); $('tradeVisualModal').dataset.editId=id; $('tradeVisualModal').classList.remove('hidden'); $('tradeVisualModal').setAttribute('aria-hidden','false');
  }

  function closeTrade(id){ editTrade(id); $('tradeVisualClosedAt').value=localDateInput(); $('tradeVisualExitAmount').value=''; $('tradeVisualMessage').textContent='Informe a quantidade recebida na âncora para fechar 100% da posição.'; updateFormFields(); }

  async function deleteTrade(id){ if(!confirm('Excluir este trade?'))return; try{await request(`/rest/v1/trades?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});await renderTrades();}catch(e){alert(`Erro ao excluir: ${e.message}`);} }

  window.updateTradeVisualForm=updateFormFields;
  window.openTradeVisualForm=()=>{if(!session?.access_token){openAuthModal();return;} fillFormFromCurrent(); $('tradeVisualModal').classList.remove('hidden'); $('tradeVisualModal').setAttribute('aria-hidden','false');};
  window.closeTradeVisualForm=()=>{$('tradeVisualModal').classList.add('hidden');$('tradeVisualModal').setAttribute('aria-hidden','true');delete $('tradeVisualModal').dataset.editId;};
  window.validateTradeVisualForm=persistTrade;

  function init(){
    renderAuthBar();
    renderTrades();
    const arb=$('arbitrageSelect'); if(arb)arb.addEventListener('change',renderTrades);
    const form=$('tradeVisualForm'); if(form)form.onsubmit=persistTrade;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
