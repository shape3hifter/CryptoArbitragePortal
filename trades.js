(() => {
  const cfg = window.CRYPTO_ARB_SUPABASE_CONFIG || {};
  const hasSupabaseConfig = Boolean(cfg.url && cfg.anonKey && window.supabase);
  const supabaseClient = hasSupabaseConfig ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  const panelMarkup = `
    <section class="card trades-card" id="tradesPanel">
      <div class="section-head">
        <div><h2>Trades</h2><div class="note" id="tradesContext">Acompanhamento da arbitragem selecionada</div></div>
        <button class="btn primary" id="newTradeBtn" type="button">+ Novo trade</button>
      </div>
      <div id="tradeAuth" class="trades-auth"></div>
      <div id="tradesContent">
        <div id="openTrades"></div>
        <div id="closedTrades" class="trades-closed"></div>
      </div>
    </section>
    <div id="tradeModal" class="trade-modal hidden" aria-hidden="true">
      <div class="trade-modal-backdrop" data-trade-close="true"></div>
      <div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="tradeDialogTitle">
        <div class="section-head"><h2 id="tradeDialogTitle">Novo trade</h2><button class="btn" type="button" data-trade-close="true">Fechar</button></div>
        <form id="tradeForm">
          <input type="hidden" id="tradeId">
          <div class="trade-form-grid">
            <div class="field"><label for="tradeArbitrage">Arbitragem</label><select id="tradeArbitrage"></select></div>
            <div class="field"><label for="tradeStrategy">Estratégia</label><select id="tradeStrategy"></select></div>
            <div class="field"><label for="tradeOpenedAt">Entrada</label><input id="tradeOpenedAt" type="datetime-local" required></div>
            <div class="field"><label for="tradeInitialAnchor">Capital inicial (<span id="tradeAnchorLabel">ADA</span>)</label><input id="tradeInitialAnchor" type="number" min="0" step="any" required></div>
            <div class="field"><label for="tradeCurrentAsset">Ativo atualmente detido</label><select id="tradeCurrentAsset"></select></div>
            <div class="field"><label for="tradeCurrentQuantity">Quantidade atualmente detida</label><input id="tradeCurrentQuantity" type="number" min="0" step="any" required></div>
            <div class="field"><label for="tradeEntryRatio">Relação na entrada: 1 ativo = <span id="tradeAnchorLabel2">ADA</span></label><input id="tradeEntryRatio" type="number" min="0" step="any" required></div>
            <div class="field"><label for="tradeNotes">Observação</label><input id="tradeNotes" placeholder="Opcional"></div>
          </div>
          <div class="trade-entry-hint" id="tradeEntryHint">A quantidade do ativo e a relação de entrada são preservadas para que o fechamento possa ser simulado sem recalcular a posição original.</div>
          <div class="actions">
            <button class="btn primary" type="submit">Salvar trade</button>
            <button class="btn" type="button" data-trade-close="true">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
    <div id="tradeAuthModal" class="trade-modal hidden" aria-hidden="true">
      <div class="trade-modal-backdrop" data-auth-close="true"></div>
      <div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <div class="section-head"><h2 id="authTitle">Acesso aos Trades</h2><button class="btn" type="button" data-auth-close="true">Fechar</button></div>
        <form id="authForm">
          <div class="trade-form-grid auth-grid">
            <div class="field"><label for="authEmail">E-mail</label><input id="authEmail" type="email" required></div>
            <div class="field"><label for="authPassword">Senha</label><input id="authPassword" type="password" minlength="6" required></div>
          </div>
          <div class="actions"><button class="btn primary" id="authLoginBtn" type="submit">Entrar</button><button class="btn" id="authSignupBtn" type="button">Criar conta</button></div>
          <div id="authMessage" class="note"></div>
        </form>
      </div>
    </div>`;

  const styleText = `
    .trades-card{height:100%;min-height:100%}.trades-auth{margin-bottom:10px;padding:9px 10px;border:1px solid var(--border);border-radius:12px;background:var(--panel2)}
    .trade-auth-line{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.trade-mini{background:var(--panel2);border:1px solid var(--border);border-radius:14px;padding:11px;margin-top:8px}.trade-mini-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.trade-title{font-weight:700}.trade-meta{font-size:11px;color:var(--muted);margin-top:3px}.trade-main{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.trade-k{font-size:10px;color:var(--muted)}.trade-v{font-size:14px;font-weight:700;margin-top:2px}.trade-result-good{color:var(--good)}.trade-result-bad{color:var(--bad)}.trade-result-neutral{color:var(--warn)}.trade-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.trade-actions .btn{font-size:11px;padding:7px 9px}.trade-status{font-size:10px;padding:4px 7px;border-radius:999px;border:1px solid var(--border);font-weight:700}.trade-status.open{color:var(--good);background:rgba(104,211,145,.09)}.trade-status.alert{color:var(--warn);background:rgba(246,200,95,.09)}.trade-status.closed{color:var(--muted)}.trades-closed{margin-top:12px}.trades-subtitle{font-size:11px;color:var(--muted);font-weight:700;margin:8px 0 4px}.trade-empty{padding:15px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px}.trade-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px}.trade-modal.hidden{display:none}.trade-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.62)}.trade-dialog{position:relative;width:min(680px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45)}.trade-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.trade-form-grid .field:last-child{grid-column:1/-1}.auth-grid{grid-template-columns:1fr}.auth-grid .field:last-child{grid-column:auto}.trade-entry-hint{margin-top:10px;font-size:11px;line-height:1.5;color:var(--muted);background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:9px}.trade-sim{margin-top:9px;padding:9px;border:1px solid rgba(122,162,255,.25);background:rgba(122,162,255,.06);border-radius:12px;font-size:11px}.trade-sim strong{font-size:13px}@media(max-width:900px){.trade-form-grid{grid-template-columns:1fr}.trade-form-grid .field:last-child{grid-column:auto}.trade-main{grid-template-columns:1fr}}
  `;
  const style = document.createElement('style'); style.textContent = styleText; document.head.appendChild(style);

  function portalContext(){
    return window.CryptoPortalBridge?.getContext?.() || null;
  }
  function liveSnapshot(){
    return window.CryptoPortalBridge?.getLiveSnapshot?.() || null;
  }
  function money(n, digits=2){
    return Number.isFinite(Number(n)) ? Number(n).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
  }
  function qty(n){
    return Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US',{maximumFractionDigits:8}) : '—';
  }
  function pct(n){
    if(!Number.isFinite(Number(n))) return '—';
    const v=Number(n); return `${v>=0?'+':''}${(v*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2)}%`;
  }
  function isoLocalNow(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}

  let trades=[];
  let authUser=null;
  let loading=false;

  function injectPanel(){
    const grid=document.querySelector('#arbitragesView .grid');
    if(!grid || document.getElementById('tradesPanel')) return;
    const holder=document.createElement('div'); holder.innerHTML=panelMarkup; grid.appendChild(holder.firstElementChild);
    bindUi();
  }

  function selectedArbitrage(){
    const c=portalContext();
    if(c?.arbitrageId) return {id:c.arbitrageId,name:c.arbitrageName,anchor:c.anchor,comps:c.comps||[]};
    const sel=document.getElementById('arbitrageSelect');
    const option=sel?.selectedOptions?.[0];
    const anchor=c?.anchor||'ADA'; const comps=c?.comps||[];
    return {id:sel?.value||'',name:option?.textContent||`${anchor} / ${comps.join(' / ')}`,anchor,comps};
  }
  function fillArbitrageOptions(){
    const ctx=portalContext(); const select=document.getElementById('tradeArbitrage'); if(!select) return;
    const opts=(ctx?.arbitrages||[]).map(a=>`<option value="${a.id}">${a.name}</option>`);
    if(opts.length){select.innerHTML=opts.join('');select.value=ctx.arbitrageId||opts[0]?.match(/value="([^"]+)/)?.[1]||'';}
    updateFormFromArb();
  }
  function updateFormFromArb(){
    const select=document.getElementById('tradeArbitrage'); const strategy=document.getElementById('tradeStrategy'); const asset=document.getElementById('tradeCurrentAsset');
    const ctx=portalContext();
    const selected=(ctx?.arbitrages||[]).find(a=>a.id===select?.value)||selectedArbitrage();
    if(!selected) return;
    const anchor=selected.anchor||'ADA'; const comps=selected.comps||selected.comparativesDefault||[]; const names=[];
    comps.forEach(c=>{names.push(`${anchor} → ${c} → ${anchor}`)});
    if(comps.length>=2) names.push(`${comps[0]} → ${comps[1]} → ${anchor}`);
    names.push(`${comps[1]||comps[0]||anchor} → ${comps[0]||anchor} → ${anchor}`);
    strategy.innerHTML=[...new Set(names)].map(x=>`<option>${x}</option>`).join('');
    asset.innerHTML=comps.map(c=>`<option>${c}</option>`).join('');
    if(!asset.value && comps[0]) asset.value=comps[0];
    document.getElementById('tradeAnchorLabel').textContent=anchor;
    document.getElementById('tradeAnchorLabel2').textContent=anchor;
  }

  async function refreshUser(){
    if(!supabaseClient) return;
    const {data}=await supabaseClient.auth.getSession(); authUser=data.session?.user||null; renderAuth();
    if(authUser) await loadTrades(); else {trades=[];renderTrades();}
  }
  async function loadTrades(){
    if(!supabaseClient || !authUser)return;
    loading=true;renderTrades();
    const {data,error}=await supabaseClient.from('trades').select('*').eq('user_id',authUser.id).order('opened_at',{ascending:false});
    loading=false;
    if(error){setAuthMessage('Erro ao carregar trades: '+error.message);trades=[];}else trades=data||[];
    renderTrades();
  }
  function renderAuth(){
    const box=document.getElementById('tradeAuth'); if(!box)return;
    if(!hasSupabaseConfig){box.innerHTML='<div class="note">Persistência configurável no Supabase. Preencha <code>supabase/config.js</code> com a URL e a chave anon/public para habilitar os Trades.</div>';return;}
    if(authUser){box.innerHTML=`<div class="trade-auth-line"><span class="note">Conectado: ${authUser.email||'usuário autenticado'}</span><button class="btn" id="logoutTradeBtn" type="button">Sair</button></div>`;document.getElementById('logoutTradeBtn')?.addEventListener('click',async()=>{await supabaseClient.auth.signOut();authUser=null;trades=[];renderAuth();renderTrades()});}
    else box.innerHTML='<div class="trade-auth-line"><span class="note">Entre para acessar seus trades persistidos no PostgreSQL.</span><button class="btn primary" id="loginTradeBtn" type="button">Entrar</button></div>'; document.getElementById('loginTradeBtn')?.addEventListener('click',()=>openModal('tradeAuthModal'));
  }
  function setAuthMessage(msg){const el=document.getElementById('authMessage');if(el)el.textContent=msg||'';}

  function currentAnchorValue(asset, snapshot, anchor){
    if(!snapshot?.prices || !Number.isFinite(Number(snapshot.prices[asset])) || !Number.isFinite(Number(snapshot.prices[anchor])) || Number(snapshot.prices[anchor])<=0) return null;
    return Number(snapshot.prices[asset]) / Number(snapshot.prices[anchor]);
  }
  function simulateTrade(t){
    const ctx=portalContext(); const snap=liveSnapshot(); if(!snap) return null;
    const ratio=currentAnchorValue(t.current_asset,snap,t.anchor_symbol); if(!Number.isFinite(ratio)) return null;
    const current=Number(t.current_quantity)*ratio; const initial=Number(t.initial_anchor_amount);
    return {currentAnchor:current,resultAnchor:current-initial,resultPct:initial?current/initial-1:null,currentRatio:ratio};
  }
  function tradeCard(t){
    const sim=simulateTrade(t); const closed=!!t.closed_at; const res=closed?Number(t.closed_anchor_amount)-Number(t.initial_anchor_amount):(sim?.resultAnchor??null); const rp=closed?(Number(t.initial_anchor_amount)?Number(t.closed_anchor_amount)/Number(t.initial_anchor_amount)-1:null):(sim?.resultPct??null); const cls=res>0?'trade-result-good':res<0?'trade-result-bad':'trade-result-neutral';
    const livePart=closed?'':(sim?`<div class="trade-sim"><div>Fechamento simulado</div><strong>${qty(sim.currentAnchor)} ${t.anchor_symbol}</strong> · <span class="${cls}">${qty(res)} ${t.anchor_symbol} (${pct(rp)})</span></div>`:'<div class="trade-sim">Sem <b>⚡ Cotação agora</b>. Carregue a cotação atual para simular o fechamento.</div>');
    const status=closed?'<span class="trade-status closed">FECHADO</span>':'<span class="trade-status open">ABERTO</span>';
    const closeBtn=closed?'':`<button class="btn" data-trade-action="close" data-id="${t.id}">Fechar trade</button>`;
    return `<div class="trade-mini"><div class="trade-mini-head"><div><div class="trade-title">#${t.sequence_no||'—'} · ${t.strategy}</div><div class="trade-meta">${t.opened_at?new Date(t.opened_at).toLocaleDateString('pt-BR'):''} · ${t.current_asset} ${qty(t.current_quantity)}</div></div>${status}</div><div class="trade-main"><div><div class="trade-k">Inicial</div><div class="trade-v">${qty(t.initial_anchor_amount)} ${t.anchor_symbol}</div></div><div><div class="trade-k">Resultado</div><div class="trade-v ${cls}">${qty(res)} ${t.anchor_symbol} · ${pct(rp)}</div></div></div>${livePart}<div class="trade-actions">${closed?'':`<button class="btn" data-trade-action="simulate" data-id="${t.id}">Simular fechamento</button>`}${closeBtn}<button class="btn" data-trade-action="edit" data-id="${t.id}">Editar</button><button class="btn danger" data-trade-action="delete" data-id="${t.id}">Excluir</button></div></div>`;
  }
  function renderTrades(){
    const open=document.getElementById('openTrades'),closed=document.getElementById('closedTrades');if(!open||!closed)return;
    const ctx=portalContext();document.getElementById('tradesContext').textContent=ctx?`${ctx.arbitrageName} · anchor ${ctx.anchor}`:'Acompanhamento da arbitragem selecionada';
    const currentId=ctx?.arbitrageId; const visible=(trades||[]).filter(t=>!currentId||t.arbitrage_id===currentId);
    const opened=visible.filter(t=>!t.closed_at), closedRows=visible.filter(t=>t.closed_at);
    open.innerHTML=`<div class="trades-subtitle">ABERTOS</div>${loading?'<div class="trade-empty">Carregando…</div>':(opened.length?opened.map(tradeCard).join(''):'<div class="trade-empty">Nenhum trade aberto nesta arbitragem.</div>')}`;
    closed.innerHTML=`<div class="trades-subtitle">FECHADOS</div>${closedRows.length?closedRows.map(tradeCard).join(''):'<div class="trade-empty">Nenhum trade fechado nesta arbitragem.</div>'}`;
    [...document.querySelectorAll('[data-trade-action]')].forEach(b=>b.addEventListener('click',()=>handleTradeAction(b.dataset.tradeAction,b.dataset.id)));
  }

  function openModal(id){const m=document.getElementById(id);if(!m)return;m.classList.remove('hidden');m.setAttribute('aria-hidden','false')}
  function closeModal(id){const m=document.getElementById(id);if(!m)return;m.classList.add('hidden');m.setAttribute('aria-hidden','true')}
  function newTrade(){
    if(!authUser){openModal('tradeAuthModal');return;}
    document.getElementById('tradeDialogTitle').textContent='Novo trade'; document.getElementById('tradeId').value=''; document.getElementById('tradeForm').reset(); document.getElementById('tradeOpenedAt').value=isoLocalNow(); fillArbitrageOptions(); updateFormFromArb(); openModal('tradeModal');
  }
  function editTrade(id){
    const t=trades.find(x=>x.id===id);if(!t)return;document.getElementById('tradeDialogTitle').textContent=`Editar trade #${t.sequence_no||''}`;document.getElementById('tradeId').value=t.id;fillArbitrageOptions();document.getElementById('tradeArbitrage').value=t.arbitrage_id;updateFormFromArb();document.getElementById('tradeStrategy').value=t.strategy;document.getElementById('tradeOpenedAt').value=new Date(t.opened_at).toISOString().slice(0,16);document.getElementById('tradeInitialAnchor').value=t.initial_anchor_amount;document.getElementById('tradeCurrentAsset').value=t.current_asset;document.getElementById('tradeCurrentQuantity').value=t.current_quantity;document.getElementById('tradeEntryRatio').value=t.entry_ratio_anchor_per_asset;document.getElementById('tradeNotes').value=t.notes||'';openModal('tradeModal');
  }
  async function saveTrade(e){
    e.preventDefault(); if(!authUser||!supabaseClient)return;
    const id=document.getElementById('tradeId').value; const ctxs=portalContext(); const arbs=(ctxs?.arbitrages||[]); const a=arbs.find(x=>x.id===document.getElementById('tradeArbitrage').value)||selectedArbitrage();
    const payload={user_id:authUser.id,arbitrage_id:a.id,arbitrage_name:a.name,anchor_symbol:a.anchor,strategy:document.getElementById('tradeStrategy').value,opened_at:new Date(document.getElementById('tradeOpenedAt').value).toISOString(),initial_anchor_amount:Number(document.getElementById('tradeInitialAnchor').value),entry_anchor_amount:Number(document.getElementById('tradeInitialAnchor').value),current_asset:document.getElementById('tradeCurrentAsset').value,current_quantity:Number(document.getElementById('tradeCurrentQuantity').value),entry_ratio_anchor_per_asset:Number(document.getElementById('tradeEntryRatio').value),notes:document.getElementById('tradeNotes').value.trim()||null};
    if(id){const {error}=await supabaseClient.from('trades').update(payload).eq('id',id).eq('user_id',authUser.id);if(error){alert('Não foi possível salvar: '+error.message);return;}}else{const {error}=await supabaseClient.from('trades').insert(payload);if(error){alert('Não foi possível criar o trade: '+error.message);return;}}
    closeModal('tradeModal'); await loadTrades();
  }
  async function deleteTrade(id){if(!confirm('Excluir este trade? Esta ação não pode ser desfeita.'))return;const {error}=await supabaseClient.from('trades').delete().eq('id',id).eq('user_id',authUser.id);if(error){alert(error.message);return}await loadTrades()}
  async function closeTrade(id){
    const t=trades.find(x=>x.id===id); if(!t)return; const sim=simulateTrade(t); if(!sim){alert('Carregue ⚡ Cotação agora antes de fechar o trade.');return;} if(!confirm(`Fechar este trade por aproximadamente ${qty(sim.currentAnchor)} ${t.anchor_symbol} (${pct(sim.resultPct)})?`))return; const {error}=await supabaseClient.from('trades').update({closed_at:new Date().toISOString(),closed_anchor_amount:sim.currentAnchor}).eq('id',id).eq('user_id',authUser.id);if(error){alert(error.message);return}await loadTrades();
  }
  function simulateOnly(id){const t=trades.find(x=>x.id===id);if(!t)return;const sim=simulateTrade(t);if(!sim){alert('Primeiro clique em ⚡ Cotação agora para ter uma cotação temporária disponível.');return;}alert(`Trade #${t.sequence_no||''}\n\nFechamento simulado: ${qty(sim.currentAnchor)} ${t.anchor_symbol}\nResultado: ${qty(sim.resultAnchor)} ${t.anchor_symbol}\nResultado %: ${pct(sim.resultPct)}`)}
  async function handleTradeAction(action,id){if(action==='edit')editTrade(id);else if(action==='delete')await deleteTrade(id);else if(action==='close')await closeTrade(id);else if(action==='simulate')simulateOnly(id)}

  async function authSubmit(e){
    e.preventDefault();if(!supabaseClient)return;setAuthMessage('Entrando…');const email=document.getElementById('authEmail').value.trim(),password=document.getElementById('authPassword').value;const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error){setAuthMessage(error.message);return}authUser=data.user;closeModal('tradeAuthModal');renderAuth();await loadTrades();
  }
  async function authSignup(){if(!supabaseClient)return;setAuthMessage('Criando conta…');const email=document.getElementById('authEmail').value.trim(),password=document.getElementById('authPassword').value;const {data,error}=await supabaseClient.auth.signUp({email,password});if(error){setAuthMessage(error.message);return}if(data.user&&!data.session){setAuthMessage('Conta criada. Verifique seu e-mail e depois entre no portal.')}else{authUser=data.user;closeModal('tradeAuthModal');renderAuth();await loadTrades();}}

  function bindUi(){
    document.getElementById('newTradeBtn')?.addEventListener('click',newTrade);
    document.getElementById('tradeForm')?.addEventListener('submit',saveTrade);
    document.getElementById('tradeArbitrage')?.addEventListener('change',updateFormFromArb);
    document.getElementById('authForm')?.addEventListener('submit',authSubmit);
    document.getElementById('authSignupBtn')?.addEventListener('click',authSignup);
    document.querySelectorAll('[data-trade-close]').forEach(el=>el.addEventListener('click',()=>closeModal('tradeModal')));
    document.querySelectorAll('[data-auth-close]').forEach(el=>el.addEventListener('click',()=>closeModal('tradeAuthModal')));
  }

  window.refreshTradePanel=renderTrades;
  injectPanel();
  if(supabaseClient){supabaseClient.auth.onAuthStateChange((_event,session)=>{authUser=session?.user||null;renderAuth();if(authUser)loadTrades()});refreshUser();}
  else {renderAuth();renderTrades();}

  // Refresh contextual calculations whenever the portal changes arbitrage/cotação.
  setInterval(()=>{try{fillArbitrageOptions();renderTrades();}catch(e){}},3000);
})();
