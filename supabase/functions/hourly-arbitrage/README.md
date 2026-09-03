# Hourly Arbitrage Edge Function

Backend one-shot evaluator for the hourly arbitrage alert feature.

## Safety

- This function is **not deployed** by this change.
- `dry_run` defaults to `true`.
- It never closes trades.
- It does not send WhatsApp/SMS yet.
- It writes to the three hourly tables only when called with `{"dry_run":false}`.
- It evaluates only arbitrages that have an open row in `public.trades`.

## What it does

1. Reads open trades from Supabase.
2. Loads the historical `data.csv` series.
3. Fetches the current CMC quote for the required assets.
4. Appends the current quote in memory only.
5. Reproduces the portal's rolling ratio / average / sample standard deviation / Z-score / BUY-HOLD-SELL calculation.
6. Calculates the signed derived GAP as `ratio / average - 1`.
7. Tracks state changes and BUY GAP threshold progression (5%, 10%, 15%).
8. Simulates each open trade's current result without closing it and tracks independent PROFIT levels (5%, 10%, 15%).
9. Persists observations/state/trade state only when `dry_run:false`.

## Required Supabase secrets

Supabase Edge Functions provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the deployed environment.

Optional:

- `ARBITRAGE_HISTORY_URL` — alternate CSV history source. Default is the repository's `main/data.csv` raw URL.

## Invocation

POST `/functions/v1/hourly-arbitrage` with an authenticated Supabase JWT.

Examples:

- Safe evaluation: `{}` or `{"dry_run":true}`
- Persist one evaluation: `{"dry_run":false}`
- Restrict to one user: `{"user_id":"...","dry_run":true}`

## Not implemented yet

- WhatsApp/SMS delivery.
- Scheduler / exact `HH:00:00` trigger.
- Production deployment.
- Message formatting.
- A configurable alert-level table/UI.
