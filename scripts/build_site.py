#!/usr/bin/env python3
"""Build the deployable static site."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SOURCE_INDEX = ROOT / "index.html"
TRADES_JS = ROOT / "trades.js"
SUPABASE_CONFIG = ROOT / "supabase" / "config.js"

BRIDGE = r'''
<script>
window.CryptoPortalBridge = {
  getContext: () => ({
    arbitrageId: activeArbitrageId,
    arbitrageName: activeArbitrage()?.name || '',
    anchor: settings.anchor,
    fiat: settings.fiat,
    comps: [...settings.comps],
    arbitrages: arbitrages.map(a => ({id:a.id,name:a.name,anchor:a.anchor,comps:[...(a.comparativesDefault||[])]}))
  }),
  getLiveSnapshot: () => temporarySnapshot ? {
    rawTime: temporarySnapshot.rawTime,
    dt: temporarySnapshot.dt,
    fiat: temporarySnapshot.fiat,
    prices: {...temporarySnapshot.prices}
  } : null
};
window.openModal = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
};
window.closeModal = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
};
</script>
<script src="supabase/config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
(function bootTrades(){
  function load(){
    const grid = document.querySelector('#arbitragesView .grid');
    if (!grid) { setTimeout(load, 100); return; }
    if (document.querySelector('script[data-trades-module]')) return;
    const s = document.createElement('script');
    s.src = 'trades.js';
    s.dataset.tradesModule = 'true';
    document.body.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once:true});
  else load();
})();
</script>
'''


def build() -> None:
    if not SOURCE_INDEX.exists():
        raise SystemExit("index.html não encontrado")
    if not TRADES_JS.exists():
        raise SystemExit("trades.js não encontrado")
    if not SUPABASE_CONFIG.exists():
        raise SystemExit("supabase/config.js não encontrado")

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    for name in ["data.csv", "capture-log.json", "config.json"]:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, DIST / name)
    for path in ROOT.glob("favicon*"):
        if path.is_file():
            shutil.copy2(path, DIST / path.name)

    html = SOURCE_INDEX.read_text(encoding="utf-8")

    # Load the Trades module only after the main portal has rendered its
    # arbitrage grid. This avoids racing the portal's asynchronous startup.
    html = html.replace("</body>", BRIDGE + "</body>", 1)

    (DIST / "index.html").write_text(html, encoding="utf-8")
    shutil.copy2(TRADES_JS, DIST / "trades.js")
    (DIST / "supabase").mkdir()
    shutil.copy2(SUPABASE_CONFIG, DIST / "supabase" / "config.js")

    print(f"Built deployable site in {DIST}")


if __name__ == "__main__":
    build()
