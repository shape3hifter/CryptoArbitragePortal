#!/usr/bin/env python3
"""Build the deployable static site.

Keep the existing portal JavaScript untouched while introducing the Trades
panel as a purely visual, isolated component. No Supabase or trade logic is
loaded in this step.
"""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SOURCE_INDEX = ROOT / "index.html"

TRADES_VISUAL = r'''
<style id="trades-visual-style">
.trades-visual-card{height:100%;min-height:100%;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px}
.trades-visual-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px}
.trades-visual-title{font-size:18px;font-weight:750;margin:0}.trades-visual-context{font-size:12px;color:var(--muted);margin-top:3px}
.trades-visual-add{background:var(--accent);color:#09101f;border:1px solid var(--accent);padding:9px 12px;border-radius:10px;font-weight:700;cursor:default}
.trades-visual-section{font-size:11px;letter-spacing:.08em;color:var(--muted);font-weight:800;margin:10px 0 7px}
.trades-visual-empty{padding:16px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px;font-size:12px}
.trades-visual-card.closed-preview{margin-top:10px;padding:11px;background:var(--panel2);border:1px solid var(--border);border-radius:12px}
.trades-visual-row{display:flex;justify-content:space-between;gap:10px;align-items:center}.trades-visual-name{font-weight:700;font-size:13px}.trades-visual-meta{font-size:11px;color:var(--muted);margin-top:2px}.trades-visual-result{font-weight:800;font-size:12px}.trades-visual-good{color:var(--good)}.trades-visual-muted{color:var(--muted)}
.trades-visual-footer{font-size:11px;color:var(--muted);margin-top:11px;padding-top:10px;border-top:1px solid var(--border)}
@media(max-width:900px){.trades-visual-card{min-height:auto}}
</style>
<script>
(function addTradesVisual(){
  function mount(){
    const grid=document.querySelector('#arbitragesView .grid');
    if(!grid || document.getElementById('tradesVisualCard')) return false;
    const card=document.createElement('section');
    card.className='trades-visual-card';
    card.id='tradesVisualCard';
    card.innerHTML=`
      <div class="trades-visual-head">
        <div>
          <h2 class="trades-visual-title">Trades</h2>
          <div class="trades-visual-context" id="tradesVisualContext">Acompanhamento da arbitragem selecionada</div>
        </div>
        <button class="trades-visual-add" type="button">+ Novo trade</button>
      </div>
      <div class="trades-visual-section">ABERTOS</div>
      <div class="trades-visual-empty">Nenhum trade aberto nesta arbitragem.</div>
      <div class="trades-visual-section">FECHADOS</div>
      <div class="closed-preview">
        <div class="trades-visual-row">
          <div><div class="trades-visual-name">Exemplo · ADA → SNEK → ADA</div><div class="trades-visual-meta">somente visual nesta etapa</div></div>
          <div class="trades-visual-result trades-visual-good">+8,32%</div>
        </div>
      </div>
      <div class="trades-visual-footer">Nesta etapa o painel é apenas visual. Cadastro, banco e simulação entram na próxima etapa.</div>`;

    const first=grid.firstElementChild;
    if(first && first.nextElementSibling) grid.insertBefore(card,first.nextElementSibling);
    else grid.appendChild(card);

    const context=document.getElementById('tradesVisualContext');
    function syncContext(){
      try{
        const select=document.getElementById('arbitrageSelect');
        const label=select?.selectedOptions?.[0]?.textContent?.trim();
        if(context && label) context.textContent=`Acompanhamento de ${label}`;
      }catch(e){}
    }
    syncContext();
    document.getElementById('arbitrageSelect')?.addEventListener('change',()=>setTimeout(syncContext,0));
    return true;
  }

  function wait(){
    if(mount()) return;
    setTimeout(wait,100);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wait,{once:true});
  else wait();
})();
</script>
'''


def build() -> None:
    if not SOURCE_INDEX.exists():
        raise SystemExit("index.html não encontrado")

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

    html = SOURCE_INDEX.read_text(encoding="utf-8")
    html = html.replace("</body>", TRADES_VISUAL + "</body>", 1)
    (DIST / "index.html").write_text(html, encoding="utf-8")

    print(f"Built deployable site in {DIST}")


if __name__ == "__main__":
    build()
