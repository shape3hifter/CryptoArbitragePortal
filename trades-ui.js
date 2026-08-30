(() => {
  'use strict';

  const ARBS = {
    'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', anchor: 'SOL', assets: ['BONK', 'WIF'] },
  };

  const $ = id => document.getElementById(id);

  function currentArbitrage() {
    const select = $('arbitrageSelect');
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

  function updateDerivedFields() {
    const arb = currentArbitrage();
    const strategy = $('tradeVisualStrategy')?.value || strategyOptions(arb)[0];
    const initialAsset = initialAssetFor(strategy, arb);
    const anchorAmount = Number($('tradeVisualAnchorAmount')?.value);
    const quantity = Number($('tradeVisualQuantity')?.value);
    const exitAmount = Number($('tradeVisualExitAmount')?.value);

    if ($('tradeVisualInitialAsset')) $('tradeVisualInitialAsset').value = initialAsset;
    if ($('tradeVisualAnchorLabel')) $('tradeVisualAnchorLabel').textContent = `Quantidade utilizada (${arb.anchor})`;
    if ($('tradeVisualQuantityLabel')) $('tradeVisualQuantityLabel').textContent = `Quantidade recebida (${initialAsset})`;
    if ($('tradeVisualExitAmountLabel')) $('tradeVisualExitAmountLabel').textContent = `Quantidade recebida na âncora (${arb.anchor})`;

    const entry = anchorAmount > 0 && quantity > 0 ? anchorAmount / quantity : null;
    const exit = exitAmount > 0 && quantity > 0 ? exitAmount / quantity : null;
    if ($('tradeVisualEntryDerived')) $('tradeVisualEntryDerived').innerHTML = `Preço efetivo de entrada: <strong>${entry == null ? '—' : `${fmt(entry)} ${arb.anchor}/${initialAsset}`}</strong>`;
    if ($('tradeVisualExitDerived')) $('tradeVisualExitDerived').innerHTML = `Preço efetivo de saída: <strong>${exit == null ? '—' : `${fmt(exit)} ${arb.anchor}/${initialAsset}`}</strong>`;
  }

  function setNow(id) {
    const input = $(id);
    if (!input) return;
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    input.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function fillForm() {
    const arb = currentArbitrage();
    const aSel = $('tradeVisualArbitrage');
    const strategy = $('tradeVisualStrategy');
    if (aSel) aSel.innerHTML = `<option value="${arb.id}">${arb.name}</option>`;
    if (strategy) strategy.innerHTML = strategyOptions(arb).map(s => `<option value="${s}">${s}</option>`).join('');
    setNow('tradeVisualOpenedAt');
    if ($('tradeVisualClosedAt')) $('tradeVisualClosedAt').value = '';
    if ($('tradeVisualAnchorAmount')) $('tradeVisualAnchorAmount').value = '';
    if ($('tradeVisualQuantity')) $('tradeVisualQuantity').value = '';
    if ($('tradeVisualExitAmount')) $('tradeVisualExitAmount').value = '';
    if ($('tradeVisualMessage')) $('tradeVisualMessage').textContent = '';
    if ($('tradeVisualResult')) $('tradeVisualResult').classList.add('hidden');
    updateDerivedFields();
  }

  function openModal() {
    fillForm();
    const modal = $('tradeVisualModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const modal = $('tradeVisualModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function validateTrade(form) {
    const arb = currentArbitrage();
    const strategy = $('tradeVisualStrategy')?.value || strategyOptions(arb)[0];
    const initialAsset = initialAssetFor(strategy, arb);
    const openedAt = $('tradeVisualOpenedAt')?.value || '';
    const closedAt = $('tradeVisualClosedAt')?.value || '';
    const anchorAmount = Number($('tradeVisualAnchorAmount')?.value);
    const quantity = Number($('tradeVisualQuantity')?.value);
    const exitAmount = Number($('tradeVisualExitAmount')?.value);
    const msg = $('tradeVisualMessage');
    const result = $('tradeVisualResult');

    if (!(anchorAmount > 0) || !(quantity > 0)) {
      if (msg) msg.textContent = `Preencha a quantidade utilizada em ${arb.anchor} e a quantidade recebida em ${initialAsset}.`;
      return;
    }

    if (closedAt || exitAmount > 0) {
      if (!closedAt || !(exitAmount > 0)) {
        if (msg) msg.textContent = 'Para um trade fechado, informe a data/hora de saída e a quantidade recebida na âncora.';
        return;
      }
      if (new Date(closedAt) < new Date(openedAt)) {
        if (msg) msg.textContent = 'A saída não pode ser anterior à entrada.';
        return;
      }
      const entryPrice = anchorAmount / quantity;
      const exitPrice = exitAmount / quantity;
      const profit = exitAmount - anchorAmount;
      const ret = profit / anchorAmount;
      const durationHours = (new Date(closedAt) - new Date(openedAt)) / 36e5;
      if (result) {
        result.innerHTML = `<strong>Trade fechado validado</strong><br>${fmt(anchorAmount)} ${arb.anchor} → ${fmt(quantity)} ${initialAsset} → ${fmt(exitAmount)} ${arb.anchor}<br>Resultado: <strong>${fmt(profit)} ${arb.anchor}</strong> (${(ret * 100).toLocaleString('pt-BR', {maximumFractionDigits: 4)}%) · Duração: ${durationHours.toLocaleString('pt-BR', {maximumFractionDigits: 2})} h<br>Preço efetivo: entrada ${fmt(entryPrice)} → saída ${fmt(exitPrice)} ${arb.anchor}/${initialAsset}`;
        result.classList.remove('hidden');
      }
      if (msg) msg.textContent = 'Validação concluída. Ainda não gravado no PostgreSQL.';
      return;
    }

    const entryPrice = anchorAmount / quantity;
    if (result) {
      result.innerHTML = `<strong>Trade aberto validado</strong><br>${fmt(anchorAmount)} ${arb.anchor} → ${fmt(quantity)} ${initialAsset}<br>Preço efetivo de entrada: <strong>${fmt(entryPrice)} ${arb.anchor}/${initialAsset}</strong>`;
      result.classList.remove('hidden');
    }
    if (msg) msg.textContent = 'Validação concluída. Ainda não gravado no PostgreSQL.';
  }

  function bindDelegatedEvents() {
    if (document.documentElement.dataset.tradesDelegated === 'true') return;
    document.documentElement.dataset.tradesDelegated = 'true';

    document.addEventListener('click', event => {
      const newTrade = event.target.closest?.('#newTradeBtn');
      if (newTrade) {
        event.preventDefault();
        openModal();
        return;
      }
      const close = event.target.closest?.('[data-close-trade-modal="true"]');
      if (close) {
        event.preventDefault();
        closeModal();
      }
    });

    document.addEventListener('input', event => {
      if (event.target.closest?.('#tradeVisualForm')) updateDerivedFields();
    });
    document.addEventListener('change', event => {
      if (event.target.closest?.('#tradeVisualForm')) updateDerivedFields();
      if (event.target.closest?.('#arbitrageSelect')) {
        const context = $('tradesContext');
        const arb = currentArbitrage();
        if (context) context.textContent = `Acompanhamento de ${arb.name}`;
      }
    });

    document.addEventListener('submit', event => {
      if (event.target?.id === 'tradeVisualForm') {
        event.preventDefault();
        validateTrade(event.target);
      }
    });
  }

  function refreshContext() {
    const arb = currentArbitrage();
    const context = $('tradesContext');
    if (context) context.textContent = arb.name ? `Acompanhamento de ${arb.name}` : 'Acompanhamento da arbitragem selecionada';
  }

  function init() {
    if (!$('tradesPanel') || !$('tradeVisualModal')) return false;
    bindDelegatedEvents();
    refreshContext();
    return true;
  }

  function wait(n = 100) {
    if (init()) return;
    if (n > 0) setTimeout(() => wait(n - 1), 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => wait(), { once: true });
  else wait();
})();
