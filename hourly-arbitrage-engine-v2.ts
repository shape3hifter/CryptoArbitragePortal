export type Signal = "BUY" | "HOLD" | "SELL";

export type PricePoint = {
  evaluatedAt: string;
  prices: Record<string, number>;
};

export type ArbitrageConfig = {
  id: string;
  name: string;
  anchor: string;
  comparatives: string[];
  lookback?: number;
};

export type PreviousState = {
  userId: string;
  arbitrageId: string;
  comparativeSymbol: string;
  signal: Signal;
  gapPct: number | null;
  zscore: number | null;
  gapThresholdAlerted: number | null;
  cycleStartedAt: string | null;
  evaluatedAt: string;
};

export type ArbitrageEvaluation = {
  userId: string;
  arbitrageId: string;
  arbitrageName: string;
  anchorSymbol: string;
  comparativeSymbol: string;
  evaluatedAt: string;
  ratio: number;
  avg: number;
  stdev: number;
  zscore: number;
  signal: Signal;
  gapPct: number;
  previousSignal: Signal;
  stateChanged: boolean;
  gapThresholdAlerted: number | null;
  cycleStartedAt: string | null;
};

export type EngineEvent = {
  type: string;
  userId: string;
  arbitrageId: string;
  arbitrageName: string;
  comparativeSymbol: string;
  signal: Signal;
  previousSignal: Signal;
  gapPct: number;
  zscore: number;
  threshold?: number;
  evaluatedAt: string;
};

export type EngineResult = {
  evaluations: ArbitrageEvaluation[];
  events: EngineEvent[];
};

export const DEFAULT_LOOKBACK = 60;
export const DEFAULT_SIGNAL_Z = 1.5;
export const DEFAULT_BUY_GAP_LEVELS = [0.05, 0.10, 0.15];

function mean(values: number[]): number {
  if (!values.length) throw new Error("Cannot calculate mean of an empty series");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdev(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      (values.length - 1),
  );
}

function ratioFor(
  prices: Record<string, number>,
  comparative: string,
  anchor: string,
): number | null {
  const comparativePrice = Number(prices[comparative]);
  const anchorPrice = Number(prices[anchor]);

  if (
    !Number.isFinite(comparativePrice) ||
    !Number.isFinite(anchorPrice) ||
    anchorPrice <= 0
  ) {
    return null;
  }

  return comparativePrice / anchorPrice;
}

function signalFor(zscore: number, signalZ: number): Signal {
  if (zscore <= -signalZ) return "BUY";
  if (zscore >= signalZ) return "SELL";
  return "HOLD";
}

function highestNewLevel(
  value: number,
  levels: number[],
  previous: number | null,
): number | null {
  const previousLevel = previous ?? 0;
  const reached = levels.filter(
    (level) => value + 1e-12 >= level && level > previousLevel,
  );
  return reached.length ? Math.max(...reached) : null;
}

/**
 * Evaluates arbitrages independently of trades.
 *
 * A trade is deliberately NOT an input to this function. The caller supplies
 * the users and the arbitrage configurations that should be monitored.
 * This makes BUY/HOLD/SELL analysis available even when no trade is open.
 */
export function evaluateArbitrages(args: {
  users: string[];
  arbitrages: ArbitrageConfig[];
  history: PricePoint[];
  currentPrices: Record<string, number>;
  evaluatedAt: string;
  previousStates?: PreviousState[];
  signalZ?: number;
  defaultLookback?: number;
  buyGapLevels?: number[];
}): EngineResult {
  const {
    users,
    arbitrages,
    history,
    currentPrices,
    evaluatedAt,
    previousStates = [],
    signalZ = DEFAULT_SIGNAL_Z,
    defaultLookback = DEFAULT_LOOKBACK,
    buyGapLevels = DEFAULT_BUY_GAP_LEVELS,
  } = args;

  const previous = new Map<string, PreviousState>();
  for (const state of previousStates) {
    previous.set(
      `${state.userId}|${state.arbitrageId}|${state.comparativeSymbol}`,
      state,
    );
  }

  const points = [
    ...history.filter((point) => point.evaluatedAt !== evaluatedAt),
    { evaluatedAt, prices: currentPrices },
  ];

  const evaluations: ArbitrageEvaluation[] = [];
  const events: EngineEvent[] = [];

  for (const userId of users) {
    for (const arbitrage of arbitrages) {
      const lookback = arbitrage.lookback ?? defaultLookback;

      for (const comparative of arbitrage.comparatives) {
        const ratios = points
          .map((point) =>
            ratioFor(point.prices, comparative, arbitrage.anchor),
          )
          .filter((value): value is number => value !== null);

        if (ratios.length < lookback) continue;

        const ratio = ratios[ratios.length - 1];
        const window = ratios.slice(-lookback);
        const avg = mean(window);
        const stdev = sampleStdev(window);
        const zscore = stdev === 0 ? 0 : (ratio - avg) / stdev;
        const gapPct = avg === 0 ? 0 : ratio / avg - 1;
        const signal = signalFor(zscore, signalZ);

        const key = `${userId}|${arbitrage.id}|${comparative}`;
        const previousState = previous.get(key);
        const previousSignal = previousState?.signal ?? "HOLD";
        const stateChanged = signal !== previousSignal;

        let gapThresholdAlerted = previousState?.gapThresholdAlerted ?? null;
        let cycleStartedAt = previousState?.cycleStartedAt ?? null;

        if (stateChanged) {
          events.push({
            type: `STATE_CHANGE_${previousSignal}_TO_${signal}`,
            userId,
            arbitrageId: arbitrage.id,
            arbitrageName: arbitrage.name,
            comparativeSymbol: comparative,
            signal,
            previousSignal,
            gapPct,
            zscore,
            evaluatedAt,
          });
        }

        if (signal === "BUY") {
          if (previousSignal !== "BUY") {
            gapThresholdAlerted = null;
            cycleStartedAt = evaluatedAt;
          }

          const newLevel = highestNewLevel(
            Math.abs(gapPct),
            buyGapLevels,
            gapThresholdAlerted,
          );

          if (newLevel !== null) {
            gapThresholdAlerted = newLevel;
            events.push({
              type: `BUY_THRESHOLD_${Math.round(newLevel * 100)}`,
              userId,
              arbitrageId: arbitrage.id,
              arbitrageName: arbitrage.name,
              comparativeSymbol: comparative,
              signal,
              previousSignal,
              gapPct,
              zscore,
              threshold: newLevel,
              evaluatedAt,
            });
          }
        } else {
          gapThresholdAlerted = null;
          if (signal === "SELL" && previousSignal !== "SELL") {
            cycleStartedAt = evaluatedAt;
          }
          if (signal === "HOLD" && previousSignal !== "HOLD") {
            cycleStartedAt = null;
          }
        }

        evaluations.push({
          userId,
          arbitrageId: arbitrage.id,
          arbitrageName: arbitrage.name,
          anchorSymbol: arbitrage.anchor,
          comparativeSymbol: comparative,
          evaluatedAt,
          ratio,
          avg,
          stdev,
          zscore,
          signal,
          gapPct,
          previousSignal,
          stateChanged,
          gapThresholdAlerted,
          cycleStartedAt,
        });
      }
    }
  }

  return { evaluations, events };
}
