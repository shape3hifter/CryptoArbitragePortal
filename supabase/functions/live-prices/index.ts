import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const CG_BASE="https://api.coingecko.com/api/v3/simple/price";
const CMC_HISTORY_BASE="https://api.coinmarketcap.com/data-api/v3.1/cryptocurrency/historical";
const ALLOWED_IDS=new Set(["cardano","midnight-3","snek","solana","bonk","dogwifcoin","bitcoin","ethereum","tether","usd-coin"]);
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, OPTIONS","Content-Type":"application/json"};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Cache-Control":"no-store"}});}
function validPublishableKey(req:Request){const supplied=req.headers.get("apikey")||"";if(!supplied)return false;try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");return Object.values(keys).includes(supplied);}catch{return false;}}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="GET")return json({error:"Method not allowed"},405);
 if(!validPublishableKey(req))return json({error:"Unauthorized"},401);
 try{
  const url=new URL(req.url);
  if(url.searchParams.get("action")==="history"){
   const cmcId=Number(url.searchParams.get("cmc_id")),days=Number(url.searchParams.get("days")||"365");
   if(!Number.isSafeInteger(cmcId)||cmcId<=0||cmcId>100000000||!Number.isInteger(days)||days<120||days>365)return json({error:"Invalid historical quote request"},400);
   const end=Math.floor(Date.now()/1000),start=end-days*86400;
   const upstreamUrl=`${CMC_HISTORY_BASE}?id=${cmcId}&convertId=2781&timeStart=${start}&timeEnd=${end}&interval=1d`;
   const upstream=await fetch(upstreamUrl,{headers:{Accept:"application/json, text/plain, */*",Referer:"https://coinmarketcap.com/","User-Agent":"Mozilla/5.0 CryptoArbitragePortal/1.0"}});
   const raw=await upstream.text();
   if(!upstream.ok)return json({error:"CoinMarketCap historical service unavailable",upstream_status:upstream.status,detail:raw.slice(0,500)},502);
   let payload:unknown;try{payload=JSON.parse(raw);}catch{return json({error:"Invalid CoinMarketCap historical response"},502);}
   const quotes=(payload as {data?:{quotes?:unknown[]}})?.data?.quotes;
   if(!Array.isArray(quotes))return json({error:"CoinMarketCap response did not contain historical quotes"},502);
   return json(payload);
  }
  const ids=String(url.searchParams.get("ids")||"").split(",").map(x=>x.trim()).filter(Boolean);
  const vs=String(url.searchParams.get("vs_currencies")||"usd").toLowerCase();
  if(!ids.length||ids.length>6||vs!=="usd")return json({error:"Invalid quote request"},400);
  if(ids.some(id=>!ALLOWED_IDS.has(id)))return json({error:"Asset not allowed"},400);
  const upstream=await fetch(`${CG_BASE}?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`,{headers:{Accept:"application/json"}});
  const raw=await upstream.text();
  if(!upstream.ok)return json({error:"CoinGecko unavailable",upstream_status:upstream.status},502);
  let payload:unknown;try{payload=JSON.parse(raw);}catch{return json({error:"Invalid CoinGecko response"},502);}
  return json(payload);
 }catch(error){return json({error:"Quote service failed",message:error instanceof Error?error.message:String(error)},502);}
});
