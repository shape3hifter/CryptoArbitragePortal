#!/usr/bin/env python3
"""Build the deployable static site.

The existing portal remains the source of truth. The Trades markup is inserted
at build time in a deterministic location, while trades-ui.js only binds
behavior to the already-rendered elements. This avoids runtime DOM races.
"""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SOURCE_INDEX = ROOT / "index.html"
TRADES_UI_JS = ROOT / "trades-ui.js"
SUPABASE_CONFIG = ROOT / "supabase" / "config.js"

TRADES_MARKUP = r'''
<section class="card trades-card" id="tradesPanel">
  <div class="section-head">
    <div><h2>Trades</h2><div class="note" id="tradesContext">Acompanhamento da arbitragem selecionada</div></div>
    <button class="btn primary" id="newTradeBtn" type="button">+ Novo trade</button>
  </div>
  <div class="trades-subtitle">ABERTOS</div>
  <div class="trade-empty" id="tradesOpenEmpty">Nenhum trade aberto nesta arbitragem.</div>
  <div class="trades-subtitle">FECHADOS</div>
  <div class="trade-empty" id="tradesClosedEmpty">Nenhum trade fechado nesta arbitragem.</div>
</section>

<div id="tradeVisualModal" class="trade-modal hidden" aria-hidden="true">
  <div class="trade-modal-backdrop" data-close-trade-modal="true"></div>
  <div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="tradeVisualTitle">
    <div class="section-head">
      <div><h2 id="tradeVisualTitle">Novo trade</h2><div class="note">Registro da operação real</div></div>
      <button class="btn" type="button" data-close-trade-modal="true">Fechar</button>
    </div>
    <form id="tradeVisualForm">
      <div class="trade-form-grid">
        <div class="field"><label for="tradeVisualArbitrage">Arbitragem</label><select id="tradeVisualArbitrage" required></select></div>
        <div class="field"><label for="tradeVisualStrategy">Estratégia</label><select id="tradeVisualStrategy" required></select></div>
        <div class="field"><label for="tradeVisualOpenedAt">Entrada</label><input id="tradeVisualOpenedAt" type="datetime-local" required></div>
        <div class="field"><label id="tradeVisualAnchorLabel" for="tradeVisualAnchorAmount">Quantidade utilizada (ADA)</label><input id="tradeVisualAnchorAmount" type="number" min="0" step="any" required></div>
        <div class="field"><label>Ativo inicial da posição</label><div class="trade-readonly"><input id="tradeVisualInitialAsset" type="text" readonly></div></div>
        <div class="field"><label id="tradeVisualQuantityLabel" for="tradeVisualQuantity">Quantidade recebida</label><input id="tradeVisualQuantity" type="number" min="0" step="any" required></div>
      </div>
      <div class="trade-derived" id="tradeVisualEntryDerived">Preço efetivo de entrada: <strong>—</strong></div>
      <div class="trade-section">
        <div class="section-head"><div><h2>Saída</h2><div class="note">Fechamento padrão = 100% da posição</div></div></div>
        <div class="trade-form-grid">
          <div class="field"><label for="tradeVisualClosedAt">Data/hora de saída</label><input id="tradeVisualClosedAt" type="datetime-local"></div>
          <div class="field"><label id="tradeVisualExitAmountLabel" for="tradeVisualExitAmount">Quantidade recebida na âncora (ADA)</label><input id="tradeVisualExitAmount" type="number" min="0" step="any" placeholder="Preencher ao fechar"></div>
        </div>
        <div class="trade-derived" id="tradeVisualExitDerived">Preço efetivo de saída: <strong>—</strong></div>
      </div>
      <div class="trade-help">Entrada e saída usam os valores efetivamente executados. Taxas, slippage e variações ficam incorporados nos valores informados. “Cotação Agora” será usada apenas para simular o fechamento de um trade aberto; ela não altera o trade real.</div>
      <div id="tradeVisualResult" class="trade-result hidden"></div>
      <div class="actions"><button class="btn primary" type="submit">Validar trade</button><button class="btn" type="button" data-close-trade-modal="true">Cancelar</button></div>
      <div id="tradeVisualMessage" class="note" style="margin-top:10px"></div>
    </form>
  </div>
</div>

<style id="trades-ui-style">
  .trades-card{height:100%;min-height:100%}
  .trades-subtitle{font-size:11px;color:var(--muted);font-weight:700;margin:10px 0 4px}
  .trade-empty{padding:14px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px}
  .trade-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px}
  .trade-modal.hidden{display:none}
  .trade-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.62)}
  .trade-dialog{position:relative;width:min(760px,100%);max-height:92vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
  .trade-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .trade-section{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
  .trade-derived{margin-top:10px;background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px;font-size:12px;color:var(--muted)}
  .trade-derived strong{color:var(--text)}
  .trade-help{margin-top:10px;font-size:11px;line-height:1.5;color:var(--muted);background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px}
  .trade-result{margin-top:10px;padding:10px;border-radius:12px;border:1px solid var(--border);background:rgba(104,211,145,.05);font-size:12px;line-height:1.5}
  .trade-readonly input{opacity:.85}
  @media(max-width:700px){.trade-form-grid{grid-template-columns:1fr}}
</style>

<script src="trades-ui.js" defer></script>
'''


def build() -> None:
    if not SOURCE_INDEX.exists():
        raise SystemExit("index.html não encontrado")
    if not TRADES_UI_JS.exists():
        raise SystemExit("trades-ui.js não encontrado")
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

    shutil.copy2(TRADES_UI_JS, DIST / "trades-ui.js")
    (DIST / "supabase").mkdir()
    shutil.copy2(SUPABASE_CONFIG, DIST / "supabase" / "config.js")

    html = SOURCE_INDEX.read_text(encoding="utf-8")
    marker = '</div>\n\n  <div class="section metrics" id="metrics"></div>'
    if marker in html and 'id="tradesPanel"' not in html:
        html = html.replace(marker, '</div>\n\n  ' + TRADES_MARKUP + '\n\n  <div class="section metrics" id="metrics"></div>', 1)
    elif 'id="tradesPanel"' not in html:
        html = html.replace('</body>', TRADES_MARKUP + '\n</body>', 1)
    else:
        raise SystemExit("index.html já contém tradesPanel; remova o duplicado antes do build")
    (DIST / "index.html").write_text(html, encoding="utf-8")

    print(f"Built deployable site in {DIST}")


if __name__ == "__main__":
    build()
