(() => {
  'use strict';

  function injectStyles() {
    if (document.getElementById('tradeSimulationStyles')) return;
    const style = document.createElement('style');
    style.id = 'tradeSimulationStyles';
    style.textContent = `
      .trade-sim-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
      .trade-sim-modal.hidden{display:none}
      .trade-sim-backdrop{position:absolute;inset:0;background:rgba(3,7,18,.72)}
      .trade-sim-dialog{position:relative;width:min(720px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px;box-shadow:0 20px 70px rgba(0,0,0,.45);box-sizing:border-box}
      .trade-sim-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .trade-sim-card{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:12px}
      .trade-sim-card .k{font-size:11px;color:var(--muted)}
      .trade-sim-card .v{font-size:18px;font-weight:700;margin-top:4px}
      .trade-sim-result{margin-top:14px;border:1px solid var(--border);border-radius:14px;padding:14px;background:rgba(122,162,255,.06)}
      .trade-sim-profit{font-size:28px;font-weight:800;margin-top:4px}
      .trade-sim-meta{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.45}
      .trade-sim-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}
      @media(max-width:600px){.trade-sim-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function parsePtBrNumber(text) {
    const raw = String(text || '').replace(/[^0-9,.-]/g, '');
    if (!raw) return NaN;
    return Number(raw.replace(/\./g, '').replace(',', '.'));
  }

  function fixCurrentRatio(root = document) {
    const modal = root.querySelector?.('#tradeSimModal');
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
    injectStyles();
    fixCurrentRatio();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
