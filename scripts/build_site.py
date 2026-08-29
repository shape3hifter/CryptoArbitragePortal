#!/usr/bin/env python3
"""Build the deployable static site.

The source index.html remains the stable portal UI. This build creates dist/,
adds the persistent Trades module through trades.js, and exposes a small bridge
from the existing portal calculation state to trades.js without moving price
data out of data.csv.
"""
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
<script src="trades.js"></script>
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

    # Trades is rendered entirely by trades.js. Keeping the panel and modal
    # markup in one place ensures the controls are bound to the same DOM.
    if "window.CryptoPortalBridge" not in html:
        html = html.replace("</body>", BRIDGE + "</body>", 1)

    (DIST / "index.html").write_text(html, encoding="utf-8")
    shutil.copy2(TRADES_JS, DIST / "trades.js")
    (DIST / "supabase").mkdir()
    shutil.copy2(SUPABASE_CONFIG, DIST / "supabase" / "config.js")

    print(f"Built deployable site in {DIST}")


if __name__ == "__main__":
    build()
