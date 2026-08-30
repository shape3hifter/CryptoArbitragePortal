(() => {
  'use strict';

  const ARBS = {
    'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', anchor: 'SOL', assets: ['BONK', 'WIF'] },
  };

  function currentArbitrage() {
    const select = document.getElementById('arbitrageSelect');
    const text = String(select?.selectedOptions?.[0]?.textContent || '').trim();
    const normalized = text.replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, ' ');
    if (ARBS[normalized]) return { ...ARBS[normalized], name: normalized };
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
    const entryBox = document.getElementById('tradeVisualEntryDerived');
    const exitBox = document.getElementById('tradeVisualExitDerived');
    if (entryBox) entryBox.innerHTML = `Preço efetivo de entrada: <strong>${entry == null ? '—' : `${fmt(entry)} ${arb.anchor}/${initialAsset}`}</strong>`;
    if (exitBox) exitBox.innerHTML = `Preço efetivo de saída: <strong>${exit == null ? '—' : `${fmt(exit)} ${arb.anchor}/${initialAsset}`}</strong>`;
  }

  function fillForm() {
    const arb = currentArbitrage();
    const aSel = document.getElementById('tradeVisualArbitrage');
    const strategy = document.getElementById('tradeVisualStrategy');
    if (aSel) aSel.innerHTML = `<option value="${arb.id}">${arb.name}</option>`;
    if (strategy) strategy.innerHTML = strategyOptions(arb).map(s => `<option value="${s}">${s}</option>`).join('');
    setNow('tradeVisualOpenedAt');
    document.getElementById('tradeVisualClosedAt').value = '';
    document.getElementById('tradeVisualAnchorAmount').value = '';
    document.getElementById('tradeVisualQuantity').value = '';
    document.getElementById('tradeVisualExitAmount').value = '';
    document.getElementById('tradeVisualMessage').textContent = '';
    document.getElementById('tradeVisualResult').classList.add('hidden');
    updateDerivedFields();
  }

  function openModal() {
    fillForm();
    const modal = document.getElementById('tradeVisualModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const modal = document.getElementById('tradeVisualModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function bind() {
    const button = document.getElementById('newTradeBtn');
    const modal = document.getElementById('tradeVisualModal');
    if (!button || !modal || button.dataset.bound === 'true') return false;

    button.addEventListener('click', openModal);
    button.dataset.bound = 'true';
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
      result.innerHTML = `<strong>Trade aberto validado</strong><br>${fmt(anchorAmount)} ${arb.anchor} → ${fmt(quantity)} ${initialAsset}<br>Preço efetivo de entrada: <strong>${fmt(entryPrice)} ${arb.anchor}/${initialAsset}</strong>`;
      result.classList.remove('hidden');
      msg.textContent = 'Validação concluída. Ainda não gravado no PostgreSQL.';
    });
    modal.dataset.bound = 'true';
    return true;
  }

  function refreshContext() {
    const arb = currentArbitrage();
    const context = document.getElementById('tradesContext');
    if (context) context.textContent = arb.name ? `Acompanhamento de ${arb.name}` : 'Acompanhamento da arbitragem selecionada';
  }

  function init() {
    if (!document.getElementById('tradesPanel') || !document.getElementById('tradeVisualModal')) return false;
    refreshContext();
    return bind();
  }

  function wait(n = 150) {
    if (init()) return;
    if (n > 0) setTimeout(() => wait(n - 1), 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => wait(), { once: true });
  else wait();
})();
