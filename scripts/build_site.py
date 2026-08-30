#!/usr/bin/env python3
from __future__ import annotations
import shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
DIST=ROOT/'dist'
SOURCE_INDEX=ROOT/'index.html'
TRADES_UI_JS=ROOT/'trades-ui.js'
SUPABASE_CONFIG=ROOT/'supabase'/'config.js'
TRADES_MARKUP=r'''
<section class="card trades-card" id="tradesPanel">
 <div class="section-head"><div><h2>Trades</h2><div class="note" id="tradesContext">Acompanhamento da arbitragem selecionada</div></div>
 <button class="btn primary" id="newTradeBtn" type="button" onclick="window.openTradeVisualForm()">+ Novo trade</button></div>
 <div class="trades-subtitle">ABERTOS</div><div class="trade-empty" id="tradesOpenEmpty">Nenhum trade aberto nesta arbitragem.</div>
 <div class="trades-subtitle">FECHADOS</div><div class="trade-empty" id="tradesClosedEmpty">Nenhum trade fechado nesta arbitragem.</div>
</section>
<div id="tradeVisualModal" class="trade-modal hidden" aria-hidden="true">
 <div class="trade-modal-backdrop" onclick="window.closeTradeVisualForm()"></div>
 <div class="trade-dialog" role="dialog" aria-modal="true">
  <div class="section-head"><div><h2>Novo trade</h2><div class="note">Registro da operação real</div></div><button class="btn" type="button" onclick="window.closeTradeVisualForm()">Fechar</button></div>
  <form id="tradeVisualForm" onsubmit="return window.validateTradeVisualForm(event)">
   <div class="trade-form-grid">
    <div class="field"><label for="tradeVisualArbitrage">Arbitragem</label><select id="tradeVisualArbitrage" required></select></div>
    <div class="field"><label for="tradeVisualStrategy">Estratégia</label><select id="tradeVisualStrategy" required onchange="window.updateTradeVisualForm()"></select></div>
    <div class="field"><label for="tradeVisualOpenedAt">Entrada</label><input id="tradeVisualOpenedAt" type="datetime-local" required></div>
    <div class="field"><label id="tradeVisualAnchorLabel" for="tradeVisualAnchorAmount">Quantidade utilizada (ADA)</label><input id="tradeVisualAnchorAmount" type="number" min="0" step="any" required oninput="window.updateTradeVisualForm()"></div>
    <div class="field"><label>Ativo inicial da posição</label><input id="tradeVisualInitialAsset" type="text" readonly></div>
    <div class="field"><label id="tradeVisualQuantityLabel" for="tradeVisualQuantity">Quantidade recebida</label><input id="tradeVisualQuantity" type="number" min="0" step="any" required oninput="window.updateTradeVisualForm()"></div>
   </div>
   <div class="trade-derived" id="tradeVisualEntryDerived">Preço efetivo de entrada: <strong>—</strong></div>
   <div class="trade-section"><div class="section-head"><div><h2>Saída</h2><div class="note">Fechamento padrão = 100% da posição</div></div></div>
    <div class="trade-form-grid">
     <div class="field"><label for="tradeVisualClosedAt">Data/hora de saída</label><input id="tradeVisualClosedAt" type="datetime-local"></div>
     <div class="field"><label id="tradeVisualExitAmountLabel" for="tradeVisualExitAmount">Quantidade recebida na âncora (ADA)</label><input id="tradeVisualExitAmount" type="number" min="0" step="any" placeholder="Preencher ao fechar" oninput="window.updateTradeVisualForm()"></div>
    </div>
    <div class="trade-derived" id="tradeVisualExitDerived">Preço efetivo de saída: <strong>—</strong></div>
   </div>
   <div class="trade-help">Entrada e saída usam os valores efetivamente executados. Taxas, slippage e variações ficam incorporados nos valores informados. “Cotação Agora” será usada apenas para simular o fechamento de um trade aberto.</div>
   <div id="tradeVisualResult" class="trade-result hidden"></div>
   <div class="actions"><button class="btn primary" type="submit">Validar trade</button><button class="btn" type="button" onclick="window.closeTradeVisualForm()">Cancelar</button></div>
   <div id="tradeVisualMessage" class="note" style="margin-top:10px"></div>
  </form>
 </div>
</div>
<style>
.trades-card{grid-column:2;grid-row:1;height:100%;min-height:100%}.trades-subtitle{font-size:11px;color:var(--muted);font-weight:700;margin:10px 0 4px}.trade-empty{padding:14px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px}.trade-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px}.trade-modal.hidden{display:none}.trade-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.62)}.trade-dialog{position:relative;width:min(760px,100%);max-height:92vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45)}.trade-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.trade-section{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}.trade-derived{margin-top:10px;background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px;font-size:12px;color:var(--muted)}.trade-derived strong{color:var(--text)}.trade-help{margin-top:10px;font-size:11px;line-height:1.5;color:var(--muted);background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px}.trade-result{margin-top:10px;padding:10px;border-radius:12px;border:1px solid var(--border);background:rgba(104,211,145,.05);font-size:12px;line-height:1.5}.trade-readonly input{opacity:.85}@media(max-width:900px){.trades-card{grid-column:1;grid-row:auto}}@media(max-width:700px){.trade-form-grid{grid-template-columns:1fr}}
</style>
<script>
(function(){
 const ARBS={'ADA / NIGHT / SNEK':{id:'arb-ada-night-snek',anchor:'ADA',assets:['NIGHT','SNEK']},'SOL / BONK / WIF':{id:'arb-sol-bonk-wif',anchor:'SOL',assets:['BONK','WIF']}}; const $=id=>document.getElementById(id);
 function arb(){const s=$('arbitrageSelect'),n=String(s?.selectedOptions?.[0]?.textContent||'').trim();if(ARBS[n])return {...ARBS[n],name:n};const p=n.split('/').map(x=>x.trim()).filter(Boolean);return p.length>=2?{id:String(s?.value||'current'),name:n,anchor:p[0],assets:p.slice(1)}:ARBS['ADA / NIGHT / SNEK'];}
 function sts(a){const[x,y]=a.assets;return[`${a.anchor} → ${x} → ${a.anchor}`,`${a.anchor} → ${y} → ${a.anchor}`,`${x} → ${y} → ${a.anchor}`,`${y} → ${x} → ${a.anchor}`];}
 function ia(s,a){const[x,y]=a.assets,st=sts(a);return s===st[0]?x:s===st[1]?y:s===st[2]?y:x;}
 const fmt=n=>Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:8}):'—';
 window.updateTradeVisualForm=function(){const a=arb(),s=$('tradeVisualStrategy')?.value||sts(a)[0],asset=ia(s,a),cap=Number($('tradeVisualAnchorAmount')?.value),qty=Number($('tradeVisualQuantity')?.value),out=Number($('tradeVisualExitAmount')?.value);$('tradeVisualInitialAsset').value=asset;$('tradeVisualAnchorLabel').textContent=`Quantidade utilizada (${a.anchor})`;$('tradeVisualQuantityLabel').textContent=`Quantidade recebida (${asset})`;$('tradeVisualExitAmountLabel').textContent=`Quantidade recebida na âncora (${a.anchor})`;$('tradeVisualEntryDerived').innerHTML=`Preço efetivo de entrada: <strong>${cap>0&&qty>0?fmt(cap/qty)+' '+a.anchor+'/'+asset:'—'}</strong>`;$('tradeVisualExitDerived').innerHTML=`Preço efetivo de saída: <strong>${out>0&&qty>0?fmt(out/qty)+' '+a.anchor+'/'+asset:'—'}</strong>`;};
 window.openTradeVisualForm=function(){const a=arb(),s=$('tradeVisualStrategy'),as=$('tradeVisualArbitrage');as.innerHTML=`<option value="${a.id}">${a.name}</option>`;s.innerHTML=sts(a).map(x=>`<option value="${x}">${x}</option>`).join('');const d=new Date(),p=n=>String(n).padStart(2,'0');$('tradeVisualOpenedAt').value=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;$('tradeVisualClosedAt').value='';$('tradeVisualAnchorAmount').value='';$('tradeVisualQuantity').value='';$('tradeVisualExitAmount').value='';$('tradeVisualMessage').textContent='';$('tradeVisualResult').classList.add('hidden');window.updateTradeVisualForm();$('tradeVisualModal').classList.remove('hidden');$('tradeVisualModal').setAttribute('aria-hidden','false');};
 window.closeTradeVisualForm=function(){$('tradeVisualModal').classList.add('hidden');$('tradeVisualModal').setAttribute('aria-hidden','true');};
 window.validateTradeVisualForm=function(e){e.preventDefault();const a=arb(),s=$('tradeVisualStrategy').value||sts(a)[0],asset=ia(s,a),opened=$('tradeVisualOpenedAt').value,closed=$('tradeVisualClosedAt').value,cap=Number($('tradeVisualAnchorAmount').value),qty=Number($('tradeVisualQuantity').value),out=Number($('tradeVisualExitAmount').value),m=$('tradeVisualMessage'),r=$('tradeVisualResult');if(!(cap>0)||!(qty>0)){m.textContent=`Preencha a quantidade utilizada em ${a.anchor} e a quantidade recebida em ${asset}.`;return false}if(closed||out>0){if(!closed||!(out>0)){m.textContent='Para fechar, informe a data/hora de saída e a quantidade recebida na âncora.';return false}if(new Date(closed)<new Date(opened)){m.textContent='A saída não pode ser anterior à entrada.';return false}const profit=out-cap,ret=profit/cap,h=(new Date(closed)-new Date(opened))/36e5;r.innerHTML=`<strong>Trade fechado validado</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset} → ${fmt(out)} ${a.anchor}<br>Resultado: <strong>${fmt(profit)} ${a.anchor}</strong> (${(ret*100).toLocaleString('pt-BR',{maximumFractionDigits:4)}%) · Duração: ${h.toLocaleString('pt-BR',{maximumFractionDigits:2})} h`;}else{r.innerHTML=`<strong>Trade aberto validado</strong><br>${fmt(cap)} ${a.anchor} → ${fmt(qty)} ${asset}<br>Preço efetivo de entrada: <strong>${fmt(cap/qty)} ${a.anchor}/${asset}</strong>`}r.classList.remove('hidden');m.textContent='Validação concluída. Ainda não gravado no PostgreSQL.';return false;};
})();
</script>
<script src="trades-ui.js?v=20260829" defer></script>
'''
def build():
 if not SOURCE_INDEX.exists() or not TRADES_UI_JS.exists() or not SUPABASE_CONFIG.exists(): raise SystemExit('Arquivos necessários não encontrados')
 if DIST.exists(): shutil.rmtree(DIST)
 DIST.mkdir(parents=True)
 for name in ['index.html','data.csv','capture-log.json','config.json']:
  p=ROOT/name
  if p.exists(): shutil.copy2(p,DIST/name)
 for p in ROOT.glob('favicon*'):
  if p.is_file(): shutil.copy2(p,DIST/p.name)
 shutil.copy2(TRADES_UI_JS,DIST/'trades-ui.js')
 (DIST/'supabase').mkdir(); shutil.copy2(SUPABASE_CONFIG,DIST/'supabase'/'config.js')
 html=SOURCE_INDEX.read_text(encoding='utf-8')
 marker='</div>\n\n  <div class="section metrics" id="metrics"></div>'
 if marker not in html: raise SystemExit('Marcador do grid não encontrado')
 html=html.replace(marker, TRADES_MARKUP+'\n  </div>\n\n  <div class="section metrics" id="metrics"></div>',1)
 (DIST/'index.html').write_text(html,encoding='utf-8')
 print(f'Built deployable site in {DIST}')
if __name__=='__main__': build()
