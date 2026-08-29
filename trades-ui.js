(() => {
  'use strict';

  const PANEL_ID = 'tradesPanel';
  const MODAL_ID = 'tradeVisualModal';

  function currentArbitrage() {
    const select = document.getElementById('arbitrageSelect');
    const text = String(select?.selectedOptions?.[0]?.textContent || '').trim();
    const normalized = text.replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, ' ');

    const known = {
      'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', name: 'ADA / NIGHT / SNEK', anchor: 'ADA', comps: ['NIGHT', 'SNEK'] },
      'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', name: 'SOL / BONK / WIF', anchor: 'SOL', comps: ['BONK', 'WIF'] }
    };
    if (known[normalized]) return known[normalized];

    const parts = normalized.split(/[\/|]/).map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { id: String(select?.value || 'current'), name: normalized, anchor: parts[0], comps: parts.slice(1) };
    }

    return { id: String(select?.value || 'current'), name: normalized || 'Arbitragem selecionada', anchor: 'ADA', comps: ['NIGHT', 'SNEK'] };
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
      .trade-dialog{position:relative;width:min(680px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
      .trade-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .trade-entry-hint{margin-top:10px;font-size:11px;line-height:1.5;color:var(--muted);background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:9px}
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
      <div class="trade-empty">Nenhum trade aberto nesta arbitragem.</div>
      <div class="trades-subtitle">FECHADOS</div>
      <div class="trade-empty">Nenhum trade fechado nesta arbitragem.</div>`;
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
          <div class="trade-entry-hint">Nesta etapa, o formulário apenas valida o cadastro visualmente; ainda não grava no PostgreSQL.</div>
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
    aSel.innerHTML = `<option value="${arb.id}">${arb.name}</option>`;
    strategy.innerHTML = arb.comps.map(c => `<option>${arb.anchor} → ${c} → ${arb.anchor}</option>`).join('');
    if (arb.comps.length >= 2) strategy.insertAdjacentHTML('beforeend', `<option>${arb.comps[0]} → ${arb.comps[1]} → ${arb.anchor}</option>`);
    asset.innerHTML = arb.comps.map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('tradeVisualAnchorLabel').textContent = `Capital inicial (${arb.anchor})`;
    document.getElementById('tradeVisualRatioLabel').textContent = `Relação de entrada: 1 ativo = ${arb.anchor}`;
    const d = new Date(), p = n => String(n).padStart(2, '0');
    document.getElementById('tradeVisualOpenedAt').value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    document.getElementById('tradeVisualMessage').textContent = '';
  }

  function bind() {
    const button = document.getElementById('newTradeBtn');
    const modal = document.getElementById(MODAL_ID);
    if (!button || !modal) return;
    if (!button.dataset.bound) {
      button.addEventListener('click', () => {
        fillForm();
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
      });
      button.dataset.bound = 'true';
    }
    if (!modal.dataset.bound) {
      modal.querySelectorAll('[data-close-trade-modal="true"]').forEach(b => b.addEventListener('click', () => {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
      }));
      modal.dataset.bound = 'true';
    }
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
