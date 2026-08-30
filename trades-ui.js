(() => {
  'use strict';

  const CONFIG = {
    'ADA / NIGHT / SNEK': { id: 'arb-ada-night-snek', anchor: 'ADA', assets: ['NIGHT', 'SNEK'] },
    'SOL / BONK / WIF': { id: 'arb-sol-bonk-wif', anchor: 'SOL', assets: ['BONK', 'WIF'] },
  };
  const $ = id => document.getElementById(id);
  const fmt = n => Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 8 }) : '—';

  function getArbitrage() {
    const select = $('arbitrageSelect');
    const name = String(select?.selectedOptions?.[0]?.textContent || '').trim().replace(/\s+/g, ' ');
    if (CONFIG[name]) return { ...CONFIG[name], name };
    const parts = name.split('/').map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) return { id: String(select?.value || 'current'), name, anchor: parts[0], assets: parts.slice(1, 3) };
    return { ...CONFIG['ADA / NIGHT / SNEK'], name: 'ADA / NIGHT / SNEK' };
  }

  function strategies(a) {
    const [x, y] = a.assets;
    return [`${a.anchor} → ${x} → ${a.anchor}`, `${a.anchor} → ${y} → ${a.anchor}`, `${x} → ${y} → ${a.anchor}`, `${y} → ${x} → ${a.anchor}`];
  }

  function initialAsset(strategy, a) {
    const [x, y] = a.assets;
    const s = strategies(a);
    return strategy === s[0] ? x : strategy === s[1] ? y : strategy === s[2] ? y : x;
  }

  function refreshForm() {
    const a = getArbitrage();
    const arSel = $('tradeVisualArbitrage');
    const stSel = $('tradeVisualStrategy');
    if (!arSel || !stSel) return false;
    arSel.innerHTML = `<option value="${a.id}">${a.name}</option>`;
    const list = strategies(a);
    stSel.innerHTML = list.map(s => `<option value="${s}">${s}</option>`).join('');
    stSel.value = list[0];
    const d = new Date(), p = n => String(n).padStart(2, '0');
    if ($('tradeVisualOpenedAt')) $('tradeVisualOpenedAt').value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    if ($('tradeVisualClosedAt')) $('tradeVisualClosedAt').value = '';
    if ($('tradeVisualAnchorAmount')) $('tradeVisualAnchorAmount').value = '';
    if ($('tradeVisualQuantity')) $('tradeVisualQuantity').value = '';
    if ($('tradeVisualExitAmount')) $('tradeVisualExitAmount').value = '';
    if ($('tradeVisualMessage')) $('tradeVisualMessage').textContent = '';
    if ($('tradeVisualResult')) $('tradeVisualResult').classList.add('hidden');
    updateFormFields();
    return true;
  }

  function updateFormFields() {
    const a = getArbitrage();
    const s = $('tradeVisualStrategy')?.value || strategies(a)[0];
    const asset = initialAsset(s, a);
    const cap = Number($('tradeVisualAnchorAmount')?.value);
    const qty = Number($('tradeVisualQuantity')?.value);
    const out = Number($('tradeVisualExitAmount')?.value);
    if ($('tradeVisualInitialAsset')) $('tradeVisualInitialAsset').value = asset;
    if ($('tradeVisualAnchorLabel')) $('tradeVisualAnchorLabel').textContent = `Quantidade utilizada (${a.anchor})`;
    if ($('tradeVisualQuantityLabel')) $('tradeVisualQuantityLabel').textContent = `Quantidade recebida (${asset})`;
    if ($('tradeVisualExitAmountLabel')) $('tradeVisualExitAmountLabel').textContent = `Quantidade recebida na âncora (${a.anchor})`;
    if ($('tradeVisualEntryDerived')) $('tradeVisualEntryDerived').innerHTML = `Preço efetivo de entrada: <strong>${cap > 0 && qty > 0 ? `${fmt(cap / qty)} ${a.anchor}/${asset}` : '—'}</strong>`;
    if ($('tradeVisualExitDerived')) $('tradeVisualExitDerived').innerHTML = `Preço efetivo de saída: <strong>${out > 0 && qty > 0 ? `${fmt(out / qty)} ${a.anchor}/${asset}` : '—'}</strong>`;
  }

  window.updateTradeVisualForm = updateFormFields;

  window.openTradeVisualForm = function () {
    if (!refreshForm()) return false;
    const modal = $('tradeVisualModal');
    if (!modal) return false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    return false;
  };

  window.closeTradeVisualForm = function () {
    const modal = $('tradeVisualModal');
    if (!modal) return false;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    return false;
  };

  window.validateTradeVisualForm = function (event) {
    if (event) event.preventDefault();
    const a = getArbitrage();
    const strategy = $('tradeVisualStrategy')?.value || strategies(a)[0];
    const asset = initialAsset(strategy, a);
    const opened = $('tradeVisualOpenedAt')?.value || '';
    const closed = $('tradeVisualClosedAt')?.value || '';
    const cap = Number($('tradeVisualAnchorAmount')?.value);
    const qty = Number($('tradeVisualQuantity')?.value);
    const out = Number($('tradeVisualExitAmount')?.value);
    const msg = $('tradeVisualMessage'), result = $('tradeVisualResult');
    if (!(cap > 0) || !(qty > 0)) {
      if (msg) msg.textContent = `Preencha a quantidade utilizada em ${a.anchor} e a quantidade recebida em ${asset}.`;
      return false;
    }
    if (closed || out > 0) {
      if (!closed || !(out > 0)) { if (msg) msg.textContent = 'Para fechar, informe a data/hora de saída e a quantidade recebida na âncora.'; return false; }
      if (new Date(closed) < new Date(opened)) { if (msg) msg.textContent = 'A saída não pode ser anterior à entrada.'; return false; }
      const profit = out - cap, ret = profit / cap, hours = (new Date(closed) - new Date(opened)) / 36e5;
      result.innerHTML = `<strong>Trade fechado validado</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset} → ${fmt(out)} ${a.anchor}<br>Resultado: <strong>${fmt(profit)} ${a.anchor}</strong> (${(ret * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%) · Duração: ${hours.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`;
    } else {
      result.innerHTML = `<strong>Trade aberto validado</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset}<br>Preço efetivo de entrada: <strong>${fmt(cap / qty)} ${a.anchor}/${asset}</strong>`;
    }
    result.classList.remove('hidden');
    if (msg) msg.textContent = 'Validação concluída. Ainda não gravado no PostgreSQL.';
    return false;
  };

  // Keep the module alive even if the portal replaces parts of the DOM.
  document.addEventListener('change', event => {
    if (event.target?.id === 'tradeVisualStrategy') updateFormFields();
  });
})();
