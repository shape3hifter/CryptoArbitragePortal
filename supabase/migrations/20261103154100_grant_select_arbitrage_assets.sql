-- The asset catalog is intentionally readable through the public catalog policy.
-- SELECT is also required by PostgREST PATCH/UPSERT responses using return=representation.
grant select on table public.arbitrage_assets to anon, authenticated;
