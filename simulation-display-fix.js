(() => {
  'use strict';

  function parsePtBrNumber(text) {
    const raw = String(text || '').replace(/[^0-9,.-]/g, '');
    if (!raw) return NaN;
    return Number(raw.replace(/\./g, '').replace(',', '.'));
  }

  function fixCurrentRatio(root = document) {
    const modal = root.querySelector?.('#tradeSimulationModal');
    if (!modal || modal.classList.contains('hidden')) return;

    const cards = [...modal.querySelectorAll('.trade-sim-card')];
    const values = {};
    let relationCard = null;

    for (const card of cards) {
      const k = card.querySelector('.k')?.textContent?.trim() || '';
      const v = card.querySelector('.v');
      if (!v) continue;
      if (k.endsWith('agora')) {
        const symbol = k.replace(/\s+agora$/, '').trim().toUpperCase();
        values[symbol] = parsePtBrNumber(v.textContent);
      }
      if (k === 'Relação atual') relationCard = card;
    }

    if (!relationCard) return;

    const subtitle = modal.querySelector('#tradeSimSubtitle')?.textContent || '';
    const m = subtitle.match(/^([^·]+)·/);
    if (!m) return;
    const strategy = m[1].trim();
    const parts = strategy.split('→').map(x => x.trim()).filter(Boolean);
    if (parts.length < 3) return;
    const anchor = parts[0].toUpperCase();
    const asset = parts[1].toUpperCase();

    const assetPrice = values[asset];
    const anchorPrice = values[anchor];
    if (!(assetPrice > 0) || !(anchorPrice > 0)) return;

    const currentRatio = assetPrice / anchorPrice;
    const formatted = `${currentRatio.toLocaleString('pt-BR', { maximumFractionDigits: 10 })} ${anchor}/${asset}`;
    const value = relationCard.querySelector('.v');
    if (value && value.textContent !== formatted) value.textContent = formatted;

    const k = relationCard.querySelector('.k');
    if (k) k.textContent = 'Relação atual';
  }

  const observer = new MutationObserver(() => fixCurrentRatio());
  const start = () => {
    fixCurrentRatio();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
