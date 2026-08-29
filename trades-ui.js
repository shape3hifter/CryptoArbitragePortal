(() => {
  'use strict';

  function initTradesUI() {
    const newTradeBtn = document.getElementById('newTradeBtn');
    const panel = document.getElementById('tradesPanel');
    if (!newTradeBtn || !panel || document.getElementById('tradeVisualModal')) return;

    const modal = document.createElement('div');
    modal.id = 'tradeVisualModal';
    modal.className = 'trade-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="trade-modal-backdrop" data-close-trade-modal="true"></div>
      <div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="tradeVisualTitle">
        <div class="section-head">
          <div>
            <h2 id="tradeVisualTitle">Novo trade</h2>
            <div class="note">Cadastro do trade · etapa de interface</div>
          </div>
          <button class="btn" type="button" data-close-trade-modal="true">Fechar</button>
        </div>
        <form id="tradeVisualForm">
          <div class="trade-form-grid">
            <div class="field">
              <label for="tradeVisualArbitrage">Arbitragem</label>
              <select id="tradeVisualArbitrage" required></select>
            </div>
            <div class="field">
              <label for="tradeVisualStrategy">Estratégia</label>
              <select id="tradeVisualStrategy" required></select>
            </div>
            <div class="field">
              <label for="tradeVisualOpenedAt">Entrada</label>
              <input id="tradeVisualOpenedAt" type="datetime-local" required>
            </div>
            <div class="field">
              <label for="tradeVisualAnchorAmount">Capital inicial</label>
              <input id="tradeVisualAnchorAmount" type="number" min="0" step="any" required>
            </div>
            <div class="field">
              <label for="tradeVisualAsset">Ativo inicialmente adquirido</label>
              <select id="tradeVisualAsset" required></select>
            </div>
            <div class="field">
              <label for="tradeVisualQuantity">Quantidade adquirida</label>
              <input id="tradeVisualQuantity" type="number" min="0" step="any" required>
            </div>
            <div class="field">
              <label for="tradeVisualRatio">Relação de entrada: 1 ativo = Anchor</label>
              <input id="tradeVisualRatio" type="number" min="0" step="any" required>
            </div>
            <div class="field">
              <label for="tradeVisualNotes">Observação</label>
              <input id="tradeVisualNotes" placeholder="Opcional">
            </div>
          </div>
          <div class="trade-entry-hint">
            A posição e a relação da entrada serão preservadas. Nesta etapa, o botão apenas valida e apresenta o cadastro; ainda não grava no PostgreSQL.
          </div>
          <div class="actions">
            <button class="btn primary" type="submit">Validar cadastro</button>
            <button class="btn" type="button" data-close-trade-modal="true">Cancelar</button>
          </div>
          <div id="tradeVisualMessage" class="note" style="margin-top:10px"></div>
        </form>
      </div>`;

    document.body.appendChild(modal);

    function pad(value) { return String(value).padStart(2, '0'); }
    function nowLocal() {
      const d = new Date();
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function portalContext() {
      return window.CryptoPortalBridge?.getContext?.() || null;
    }

    function selectedArbitrages() {
      const ctx = portalContext();
      if (Array.isArray(ctx?.arbitrages) && ctx.arbitrages.length) return ctx.arbitrages;
      const select = document.getElementById('arbitrageSelect');
      const option = select?.selectedOptions?.[0];
      const anchor = ctx?.anchor || document.getElementById('anchor')?.value || 'ADA';
      const comps = ctx?.comps || [];
      return [{
        id: select?.value || 'current',
        name: option?.textContent || `${anchor} / ${comps.join(' / ')}`,
        anchor,
        comps
      }];
    }

    function fillForm() {
      const list = selectedArbitrages();
      const arbSelect = document.getElementById('tradeVisualArbitrage');
      arbSelect.innerHTML = list.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      const currentId = portalContext()?.arbitrageId;
      if (currentId && list.some(a => a.id === currentId)) arbSelect.value = currentId;
      updateForArbitrage();
      document.getElementById('tradeVisualOpenedAt').value = nowLocal();
      document.getElementById('tradeVisualMessage').textContent = '';
    }

    function updateForArbitrage() {
      const list = selectedArbitrages();
      const selectedId = document.getElementById('tradeVisualArbitrage').value;
      const arb = list.find(a => a.id === selectedId) || list[0];
      if (!arb) return;
      const anchor = arb.anchor || 'ADA';
      const comps = Array.isArray(arb.comps) ? arb.comps : [];
      const strategies = [];
      comps.forEach(asset => strategies.push(`${anchor} → ${asset} → ${anchor}`));
      if (comps.length >= 2) strategies.push(`${comps[0]} → ${comps[1]} → ${anchor}`);

      const strategy = document.getElementById('tradeVisualStrategy');
      strategy.innerHTML = [...new Set(strategies)].map(s => `<option>${s}</option>`).join('');

      const asset = document.getElementById('tradeVisualAsset');
      asset.innerHTML = comps.map(s => `<option value="${s}">${s}</option>`).join('');
      const label = document.querySelector('label[for="tradeVisualAnchorAmount"]');
      const ratioLabel = document.querySelector('label[for="tradeVisualRatio"]');
      if (label) label.textContent = `Capital inicial (${anchor})`;
      if (ratioLabel) ratioLabel.textContent = `Relação de entrada: 1 ativo = ${anchor}`;
    }

    function openModal() {
      fillForm();
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }

    newTradeBtn.addEventListener('click', openModal);
    document.getElementById('tradeVisualArbitrage').addEventListener('change', updateForArbitrage);
    modal.querySelectorAll('[data-close-trade-modal="true"]').forEach(button => button.addEventListener('click', closeModal));
    document.getElementById('tradeVisualForm').addEventListener('submit', event => {
      event.preventDefault();
      const ctx = portalContext();
      const anchor = ctx?.anchor || document.getElementById('anchor')?.value || 'ADA';
      const amount = Number(document.getElementById('tradeVisualAnchorAmount').value);
      const ratio = Number(document.getElementById('tradeVisualRatio').value);
      const quantity = Number(document.getElementById('tradeVisualQuantity').value);
      const message = document.getElementById('tradeVisualMessage');
      if (!(amount > 0) || !(ratio > 0) || !(quantity > 0)) {
        message.textContent = 'Preencha capital, relação e quantidade com valores maiores que zero.';
        return;
      }
      const reconstructed = quantity * ratio;
      const delta = Math.abs(reconstructed - amount);
      const tolerance = Math.max(0.0000001, amount * 0.00001);
      if (delta > tolerance) {
        message.textContent = `Atenção: ${quantity} × ${ratio} = ${reconstructed.toLocaleString('pt-BR')} ${anchor}, diferente do capital informado (${amount.toLocaleString('pt-BR')} ${anchor}).`;
        return;
      }
      message.textContent = `Cadastro validado. ${quantity.toLocaleString('en-US', { maximumFractionDigits: 8 })} do ativo representa aproximadamente ${amount.toLocaleString('pt-BR')} ${anchor}. Ainda não gravado.`;
    });

    window.addEventListener('crypto-portal-arbitrage-changed', updateForArbitrage);
  }

  function waitForPanel(attempts = 100) {
    if (document.getElementById('tradesPanel')) {
      initTradesUI();
      return;
    }
    if (attempts <= 0) return;
    setTimeout(() => waitForPanel(attempts - 1), 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitForPanel(), { once: true });
  } else {
    waitForPanel();
  }
})();
