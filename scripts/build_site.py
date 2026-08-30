#!/usr/bin/env python3
"""Build the deployable static site.

The existing portal remains the source of truth. The Trades markup is inserted
at build time inside the main arbitrage grid, while trades-ui.js provides the
full behavior. A small inline initializer is also embedded so the form can
populate itself even if the external module is cached or delayed.
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
    <button class="btn primary" id="newTradeBtn" type="button" onclick="window.openTradeVisualForm && window.openTradeVisualForm()">+ Novo trade</button>
  </div>
  <div class="trades-subtitle">ABERTOS</div>
  <div class="trade-empty" id="tradesOpenEmpty">Nenhum trade aberto nesta arbitragem.</div>
  <div class="trades-subtitle">FECHADOS</div>
  <div class="trade-empty" id="tradesClosedEmpty">Nenhum trade fechado nesta arbitragem.</div>
</section>

<div id="tradeVisualModal" class="trade-modal hidden" aria-hidden="true">
  <div class="trade-modal-backdrop" data-close-trade-modal="true" onclick="window.closeTradeVisualForm && window.closeTradeVisualForm()"></div>
  <div class="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="tradeVisualTitle">
    <div class="section-head">
      <div><h2 id="tradeVisualTitle">Novo trade</h2><div class="note">Registro da operação real</div></div>
      <button class="btn" type="button" data-close-trade-modal="true" onclick="window.closeTradeVisualForm && window.closeTradeVisualForm()">Fechar</button>
    </div>
    <form id="tradeVisualForm" onsubmit="return window.validateTradeVisualForm ? window.validateTradeVisualForm(event) : false;">
      <div class="trade-form-grid">
        <div class="field"><label for="tradeVisualArbitrage">Arbitragem</label><select id="tradeVisualArbitrage" required></select></div>
        <div class="field"><label for="tradeVisualStrategy">Estratégia</label><select id="tradeVisualStrategy" required onchange="window.updateTradeVisualForm && window.updateTradeVisualForm()"></select></div>
        <div class="field"><label for="tradeVisualOpenedAt">Entrada</label><input id="tradeVisualOpenedAt" type="datetime-local" required></div>
        <div class="field"><label id="tradeVisualAnchorLabel" for="tradeVisualAnchorAmount">Quantidade utilizada (ADA)</label><input id="tradeVisualAnchorAmount" type="number" min="0" step="any" required oninput="window.updateTradeVisualForm && window.updateTradeVisualForm()"></div>
        <div class="field"><label>Ativo inicial da posição</label><div class="trade-readonly"><input id="tradeVisualInitialAsset" type="text" readonly></div></div>
        <div class="field"><label id="tradeVisualQuantityLabel" for="tradeVisualQuantity">Quantidade recebida</label><input id="tradeVisualQuantity" type="number" min="0" step="any" required oninput="window.updateTradeVisualForm && window.updateTradeVisualForm()"></div>
      </div>
      <div class="trade-derived" id="tradeVisualEntryDerived">Preço efetivo de entrada: <strong>—</strong></div>
      <div class="trade-section">
        <div class="section-head"><div><h2>Saída</h2><div class="note">Fechamento padrão = 100% da posição</div></div></div>
        <div class="trade-form-grid">
          <div class="field"><label for="tradeVisualClosedAt">Data/hora de saída</label><input id="tradeVisualClosedAt" type="datetime-local"></div>
          <div class="field"><label id="tradeVisualExitAmountLabel" for="tradeVisualExitAmount">Quantidade recebida na âncora (ADA)</label><input id="tradeVisualExitAmount" type="number" min="0" step="any" placeholder="Preencher ao fechar" oninput="window.updateTradeVisualForm && window.updateTradeVisualForm()"></div>
        </div>
        <div class="trade-derived" id="tradeVisualExitDerived">Preço efetivo de saída: <strong>—</strong></div>
      </div>
      <div class="trade-help">Entrada e saída usam os valores efetivamente executados. Taxas, slippage e variações ficam incorporados nos valores informados. “Cotação Agora” será usada apenas para simular o fechamento de um trade aberto; ela não altera o trade real.</div>
      <div id="tradeVisualResult" class="trade-result hidden"></div>
      <div class="actions"><button class="btn primary" type="submit">Validar trade</button><button class="btn" type="button" data-close-trade-modal="true" onclick="window.closeTradeVisualForm && window.closeTradeVisualForm()">Cancelar</button></div>
      <div id="tradeVisualMessage" class="note" style="margin-top:10px"></div>
    </form>
  </div>
</div>

<style id="trades-ui-style">
  .trades-card{grid-column:2;grid-row:1;height:100%;min-height:100%}
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
  @media(max-width:900px){.trades-card{grid-column:1;grid-row:auto}}
  @media(max-width:700px){.trade-form-grid{grid-template-columns:1fr}}
</style>

<script>
(function(){
  const ARBS={
    'ADA / NIGHT / SNEK':{id:'arb-ada-night-snek',anchor:'ADA',assets:['NIGHT','SNEK']},
    'SOL / BONK / WIF':{id:'arb-sol-bonk-wif',anchor:'SOL',assets:['BONK','WIF']}
  };
  const $=id=>document.getElementById(id);
  const pad=n=>String(n).padStart(2,'0');
  function arb(){
    const s=$('arbitrageSelect');
    const name=String(s?.selectedOptions?.[0]?.textContent||'').trim().replace(/\s+/g,' ');
    if(ARBS[name])return {...ARBS[name],name};
    const p=name.split('/').map(x=>x.trim()).filter(Boolean);
    if(p.length>=2)return{id:String(s?.value||'current'),name,anchor:p[0],assets:p.slice(1)};
    return{id:'arb-ada-night-snek',name:'ADA / NIGHT / SNEK',anchor:'ADA',assets:['NIGHT','SNEK']};
  }
  function strategies(a){const[x,y]=a.assets;return[`${a.anchor} → ${x} → ${a.anchor}`,`${a.anchor} → ${y} → ${a.anchor}`,`${x} → ${y} → ${a.anchor}`,`${y} → ${x} → ${a.anchor}`];}
  function initialAsset(strategy,a){const[x,y]=a.assets;if(strategy===strategies(a)[0])return x;if(strategy===strategies(a)[1])return y;if(strategy===strategies(a)[2])return y;return x;}
  function nowLocal(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
  function fmt(n){return Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:8}):'—';}
  window.updateTradeVisualForm=function(){
    const a=arb();
    const st=$('tradeVisualStrategy');
    if(!st)return;
    const s=st.value||strategies(a)[0];
    const asset=initialAsset(s,a);
    $('tradeVisualInitialAsset').value=asset;
    $('tradeVisualAnchorLabel').textContent=`Quantidade utilizada (${a.anchor})`;
    $('tradeVisualQuantityLabel').textContent=`Quantidade recebida (${asset})`;
    $('tradeVisualExitAmountLabel').textContent=`Quantidade recebida na âncora (${a.anchor})`;
    const cap=Number($('tradeVisualAnchorAmount').value), qty=Number($('tradeVisualQuantity').value), exit=Number($('tradeVisualExitAmount').value);
    const ep=cap>0&&qty>0?cap/qty:null, xp=exit>0&&qty>0?exit/qty:null;
    $('tradeVisualEntryDerived').innerHTML=`Preço efetivo de entrada: <strong>${ep==null?'—':fmt(ep)+' '+a.anchor+'/'+asset}</strong>`;
    $('tradeVisualExitDerived').innerHTML=`Preço efetivo de saída: <strong>${xp==null?'—':fmt(xp)+' '+a.anchor+'/'+asset}</strong>`;
  };
  window.openTradeVisualForm=function(){
    const a=arb(), st=$('tradeVisualStrategy'), as=$('tradeVisualArbitrage');
    if(as)as.innerHTML=`<option value="${a.id}">${a.name}</option>`;
    if(st)st.innerHTML=strategies(a).map(x=>`<option value="${x}">${x}</option>`).join('');
    $('tradeVisualOpenedAt').value=nowLocal();
    $('tradeVisualClosedAt').value='';$('tradeVisualAnchorAmount').value='';$('tradeVisualQuantity').value='';$('tradeVisualExitAmount').value='';
    $('tradeVisualMessage').textContent='';$('tradeVisualResult').classList.add('hidden');
    window.updateTradeVisualForm();
    const m=$('tradeVisualModal');m.classList.remove('hidden');m.setAttribute('aria-hidden','false');
  };
  window.closeTradeVisualForm=function(){const m=$('tradeVisualModal');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}};
  window.validateTradeVisualForm=function(e){
    if(e)e.preventDefault();
    const a=arb(), s=$('tradeVisualStrategy').value||strategies(a)[0], asset=initialAsset(s,a), opened=$('tradeVisualOpenedAt').value, closed=$('tradeVisualClosedAt').value;
    const cap=Number($('tradeVisualAnchorAmount').value), qty=Number($('tradeVisualQuantity').value), exit=Number($('tradeVisualExitAmount').value), msg=$('tradeVisualMessage'), res=$('tradeVisualResult');
    if(!(cap>0)||!(qty>0)){msg.textContent=`Preencha a quantidade utilizada em ${a.anchor} e a quantidade recebida em ${asset}.`;return false;}
    if(closed||exit>0){if(!closed||!(exit>0)){msg.textContent='Para um trade fechado, informe a data/hora de saída e a quantidade recebida na âncora.';return false;}if(new Date(closed)<new Date(opened)){msg.textContent='A saída não pode ser anterior à entrada.';return false;}const p1=cap/qty,p2=exit/qty,profit=exit-cap,ret=profit/cap,h=(new Date(closed)-new Date(opened))/36e5;res.innerHTML=`<strong>Trade fechado validado</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset} → ${fmt(exit)} ${a.anchor}<br>Resultado: <strong>${fmt(profit)} ${a.anchor}</strong> (${(ret*100).toLocaleString('pt-BR',{maximumFractionDigits:4)}%) · Duração: ${h.toLocaleString('pt-BR',{maximumFractionDigits:2})} h<br>Preço efetivo: entrada ${fmt(p1)} → saída ${fmt(p2)} ${a.anchor}/${asset}`;
    }else{const p=cap/qty;res.innerHTML=`<strong>Trade aberto validado</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset}<br>Preço efetivo de entrada: <strong>${fmt(p)} ${a.anchor}/${asset}</strong>`;}
    res.classList.remove('hidden');msg.textContent='Validação concluída. Ainda não gravado no PostgreSQL.';return false;
  };
})();
</script>

<script src="trades-ui.js?v=20260829" defer></script>
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
        src=ROOT/name
        if src.exists(): shutil.copy2(src,DIST/name)
    for path in ROOT.glob("favicon*"):
        if path.is_file(): shutil.copy2(path,DIST/path.name)
    shutil.copy2(TRADES_UI_JS,DIST/"trades-ui.js")
    (DIST/"supabase").mkdir()
    shutil.copy2(SUPABASE_CONFIG,DIST/"supabase"/"config.js")
    html=SOURCE_INDEX.read_text(encoding="utf-8")
    marker='</div>\n\n  <div class="section metrics" id="metrics"></div>'
    if marker in html and 'id="tradesPanel"' not in html:
        html=html.replace(marker,TRADES_MARKUP+'\n</div>\n\n  <div class="section metrics" id="metrics"></div>',1)
    elif 'id="tradesPanel"' not in html:
        html=html.replace('</body>',TRADES_MARKUP+'\n</body>',1)
    else:
        raise SystemExit("index.html já contém tradesPanel; remova o duplicado antes do build")
    (DIST/"index.html").write_text(html,encoding="utf-8")
    print(f"Built deployable site in {DIST}")

if __name__ == "__main__":
    build()
