(() => {
  'use strict';

  const PANEL_ID = 'tradesPanel';
  const MODAL_ID = 'tradeVisualModal';

  const ARBS = {
    'ADA / NIGHT / SNEK': { anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { anchor: 'SOL', assets: ['BONK', 'WIF'] },
  };

  function currentArbitrage() {
    const select = document.getElementById('arbitrageSelect');
    const text = String(select?.selectedOptions?.[0]?.textContent || '').trim();
    const normalized = text.replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, ' ');
    if (ARBS[normalized]) return { id: normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: normalized, ...ARBS[normalized] };
    const parts = normalized.split(/[\/|]/).map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) return { id: String(select?.value || 'current'), name: normalized, anchor: parts[0], assets: parts.slice(1) };
    return { id: String(select?.value || 'current'), name: normalized || 'Arbitragem selecionada', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] };
  }

  function strategyOptions(arb) {
    const [a, b] = arb.assets;
    return [
      `${arb.anchor} → ${a} → ${arb.anchor}`,
      `${arb.anchor} → ${b} → ${arb.anchor}`,
      `${a} → ${b} → ${arb.anchor}`,
      `${b} → ${a} → ${arb.anchor}`,
    ];
  }

  function initialAssetFor(strategy, arb) {
    const [a, b] = arb.assets;
    if (strategy === `${arb.anchor} → ${a} → ${arb.anchor}`) return a;
    if (strategy === `${arb.anchor} → ${b} → ${arb.anchor}`) return b;
    if (strategy === `${a} → ${b} → ${arb.anchor}`) return b;
    if (strategy === `${b} → ${a} → ${arb.anchor}`) return a;
    return a;
  }

  function fmt(n) {
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 8 }) : '—';
  }

  function setNow(id) {
    const input = document.getElementById(id);
    if (!input) return;
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    input.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function ensureStyles() {
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
      .trade-dialog{position:relative;width:min(760px,100%);max-height:92vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
      .trade-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .trade-section{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
      .trade-derived{margin-top:10px;background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px;font-size:12px;color:var(--muted)}
      .trade-derived strong{color:var(--text)}
      .trade-help{margin-top:10px;font-size:11px;line-height:1.5;color:var(--muted);background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px}
      .trade-result{margin-top:10px;padding:10px;border-radius:12px;border:1px solid var(--border);background:rgba(104,211,145,.05);font-size:12px;line-height:1.5}
      .trade-readonly input{opacity:.85}
      @media(max-width:700px){.trade-form-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function addPanel(grid) {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement('section');
    panel.className = 'card trades-card';
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="section-head">
        <div><h2>Trades</h2><div class="note" id="tradesContext">Acompanhamento da arbitragem selecionada</div></div>
        <button class="btn primary" id="newTradeBtn" type="button">+ Novo trade</button>
      </div>
      <div class="trades-subtitle">ABERTOS</div>
      <div class="trade-empty" id="tradesOpenEmpty">Nenhum trade aberto nesta arbitragem.</div>
      <div class="trades-subtitle">FECHADOS</div>
      <div class="trade-empty" id="tradesClosedEmpty">Nenhum trade fechado nesta arbitragem.</div>`;
    grid.appendChild(panel);
  }

  function addModal() {
    if (document.getElementById(MODAL_ID)) return;
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'trade-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="trade-modal-backdrop" data-close-trade-modal="true"></div>
      <div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="tradeVisualTitle">
        <div class="section-head">
          <div>
            <h2 id="tradeVisualTitle">Novo trade</h2>
            <div class="note">Registro da operação real</div>
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
              <label id="tradeVisualAnchorLabel" for="tradeVisualAnchorAmount">Quantidade utilizada (ADA)</label>
              <input id="tradeVisualAnchorAmount" type="number" min="0" step="any" required>
            </div>
            <div class="field">
              <label>Ativo inicial da posição</label>
              <div class="trade-readonly"><input id="tradeVisualInitialAsset" type="text" readonly></div>
            </div>
            <div class="field">
              <label id="tradeVisualQuantityLabel" for="tradeVisualQuantity">Quantidade recebida</label>
              <input id="tradeVisualQuantity" type="number" min="0" step="any" required>
            </div>
          </div>

          <div class="trade-derived" id="tradeVisualEntryDerived">Preço efetivo de entrada: <strong>—</strong></div>

          <div class="trade-section">
            <div class="section-head">
              <div><h2>Saída</h2><div class="note">Fechamento padrão = 100% da posição</div></div>
            </div>
            <div class="trade-form-grid">
              <div class="field">
                <label for="tradeVisualClosedAt">Data/hora de saída</label>
                <input id="tradeVisualClosedAt" type="datetime-local">
              </div>
              <div class="field">
                <label id="tradeVisualExitAmountLabel" for="tradeVisualExitAmount">Quantidade recebida na âncora (ADA)</label>
                <input id="tradeVisualExitAmount" type="number" min="0" step="any" placeholder="Preencher ao fechar">
              </div>
            </div>
            <div class="trade-derived" id="tradeVisualExitDerived">Preço efetivo de saída: <strong>—</strong></div>
          </div>

          <div class="trade-help">
            Entrada e saída usam os valores efetivamente executados. Taxas, slippage e variações ficam incorporados nos valores informados. “Cotação Agora” será usada apenas para simular o fechamento de um trade aberto; ela não altera o trade real.
          </div>

          <div id="tradeVisualResult" class="trade-result hidden"></div>

          <div class="actions">
            <button class="btn primary" type="submit">Validar trade</button>
            <button class="btn" type="button" data-close-trade-modal="true">Cancelar</button>
          </div>
          <div id="tradeVisualMessage" class="note" style="margin-top:10px"></div>
        </form>
      </div>`;
    document.body.appendChild(modal);
  }

  function fillForm() {
    const arb = currentArbitrage();
    const aSel = document.getElementById('tradeVisualArbitrage');
    const strategy = document.getElementById('tradeVisualStrategy');
    aSel.innerHTML = `<option value="${arb.id}">${arb.name}</option>`;
    strategy.innerHTML = strategyOptions(arb).map(s => `<option value="${s}">${s}</option>`).join('');
    updateDerivedFields();
    setNow('tradeVisualOpenedAt');
    document.getElementById('tradeVisualClosedAt').value = '';
    document.getElementById('tradeVisualAnchorAmount').value = '';
    document.getElementById('tradeVisualQuantity').value = '';
    document.getElementById('tradeVisualExitAmount').value = '';
    document.getElementById('tradeVisualMessage').textContent = '';
    document.getElementById('tradeVisualResult').classList.add('hidden');
    updateDerivedFields();
  }

  function updateDerivedFields() {
    const arb = currentArbitrage();
    const strategy = document.getElementById('tradeVisualStrategy')?.value || strategyOptions(arb)[0];
    const initialAsset = initialAssetFor(strategy, arb);
    const anchorAmount = Number(document.getElementById('tradeVisualAnchorAmount')?.value);
    const quantity = Number(document.getElementById('tradeVisualQuantity')?.value);
    const exitAmount = Number(document.getElementById('tradeVisualExitAmount')?.value);

    const initial = document.getElementById('tradeVisualInitialAsset');
    if (initial) initial.value = initialAsset;
    const anchorLabel = document.getElementById('tradeVisualAnchorLabel');
    const quantityLabel = document.getElementById('tradeVisualQuantityLabel');
    const exitLabel = document.getElementById('tradeVisualExitAmountLabel');
    if (anchorLabel) anchorLabel.textContent = `Quantidade utilizada (${arb.anchor})`;
    if (quantityLabel) quantityLabel.textContent = `Quantidade recebida (${initialAsset})`;
    if (exitLabel) exitLabel.textContent = `Quantidade recebida na âncora (${arb.anchor})`;

    const entry = anchorAmount > 0 && quantity > 0 ? anchorAmount / quantity : null;
    const exit = exitAmount > 0 && quantity > 0 ? exitAmount / quantity : null;
    document.getElementById('tradeVisualEntryDerived').innerHTML = `Preço efetivo de entrada: <strong>${entry == null ? '—' : `${fmt(entry)} ${arb.anchor}/${initialAsset}`}</strong>`;
    document.getElementById('tradeVisualExitDerived').innerHTML = `Preço efetivo de saída: <strong>${exit == null ? '—' : `${fmt(exit)} ${arb.anchor}/${initialAsset}`}</strong>`;
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

  function bind() {
    const button = document.getElementById('newTradeBtn');
    const modal = document.getElementById(MODAL_ID);
    if (!button || !modal) return;

    if (!button.dataset.bound) {
      button.addEventListener('click', openModal);
      button.dataset.bound = 'true';
    }

    if (modal.dataset.bound) return;
    modal.querySelectorAll('[data-close-trade-modal="true"]').forEach(b => b.addEventListener('click', closeModal));
    ['tradeVisualStrategy', 'tradeVisualAnchorAmount', 'tradeVisualQuantity', 'tradeVisualExitAmount'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateDerivedFields);
      document.getElementById(id)?.addEventListener('change', updateDerivedFields);
    });

    document.getElementById('tradeVisualForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const arb = currentArbitrage();
      const strategy = document.getElementById('tradeVisualStrategy').value;
      const initialAsset = initialAssetFor(strategy, arb);
      const openedAt = document.getElementById('tradeVisualOpenedAt').value;
      const closedAt = document.getElementById('tradeVisualClosedAt').value;
      const anchorAmount = Number(document.getElementById('tradeVisualAnchorAmount').value);
      const quantity = Number(document.getElementById('tradeVisualQuantity').value);
      const exitAmount = Number(document.getElementById('tradeVisualExitAmount').value);
      const msg = document.getElementById('tradeVisualMessage');
      const result = document.getElementById('tradeVisualResult');

      if (!(anchorAmount > 0) || !(quantity > 0)) {
        msg.textContent = `Preencha a quantidade utilizada em ${arb.anchor} e a quantidade recebida em ${initialAsset}.`;
        return;
      }
      if (closedAt || exitAmount > 0) {
        if (!closedAt || !(exitAmount > 0)) {
          msg.textContent = 'Para um trade fechado, informe a data/hora de saída e a quantidade recebida na âncora.';
          return;
        }
        if (new Date(closedAt) < new Date(openedAt)) {
          msg.textContent = 'A saída não pode ser anterior à entrada.';
          return;
        }
        const entryPrice = anchorAmount / quantity;
        const exitPrice = exitAmount / quantity;
        const profit = exitAmount - anchorAmount;
        const ret = profit / anchorAmount;
        const durationHours = (new Date(closedAt) - new Date(openedAt)) / 36e5;
        result.innerHTML = `<strong>Trade fechado validado</strong><br>${fmt(anchorAmount)} ${arb.anchor} → ${fmt(quantity)} ${initialAsset} → ${fmt(exitAmount)} ${arb.anchor}<br>Resultado: <strong>${fmt(profit)} ${arb.anchor}</strong> (${(ret * 100).toLocaleString('pt-BR', {maximumFractionDigits: 4)}%) · Duração: ${durationHours.toLocaleString('pt-BR', {maximumFractionDigits: 2})} h<br>Preço efetivo: entrada ${fmt(entryPrice)} → saída ${fmt(exitPrice)} ${arb.anchor}/${initialAsset}`;
        result.classList.remove('hidden');
        msg.textContent = 'Validação concluída. Ainda não gravado no PostgreSQL.';
        return;
      }

      const entryPrice = anchorAmount / quantity;
      result.innerHTML = `<strong>Trade aberto validado</strong><br>${fmt(anchorAmount)} ${arb.anchor} → ${fmt(quantity)} ${initialAsset}<br>Preço efetivo de entrada: ${fmt(entryPrice)} ${arb.anchor}/${initialAsset}`;
      result.classList.remove('hidden');
      msg.textContent = 'Validação concluída. Ainda não gravado no PostgreSQL.';
    });
    modal.dataset.bound = 'true';
  }

  function init() {
    const grid = document.querySelector('#arbitragesView .grid');
    if (!grid) return false;
    ensureStyles();
    addPanel(grid);
    addModal();
    bind();
    const arb = currentArbitrage();
    const context = document.getElementById('tradesContext');
    if (context) context.textContent = `Acompanhamento de ${arb.name}`;
    return true;
  }

  function wait(n=150) {
    if (init()) return;
    if (n > 0) setTimeout(() => wait(n-1), 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => wait(), { once: true });
  else wait();
})();
