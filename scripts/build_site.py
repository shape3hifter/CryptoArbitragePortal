#!/usr/bin/env python3
"""Build the deployable static site.

The source index.html remains the stable portal UI. This build creates dist/,
adds the persistent Trades module, and exposes a small bridge from the existing
portal calculation state to trades.js without moving price data out of data.csv.
"""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SOURCE_INDEX = ROOT / "index.html"
TRADES_JS = ROOT / "trades.js"
SUPABASE_CONFIG = ROOT / "supabase" / "config.js"

PANEL = r'''
    <section class="card trades-card" id="tradesPanel">
      <div class="section-head">
        <div><h2>Trades</h2><div class="note" id="tradesContext">Acompanhamento da arbitragem selecionada</div></div>
        <button class="btn primary" id="newTradeBtn" type="button">+ Novo trade</button>
      </div>
      <div id="tradeAuth" class="trades-auth"></div>
      <div id="tradesContent"><div id="openTrades"></div><div id="closedTrades" class="trades-closed"></div></div>
    </section>
'''

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
</script>
<script src="supabase/config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="trades.js"></script>
'''

STYLE = r'''
<style id="trades-style">
.trades-card{height:100%;min-height:100%}.trades-auth{margin-bottom:10px;padding:9px 10px;border:1px solid var(--border);border-radius:12px;background:var(--panel2)}
.trade-auth-line{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.trade-mini{background:var(--panel2);border:1px solid var(--border);border-radius:14px;padding:11px;margin-top:8px}.trade-mini-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.trade-title{font-weight:700}.trade-meta{font-size:11px;color:var(--muted);margin-top:3px}.trade-main{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.trade-k{font-size:10px;color:var(--muted)}.trade-v{font-size:14px;font-weight:700;margin-top:2px}.trade-result-good{color:var(--good)}.trade-result-bad{color:var(--bad)}.trade-result-neutral{color:var(--warn)}.trade-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.trade-actions .btn{font-size:11px;padding:7px 9px}.trade-status{font-size:10px;padding:4px 7px;border-radius:999px;border:1px solid var(--border);font-weight:700}.trade-status.open{color:var(--good);background:rgba(104,211,145,.09)}.trade-status.closed{color:var(--muted)}.trades-closed{margin-top:12px}.trades-subtitle{font-size:11px;color:var(--muted);font-weight:700;margin:8px 0 4px}.trade-empty{padding:15px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px}.trade-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px}.trade-modal.hidden{display:none}.trade-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.62)}.trade-dialog{position:relative;width:min(680px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45)}.trade-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.trade-form-grid .field:last-child{grid-column:1/-1}.auth-grid{grid-template-columns:1fr}.auth-grid .field:last-child{grid-column:auto}.trade-entry-hint{margin-top:10px;font-size:11px;line-height:1.5;color:var(--muted);background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:9px}.trade-sim{margin-top:9px;padding:9px;border:1px solid rgba(122,162,255,.25);background:rgba(122,162,255,.06);border-radius:12px;font-size:11px}.trade-sim strong{font-size:13px}@media(max-width:900px){.trade-form-grid{grid-template-columns:1fr}.trade-form-grid .field:last-child{grid-column:auto}.trade-main{grid-template-columns:1fr}}
</style>
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
    marker = "  </div>\n\n  <div class=\"section metrics\" id=\"metrics\"></div>"
    if "id=\"tradesPanel\"" not in html:
        if marker not in html:
            raise SystemExit("Não encontrei o ponto de inserção do painel Trades")
        html = html.replace(marker, PANEL + marker, 1)

    # Keep the original portal script intact. Add the bridge and Trades scripts
    # immediately before </body>, rather than replacing the main script's
    # closing tag (which would make the page's primary JavaScript invalid).
    if "window.CryptoPortalBridge" not in html:
        html = html.replace("</body>", BRIDGE + "</body>", 1)
    if 'id="trades-style"' not in html:
        html = html.replace("</style>\n</head>", STYLE + "\n</head>", 1)

    # Patch the main portal so trade calculations can refresh on portal renders.
    needle = "  $('lastInfo').textContent=`${settings.lookback}D · exibindo os 12 últimos registros disponíveis por ativo`;\n}"
    replacement = "  $('lastInfo').textContent=`${settings.lookback}D · exibindo os 12 últimos registros disponíveis por ativo`;\n  window.dispatchEvent(new Event('cryptoPortalChanged'));\n}"
    if "cryptoPortalChanged" not in html and needle in html:
        html = html.replace(needle, replacement, 1)

    (DIST / "index.html").write_text(html, encoding="utf-8")
    shutil.copy2(TRADES_JS, DIST / "trades.js")
    (DIST / "supabase").mkdir()
    shutil.copy2(SUPABASE_CONFIG, DIST / "supabase" / "config.js")

    print(f"Built deployable site in {DIST}")


if __name__ == "__main__":
    build()
