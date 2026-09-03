import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HISTORY_URL = Deno.env.get("ARBITRAGE_HISTORY_URL") ?? "https://raw.githubusercontent.com/shape3hifter/CryptoArbitragePortal/main/data.csv";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SIGNAL_Z = 1.5;
const LOOKBACK = 60;
const BUY_GAP_LEVELS = [0.05, 0.10, 0.15];
const PROFIT_LEVELS = [0.05, 0.10, 0.15];
const CMC_IDS: Record<string, number> = {
  ADA: 2010,
  NIGHT: 39064,
  SNEK: 25264,
  SOL: 5426,
  BONK: 23095,
  WIF: 28752,
};

const ARBITRAGES: Record<string, { name: string; anchor: string; comparatives: string[] }> = {
  "arb-ada-night-snek": { name: "ADA / NIGHT / SNEK", anchor: "ADA", comparatives: ["NIGHT", "SNEK"] },
  "arb-sol-bonk-wif": { name: "SOL / BONK / WIF", anchor: "SOL", comparatives: ["BONK", "WIF"] },
};

type Point = { date: string; prices: Record<string, number> };
type OpenTrade = {
  id: string; user_id: string; arbitrage_id: string; arbitrage_name: string;
  anchor_symbol: string; initial_anchor_amount: number; current_asset: string;
  current_quantity: number;
};
type StateRow = {
  user_id: string; arbitrage_id: string; comparative_symbol: string; signal: string;
  gap_pct: number | null; zscore: number | null; gap_threshold_alerted: number | null;
  cycle_started_at: string | null; evaluated_at: string; updated_at: string;
};
type TradeStateRow = {
  user_id: string; trade_id: string; profit_pct: number | null;
  profit_threshold_alerted: number | null; evaluated_at: string; updated_at: string;
};

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function sampleSd(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1));
}
function signalFor(z: number) {
  if (z <= -SIGNAL_Z) return "BUY";
  if (z >= SIGNAL_Z) return "SELL";
  return "HOLD";
}
function ratioFor(prices: Record<string, number>, asset: string, anchor: string) {
  const a = Number(prices[asset]);
  const b = Number(prices[anchor]);
  return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null;
}
function evaluateSeries(points: Point[], asset: string, anchor: string) {
  const ratios = points.map((p) => ratioFor(p.prices, asset, anchor)).filter((x): x is number => x !== null);
  if (ratios.length < LOOKBACK) return null;
  const ratio = ratios[ratios.length - 1];
  const window = ratios.slice(-LOOKBACK);
  const avg = mean(window);
  const stdev = sampleSd(window);
  const zscore = stdev === 0 ? 0 : (ratio - avg) / stdev;
  const signal = signalFor(zscore);
  const gapPct = avg === 0 ? null : ratio / avg - 1;
  return { ratio, avg, stdev, zscore, signal, gapPct };
}
function highestNewLevel(valueMagnitude: number, levels: number[], previous: number | null) {
  const prev = previous ?? 0;
  const reached = levels.filter((level) => valueMagnitude + 1e-12 >= level && level > prev);
  return reached.length ? Math.max(...reached) : null;
}
function roundHourIso(now = new Date()) {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

async function loadHistory(): Promise<Point[]> {
  const response = await fetch(HISTORY_URL, { headers: { accept: "text/csv" } });
  if (!response.ok) throw new Error(`history fetch failed: ${response.status}`);
  const text = await response.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((x) => x.trim());
  const dateIndex = headers.findIndex((x) => x.toLowerCase() === "date");
  const points: Point[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    if (dateIndex < 0 || !cells[dateIndex]) continue;
    const prices: Record<string, number> = {};
    for (const symbol of Object.keys(CMC_IDS)) {
      const index = headers.findIndex((x) => x.toUpperCase() === symbol);
      if (index >= 0) prices[symbol] = Number(cells[index]);
    }
    points.push({ date: cells[dateIndex], prices });
  }
  return points;
}

async function loadCurrentQuotes(symbols: string[]) {
  const ids = symbols.map((s) => CMC_IDS[s]).filter(Boolean).join(",");
  const url = `https://api.coinmarketcap.com/data-api/v3/cryptocurrency/quotes/latest?id=${ids}&convertId=2781`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`CMC quote fetch failed: ${response.status}`);
  const json = await response.json();
  const prices: Record<string, number> = {};
  for (const item of json?.data?.data ?? []) {
    const symbol = String(item.symbol ?? "").toUpperCase();
    const value = Number(item?.quote?.USD?.price ?? item?.quotes?.[0]?.price);
    if (symbol && Number.isFinite(value)) prices[symbol] = value;
  }
  if (Object.keys(prices).length < symbols.length) {
    throw new Error(`CMC returned incomplete quote set: ${Object.keys(prices).join(",")}`);
  }
  return prices;
}

async function loadOpenTrades() {
  const { data, error } = await supabase
    .from("trades")
    .select("id,user_id,arbitrage_id,arbitrage_name,anchor_symbol,initial_anchor_amount,current_asset,current_quantity")
    .is("closed_at", null);
  if (error) throw error;
  return (data ?? []) as OpenTrade[];
}

async function loadStates(userIds: string[]) {
  if (!userIds.length) return [] as StateRow[];
  const { data, error } = await supabase.from("hourly_arbitrage_state").select("*").in("user_id", userIds);
  if (error) throw error;
  return (data ?? []) as StateRow[];
}
async function loadTradeStates(userIds: string[]) {
  if (!userIds.length) return [] as TradeStateRow[];
  const { data, error } = await supabase.from("hourly_trade_state").select("*").in("user_id", userIds);
  if (error) throw error;
  return (data ?? []) as TradeStateRow[];
}

function eventRecord(base: Record<string, unknown>, type: string, threshold?: number | null) {
  return { ...base, type, threshold: threshold ?? null };
}

Deno.serve(async (req) => {
  const started = Date.now();
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "POST required" }), { status: 405, headers: { "content-type": "application/json" } });
    }

    // JWT verification is enabled on the function. The service-role client is used only
    // for backend reads/writes after the request has been authenticated by Supabase.
    const body = await req.json().catch(() => ({}));
    const requestedUserId = typeof body.user_id === "string" ? body.user_id : null;
    const requestedDryRun = body.dry_run !== false;
    const evaluatedAt = roundHourIso(new Date());

    const allTrades = await loadOpenTrades();
    const openTrades = requestedUserId ? allTrades.filter((t) => t.user_id === requestedUserId) : allTrades;
    if (!openTrades.length) {
      return new Response(JSON.stringify({ ok: true, dry_run: requestedDryRun, evaluated_at: evaluatedAt, arbitrages: [], trades: [], elapsed_ms: Date.now() - started }), { headers: { "content-type": "application/json" } });
    }

    const userIds = [...new Set(openTrades.map((t) => t.user_id))];
    const [history, stateRows, tradeStateRows] = await Promise.all([loadHistory(), loadStates(userIds), loadTradeStates(userIds)]);
    const symbols = [...new Set(openTrades.flatMap((t) => [t.anchor_symbol, t.current_asset]))];
    const quoteSymbols = [...new Set([...symbols, ...Object.values(ARBITRAGES).flatMap((a) => [a.anchor, ...a.comparatives])])];
    const currentPrices = await loadCurrentQuotes(quoteSymbols);
    const currentPoint: Point = { date: evaluatedAt, prices: currentPrices };
    const points = [...history, currentPoint];

    const previousState = new Map(stateRows.map((r) => [`${r.user_id}|${r.arbitrage_id}|${r.comparative_symbol}`, r]));
    const previousTradeState = new Map(tradeStateRows.map((r) => [`${r.user_id}|${r.trade_id}`, r]));
    const events: Record<string, unknown>[] = [];
    const observationRows: Record<string, unknown>[] = [];
    const stateUpserts: StateRow[] = [];
    const tradeStateUpserts: TradeStateRow[] = [];

    for (const userId of userIds) {
      const userTrades = openTrades.filter((t) => t.user_id === userId);
      const arbitrageIds = [...new Set(userTrades.map((t) => t.arbitrage_id))];
      for (const arbitrageId of arbitrageIds) {
        const config = ARBITRAGES[arbitrageId];
        if (!config) continue;
        for (const asset of config.comparatives) {
          const result = evaluateSeries(points, asset, config.anchor);
          if (!result) continue;
          const key = `${userId}|${arbitrageId}|${asset}`;
          const prev = previousState.get(key);
          const previousSignal = prev?.signal ?? "HOLD";
          let thresholdAlerted = prev?.gap_threshold_alerted ?? null;
          let cycleStartedAt = prev?.cycle_started_at ?? null;

          if (result.signal !== previousSignal) {
            events.push(eventRecord({ user_id: userId, arbitrage_id: arbitrageId, comparative_symbol: asset, signal: result.signal, previous_signal: previousSignal, evaluated_at: evaluatedAt }, `STATE_CHANGE_${previousSignal}_TO_${result.signal}`));
          }

          if (result.signal === "BUY") {
            if (previousSignal !== "BUY") {
              thresholdAlerted = null;
              cycleStartedAt = evaluatedAt;
            }
            const level = highestNewLevel(Math.abs(result.gapPct ?? 0), BUY_GAP_LEVELS, thresholdAlerted);
            if (level !== null) {
              thresholdAlerted = level;
              events.push(eventRecord({ user_id: userId, arbitrage_id: arbitrageId, comparative_symbol: asset, signal: result.signal, gap_pct: result.gapPct, evaluated_at: evaluatedAt }, `BUY_THRESHOLD_${Math.round(level * 100)}`, level));
            }
          } else if (result.signal !== "BUY") {
            thresholdAlerted = null;
            if (result.signal === "SELL" && previousSignal !== "SELL") cycleStartedAt = evaluatedAt;
            if (result.signal === "HOLD" && previousSignal !== "HOLD") cycleStartedAt = null;
          }

          observationRows.push({ user_id: userId, arbitrage_id: arbitrageId, comparative_symbol: asset, anchor_symbol: config.anchor, evaluated_at: evaluatedAt, snapshot_at: evaluatedAt, ratio: result.ratio, avg: result.avg, stdev: result.stdev, zscore: result.zscore, signal: result.signal, gap_pct: result.gapPct });
          stateUpserts.push({ user_id: userId, arbitrage_id: arbitrageId, comparative_symbol: asset, signal: result.signal, gap_pct: result.signal === "BUY" ? result.gapPct : null, zscore: result.zscore, gap_threshold_alerted: thresholdAlerted, cycle_started_at: cycleStartedAt, evaluated_at: evaluatedAt, updated_at: evaluatedAt });
        }
      }
    }

    for (const trade of openTrades) {
      const ratio = ratioFor(currentPrices, trade.current_asset, trade.anchor_symbol);
      if (ratio === null || !Number.isFinite(Number(trade.initial_anchor_amount)) || Number(trade.initial_anchor_amount) === 0) continue;
      const currentAnchorAmount = Number(trade.current_quantity) * ratio;
      const profitPct = currentAnchorAmount / Number(trade.initial_anchor_amount) - 1;
      const key = `${trade.user_id}|${trade.id}`;
      const prev = previousTradeState.get(key);
      const previousLevel = prev?.profit_threshold_alerted ?? null;
      const level = highestNewLevel(Math.max(0, profitPct), PROFIT_LEVELS, previousLevel);
      let profitThresholdAlerted = previousLevel;
      if (level !== null) {
        profitThresholdAlerted = level;
        events.push(eventRecord({ user_id: trade.user_id, trade_id: trade.id, profit_pct: profitPct, current_anchor_amount: currentAnchorAmount, evaluated_at: evaluatedAt }, `PROFIT_THRESHOLD_${Math.round(level * 100)}`, level));
      }
      tradeStateUpserts.push({ user_id: trade.user_id, trade_id: trade.id, profit_pct: profitPct, profit_threshold_alerted: profitThresholdAlerted, evaluated_at: evaluatedAt, updated_at: evaluatedAt });
    }

    if (!requestedDryRun) {
      if (observationRows.length) {
        const { error } = await supabase.from("hourly_arbitrage_observations").upsert(observationRows, { onConflict: "user_id,arbitrage_id,comparative_symbol,evaluated_at" });
        if (error) throw error;
      }
      if (stateUpserts.length) {
        const { error } = await supabase.from("hourly_arbitrage_state").upsert(stateUpserts, { onConflict: "user_id,arbitrage_id,comparative_symbol" });
        if (error) throw error;
      }
      if (tradeStateUpserts.length) {
        const { error } = await supabase.from("hourly_trade_state").upsert(tradeStateUpserts, { onConflict: "user_id,trade_id" });
        if (error) throw error;
      }
    }

    return new Response(JSON.stringify({ ok: true, dry_run: requestedDryRun, evaluated_at: evaluatedAt, current_prices: currentPrices, events, persisted: !requestedDryRun, observations: observationRows.length, state_rows: stateUpserts.length, trade_state_rows: tradeStateUpserts.length, elapsed_ms: Date.now() - started }), { headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
