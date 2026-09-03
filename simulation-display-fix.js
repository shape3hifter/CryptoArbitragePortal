/*
 * Simulation display compatibility layer.
 *
 * IMPORTANT: this file must never install a broad MutationObserver. The
 * simulation UI itself changes DOM text while rendering quotes; observing
 * characterData/childList here can create a self-triggering loop and peg the
 * browser CPU. trades-ui.js is the owner of simulation state and labels.
 */
(() => {
  'use strict';

  function injectStyles() {
    if (document.getElementById('tradeSimulationStyles')) return;
    const style = document.createElement('style');
    style.id = 'tradeSimulationStyles';
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
      #tradeSimModal .trade-sim-profit + .trade-sim-meta{font-size:16px!important;font-weight:700!important;margin-top:9px!important}
      #tradeSimModal .trade-sim-result:has(.trade-sim-profit.good) .trade-sim-profit + .trade-sim-meta{color:var(--good,#68d391)!important}
      #tradeSimModal .trade-sim-result:has(.trade-sim-profit.bad) .trade-sim-profit + .trade-sim-meta{color:var(--bad,#ff7d7d)!important}
      #tradeSimModal .trade-sim-actions{display:flex!important;justify-content:flex-end!important;gap:8px!important;flex-wrap:wrap!important;margin-top:14px!important}
      @media(max-width:600px){#tradeSimModal .trade-sim-grid{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles, { once: true });
  } else {
    injectStyles();
  }
})();
