(() => {
  'use strict';

  const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  const ARBS = {
    'ADA / NIGHT / SNEK': { id:'arb-ada-night-snek', anchor:'ADA', assets:['NIGHT','SNEK'] },
    'SOL / BONK / WIF': { id:'arb-sol-bonk-wif', anchor:'SOL', assets:['BONK','WIF'] }
  };
  const SESSION_KEY = 'cryptoArbSupabaseSession';
  const $ = id => document.getElementById(id);
  let session = loadSession();
  let trades = [];

  function loadSession(){ try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null} }
  function saveSession(v){session=v; if(v)localStorage.setItem(SESSION_KEY,JSON.stringify(v)); else localStorage.removeItem(SESSION_KEY)}
  function apiUrl(path){return `${cfg.url}${path}`}
  function baseHeaders(token){return {apikey:cfg.anonKey,Authorization:`Bearer ${token||cfg.anonKey}`,'Content-Type':'application/json'}}
  async function call(path,options={},auth=true){
    if(!cfg.url||!cfg.anonKey)throw new Error('Supabase não configurado.');
    const token=auth?session?.access_token:null;
    if(auth&&!token)throw new Error('Faça login para acessar os trades.');
    const res=await fetch(apiUrl(path),{...options,headers:{...baseHeaders(token),...(options.headers||{})}});
    const text=await res.text(); let body=null; try{body=text?JSON.parse(text):null}catch{}
    if(!res.ok)throw new Error(body?.msg||body?.message||body?.hint||body?.details||`HTTP ${res.status}`);
    return body;
  }
  function arbFromPortal(){
    const s=$('arbitrageSelect'); const name=String(s?.selectedOptions?.[0]?.textContent||'').trim().replace(/\s+/g,' ');
    if(ARBS[name])return {...ARBS[name],name};
    const p=name.split('/').map(x=>x.trim()).filter(Boolean);
    return p.length>=2?{id:String(s?.value||'current'),name,anchor:p[0],assets:p.slice(1,3)}:{...ARBS['ADA / NIGHT / SNEK'],name:'ADA / NIGHT / SNEK'};
  }
  function strategyList(a){const[x,y]=a.assets;return[`${a.anchor} → ${x} → ${a.anchor}`,`${a.anchor} → ${y} → ${a.anchor}`,`${x} → ${y} → ${a.anchor}`,`${y} → ${x} → ${a.anchor}`]}
  function initialAsset(strategy,a){const[x,y]=a.assets,st=strategyList(a);return strategy===st[0]?x:strategy===st[1]?y:strategy===st[2]?y:x}
  function fmt(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:8}):'—'}
  function localDate(d=new Date()){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}

  function authUi(){
    const card=$('tradesPanel'); if(!card)return;
    if(!$('tradeAuthBar')){
      const bar=document.createElement('div'); bar.id='tradeAuthBar'; bar.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin:6px 0 10px;';
      bar.innerHTML='<span id="tradeAuthStatus" class="note"></span><div class="actions" style="margin-top:0"><button id="tradeLoginBtn" class="btn" type="button">Entrar</button><button id="tradeLogoutBtn" class="btn" type="button" style="display:none">Sair</button></div>';
      card.querySelector('.section-head')?.after(bar);
      $('tradeLoginBtn').onclick=showAuth;
      $('tradeLogoutBtn').onclick=()=>{saveSession(null);authUi();renderTrades()};
    }
    const status=$('tradeAuthStatus'),login=$('tradeLoginBtn'),logout=$('tradeLogoutBtn');
    if(session?.user?.email){status.textContent=`Usuário: ${session.user.email}`;login.style.display='none';logout.style.display=''}else{status.textContent='Faça login para gravar e consultar seus trades.';login.style.display='';logout.style.display='none'}
  }
  function showAuth(){
    if(!$('tradeAuthModal')){
      const m=document.createElement('div');m.id='tradeAuthModal';m.className='trade-modal hidden';
      m.innerHTML='<div class="trade-modal-backdrop"></div><div class="trade-dialog" role="dialog" aria-modal="true"><div class="section-head"><div><h2>Acesso aos Trades</h2><div class="note">Supabase Auth</div></div><button id="authClose" class="btn" type="button">Fechar</button></div><form id="authForm"><div class="trade-form-grid"><div class="field"><label>E-mail</label><input id="authEmail" type="email" autocomplete="email" required></div><div class="field"><label>Senha</label><input id="authPassword" type="password" minlength="6" autocomplete="current-password" required></div></div><div class="actions"><button class="btn primary" type="submit">Entrar</button><button id="signupBtn" class="btn" type="button">Criar conta</button></div><div id="authMsg" class="note" style="margin-top:10px"></div></form></div>';
      document.body.appendChild(m); $('authClose').onclick=()=>m.classList.add('hidden'); m.querySelector('.trade-modal-backdrop').onclick=()=>m.classList.add('hidden'); $('authForm').onsubmit=async e=>{e.preventDefault();await login()}; $('signupBtn').onclick=signup;
    }
    $('tradeAuthModal').classList.remove('hidden');$('tradeAuthModal').setAttribute('aria-hidden','false');
  }
  async function login(){const msg=$('authMsg');msg.textContent='Entrando…';try{const b=await call('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('authEmail').value.trim(),password:$('authPassword').value})},false);saveSession({access_token:b.access_token,refresh_token:b.refresh_token,expires_at:b.expires_at,user:b.user});$('tradeAuthModal').classList.add('hidden');authUi();await renderTrades()}catch(e){msg.textContent=`Erro: ${e.message}`}}
  async function signup(){const msg=$('authMsg');msg.textContent='Criando conta…';try{const b=await call('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:$('authEmail').value.trim(),password:$('authPassword').value})},false);if(b?.access_token){saveSession({access_token:b.access_token,refresh_token:b.refresh_token,expires_at:b.expires_at,user:b.user});$('tradeAuthModal').classList.add('hidden');authUi();await renderTrades()}else msg.textContent='Conta criada. Verifique o e-mail caso a confirmação esteja habilitada no Supabase.'}catch(e){msg.textContent=`Erro: ${e.message}`}}

  function prepareForm(){
    const a=arbFromPortal(),sel=$('tradeVisualArbitrage'),st=$('tradeVisualStrategy');
    sel.innerHTML=Object.values(ARBS).map(x=>`<option value="${x.id}" ${x.id===a.id?'selected':''}>${x.name}</option>`).join('');
    st.innerHTML=strategyList(a).map(x=>`<option value="${x}">${x}</option>`).join('');
    $('tradeVisualOpenedAt').value=localDate();$('tradeVisualClosedAt').value='';$('tradeVisualAnchorAmount').value='';$('tradeVisualQuantity').value='';$('tradeVisualExitAmount').value='';$('tradeVisualMessage').textContent='';$('tradeVisualResult').classList.add('hidden');$('tradeVisualModal').dataset.tradeId='';
    updateForm();
  }
  function updateForm(){const a=arbFromPortal(),s=$('tradeVisualStrategy')?.value||strategyList(a)[0],asset=initialAsset(s,a),cap=Number($('tradeVisualAnchorAmount')?.value),qty=Number($('tradeVisualQuantity')?.value),out=Number($('tradeVisualExitAmount')?.value);$('tradeVisualInitialAsset').value=asset;$('tradeVisualAnchorLabel').textContent=`Quantidade utilizada (${a.anchor})`;$('tradeVisualQuantityLabel').textContent=`Quantidade recebida (${asset})`;$('tradeVisualExitAmountLabel').textContent=`Quantidade recebida na âncora (${a.anchor})`;$('tradeVisualEntryDerived').innerHTML=`Preço efetivo de entrada: <strong>${cap>0&&qty>0?fmt(cap/qty)+' '+a.anchor+'/'+asset:'—'}</strong>`;$('tradeVisualExitDerived').innerHTML=`Preço efetivo de saída: <strong>${out>0&&qty>0?fmt(out/qty)+' '+a.anchor+'/'+asset:'—'}</strong>`}

  window.updateTradeVisualForm=updateForm;
  window.openTradeVisualForm=()=>{if(!session?.access_token){showAuth();return}prepareForm();$('tradeVisualModal').classList.remove('hidden');$('tradeVisualModal').setAttribute('aria-hidden','false')};
  window.closeTradeVisualForm=()=>{$('tradeVisualModal').classList.add('hidden');$('tradeVisualModal').setAttribute('aria-hidden','true')};

  async function submitForm(e){
    e.preventDefault(); if(!session?.access_token){showAuth();return false}
    const a=arbFromPortal(),s=$('tradeVisualStrategy').value||strategyList(a)[0],asset=initialAsset(s,a),opened=$('tradeVisualOpenedAt').value,closed=$('tradeVisualClosedAt').value,cap=Number($('tradeVisualAnchorAmount').value),qty=Number($('tradeVisualQuantity').value),out=Number($('tradeVisualExitAmount').value),msg=$('tradeVisualMessage'),res=$('tradeVisualResult'),id=$('tradeVisualModal').dataset.tradeId||'';
    if(!(cap>0)||!(qty>0)){msg.textContent=`Preencha a quantidade utilizada em ${a.anchor} e a quantidade recebida em ${asset}.`;return false}
    if(closed||out>0){if(!closed||!(out>0)){msg.textContent='Para fechar, informe a data/hora de saída e a quantidade recebida na âncora.';return false}if(new Date(closed)<new Date(opened)){msg.textContent='A saída não pode ser anterior à entrada.';return false}}
    const payload={user_id:session.user.id,arbitrage_id:a.id,arbitrage_name:a.name,anchor_symbol:a.anchor,strategy,opened_at:new Date(opened).toISOString(),initial_anchor_amount:cap,current_asset:asset,current_quantity:qty,entry_ratio_anchor_per_asset:cap/qty,entry_anchor_amount:cap,closed_at:closed?new Date(closed).toISOString():null,closed_anchor_amount:closed?out:null};
    msg.textContent=id?'Atualizando no PostgreSQL…':'Gravando no PostgreSQL…';
    try{
      const saved=await call(id?`/rest/v1/trades?id=eq.${encodeURIComponent(id)}`:'/rest/v1/trades',{method:id?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
      if(!id&&saved?.[0])await call('/rest/v1/trade_legs',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({trade_id:saved[0].id,user_id:session.user.id,leg_order:1,from_asset:a.anchor,to_asset:asset,from_amount:cap,to_amount:qty,ratio_from_to:qty/cap,captured_at:new Date(opened).toISOString()})});
      msg.textContent=id?'Trade atualizado no PostgreSQL.':'Trade gravado no PostgreSQL.';res.innerHTML=closed?`<strong>Trade fechado salvo</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset} → ${fmt(out)} ${a.anchor}<br>Resultado: <strong>${fmt(out-cap)} ${a.anchor}</strong> (${(100*(out-cap)/cap).toLocaleString('pt-BR',{maximumFractionDigits:4)}%)`:`<strong>Trade aberto salvo</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset}<br>Preço efetivo: <strong>${fmt(cap/qty)} ${a.anchor}/${asset}</strong>`;res.classList.remove('hidden');await renderTrades();
    }catch(err){msg.textContent=`Erro ao gravar: ${err.message}`}
    return false;
  }
  window.validateTradeVisualForm=submitForm;

  async function renderTrades(){
    const open=$('tradesOpenEmpty'),closed=$('tradesClosedEmpty');if(!open||!closed)return;document.querySelectorAll('.trade-row').forEach(x=>x.remove());
    if(!session?.access_token){open.textContent='Faça login para consultar seus trades.';closed.textContent='Faça login para consultar seus trades.';return}
    try{
      trades=await call(`/rest/v1/trades?select=*&arbitrage_id=eq.${encodeURIComponent(arbFromPortal().id)}&order=opened_at.desc`);const o=trades.filter(t=>!t.closed_at),c=trades.filter(t=>t.closed_at);
      if(o.length){open.textContent='';o.forEach(t=>open.before(row(t)))}else open.textContent='Nenhum trade aberto nesta arbitragem.';
      if(c.length){closed.textContent='';c.forEach(t=>closed.before(row(t)))}else closed.textContent='Nenhum trade fechado nesta arbitragem.';
    }catch(e){open.textContent=`Erro ao carregar trades: ${e.message}`;closed.textContent=''}
  }
  function row(t){const closed=!!t.closed_at,profit=closed?Number(t.closed_anchor_amount)-Number(t.initial_anchor_amount):0,pct=closed?profit/Number(t.initial_anchor_amount)*100:0,d=document.createElement('div');d.className='trade-row';d.style.cssText='padding:10px 0;border-bottom:1px solid var(--border);font-size:12px';d.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px"><div><strong>${t.strategy}</strong><br><span class="note">${fmt(t.initial_anchor_amount)} ${t.anchor_symbol} → ${fmt(t.current_quantity)} ${t.current_asset}${closed?` → ${fmt(t.closed_anchor_amount)} ${t.anchor_symbol}`:''}</span></div><div style="text-align:right"><strong>${closed?`${fmt(profit)} ${t.anchor_symbol}`:'ABERTO'}</strong><br><span class="note">${closed?`${pct.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`:new Date(t.opened_at).toLocaleString('pt-BR')}</span></div></div><div class="actions" style="justify-content:flex-end;margin-top:6px"><button class="btn" data-e="${t.id}">Editar</button><button class="btn danger" data-d="${t.id}">Excluir</button>${closed?'':'<button class="btn primary" data-c="'+t.id+'">Fechar</button>'}</div>`;d.querySelector('[data-e]').onclick=()=>edit(t);d.querySelector('[data-d]').onclick=()=>del(t.id);if(!closed)d.querySelector('[data-c]').onclick=()=>finish(t);return d}
  function edit(t){$('tradeVisualModal').dataset.tradeId=t.id;prepareForm();$('tradeVisualArbitrage').value=t.arbitrage_id;$('tradeVisualStrategy').value=t.strategy;$('tradeVisualOpenedAt').value=localDate(new Date(t.opened_at));$('tradeVisualAnchorAmount').value=t.initial_anchor_amount;$('tradeVisualQuantity').value=t.current_quantity;$('tradeVisualClosedAt').value=t.closed_at?localDate(new Date(t.closed_at)):'';$('tradeVisualExitAmount').value=t.closed_anchor_amount||'';updateForm();$('tradeVisualModal').classList.remove('hidden')}
  function finish(t){edit(t);$('tradeVisualClosedAt').value=localDate();$('tradeVisualExitAmount').value='';$('tradeVisualMessage').textContent='Informe somente a quantidade recebida na âncora para fechar 100% da posição.'}
  async function del(id){if(!confirm('Excluir este trade?'))return;try{await call(`/rest/v1/trades?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});await renderTrades()}catch(e){alert(`Erro ao excluir: ${e.message}`)}}

  function init(){authUi();renderTrades();const a=$('arbitrageSelect');if(a)a.addEventListener('change',()=>{authUi();renderTrades()});const f=$('tradeVisualForm');if(f)f.onsubmit=submitForm}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
