(() => {
  'use strict';

  const PANEL_IDS = ['openTrades', 'closedTrades'];
  let refreshTimer = null;
  let dedupeTimer = null;
  let observed = false;
  let changeBound = false;

  function scheduleDedupe() {
    clearTimeout(dedupeTimer);
    dedupeTimer = setTimeout(dedupeTrades, 0);
  }

  function dedupeTrades() {
    const seen = new Set();
    let removed = 0;

    for (const panelId of PANEL_IDS) {
      const panel = document.getElementById(panelId);
      if (!panel) continue;

      for (const row of panel.querySelectorAll('.trade-mini')) {
        const title = row.querySelector('.trade-title')?.textContent?.trim() || '';
        const meta = row.querySelector('.trade-meta')?.textContent?.trim() || '';
        const key = `${panelId}|${title}|${meta}`;
        if (seen.has(key)) {
          row.remove();
          removed += 1;
        } else {
          seen.add(key);
        }
      }
    }

    if (removed && window.console) {
      console.warn(`[Trades guard] ${removed} registro(s) duplicado(s) removido(s) da tela.`);
    }
  }

  function refreshTradesForArbitrageChange() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      try {
        if (typeof window.refreshTradePanel === 'function') {
          window.refreshTradePanel();
        }
      } catch (error) {
        console.warn('[Trades guard] Falha ao atualizar trades após troca de arbitragem.', error);
      }
      scheduleDedupe();
    }, 75);
  }

  function observeTradePanels() {
    if (observed) return;
    const targets = PANEL_IDS.map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;

    const observer = new MutationObserver(scheduleDedupe);
    targets.forEach(target => observer.observe(target, { childList: true, subtree: true }));
    observed = true;
    scheduleDedupe();
  }

  function bindArbitrageChange() {
    if (changeBound) return;
    const select = document.getElementById('arbitrageSelect');
    if (!select) return;

    select.addEventListener('change', refreshTradesForArbitrageChange);
    changeBound = true;
  }

  function init() {
    bindArbitrageChange();
    observeTradePanels();

    // The portal can create/recreate the Trades panel during startup.
    // Re-check briefly without introducing a permanent polling loop.
    let attempts = 0;
    const retry = () => {
      bindArbitrageChange();
      observeTradePanels();
      if (attempts++ < 20 && (!changeBound || !observed)) setTimeout(retry, 250);
    };
    retry();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
