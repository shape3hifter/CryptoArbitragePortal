(() => {
  'use strict';

  const ARBS = {
    'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', anchor: 'SOL', assets: ['BONK', 'WIF'] },
  };

  const $ = id => document.getElementById(id);

  function getArb() {
    const select = $('arbitrageSelect');
    const text = String(select?.selectedOptions?.[0]?.textContent || '').trim().replace(/\s+/g, ' ');
    if (ARBS[text]) return { ...ARBS[text], name: text };
    const parts = text.split('/').map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) return { id: String(select?.value || 'current'), name: text, anchor: parts[0], assets: parts.slice(1, 3) };
    return { ...ARBS['ADA / NIGHT / SNEK'], name: 'ADA / NIGHT / SNEK' };
  }

  function strategies(arb) {
    const [a, b] = arb.assets;
    return [
      `${arb.anchor} → ${a} → ${arb.anchor}`,
      `${arb.anchor} → ${b} → ${arb.anchor}`,
      `${a} → ${b} → ${arb.anchor}`,
      `${b} → ${a} → ${arb.anchor}`,
    ];
  }

  function initialAsset(strategy, arb) {
    const [a, b] = arb.assets;
    const list = strategies(arb);
    if (strategy === list[0]) return a;
    if (strategy === list[1]) return b;
    if (strategy === list[2]) return b;
    return a;
  }

  function localDate() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function populate() {
    const arb = getArb();
    const arbField = $('tradeVisualArbitrage');
    const strategyField = $('tradeVisualStrategy');
    if (arbField) arbField.innerHTML = `<option value="${arb.id}" selected>${arb.name}</option>`;
    if (strategyField) strategyField.innerHTML = strategies(arb).map(s => `<option value="${s}">${s}</option>`).join('');
    if ($('tradeVisualOpenedAt')) $('tradeVisualOpenedAt').value = localDate();
    if ($('tradeVisualClosedAt')) $('tradeVisualClosedAt').value = '';
    if ($('tradeVisualAnchorAmount')) $('tradeVisualAnchorAmount').value = '';
    if ($('tradeVisualQuantity')) $('tradeVisualQuantity').value = '';
    if ($('tradeVisualExitAmount')) $('tradeVisualExitAmount').value = '';
    if ($('tradeVisualMessage')) $('tradeVisualMessage').textContent = '';
    if ($('tradeVisualResult')) $('tradeVisualResult').classList.add('hidden');
    refresh();
  }

  function refresh() {
    const arb = getArb();
    const strategy = $('tradeVisualStrategy')?.value || strategies(arb)[0];
    const asset = initialAsset(strategy, arb);
    if ($('tradeVisualInitialAsset')) $('tradeVisualInitialAsset').value = asset;
    if ($('tradeVisualAnchorLabel')) $('tradeVisualAnchorLabel').textContent = `Quantidade utilizada (${arb.anchor})`;
    if ($('tradeVisualQuantityLabel')) $('tradeVisualQuantityLabel').textContent = `Quantidade recebida (${asset})`;
    if ($('tradeVisualExitAmountLabel')) $('tradeVisualExitAmountLabel').textContent = `Quantidade recebida na âncora (${arb.anchor})`;
    const cap = Number($('tradeVisualAnchorAmount')?.value);
    const qty = Number($('tradeVisualQuantity')?.value);
    const out = Number($('tradeVisualExitAmount')?.value);
    const fmt = n => Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 8 }) : '—';
    if ($('tradeVisualEntryDerived')) $('tradeVisualEntryDerived').innerHTML = `Preço efetivo de entrada: <strong>${cap > 0 && qty > 0 ? `${fmt(cap / qty)} ${arb.anchor}/${asset}` : '—'}</strong>`;
    if ($('tradeVisualExitDerived')) $('tradeVisualExitDerived').innerHTML = `Preço efetivo de saída: <strong>${out > 0 && qty > 0 ? `${fmt(out / qty)} ${arb.anchor}/${asset}` : '—'}</strong>`;
  }

  function open() {
    const modal = $('tradeVisualModal');
    if (!modal) return;
    populate();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function close() {
    const modal = $('tradeVisualModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  window.openTradeVisualForm = open;
  window.closeTradeVisualForm = close;
  window.updateTradeVisualForm = refresh;

  function init() {
    const button = $('newTradeBtn');
    if (button) button.onclick = open;
    const strategy = $('tradeVisualStrategy');
    if (strategy) strategy.onchange = refresh;
    const form = $('tradeVisualForm');
    if (form) form.addEventListener('input', refresh);
    document.addEventListener('click', e => {
      if (e.target.closest?.('[data-close-trade-modal="true"]')) close();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
