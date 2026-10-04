import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const HISTORY = Deno.env.get("ARBITRAGE_HISTORY_URL") ?? "https://raw.githubusercontent.com/shape3hifter/CryptoArbitragePortal/main/data.csv";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_TO = Deno.env.get("ARBITRAGE_EMAIL_TO") ?? "shape3hifter@gmail.com";
const EMAIL_FROM = Deno.env.get("ARBITRAGE_EMAIL_FROM") ?? "Crypto Arbitrage <onboarding@resend.dev>";
const Z = 1.5, LOOKBACK = 60, OPPORTUNITY_STEP = 0.05;
const IDS: Record<string, string> = { ADA: "cardano", NIGHT: "midnight-3", SNEK: "snek", SOL: "solana", BONK: "bonk", WIF: "dogwifcoin" };
const ARBS: Record<string, any> = {
  "arb-ada-night-snek": { name: "ADA / NIGHT / SNEK", anchor: "ADA", comparatives: ["NIGHT", "SNEK"], strategies: { NIGHT: "NIGHT → SNEK → ADA", SNEK: "SNEK → NIGHT → ADA" } },
  "arb-sol-bonk-wif": { name: "SOL / BONK / WIF", anchor: "SOL", comparatives: ["BONK", "WIF"], strategies: { BONK: "SOL → BONK → SOL", WIF: "SOL → WIF → SOL" } }
};
const json = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { "content-type": "application/json" } });
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const ratio = (p: any, a: string, b: string) => Number.isFinite(p[a]) && Number.isFinite(p[b]) && p[b] > 0 ? p[a] / p[b] : null;
const signal = (z: number) => z <= -Z ? "BUY" : z >= Z ? "SELL" : "HOLD";
const profitLevel = (profit: number, old: number | null) => { if (profit < -1e-12) return null; const level = Math.floor((profit + 1e-12) / OPPORTUNITY_STEP) * OPPORTUNITY_STEP; return level > (old ?? -OPPORTUNITY_STEP) + 1e-12 ? Number(level.toFixed(10)) : null; };
const hour = () => { const d = new Date(); d.setUTCMinutes(0, 0, 0); return d.toISOString(); };
const signedPct = (v: number | null | undefined) => Number.isFinite(v) ? `${Number(v) >= 0 ? "+" : ""}${(Number(v) * 100).toFixed(1)}%` : "—";
const zfmt = (v: number | null | undefined) => Number.isFinite(v) ? Number(v).toFixed(2) : "—";
const numfmt = (v: number | null | undefined) => Number.isFinite(v) ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : "—";
const dateTimeBR = (v: string | null | undefined) => v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";
const dateBR = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const strategyLabel = (anchor: string, asset: string) => `${anchor}-${asset}-${anchor}`;
const moneyfmt = (v: number | null | undefined) => Number.isFinite(v) ? `US$ ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}` : "—";

function formatMessage(e: any) {
  if (e.type === "TRADE_WEEKLY") {
    const resultColor = Number(e.profit_anchor_amount ?? 0) >= 0 ? "🟢" : "🔴";
    return `💼 **TRADE ABERTO**

**Data de abertura:** ${dateTimeBR(e.opened_at)}
**Estratégia:** **${strategyLabel(e.anchor_symbol, e.current_asset)}**

**Token da estratégia:** ${e.current_asset}
**Quantidade:** ${numfmt(e.current_quantity)} ${e.current_asset}

**ENTRADA**
${numfmt(e.initial_anchor_amount)} ${e.anchor_symbol} → ${numfmt(e.current_quantity)} ${e.current_asset}
Relação: **${numfmt(e.entry_ratio_anchor_per_asset)} ${e.anchor_symbol}/${e.current_asset}**

**FECHAMENTO SIMULADO**
${numfmt(e.current_anchor_amount)} ${e.anchor_symbol} → ${numfmt(e.current_quantity)} ${e.current_asset}
Relação: **${numfmt(e.exit_ratio_anchor_per_asset)} ${e.anchor_symbol}/${e.current_asset}**

**LUCRO**
${resultColor} **${numfmt(e.profit_anchor_amount)} ${e.anchor_symbol}**
${resultColor} **${signedPct(e.profit_pct)}**`;
  }
  if (String(e.type).startsWith("PROFIT_THRESHOLD_")) {
    const previousLevel = e.previous_profit_threshold == null ? "—" : signedPct(e.previous_profit_threshold);
    const resultColor = Number(e.profit_anchor_amount ?? 0) >= 0 ? "🟢" : "🔴";
    return `📈 **EVOLUÇÃO DO TRADE**

**Última aferição:** ${previousLevel}
**Nova aferição:** **${signedPct(e.profit_pct)}**

**Data de abertura:** ${dateTimeBR(e.opened_at)}
**Estratégia:** **${strategyLabel(e.anchor_symbol, e.current_asset)}**

**Token da estratégia:** ${e.current_asset}
**Quantidade:** ${numfmt(e.current_quantity)} ${e.current_asset}

**ENTRADA**
${numfmt(e.initial_anchor_amount)} ${e.anchor_symbol} → ${numfmt(e.current_quantity)} ${e.current_asset}
Relação: **${numfmt(e.entry_ratio_anchor_per_asset)} ${e.anchor_symbol}/${e.current_asset}**

**FECHAMENTO SIMULADO**
${numfmt(e.current_anchor_amount)} ${e.anchor_symbol} → ${numfmt(e.current_quantity)} ${e.current_asset}
Relação: **${numfmt(e.exit_ratio_anchor_per_asset)} ${e.anchor_symbol}/${e.current_asset}**

**LUCRO**
${resultColor} **${numfmt(e.profit_anchor_amount)} ${e.anchor_symbol}**
${resultColor} **${signedPct(e.profit_pct)}**`;
  }
  if (e.type === "BUY_OPPORTUNITY") {
    return `🟢 **BUY OPPORTUNITY**

**Data e hora da aferição:** ${dateTimeBR(e.evaluated_at)}
**Estratégia:** **${strategyLabel(e.anchor_symbol, e.comparative_symbol)}**

**Token:** ${e.comparative_symbol}
**Z-Score:** **${zfmt(e.zscore)}**
**Relação Âncora/Token:** **${numfmt(e.ratio)} ${e.anchor_symbol}/${e.comparative_symbol}**
**Preço USD Âncora:** **${moneyfmt(e.anchor_price_usd)}**
**Preço USD Token Trade:** **${moneyfmt(e.token_price_usd)}**`;
  }
  return null;
}
function htmlFor(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc.split("\n").map(line => {
    const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    if (bold.includes("🟢")) return `<div style="color:#15803d;">${bold}</div>`;
    if (bold.includes("🔴")) return `<div style="color:#b91c1c;">${bold}</div>`;
    return `<div>${bold || "&nbsp;"}</div>`;
  });
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827;">${lines.join("")}</div>`;
}
function subjectFor(t: string, row?: any) {
  if (t === "TRADE_WEEKLY") return `TRADE ABERTO ${strategyLabel(row.anchor_symbol, row.current_asset)} em ${dateBR(row.opened_at)}`;
  if (t.startsWith("PROFIT_THRESHOLD_")) return `+ ${Number(row.threshold * 100).toFixed(0)}% - TRADE ABERTO ${strategyLabel(row.anchor_symbol, row.current_asset)} em ${dateBR(row.opened_at)}`;
  if (t === "BUY_OPPORTUNITY") return `BUY OPPORTUNITY ${strategyLabel(row.anchor_symbol, row.comparative_symbol)}`;
  return "Crypto Arbitrage — Alerta";
}
async function sendEmail(row: any) { if (!RESEND_KEY) throw Error("RESEND_API_KEY is not configured"); const payload = { from: EMAIL_FROM, to: [EMAIL_TO], subject: subjectFor(row.event_type, row), text: row.message, html: htmlFor(row.message) }; const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `arbitrage/${row.id}` }, body: JSON.stringify(payload) }); const b = await r.json().catch(() => ({})); if (!r.ok) throw Error(`Resend ${r.status}: ${b?.message ?? JSON.stringify(b)}`); return String(b?.id ?? ""); }
async function deliverPending() { const since = new Date(Date.now() - 86400000).toISOString(); const { data, error } = await db.from("hourly_arbitrage_message_preview").select("id,event_type,message,evaluated_at").in("email_status", ["pending", "failed"]).gte("evaluated_at", since).order("evaluated_at", { ascending: true }).limit(50); if (error) throw error; let sent = 0, failed = 0; for (const row of data ?? []) { try { const id = await sendEmail(row); const { error: e } = await db.from("hourly_arbitrage_message_preview").update({ email_status: "sent", email_sent_at: new Date().toISOString(), email_provider_id: id || null, email_error: null }).eq("id", row.id); if (e) throw e; sent++; } catch (e) { failed++; await db.from("hourly_arbitrage_message_preview").update({ email_status: "failed", email_error: e instanceof Error ? e.message : String(e) }).eq("id", row.id); } } return { sent, failed }; }
async function auth(req: Request) { const secret = req.headers.get("x-cron-secret")?.trim() || ""; if (secret) { const { data } = await db.from("hourly_arbitrage_scheduler_config").select("cron_secret").eq("id", 1).maybeSingle(); if (data?.cron_secret === secret) return { service: true, userId: null as string | null }; } const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i); if (!m) return { service: false, userId: null as string | null }; const pub = Deno.env.get("SUPABASE_ANON_KEY") || ""; if (!pub) return { service: false, userId: null as string | null }; const c = createClient(URL, pub, { global: { headers: { Authorization: `Bearer ${m[1]}` } }, auth: { persistSession: false, autoRefreshToken: false } }); const { data, error } = await c.auth.getUser(m[1]); return { service: false, userId: error || !data.user ? null : data.user.id }; }
async function hist() { const r = await fetch(HISTORY, { headers: { Accept: "text/csv" } }); if (!r.ok) throw Error(`history fetch failed: ${r.status}`); const ls = (await r.text()).trim().split(/\r?\n/), h = ls[0].split(",").map(x => x.trim().toLowerCase()); if (h.includes("symbol") && h.includes("price")) { const di = h.indexOf("date"), ti = h.indexOf("time"), si = h.indexOf("symbol"), pi = h.indexOf("price"), fi = h.indexOf("fiat"), m = new Map<string, any>(); for (const line of ls.slice(1)) { const c = line.split(","), sym = String(c[si] || "").toUpperCase(), v = Number(c[pi]); if (!sym || !Number.isFinite(v) || !Object.keys(IDS).includes(sym)) continue; const d = String(c[di] || ""); if (!d) continue; const tm = ti >= 0 ? String(c[ti] || "") : "00:00", fiat = fi >= 0 ? String(c[fi] || "USD") : "USD"; if (fiat.toUpperCase() !== "USD") continue; const key = `${d}T${tm}:00.000Z`; if (!m.has(key)) m.set(key, { date: key, prices: {} }); m.get(key).prices[sym] = v; } return [...m.values()].sort((a, b) => a.date.localeCompare(b.date)); } return []; }
async function quotes() { const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(Object.values(IDS).join(","))}&vs_currencies=usd`, { headers: { Accept: "application/json" } }); if (!r.ok) throw Error(`CoinGecko quote fetch failed: ${r.status}`); const b = await r.json(), p: any = {}; for (const [s, id] of Object.entries(IDS)) { const v = Number((b as any)[id]?.usd); if (Number.isFinite(v)) p[s] = v; } const m = Object.keys(IDS).filter(s => !Number.isFinite(p[s])); if (m.length) throw Error(`CoinGecko returned incomplete quote set: ${m.join(",")}`); return p; }
async function openTrades(uid: string | null) { let q = db.from("trades").select("id,user_id,arbitrage_id,arbitrage_name,anchor_symbol,strategy,opened_at,initial_anchor_amount,current_asset,current_quantity,entry_ratio_anchor_per_asset,entry_anchor_amount").is("closed_at", null); if (uid) q = q.eq("user_id", uid); const { data, error } = await q; if (error) throw error; return data || []; }
async function userIdsForService() { const ids = new Set<string>(); const { data: states, error: se } = await db.from("hourly_arbitrage_state").select("user_id"); if (se) throw se; (states || []).forEach((r: any) => ids.add(r.user_id)); const { data: trades, error: te } = await db.from("trades").select("user_id"); if (te) throw te; (trades || []).forEach((r: any) => ids.add(r.user_id)); return [...ids]; }

Deno.serve(async req => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
    const a = await auth(req);
    if (!a.userId && !a.service) return json({ ok: false, error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({})), requested = typeof body.user_id === "string" ? body.user_id : null;
    if (!a.service && requested && requested !== a.userId) return json({ ok: false, error: "user_id does not match authenticated user" }, 403);
    const users = a.service ? (requested ? [requested] : await userIdsForService()) : [a.userId!];
    const at = hour(), [hs, prices] = await Promise.all([hist(), quotes()]);
    const allTrades = await openTrades(requested || null), targetTrades = a.service && !requested ? allTrades.filter((t: any) => users.includes(t.user_id)) : allTrades;
    const [st, trs] = await Promise.all([db.from("hourly_arbitrage_state").select("*").in("user_id", users), db.from("hourly_trade_state").select("*").in("user_id", users)]);
    if (st.error) throw st.error; if (trs.error) throw trs.error;
    const pts = [...hs.filter((p: any) => p.date !== at), { date: at, prices }], sm = new Map((st.data || []).map((r: any) => [`${r.user_id}|${r.arbitrage_id}|${r.comparative_symbol}`, r])), tm = new Map((trs.data || []).map((r: any) => [`${r.user_id}|${r.trade_id}`, r])), events: any[] = [], obs: any[] = [], su: any[] = [], tu: any[] = [], previews: any[] = [];
    for (const uid of users) for (const arbId of Object.keys(ARBS)) {
      const c=ARBS[arbId];
      for (const asset of c.comparatives) {
        const rs=pts.map((p:any)=>ratio(p.prices,asset,c.anchor)).filter((x:any)=>x!==null); if(rs.length<LOOKBACK) continue;
        const r=rs.at(-1),w=rs.slice(-LOOKBACK),avg=mean(w),stdev=sd(w),zs=stdev===0?0:(r-avg)/stdev,g=avg===0?null:r/avg-1,s=signal(zs),k=`${uid}|${arbId}|${asset}`,prev=sm.get(k),alerted=Boolean(prev?.buy_opportunity_alerted??false);
        if(s==="BUY"&&!alerted){
          const type="BUY_OPPORTUNITY",anchorPrice=Number(prices[c.anchor]),tokenPrice=Number(prices[asset]);
          const message=formatMessage({type,comparative_symbol:asset,anchor_symbol:c.anchor,ratio:r,zscore:zs,evaluated_at:at,anchor_price_usd:anchorPrice,token_price_usd:tokenPrice});
          if(message) previews.push({user_id:uid,evaluated_at:at,type,arbitrage_id:arbId,comparative_symbol:asset,trade_id:null,signal:"BUY",gap_pct:g,zscore:zs,profit_pct:null,threshold:null,message});
        }
        const nextAlerted=s==="SELL"?false:s==="BUY"?true:alerted;
        obs.push({user_id:uid,arbitrage_id:arbId,comparative_symbol:asset,anchor_symbol:c.anchor,evaluated_at:at,snapshot_at:at,ratio:r,avg,stdev,zscore:zs,signal:s,gap_pct:g});
        su.push({user_id:uid,arbitrage_id:arbId,comparative_symbol:asset,signal:s,gap_pct:g,zscore:zs,gap_threshold_alerted:null,cycle_started_at:s==="SELL"?at:(prev?.cycle_started_at??(s==="BUY"?at:null)),buy_opportunity_alerted:nextAlerted,evaluated_at:at,updated_at:at});
      }
    }

    const weeklyRun=(()=>{const d=new Date(at);return d.getUTCDay()===1&&d.getUTCHours()===0;})();
    for(const t of targetTrades){
      const r=ratio(prices,t.current_asset,t.anchor_symbol),initial=Number(t.initial_anchor_amount); if(r===null||!Number.isFinite(initial)||initial===0) continue;
      const current=Number(t.current_quantity)*r,profit=current/initial-1,prev=tm.get(`${t.user_id}|${t.id}`),old=prev?.profit_threshold_alerted??null,lv=profitLevel(profit,old); let alerted=old;
      if(weeklyRun){
        const type="TRADE_WEEKLY",message=formatMessage({...t,type,evaluated_at:at,current_anchor_amount:current,profit_anchor_amount:current-initial,profit_pct:profit,exit_ratio_anchor_per_asset:r});
        if(message) previews.push({user_id:t.user_id,evaluated_at:at,event_type:type,type,arbitrage_id:t.arbitrage_id,comparative_symbol:t.current_asset,trade_id:t.id,signal:null,gap_pct:null,zscore:null,profit_pct:profit,threshold:null,message});
      }
      if(lv!==null){
        const previousLevel=old; alerted=lv; const type=`PROFIT_THRESHOLD_${Math.round(lv*100)}`,message=formatMessage({...t,type,evaluated_at:at,current_anchor_amount:current,profit_anchor_amount:current-initial,profit_pct:profit,threshold:lv,previous_profit_threshold:previousLevel,exit_ratio_anchor_per_asset:r});
        if(message) previews.push({user_id:t.user_id,evaluated_at:at,event_type:type,type,arbitrage_id:t.arbitrage_id,comparative_symbol:t.current_asset,trade_id:t.id,signal:null,gap_pct:null,zscore:null,profit_pct:profit,threshold:lv,message});
      }
      tu.push({user_id:t.user_id,trade_id:t.id,profit_pct:profit,profit_threshold_alerted:alerted,evaluated_at:at,updated_at:at});
    }

    if (obs.length) { const { error } = await db.from("hourly_arbitrage_observations").upsert(obs, { onConflict: "user_id,arbitrage_id,comparative_symbol,evaluated_at" }); if (error) throw error; }
    if (su.length) { const { error } = await db.from("hourly_arbitrage_state").upsert(su, { onConflict: "user_id,arbitrage_id,comparative_symbol" }); if (error) throw error; }
    if (tu.length) { const { error } = await db.from("hourly_trade_state").upsert(tu, { onConflict: "user_id,trade_id" }); if (error) throw error; }
    if (previews.length) { const rows = previews.map((p: any) => ({ user_id: p.user_id, evaluated_at: p.evaluated_at, event_type: p.type, arbitrage_id: p.arbitrage_id, comparative_symbol: p.comparative_symbol, trade_id: p.trade_id ?? null, signal: p.signal ?? null, gap_pct: p.gap_pct ?? null, zscore: p.zscore ?? null, profit_pct: p.profit_pct ?? null, threshold: p.threshold ?? null, message: p.message, email_status: "pending" })); const { error } = await db.from("hourly_arbitrage_message_preview").upsert(rows, { onConflict: "user_id,evaluated_at,event_type,arbitrage_id,comparative_symbol,trade_id", ignoreDuplicates: true }); if (error) throw error; }
    const email = await deliverPending();
    return json({ ok: true, evaluated_at: at, user_count: users.length, observations: obs.length, state_rows: su.length, trade_state_rows: tu.length, message_previews: previews.length, email_sent: email.sent, email_failed: email.failed, events, current_prices: prices, persisted: true });
  } catch (e) { console.error(e); return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500); }
});
