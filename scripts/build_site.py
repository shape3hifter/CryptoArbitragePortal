#!/usr/bin/env python3
"""Build the deployable static site.

The existing portal remains the source of truth. The Trades authentication
module is loaded as an isolated enhancement after the page has rendered, so a
failure in that module cannot prevent the core portal from starting.
"""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SOURCE_INDEX = ROOT / "index.html"
TRADES_AUTH_JS = ROOT / "trades-auth.js"
SUPABASE_CONFIG = ROOT / "supabase" / "config.js"

INJECT = r'''
<script>
(function loadTradesAuth(){
  function load(){
    if (!document.getElementById('tradesPanel')) return;
    if (document.querySelector('script[data-trades-auth]')) return;
    const s = document.createElement('script');
    s.src = 'trades-auth.js';
    s.defer = true;
    s.dataset.tradesAuth = 'true';
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
    if not TRADES_AUTH_JS.exists():
        raise SystemExit("trades-auth.js não encontrado")
    if not SUPABASE_CONFIG.exists():
        raise SystemExit("supabase/config.js não encontrado")

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    for name in ["index.html", "data.csv", "capture-log.json", "config.json"]:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, DIST / name)

    for path in ROOT.glob("favicon*"):
        if path.is_file():
            shutil.copy2(path, DIST / path.name)

    shutil.copy2(TRADES_AUTH_JS, DIST / "trades-auth.js")
    (DIST / "supabase").mkdir()
    shutil.copy2(SUPABASE_CONFIG, DIST / "supabase" / "config.js")

    html = SOURCE_INDEX.read_text(encoding="utf-8")
    if "data-trades-auth" not in html:
        html = html.replace("</body>", INJECT + "</body>", 1)
    (DIST / "index.html").write_text(html, encoding="utf-8")

    print(f"Built deployable site in {DIST}")


if __name__ == "__main__":
    build()
