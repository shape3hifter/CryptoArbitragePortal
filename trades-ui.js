(() => {
  'use strict';

  const PANEL_ID = 'tradesPanel';
  const MODAL_ID = 'tradeVisualModal';

  function portalContext() {
    return window.CryptoPortalBridge?.getContext?.() || {};
  }

  function parseCurrentArbitrage() {
    const ctx = portalContext();
    let name = String(ctx.arbitrageName || '').trim();
    const select = document.getElementById('arbitrageSelect');
    const option = select?.selectedOptions?.[0];
    if (!name) name = String(option?.textContent || '').trim();

    let anchor = String(ctx.anchor || '').trim();
    let comps = Array.isArray(ctx.comps) ? ctx.comps.filter(Boolean).map(String) : [];

    if ((!anchor || !comps.length) && name) {
      const parts = name.split('/').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        anchor = anchor || parts[0];
        if (!comps.length) comps = parts.slice(1);
      }
    }

    anchor = anchor || document.getElementById('anchor')?.value || 'ADA';
    if (!comps.length) {
      const labels = [...document.querySelectorAll('#compareChecks label')]
        .map(label => label.textContent.trim())
        .filter(Boolean);
      comps = labels.filter(x => x !== anchor).slice(0, 5);
    }

    return {
      id: String(ctx.arbitrageId || select?.value || 'current'),
      name: name || `${anchor} / ${comps.join(' / ')}`,
      anchor,
      comps
    };
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

  function panelMarkup() {
    return `
      <section class="card trades-card" id="${PANEL_ID}">
        <div class="section-head">
          <div><h2>Trades</h2><div class="note" id="tradesContext">Acompanhamento da arbitragem selecionada</div></div>
          <button class="btn primary" id="newTradeBtn" type="button">+ Novo trade</button>
        </div>
        <div class="trade-empty" id="tradesOpenEmpty">Nenhum trade aberto nesta arbitragem.</div>
        <div class="trades-subtitle">FECHADOS</div>
        <div class="trade-empty" id="tradesClosedEmpty">Nenhum trade fechado nesta arbitragem.</div>
      </section>`;
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
            <div class="field"><label id="tradeVisualAnchorLabel" for="tradeVisualAnchorAmount">Capital inicial</label><input id="tradeVisualAnchorAmount" type="number" min="0" step="any" required></div>
            <div class="field"><label for="tradeVisualAsset">Ativo inicialmente adquirido</label><select id="tradeVisualAsset" required></select></div>
            <div class="field"><label for="tradeVisualQuantity">Quantidade adquirida</label><input id="tradeVisualQuantity" type="number" min="0" step="any" required></div>
            <div class="field"><label id="tradeVisualRatioLabel" for="tradeVisualRatio">Relação de entrada</label><input id="tradeVisualRatio" type="number" min="0" step="any" required></div>
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
    const arb = parseCurrentArbitrage();
    const aSel = document.getElementById('tradeVisualArbitrage');
    aSel.innerHTML = `<option value="${arb.id}">${arb.name}</option>`;
    updateFields(arb);
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    document.getElementById('tradeVisualOpenedAt').value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    document.getElementById('tradeVisualMessage').textContent = '';
  }

  function updateFields(arb = parseCurrentArbitrage()) {
    const anchor = arb.anchor || 'ADA';
    const comps = arb.comps || [];
    const strategies = comps.map(c => `${anchor} → ${c} → ${anchor}`);
    if (comps.length >= 2) strategies.push(`${comps[0]} → ${comps[1]} → ${anchor}`);
    const strategy = document.getElementById('tradeVisualStrategy');
    const asset = document.getElementById('tradeVisualAsset');
    if (strategy) strategy.innerHTML = [...new Set(strategies)].map(s => `<option>${s}</option>`).join('');
    if (asset) asset.innerHTML = comps.map(c => `<option value="${c}">${c}</option>`).join('');
    const label = document.getElementById('tradeVisualAnchorLabel');
    const ratioLabel = document.getElementById('tradeVisualRatioLabel');
    if (label) label.textContent = `Capital inicial (${anchor})`;
    if (ratioLabel) ratioLabel.textContent = `Relação de entrada: 1 ativo = ${anchor}`;
  }

  function openModal() {
    fillForm();
    const modal = document.getElementById(MODAL_ID);
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function bindEvents() {
    const button = document.getElementById('newTradeBtn');
    if (button && !button.dataset.bound) {
      button.addEventListener('click', openModal);
      button.dataset.bound = 'true';
    }
    const modal = document.getElementById(MODAL_ID);
    if (!modal || modal.dataset.bound) return;
    modal.querySelectorAll('[data-close-trade-modal="true"]').forEach(b => b.addEventListener('click', closeModal));
    document.getElementById('tradeVisualArbitrage')?.addEventListener('change', () => updateFields());
    document.getElementById('tradeVisualForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const anchor = parseCurrentArbitrage().anchor || 'ADA';
      const amount = Number(document.getElementById('tradeVisualAnchorAmount').value);
      const ratio = Number(document.getElementById('tradeVisualRatio').value);
      const quantity = Number(document.getElementById('tradeVisualQuantity').value);
      const msg = document.getElementById('tradeVisualMessage');
      if (!(amount > 0) || !(ratio > 0) || !(quantity > 0)) {
        msg.textContent = 'Preencha capital, relação e quantidade com valores maiores que zero.';
        return;
      }
      const reconstructed = quantity * ratio;
      const tolerance = Math.max(0.0000001, amount * 0.00001);
      if (Math.abs(reconstructed - amount) > tolerance) {
        msg.textContent = `Atenção: ${quantity} × ${ratio} = ${reconstructed.toLocaleString('pt-BR')} ${anchor}, diferente do capital informado (${amount.toLocaleString('pt-BR')} ${anchor}).`;
        return;
      }
      msg.textContent = `Cadastro validado. ${quantity.toLocaleString('en-US', {maximumFractionDigits:8})} do ativo representa aproximadamente ${amount.toLocaleString('pt-BR')} ${anchor}. Ainda não gravado.`;
    });
    modal.dataset.bound = 'true';
  }

  function init() {
    const grid = document.querySelector('#arbitragesView .grid');
    if (!grid) return false;
    ensureStyle();
    if (!document.getElementById(PANEL_ID)) grid.appendChild(document.createRange().createContextualFragment(panelMarkup()).firstElementChild);
    makeModal();
    bindEvents();
    const arb = parseCurrentArbitrage();
    const ctx = document.getElementById('tradesContext');
    if (ctx) ctx.textContent = arb.name ? `Acompanhamento de ${arb.name}` : 'Acompanhamento da arbitragem selecionada';
    return true;
  }

  function wait(n = 150) {
    if (init()) return;
    if (n > 0) setTimeout(() => wait(n - 1), 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => wait(), {once:true});
  else wait();
})();
