import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession:false, autoRefreshToken:false } });
const HISTORY = Deno.env.get("ARBITRAGE_HISTORY_URL") ?? "https://raw.githubusercontent.com/shape3hifter/CryptoArbitragePortal/main/data.csv";
const Z=1.5, LOOKBACK=60, BUY=[.05,.10,.15], PROFIT=[.05,.10,.15];
const IDS:Record<string,string>={ADA:"cardano",NIGHT:"midnight-3",SNEK:"snek",SOL:"solana",BONK:"bonk",WIF:"dogwifcoin"};
const ARBS:Record<string,any>={
  "arb-ada-night-snek":{name:"ADA / NIGHT / SNEK",anchor:"ADA",comparatives:["NIGHT","SNEK"],strategies:{NIGHT:"NIGHT → SNEK → ADA",SNEK:"SNEK → NIGHT → ADA"}},
  "arb-sol-bonk-wif":{name:"SOL / BONK / WIF",anchor:"SOL",comparatives:["BONK","WIF"],strategies:{BONK:"SOL → BONK → SOL",WIF:"SOL → WIF → SOL"}}
};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json"}});
const mean=(a:number[])=>a.reduce((x,y)=>x+y,0)/a.length;
const sd=(a:number[])=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1))};
const ratio=(p:any,a:string,b:string)=>Number.isFinite(p[a])&&Number.isFinite(p[b])&&p[b]>0?p[a]/p[b]:null;
const signal=(z:number)=>z<=-Z?"BUY":z>=Z?"SELL":"HOLD";
const level=(v:number,ls:number[],old:number|null)=>{const p=old??0,r=ls.filter(x=>v+1e-12>=x&&x>p);return r.length?Math.max(...r):null};
const hour=()=>{const d=new Date();d.setUTCMinutes(0,0,0);return d.toISOString()};
const signedPct=(v:number|null|undefined)=>Number.isFinite(v)?`${Number(v)>=0?"+":""}${(Number(v)*100).toFixed(1)}%`:"—";
const zfmt=(v:number|null|undefined)=>Number.isFinite(v)?Number(v).toFixed(2):"—";

function formatMessage(e:any){
  const name=e.arbitrage_name??"ARBITRAGEM", asset=e.comparative_symbol??"—", strategy=e.strategy?`\n${e.strategy}`:"";
  const metrics=`\n📊 ${asset}: **${e.signal??"—"}**\nZ-Score: **${zfmt(e.zscore)}**\nGAP: **${signedPct(e.gap_pct)}**`;
  const position=e.has_open_trade?"\n💼 **Trade aberto**":"\n⚠️ **Não há trade aberto.**";
  if(e.type==="STATE_CHANGE_HOLD_TO_BUY")return `🟢 **ARBITRAGEM — BUY**\n\n**${name}**${strategy}${metrics}${position}`;
  if(e.type==="STATE_CHANGE_HOLD_TO_SELL")return `🔴 **ARBITRAGEM — SELL**\n\n**${name}**${strategy}${metrics}${position}\n\nSinal de saída da condição de BUY.`;
  if(e.type==="STATE_CHANGE_BUY_TO_HOLD")return `🔵 **ARBITRAGEM — BUY → HOLD**\n\n**${name}**${strategy}${metrics}\n\nA condição de **BUY deixou de estar ativa**.`;
  if(e.type==="STATE_CHANGE_SELL_TO_HOLD")return `🔵 **ARBITRAGEM — SELL → HOLD**\n\n**${name}**${strategy}${metrics}\n\nA condição de **SELL deixou de estar ativa**.`;
  if(String(e.type).startsWith("BUY_THRESHOLD_")){const l=Number(e.threshold)*100;const t=e.has_open_trade?`\n\n💼 **Trade aberto**\nResultado atual: **${signedPct(e.profit_pct)}**`:"\n\n⚠️ **Não há trade aberto.**";return `🟢 **ARBITRAGEM — BUY - ${l.toFixed(0)}%**\n\n**${name}**${strategy}${metrics}\n\n📈 GAP atingiu **${l.toFixed(0)}%**${t}`}
  if(String(e.type).startsWith("PROFIT_THRESHOLD_")){const l=Number(e.threshold)*100;return `💰 **TRADE — LUCRO +${l.toFixed(0)}%**\n\n**${name}**${strategy}\n\n💵 Resultado atual: **${signedPct(e.profit_pct)}**\n\n📌 Nível de lucro atingido: **${l.toFixed(0)}%**\n\n💼 Trade permanece aberto.`}
  return null;
}

async function auth(req:Request){
  const secret=req.headers.get("x-cron-secret")?.trim()||"";
  if(secret){const {data}=await db.from("hourly_arbitrage_scheduler_config").select("cron_secret").eq("id",1).maybeSingle();if(data?.cron_secret===secret)return{service:true,userId:null as string|null}}
  const m=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);if(!m)return{service:false,userId:null as string|null};
  const pub=Deno.env.get("SUPABASE_ANON_KEY")||"";if(!pub)return{service:false,userId:null as string|null};
  const c=createClient(URL,pub,{global:{headers:{Authorization:`Bearer ${m[1]}`}},auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await c.auth.getUser(m[1]);
  return{service:false,userId:error||!data.user?null:data.user.id};
}
async function hist(){
  const r=await fetch(HISTORY,{headers:{Accept:"text/csv"}});if(!r.ok)throw Error(`history fetch failed: ${r.status}`);
  const ls=(await r.text()).trim().split(/\r?\n/),h=ls[0].split(",").map(x=>x.trim().toLowerCase());
  if(h.includes("symbol")&&h.includes("price")){const di=h.indexOf("date"),ti=h.indexOf("time"),si=h.indexOf("symbol"),pi=h.indexOf("price"),fi=h.indexOf("fiat"),m=new Map<string,any>();for(const line of ls.slice(1)){const c=line.split(","),sym=String(c[si]||"").toUpperCase(),v=Number(c[pi]);if(!sym||!Number.isFinite(v)||!Object.keys(IDS).includes(sym))continue;const d=String(c[di]||"");if(!d)continue;const tm=ti>=0?String(c[ti]||""):"00:00",fiat=fi>=0?String(c[fi]||"USD"):"USD";if(fiat.toUpperCase()!=="USD")continue;const key=`${d}T${tm}:00.000Z`;if(!m.has(key))m.set(key,{date:key,prices:{}});m.get(key).prices[sym]=v}return[...m.values()].sort((a,b)=>a.date.localeCompare(b.date))}
  return [];
}
async function quotes(){const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(Object.values(IDS).join(","))}&vs_currencies=usd`,{headers:{Accept:"application/json"}});if(!r.ok)throw Error(`CoinGecko quote fetch failed: ${r.status}`);const b=await r.json(),p:any={};for(const[s,id]of Object.entries(IDS)){const v=Number((b as any)[id]?.usd);if(Number.isFinite(v))p[s]=v}const m=Object.keys(IDS).filter(s=>!Number.isFinite(p[s]));if(m.length)throw Error(`CoinGecko returned incomplete quote set: ${m.join(",")}`);return p}
async function openTrades(uid:string|null){let q=db.from("trades").select("id,user_id,arbitrage_id,arbitrage_name,anchor_symbol,initial_anchor_amount,current_asset,current_quantity").is("closed_at",null);if(uid)q=q.eq("user_id",uid);const{data,error}=await q;if(error)throw error;return data||[]}
async function userIdsForService(){const ids=new Set<string>();const {data:states,error:se}=await db.from("hourly_arbitrage_state").select("user_id");if(se)throw se;(states||[]).forEach((r:any)=>ids.add(r.user_id));const {data:trades,error:te}=await db.from("trades").select("user_id");if(te)throw te;(trades||[]).forEach((r:any)=>ids.add(r.user_id));return [...ids]}

Deno.serve(async req=>{try{
  if(req.method!=="POST")return json({ok:false,error:"POST required"},405);const a=await auth(req);if(!a.userId&&!a.service)return json({ok:false,error:"Unauthorized"},401);
  const body=await req.json().catch(()=>({})),requested=typeof body.user_id==="string"?body.user_id:null;if(!a.service&&requested&&requested!==a.userId)return json({ok:false,error:"user_id does not match authenticated user"},403);
  const users=a.service?(requested?[requested]:await userIdsForService()):[a.userId!];
  const dry=body.dry_run!==false,at=hour(),[hs,prices]=await Promise.all([hist(),quotes()]);const ts=await openTrades(requested||a.userId);const allTrades=a.service&&!requested?await openTrades(null):ts;
  const targetTrades=a.service&&!requested?allTrades.filter((t:any)=>users.includes(t.user_id)):ts;
  const userIds=[...new Set(users)];
  const [st,trs]=await Promise.all([db.from("hourly_arbitrage_state").select("*").in("user_id",userIds),db.from("hourly_trade_state").select("*").in("user_id",userIds)]);if(st.error)throw st.error;if(trs.error)throw trs.error;
  const pts=[...hs.filter((p:any)=>p.date!==at),{date:at,prices}],sm:Map<string,any>=new Map((st.data||[]).map((r:any)=>[`${r.user_id}|${r.arbitrage_id}|${r.comparative_symbol}`,r] as [string,any])),tm:Map<string,any>=new Map((trs.data||[]).map((r:any)=>[`${r.user_id}|${r.trade_id}`,r] as [string,any]));
  const events:any[]=[],obs:any[]=[],su:any[]=[],tu:any[]=[],previews:any[]=[];
  for(const uid of userIds)for(const arbId of Object.keys(ARBS)){const c=ARBS[arbId];for(const asset of c.comparatives){const rs=pts.map((p:any)=>ratio(p.prices,asset,c.anchor)).filter((x:any)=>x!==null);if(rs.length<LOOKBACK)continue;const r=rs.at(-1),w=rs.slice(-LOOKBACK),avg=mean(w),stdev=sd(w),zs=stdev===0?0:(r-avg)/stdev,g=avg===0?null:r/avg-1,s=signal(zs),k=`${uid}|${arbId}|${asset}`,prev=sm.get(k),ps=prev?.signal??"HOLD",trade=targetTrades.find((t:any)=>t.user_id===uid&&t.arbitrage_id===arbId);
    const base={user_id:uid,arbitrage_id:arbId,arbitrage_name:c.name,comparative_symbol:asset,strategy:c.strategies[asset],signal:s,previous_signal:ps,gap_pct:g,zscore:zs,has_open_trade:!!trade,evaluated_at:at};let th=prev?.gap_threshold_alerted??null,cy=prev?.cycle_started_at??null;
    if(s!==ps){const type=`STATE_CHANGE_${ps}_TO_${s}`;events.push({...base,type});const msg=formatMessage({...base,type});if(msg)previews.push({...base,type,trade_id:trade?.id??null,profit_pct:null,threshold:null,message:msg});}
    if(s==="BUY"){if(ps!=="BUY"){th=null;cy=at}const lv=level(Math.abs(g??0),BUY,th);if(lv!==null){th=lv;const type=`BUY_THRESHOLD_${Math.round(lv*100)}`,msg=formatMessage({...base,type,threshold:lv,profit_pct:null});events.push({...base,type,threshold:lv});if(msg)previews.push({...base,type,trade_id:trade?.id??null,profit_pct:null,threshold:lv,message:msg});}}
    else{th=null;if(s==="SELL"&&ps!=="SELL")cy=at;if(s==="HOLD"&&ps!=="HOLD")cy=null}
    obs.push({user_id:uid,arbitrage_id:arbId,comparative_symbol:asset,anchor_symbol:c.anchor,evaluated_at:at,snapshot_at:at,ratio:r,avg,stdev,zscore:zs,signal:s,gap_pct:g});su.push({user_id:uid,arbitrage_id:arbId,comparative_symbol:asset,signal:s,gap_pct:s==="BUY"?g:null,zscore:zs,gap_threshold_alerted:th,cycle_started_at:cy,evaluated_at:at,updated_at:at});
  }}
  for(const t of targetTrades){const r=ratio(prices,t.current_asset,t.anchor_symbol),initial=Number(t.initial_anchor_amount);if(r===null||!Number.isFinite(initial)||initial===0)continue;const current=Number(t.current_quantity)*r,profit=current/initial-1,prev=tm.get(`${t.user_id}|${t.id}`),old=prev?.profit_threshold_alerted??null,lv=level(Math.max(0,profit),PROFIT,old);let alerted=old;if(lv!==null){alerted=lv;const type=`PROFIT_THRESHOLD_${Math.round(lv*100)}`,base={user_id:t.user_id,arbitrage_id:t.arbitrage_id,arbitrage_name:t.arbitrage_name||ARBS[t.arbitrage_id]?.name||"ARBITRAGEM",comparative_symbol:t.current_asset,strategy:ARBS[t.arbitrage_id]?.strategies?.[t.current_asset],signal:null,gap_pct:null,zscore:null,has_open_trade:true,evaluated_at:at,trade_id:t.id,profit_pct:profit,current_anchor_amount:current,threshold:lv,type};events.push(base);const msg=formatMessage(base);if(msg)previews.push({...base,message:msg})}tu.push({user_id:t.user_id,trade_id:t.id,profit_pct:profit,profit_threshold_alerted:alerted,evaluated_at:at,updated_at:at})}
  // Dry-run means no external delivery. Internal evaluation state and message previews are intentionally persisted for validation.
  if(obs.length){const{error}=await db.from("hourly_arbitrage_observations").upsert(obs,{onConflict:"user_id,arbitrage_id,comparative_symbol,evaluated_at"});if(error)throw error}
  if(su.length){const{error}=await db.from("hourly_arbitrage_state").upsert(su,{onConflict:"user_id,arbitrage_id,comparative_symbol"});if(error)throw error}
  if(tu.length){const{error}=await db.from("hourly_trade_state").upsert(tu,{onConflict:"user_id,trade_id"});if(error)throw error}
  if(previews.length){const{error}=await db.from("hourly_arbitrage_message_preview").insert(previews.map((p:any)=>({user_id:p.user_id,evaluated_at:p.evaluated_at,event_type:p.type,arbitrage_id:p.arbitrage_id,comparative_symbol:p.comparative_symbol,trade_id:p.trade_id??null,signal:p.signal??null,gap_pct:p.gap_pct??null,zscore:p.zscore??null,profit_pct:p.profit_pct??null,threshold:p.threshold??null,message:p.message})));if(error)throw error}
  return json({ok:true,dry_run:dry,evaluated_at:at,user_count:userIds.length,arbitrages:Object.keys(ARBS).length,observations:obs.length,state_rows:su.length,trade_state_rows:tu.length,message_previews:previews.length,events,current_prices:prices,persisted:true});
}catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}});
