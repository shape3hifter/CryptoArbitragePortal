drop policy if exists arbitrage_asset_price_history_insert_own
  on public.arbitrage_asset_price_history;
create policy arbitrage_asset_price_history_insert_own
  on public.arbitrage_asset_price_history for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );

drop policy if exists arbitrage_asset_price_history_update_own
  on public.arbitrage_asset_price_history;
create policy arbitrage_asset_price_history_update_own
  on public.arbitrage_asset_price_history for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );
