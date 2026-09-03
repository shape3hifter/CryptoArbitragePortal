import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const HISTORY_URL = Deno.env.get("ARBITRAGE_HISTORY_URL") ?? "https://raw.githubusercontent.com/shape3hifter/CryptoArbitragePortal/main/data.csv";
const SIGNAL_Z = 1.5, LOOKBACK = 60;
const BUY_GAP_LEVELS = [0.05,0.10,0.15], PROFIT_LEVELS = [0.05,0.10,0.15];
const CMC_IDS:Record<string,number>={ADA:2010,NIGHT:39064,SNEK:25264,SOL:5426,BONK:23095,WIF:28752};
const ARBITRAGES:Record<string,{name:string;anchor:string;comparatives:string[]}>= {
  "arb-ada-night-snek":{name:"ADA / NIGHT / SNEK",anchor:"ADA",comparatives:["NIGHT","SNEK"]},
  "arb-sol-bonk-wif":{name:"SOL / BONK / WIF",anchor:"SOL",comparatives:["BONK","WIF"]}
};
type Point={date:string;prices:Record<string,number>};
type Trade={id:string;user_id:string;arbitrage_id:string;arbitrage_name:string;anchor_symbol:string;initial_anchor_amount:number;current_asset:string;current_quantity:number};
type State={user_id:string;arbitrage_id:string;comparative_symbol:string;signal:string;gap_pct:number|null;zscore:number|null;gap_threshold_alerted:number|null;cycle_started_at:string|null;evaluated_at:string;updated_at:string};
type TradeState={user_id:string;trade_id:string;profit_pct:number|null;profit_threshold_alerted:number|null;evaluated_at:string;updated_at:string};
const legacyServiceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const db=createClient(SUPABASE_URL,legacyServiceRole,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"content-type":"application/json"}});
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
const sampleSd=(v:number[])=>{if(v.length<2)return 0;const m=mean(v);return Math.sqrt(v.reduce((s,x)=>s+(x-m)**2,0)/(v.length-1));};
const ratioFor=(p:Record<string,number>,a:string,b:string)=>{const x=Number(p[a]),y=Number(p[b]);return Number.isFinite(x)&&Number.isFinite(y)&&y>0?x/y:null;};
const signalFor=(z:number)=>z<=-SIGNAL_Z?"BUY":z>=SIGNAL_Z?"SELL":"HOLD";
const highestNewLevel=(v:number,levels:number[],previous:number|null)=>{const p=previous??0,r=levels.filter(x=>v+1e-12>=x&&x>p);return r.length?Math.max(...r):null;};
const roundHourIso=(now=new Date())=>{const d=new Date(now);d.setUTCMinutes(0,0,0);return d.toISOString();};
const eventRecord=(base:Record<string,unknown>,type:string,threshold:number|null=null)=>({...base,type,threshold});

async function authenticate(req:Request){
  const cronSecret=req.headers.get("x-cron-secret")?.trim()??"";
  if(cronSecret){
    const {data,error}=await db.from("hourly_arbitrage_scheduler_config").select("cron_secret").eq("id",1).maybeSingle();
    if(!error&&data?.cron_secret&&cronSecret===data.cron_secret)return {mode:"service" as const,userId:null as string|null};
  }
  const key=req.headers.get("apikey")?.trim()??"";
  if(key&&key===legacyServiceRole)return {mode:"service" as const,userId:null as string|null};
  try{const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");if(key&&Object.values(keys).some(v=>v===key))return {mode:"service" as const,userId:null as string|null};}catch{}
  const m=(req.headers.get("authorization")??"").match(/^Bearer\s+(.+)$/i);if(!m)return {mode:"user" as const,userId:null as string|null};
  let pub="";try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")??"{}");pub=String(keys.default??Object.values(keys)[0]??"");}catch{};
  pub=pub||Deno.env.get("SUPABASE_ANON_KEY")||"";if(!pub)return {mode:"user" as const,userId:null as string|null};
  const c=createClient(SUPABASE_URL,pub,{global:{headers:{Authorization:`Bearer ${m[1]}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await c.auth.getUser(m[1]);return {mode:"user" as const,userId:error||!data.user?null:data.user.id};
}
async function loadHistory():Promise<Point[]>{
  const r=await fetch(HISTORY_URL,{headers:{accept:"text/csv"}});if(!r.ok)throw Error(`history fetch failed: ${r.status}`);const lines=(await r.text()).trim().split(/\r?\n/);if(lines.length<2)return [];
  const h=lines[0].split(",").map(x=>x.trim()),di=h.findIndex(x=>x.toLowerCase()==="date"),out:Point[]=[];if(di<0)return out;
  for(const line of lines.slice(1)){const c=line.split(",");if(!c[di])continue;const p:Record<string,number>={};for(const s of Object.keys(CMC_IDS)){const i=h.findIndex(x=>x.toUpperCase()===s),v=i>=0?Number(c[i]):NaN;if(Number.isFinite(v))p[s]=v;}out.push({date:c[di],prices:p});}return out;
}
async function loadCurrentQuotes(symbols:string[]){
  const ids=symbols.map(s=>CMC_IDS[s]).filter(Boolean).join(",");const url=`https://pro-api.coinmarketcap.com/public-api/v3/cryptocurrency/quotes/latest?id=${ids}&convert=USD`;
  const r=await fetch(url,{headers:{accept:"application/json"}});if(!r.ok)throw Error(`CMC quote fetch failed: ${r.status}`);const body=await r.json(),raw=body?.data,items=Array.isArray(raw)?raw:Object.values(raw??{}),prices:Record<string,number>={};
  for(const item of items as any[]){const s=String(item?.symbol??"").toUpperCase(),v=Number(item?.quote?.USD?.price??item?.quotes?.[0]?.price);if(s&&Number.isFinite(v))prices[s]=v;}
  const missing=symbols.filter(s=>!Number.isFinite(prices[s]));if(missing.length)throw Error(`CMC returned incomplete quote set: ${missing.join(",")}`);return prices;
}
async function loadOpenTrades(userId:string|null){let q=db.from("trades").select("id,user_id,arbitrage_id,arbitrage_name,anchor_symbol,initial_anchor_amount,current_asset,current_quantity").is("closed_at",null);if(userId)q=q.eq("user_id",userId);const {data,error}=await q;if(error)throw error;return(data??[]) as Trade[];}
async function loadStates(ids:string[]){if(!ids.length)return[] as State[];const {data,error}=await db.from("hourly_arbitrage_state").select("*").in("user_id",ids);if(error)throw error;return(data??[]) as State[];}
async function loadTradeStates(ids:string[]){if(!ids.length)return[] as TradeState[];const {data,error}=await db.from("hourly_trade_state").select("*").in("user_id",ids);if(error)throw error;return(data??[]) as TradeState[];}

Deno.serve(async(req)=>{const started=Date.now();try{
  if(req.method!=="POST")return json({ok:false,error:"POST required"},405);
  const auth=await authenticate(req);if(!auth.userId&&auth.mode!=="service")return json({ok:false,error:"Unauthorized"},401);
  const body=await req.json().catch(()=>({})),requestedUserId=typeof body.user_id==="string"?body.user_id:null;
  if(auth.mode==="user"&&requestedUserId&&requestedUserId!==auth.userId)return json({ok:false,error:"user_id does not match authenticated user"},403);
  const effectiveUserId=auth.mode==="user"?auth.userId:requestedUserId, dryRun=body.dry_run!==false, evaluatedAt=roundHourIso(new Date());
  const openTrades=await loadOpenTrades(effectiveUserId);if(!openTrades.length)return json({ok:true,dry_run:dryRun,evaluated_at:evaluatedAt,events:[],arbitrages:[],trades:[],elapsed_ms:Date.now()-started});
  const userIds=[...new Set(openTrades.map(t=>t.user_id))];const [history,stateRows,tradeStateRows]=await Promise.all([loadHistory(),loadStates(userIds),loadTradeStates(userIds)]);
  const quoteSymbols=Object.keys(CMC_IDS),currentPrices=await loadCurrentQuotes(quoteSymbols),points=[...history.filter(p=>p.date!==evaluatedAt),{date:evaluatedAt,prices:currentPrices}];
  const previousState=new Map(stateRows.map(r=>[`${r.user_id}|${r.arbitrage_id}|${r.comparative_symbol}`,r])),previousTradeState=new Map(tradeStateRows.map(r=>[`${r.user_id}|${r.trade_id}`,r]));
  const events:Record<string,unknown>[]=[],observations:Record<string,unknown>[]=[],stateUpserts:State[]=[],tradeUpserts:TradeState[]=[];
  for(const userId of userIds){for(const arbitrageId of [...new Set(openTrades.filter(t=>t.user_id===userId).map(t=>t.arbitrage_id))]){const cfg=ARBITRAGES[arbitrageId];if(!cfg)continue;for(const asset of cfg.comparatives){
    const rs=points.map(p=>ratioFor(p.prices,asset,cfg.anchor)).filter((x):x is number=>x!==null);if(rs.length<LOOKBACK)continue;const r=rs[rs.length-1],w=rs.slice(-LOOKBACK),avg=mean(w),stdev=sampleSd(w),z=stdev===0?0:(r-avg)/stdev,sig=signalFor(z),gap=avg===0?null:r/avg-1,key=`${userId}|${arbitrageId}|${asset}`,prev=previousState.get(key),previousSignal=prev?.signal??"HOLD";
    let threshold=prev?.gap_threshold_alerted??null,cycle=prev?.cycle_started_at??null;if(sig!==previousSignal)events.push(eventRecord({user_id:userId,arbitrage_id:arbitrageId,comparative_symbol:asset,signal:sig,previous_signal:previousSignal,evaluated_at:evaluatedAt},`STATE_CHANGE_${previousSignal}_TO_${sig}`));
    if(sig==="BUY"){if(previousSignal!=="BUY"){threshold=null;cycle=evaluatedAt;}const lv=highestNewLevel(Math.abs(gap??0),BUY_GAP_LEVELS,threshold);if(lv!==null){threshold=lv;events.push(eventRecord({user_id:userId,arbitrage_id:arbitrageId,comparative_symbol:asset,signal:sig,gap_pct:gap,evaluated_at:evaluatedAt},`BUY_THRESHOLD_${Math.round(lv*100)}`,lv));}}
    else{threshold=null;if(sig==="SELL"&&previousSignal!=="SELL")cycle=evaluatedAt;if(sig==="HOLD"&&previousSignal!=="HOLD")cycle=null;}
    observations.push({user_id:userId,arbitrage_id:arbitrageId,comparative_symbol:asset,anchor_symbol:cfg.anchor,evaluated_at:evaluatedAt,snapshot_at:evaluatedAt,ratio:r,avg,stdev,zscore:z,signal:sig,gap_pct:gap});
    stateUpserts.push({user_id:userId,arbitrage_id:arbitrageId,comparative_symbol:asset,signal:sig,gap_pct:sig==="BUY"?gap:null,zscore:z,gap_threshold_alerted:threshold,cycle_started_at:cycle,evaluated_at:evaluatedAt,updated_at:evaluatedAt});
  }}}
  for(const t of openTrades){const r=ratioFor(currentPrices,t.current_asset,t.anchor_symbol),initial=Number(t.initial_anchor_amount);if(r===null||!Number.isFinite(initial)||initial===0)continue;const current=Number(t.current_quantity)*r,profit=current/initial-1,prev=previousTradeState.get(`${t.user_id}|${t.id}`),old=prev?.profit_threshold_alerted??null,lv=highestNewLevel(Math.max(0,profit),PROFIT_LEVELS,old);let alerted=old;if(lv!==null){alerted=lv;events.push(eventRecord({user_id:t.user_id,trade_id:t.id,profit_pct:profit,current_anchor_amount:current,evaluated_at:evaluatedAt},`PROFIT_THRESHOLD_${Math.round(lv*100)}`,lv));}tradeUpserts.push({user_id:t.user_id,trade_id:t.id,profit_pct:profit,profit_threshold_alerted:alerted,evaluated_at:evaluatedAt,updated_at:evaluatedAt});}
  if(!dryRun){if(observations.length){const {error}=await db.from("hourly_arbitrage_observations").upsert(observations,{onConflict:"user_id,arbitrage_id,comparative_symbol,evaluated_at"});if(error)throw error;}if(stateUpserts.length){const {error}=await db.from("hourly_arbitrage_state").upsert(stateUpserts,{onConflict:"user_id,arbitrage_id,comparative_symbol"});if(error)throw error;}if(tradeUpserts.length){const {error}=await db.from("hourly_trade_state").upsert(tradeUpserts,{onConflict:"user_id,trade_id"});if(error)throw error;}}
  return json({ok:true,dry_run:dryRun,evaluated_at:evaluatedAt,current_prices:currentPrices,events,persisted:!dryRun,observations:observations.length,state_rows:stateUpserts.length,trade_state_rows:tradeUpserts.length,elapsed_ms:Date.now()-started});
}catch(error){console.error(error);return json({ok:false,error:error instanceof Error?error.message:String(error)},500);}});
