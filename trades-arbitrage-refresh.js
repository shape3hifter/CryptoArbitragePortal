(() => {
  'use strict';

  // Keep the Trades panel synchronized with the arbitration selector.
  // The main page updates the analytical view on this change, but the Trades
  // module lives independently and must be explicitly refreshed afterwards.
  let refreshTimer = null;

  document.addEventListener('change', event => {
    if (event.target?.id !== 'arbitrageSelect') return;
    if (refreshTimer) clearTimeout(refreshTimer);

    // Let the page's own change handler finish updating activeArbitrageId,
    // settings and the rendered selector before querying Supabase again.
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      if (typeof window.refreshTrades !== 'function') return;
      try {
        await window.refreshTrades();
      } catch (error) {
        console.error('Trades refresh after arbitration change failed:', error);
      }
    }, 0);
  }, true);
})();
