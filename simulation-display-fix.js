(() => {
  'use strict';

  function injectStyles() {
    let style = document.getElementById('tradeSimulationStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tradeSimulationStyles';
      document.head.appendChild(style);
    }
    style.textContent = `
      #tradeSimModal.trade-sim-modal{position:fixed!important;inset:0!important;z-index:99999!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:20px!important;box-sizing:border-box!important}
      #tradeSimModal.trade-sim-modal.hidden{display:none!important}
      #tradeSimModal .trade-sim-backdrop{position:absolute!important;inset:0!important;background:rgba(3,7,18,.72)!important}
      #tradeSimModal .trade-sim-dialog{position:relative!important;width:min(720px,calc(100vw - 40px))!important;max-height:90vh!important;overflow:auto!important;background:var(--panel,#111a2e)!important;border:1px solid var(--border,#2b3a5c)!important;border-radius:18px!important;padding:18px!important;box-shadow:0 20px 70px rgba(0,0,0,.45)!important;box-sizing:border-box!important;color:var(--text,#fff)!important}
      #tradeSimModal .trade-sim-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;margin-top:12px!important}
      #tradeSimModal .trade-sim-card{background:var(--panel2,#18243e)!important;border:1px solid var(--border,#2b3a5c)!important;border-radius:12px!important;padding:12px!important}
      #tradeSimModal .trade-sim-card .k{font-size:11px!important;color:var(--muted,#9aa8c2)!important}
      #tradeSimModal .trade-sim-card .v{font-size:18px!important;font-weight:700!important;margin-top:4px!important}
      #tradeSimModal .trade-sim-result{margin-top:14px!important;border:1px solid var(--border,#2b3a5c)!important;border-radius:14px!important;padding:14px!important;background:rgba(122,162,255,.06)!important}
      #tradeSimModal .trade-sim-profit{font-size:28px!important;font-weight:800!important;margin-top:4px!important}
      #tradeSimModal .trade-sim-meta{font-size:12px!important;color:var(--muted,#9aa8c2)!important;margin-top:6px!important;line-height:1.45!important}
      #tradeSimModal .trade-sim-actions{display:flex!important;justify-content:flex-end!important;gap:8px!important;flex-wrap:wrap!important;margin-top:14px!important}
      @media(max-width:600px){#tradeSimModal .trade-sim-grid{grid-template-columns:1fr!important}}
    `;
  }

  function parsePtBrNumber(text) {
    const raw = String(text || '').replace(/[^0-9,.-]/g, '');
    if (!raw) return NaN;
    return Number(raw.replace(/\./g, '').replace(',', '.'));
  }

  function fixTradeLabels(root = document) {
    root.querySelectorAll?.('.trade-row [data-action="close"]').forEach(btn => {
      btn.textContent = 'Fechar trade';
    });

    const modal = root.querySelector?.('#tradeVisualModal');
    if (!modal || modal.classList.contains('hidden')) return;
    const title = modal.querySelector('h2');
    if (!title) return;
    const tradeId = String(modal.dataset.tradeId || '');
    const message = modal.querySelector('#tradeVisualMessage')?.textContent || '';
    if (!tradeId) title.textContent = 'Novo trade';
    else if (message.includes('fechar 100% da posição')) title.textContent = 'Fechar trade';
    else title.textContent = 'Editar';
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
    const parts = m[1].trim().split('→').map(x => x.trim()).filter(Boolean);
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
  }

  function fixAll() {
    injectStyles();
    fixTradeLabels();
    fixCurrentRatio();
  }

  const observer = new MutationObserver(() => fixAll());
  const start = () => {
    fixAll();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class','data-trade-id'] });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
