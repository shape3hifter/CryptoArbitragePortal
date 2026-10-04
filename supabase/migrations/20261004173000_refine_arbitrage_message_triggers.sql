ALTER TABLE public.hourly_arbitrage_state
  ADD COLUMN IF NOT EXISTS buy_opportunity_alerted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hourly_arbitrage_state.buy_opportunity_alerted IS
  'True when the BUY opportunity alert has already been sent for the current opportunity cycle; reset on SELL.';
