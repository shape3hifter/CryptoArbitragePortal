-- Only authenticated users need the provider identifiers used to configure monitoring.
-- The public capture job continues to read the already-public, non-sensitive catalog fields.
grant select (coingecko_id, price_source)
  on table public.arbitrage_assets to authenticated;
