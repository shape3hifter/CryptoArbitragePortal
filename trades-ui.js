(() => {
  'use strict';

  const PANEL_ID = 'tradesPanel';
  const MODAL_ID = 'tradeVisualModal';

  function portalContext() {
    return window.CryptoPortalBridge?.getContext?.() || {};
  }

  function panelMarkup() {
    return `
      <section class="card trades-card" id="${PANEL_ID}">
        <div class="section-head">
          <div><h2>Trades</h2><div class="note" id="tradesContext">Acompanhamento da arbitragem selecionada</div></div>
          <button class="btn primary" id="newTradeBtn" type="button">+ Novo trade</button>
        </div>
        <div class="trade-empty">Nenhum trade aberto nesta arbitragem.</div>
        <div class="trades-subtitle">FECHADOS</div>
        <div class="trade-empty">Nenhum trade fechado nesta arbitragem.</div>
      </section>`;
  }

  function ensureStyle() {
    if (document.getElementById('trades-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'trades-ui-style';
    style.textContent = `
      .trades-card{height:100%;min-height:100%}
      .trades-subtitle{font-size:11px;color:var(--muted);font-weight:700;margin:10px 0 4px}
      .trade-empty{padding:14px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px}
      .trade-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px}
      .trade-modal.hidden{display:none}
      .trade-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.62)}
      .trade-dialog{position:relative;width:min(680px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
      .trade-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .trade-entry-hint{margin-top:10px;font-size:11px;line-height:1.5;color:var(--muted);background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:9px}
      @media(max-width:700px){.trade-form-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function makeModal() {
    if (document.getElementById(MODAL_ID)) return;
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'trade-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="trade-modal-backdrop" data-close-trade-modal="true"></div>
      <div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="tradeVisualTitle">
        <div class="section-head">
          <div><h2 id="tradeVisualTitle">Novo trade</h2><div class="note">Cadastro do trade · etapa de interface</div></div>
          <button class="btn" type="button" data-close-trade-modal="true">Fechar</button>
        </div>
        <form id="tradeVisualForm">
          <div class="trade-form-grid">
            <div class="field"><label for="tradeVisualArbitrage">Arbitragem</label><select id="tradeVisualArbitrage" required></select></div>
            <div class="field"><label for="tradeVisualStrategy">Estratégia</label><select id="tradeVisualStrategy" required></select></div>
            <div class="field"><label for="tradeVisualOpenedAt">Entrada</label><input id="tradeVisualOpenedAt" type="datetime-local" required></div>
            <div class="field"><label for="tradeVisualAnchorAmount">Capital inicial</label><input id="tradeVisualAnchorAmount" type="number" min="0" step="any" required></div>
            <div class="field"><label for="tradeVisualAsset">Ativo inicialmente adquirido</label><select id="tradeVisualAsset" required></select></div>
            <div class="field"><label for="tradeVisualQuantity">Quantidade adquirida</label><input id="tradeVisualQuantity" type="number" min="0" step="any" required></div>
            <div class="field"><label for="tradeVisualRatio">Relação de entrada: 1 ativo = Anchor</label><input id="tradeVisualRatio" type="number" min="0" step="any" required></div>
            <div class="field"><label for="tradeVisualNotes">Observação</label><input id="tradeVisualNotes" placeholder="Opcional"></div>
          </div>
          <div class="trade-entry-hint">A posição e a relação da entrada serão preservadas. Nesta etapa, o formulário apenas valida o cadastro; ainda não grava no PostgreSQL.</div>
          <div class="actions"><button class="btn primary" type="submit">Validar cadastro</button><button class="btn" type="button" data-close-trade-modal="true">Cancelar</button></div>
          <div id="tradeVisualMessage" class="note" style="margin-top:10px"></div>
        </form>
      </div>`;
    document.body.appendChild(modal);
  }

  function arbitrages() {
    const ctx = portalContext();
    if (Array.isArray(ctx.arbitrages) && ctx.arbitrages.length) return ctx.arbitrages;
    const select = document.getElementById('arbitrageSelect');
    const opt = select?.selectedOptions?.[0];
    const anchor = ctx.anchor || document.getElementById('anchor')?.value || 'ADA';
    const comps = Array.isArray(ctx.comps) ? ctx.comps : [];
    return [{id:select?.value||'current',name:opt?.textContent||`${anchor} / ${comps.join(' / ')}`,anchor,comps}];
  }

  function fillForm() {
    const list = arbitrages();
    const aSel = document.getElementById('tradeVisualArbitrage');
    aSel.innerHTML = list.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
    const current = portalContext().arbitrageId;
    if (current && list.some(a=>a.id===current)) aSel.value=current;
    updateFields();
    const d = new Date();
    const p=n=>String(n).padStart(2,'0');
    document.getElementById('tradeVisualOpenedAt').value=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    document.getElementById('tradeVisualMessage').textContent='';
  }

  function updateFields() {
    const list=arbitrages();
    const selected=list.find(a=>a.id===document.getElementById('tradeVisualArbitrage').value)||list[0];
    if(!selected)return;
    const anchor=selected.anchor||'ADA'; const comps=selected.comps||[];
    document.getElementById('tradeVisualStrategy').innerHTML=[...new Set(comps.map(c=>`${anchor} → ${c} → ${anchor}`).concat(comps.length>=2?[`${comps[0]} → ${comps[1]} → ${anchor}`]:[]))].map(s=>`<option>${s}</option>`).join('');
    document.getElementById('tradeVisualAsset').innerHTML=comps.map(c=>`<option>${c}</option>`).join('');
    document.querySelector('label[for="tradeVisualAnchorAmount"]').textContent=`Capital inicial (${anchor})`;
    document.querySelector('label[for="tradeVisualRatio"]').textContent=`Relação de entrada: 1 ativo = ${anchor}`;
  }

  function openModal(){
    fillForm(); const modal=document.getElementById(MODAL_ID); modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  }
  function closeModal(){ const modal=document.getElementById(MODAL_ID); modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); }

  function init() {
    const grid=document.querySelector('#arbitragesView .grid');
    if(!grid) return false;
    ensureStyle();
    if(!document.getElementById(PANEL_ID)) grid.appendChild(document.createRange().createContextualFragment(panelMarkup()).firstElementChild);
    makeModal();
    document.getElementById('newTradeBtn')?.addEventListener('click',openModal);
    document.querySelectorAll('[data-close-trade-modal="true"]').forEach(b=>b.addEventListener('click',closeModal));
    document.getElementById('tradeVisualArbitrage')?.addEventListener('change',updateFields);
    document.getElementById('tradeVisualForm')?.addEventListener('submit',e=>{e.preventDefault();const msg=document.getElementById('tradeVisualMessage');const amount=Number(document.getElementById('tradeVisualAnchorAmount').value),ratio=Number(document.getElementById('tradeVisualRatio').value),quantity=Number(document.getElementById('tradeVisualQuantity').value),anchor=portalContext().anchor||'ADA';if(!(amount>0&&ratio>0&&quantity>0)){msg.textContent='Preencha capital, relação e quantidade com valores maiores que zero.';return}const value=quantity*ratio;if(Math.abs(value-amount)>Math.max(1e-7,amount*1e-5)){msg.textContent=`Atenção: ${quantity} × ${ratio} = ${value.toLocaleString('pt-BR')} ${anchor}, diferente do capital informado (${amount.toLocaleString('pt-BR')} ${anchor}).`;return}msg.textContent=`Cadastro validado. ${quantity.toLocaleString('en-US',{maximumFractionDigits:8})} do ativo representa aproximadamente ${amount.toLocaleString('pt-BR')} ${anchor}. Ainda não gravado.`});
    const ctx=portalContext(); const context=document.getElementById('tradesContext'); if(context)context.textContent=ctx.arbitrageName?`Acompanhamento de ${ctx.arbitrageName}`:'Acompanhamento da arbitragem selecionada';
    return true;
  }

  function wait(n=120){ if(init()) return; if(n>0) setTimeout(()=>wait(n-1),100); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>wait(),{once:true}); else wait();
})();