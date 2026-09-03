export type MessageEvent = {
  type: string;
  arbitrage_name?: string;
  strategy?: string;
  comparative_symbol?: string;
  signal?: string;
  previous_signal?: string;
  gap_pct?: number | null;
  zscore?: number | null;
  profit_pct?: number | null;
  threshold?: number | null;
  has_open_trade?: boolean;
};

const pct = (value: number | null | undefined, digits = 1) =>
  Number.isFinite(value) ? `${(Number(value) * 100).toFixed(digits)}%` : "—";

const signedPct = (value: number | null | undefined, digits = 1) => {
  if (!Number.isFinite(value)) return "—";
  const n = Number(value) * 100;
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
};

const z = (value: number | null | undefined) =>
  Number.isFinite(value) ? Number(value).toFixed(2) : "—";

const header = (e: MessageEvent) =>
  `${e.arbitrage_name ?? e.arbitrage_name ?? "ARBITRAGEM"}`;

const positionLine = (e: MessageEvent) =>
  e.has_open_trade ? "\n💼 **Trade aberto**" : "\n⚠️ **Não há trade aberto.**";

export function formatArbitrageMessage(e: MessageEvent): string | null {
  const name = header(e);
  const asset = e.comparative_symbol ?? "—";
  const strategy = e.strategy ? `\n${e.strategy}` : "";
  const metrics = `\n📊 ${asset}: **${e.signal ?? "—"}**\nZ-Score: **${z(e.zscore)}**\nGAP: **${signedPct(e.gap_pct)}**`;

  if (e.type === "STATE_CHANGE_HOLD_TO_BUY") {
    return `🟢 **ARBITRAGEM — BUY**\n\n**${name}**${strategy}${metrics}${positionLine(e)}`;
  }

  if (e.type === "STATE_CHANGE_HOLD_TO_SELL") {
    return `🔴 **ARBITRAGEM — SELL**\n\n**${name}**${strategy}${metrics}${positionLine(e)}\n\nSinal de saída da condição de BUY.`;
  }

  if (e.type === "STATE_CHANGE_BUY_TO_HOLD") {
    return `🔵 **ARBITRAGEM — BUY → HOLD**\n\n**${name}**${strategy}${metrics}\n\nA condição de **BUY deixou de estar ativa**.`;
  }

  if (e.type === "STATE_CHANGE_SELL_TO_HOLD") {
    return `🔵 **ARBITRAGEM — SELL → HOLD**\n\n**${name}**${strategy}${metrics}\n\nA condição de **SELL deixou de estar ativa**.`;
  }

  if (e.type.startsWith("BUY_THRESHOLD_")) {
    const level = Number(e.threshold) * 100;
    const trade = e.has_open_trade
      ? `\n\n💼 **Trade aberto**\nResultado atual: **${signedPct(e.profit_pct)}**`
      : "\n\n⚠️ **Não há trade aberto.**";
    return `🟢 **ARBITRAGEM — BUY - ${level.toFixed(0)}%**\n\n**${name}**${strategy}${metrics}\n\n📈 GAP atingiu **${level.toFixed(0)}%**${trade}`;
  }

  if (e.type.startsWith("PROFIT_THRESHOLD_")) {
    const level = Number(e.threshold) * 100;
    return `💰 **TRADE — LUCRO +${level.toFixed(0)}%**\n\n**${name}**${strategy}\n\n💵 Resultado atual: **${signedPct(e.profit_pct)}**\n\n📌 Nível de lucro atingido: **${level.toFixed(0)}%**\n\n💼 Trade permanece aberto.`;
  }

  return null;
}
