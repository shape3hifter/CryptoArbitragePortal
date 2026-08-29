(() => {
  'use strict';

  const PANEL_ID = 'tradesPanel';
  const MODAL_ID = 'tradeVisualModal';

  function portalContext() {
    return window.CryptoPortalBridge?.getContext?.() || {};
  }

  function currentArbitrage() {
    const ctx = portalContext();
    const select = document.getElementById('arbitrageSelect');
    const opt = select?.selectedOptions?.[0];
    const name = (ctx.arbitrageName || opt?.textContent || '').trim();
    const parts = name.split('/').map(v => v.trim()).filter(Boolean);
    const anchor = ctx.anchor || parts[0] || document.getElementById('anchor')?.value || 'ADA';
    const comps = Array.isArray(ctx.comps) && ctx.comps.length
      ? ctx.comps
      : parts.filter(v => v !== anchor);
    return {
      id: ctx.arbitrageId || select?.value || name || 'current',
      name: name || `${anchor} / ${comps.join(' / ')}`,
      anchor,
      comps: comps.length ? comps : (anchor === 'SOL' ? ['BONK', 'WIF'] : ['NIGHT', 'SNEK'])
    };
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

  function fillForm() {
    const arb = currentArbitrage();
    const aSel = document.getElementById('tradeVisualArbitrage');
    const strategy = document.getElementById('tradeVisualStrategy');
    const asset = document.getElementById('tradeVisualAsset');
    const amountLabel = document.querySelector('label[for="tradeVisualAnchorAmount"]');
    const ratioLabel = document.querySelector('label[for="tradeVisualRatio"]');

    aSel.innerHTML = `<option value="${arb.id}">${arb.name}</option>`;
    const strategies = arb.comps.map(c => `${arb.anchor} → ${c} → ${arb.anchor}`);
    if (arb.comps.length >= 2) strategies.push(`${arb.comps[0]} → ${arb.comps[1]} → ${arb.anchor}`);
    strategy.innerHTML = [...new Set(strategies)].map(s => `<option value="${s}">${s}</option>`).join('');
    asset.innerHTML = arb.comps.map(c => `<option value="${c}">${c}</option>`).join('');
    amountLabel.textContent = `Capital inicial (${arb.anchor})`;
    ratioLabel.textContent = `Relação de entrada: 1 ativo = ${arb.anchor}`;

    const d = new Date();
    const p=n=>String(n).padStart(2,'0');
    document.getElementById('tradeVisualOpenedAt').value=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    document.getElementById('tradeVisualMessage').textContent='';
  }

  function openModal(){
    fillForm();
    const modal=document.getElementById(MODAL_ID);
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden','false');
  }

  function closeModal(){
    const modal=document.getElementById(MODAL_ID);
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden','true');
  }

  function bind() {
    const button=document.getElementById('newTradeBtn');
    if (!button || button.dataset.tradesBound === 'true') return false;
    button.dataset.tradesBound='true';
    button.addEventListener('click', openModal);
    document.querySelectorAll('[data-close-trade-modal="true"]').forEach(b=>b.addEventListener('click',closeModal));
    document.getElementById('tradeVisualArbitrage')?.addEventListener('change',()=>{
      const arb=currentArbitrage();
      const selected=arb;
      const strategy=document.getElementById('tradeVisualStrategy');
      const asset=document.getElementById('tradeVisualAsset');
      const strategies=selected.comps.map(c=>`${selected.anchor} → ${c} → ${selected.anchor}`);
      if(selected.comps.length>=2)strategies.push(`${selected.comps[0]} → ${selected.comps[1]} → ${selected.anchor}`);
      strategy.innerHTML=[...new Set(strategies)].map(s=>`<option>${s}</option>`).join('');
      asset.innerHTML=selected.comps.map(c=>`<option>${c}</option>`).join('');
    });
    document.getElementById('tradeVisualForm')?.addEventListener('submit',e=>{
      e.preventDefault();
      const arb=currentArbitrage();
      const amount=Number(document.getElementById('tradeVisualAnchorAmount').value);
      const ratio=Number(document.getElementById('tradeVisualRatio').value);
      const quantity=Number(document.getElementById('tradeVisualQuantity').value);
      const msg=document.getElementById('tradeVisualMessage');
      if(!(amount>0&&ratio>0&&quantity>0)){msg.textContent='Preencha capital, relação e quantidade com valores maiores que zero.';return;}
      const reconstructed=quantity*ratio;
      const tolerance=Math.max(1e-7,amount*1e-5);
      if(Math.abs(reconstructed-amount)>tolerance){msg.textContent=`Atenção: ${quantity} × ${ratio} = ${reconstructed.toLocaleString('pt-BR')} ${arb.anchor}, diferente do capital informado (${amount.toLocaleString('pt-BR')} ${arb.anchor}).`;return;}
      msg.textContent=`Cadastro validado. ${quantity.toLocaleString('en-US',{maximumFractionDigits:8})} do ativo representa aproximadamente ${amount.toLocaleString('pt-BR')} ${arb.anchor}. Ainda não gravado.`;
    });
    return true;
  }

  function init() {
    const grid=document.querySelector('#arbitragesView .grid');
    if(!grid)return false;
    ensureStyle();
    if(!document.getElementById(PANEL_ID)) grid.appendChild(document.createRange().createContextualFragment(panelMarkup()).firstElementChild);
    makeModal();
    bind();
    const ctx=portalContext();
    const context=document.getElementById('tradesContext');
    if(context)context.textContent=ctx.arbitrageName?`Acompanhamento de ${ctx.arbitrageName}`:`Acompanhamento de ${currentArbitrage().name}`;
    return true;
  }

  function wait(n=120){if(init())return;if(n>0)setTimeout(()=>wait(n-1),100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>wait(),{once:true});else wait();
})();
