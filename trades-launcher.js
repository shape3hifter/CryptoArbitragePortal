/*
 * Trades launcher compatibility shim.
 *
 * The Trades UI is owned exclusively by trades-ui.js. This file is intentionally
 * non-invasive: older versions of the portal used this file to redefine
 * window.openTradeVisualForm / closeTradeVisualForm / updateTradeVisualForm,
 * which could overwrite the real implementation and break the Trades UI.
 */
(() => {
  'use strict';
})();
