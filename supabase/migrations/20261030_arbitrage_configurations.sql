
-- Extend the existing Supabase catalog/configuration tables without creating
-- parallel structures. Existing records and strategy IDs are preserved.

alter table public.arbitrage_assets
  add column if not exists coingecko_id text,
  add column if not exists price_source text;

update public.arbitrage_assets
set
  price_source = case
    when type = 'FIAT' and symbol = 'USD' then 'internal'
    when type = 'FIAT' then 'frankfurter'
    else 'coinmarketcap'
  end,
  coingecko_id = case symbol
    when 'ADA' then 'cardano'
    when 'NIGHT' then 'midnight-3'
    when 'SNEK' then 'snek'
    when 'SOL' then 'solana'
    when 'BONK' then 'bonk'
    when 'WIF' then 'dogwifcoin'
    when 'BTC' then 'bitcoin'
    when 'ETH' then 'ethereum'
    when 'USDT' then 'tether'
    when 'USDC' then 'usd-coin'
    else coingecko_id
  end,
  updated_at = now();

alter table public.arbitrage_assets
  add constraint arbitrage_assets_price_source_check
  check (price_source in ('coinmarketcap','frankfurter','internal'));

-- Add widely-used reference assets. They are added to the same owner catalog
-- as the existing assets and can accumulate their own historical prices.
insert into public.arbitrage_assets
  (symbol, user_id, name, type, cmc_id, enabled, base_quote, coingecko_id, price_source)
select a.symbol, u.user_id, a.name, 'CRYPTO', a.cmc_id, true, 'USD', a.coingecko_id, 'coinmarketcap'
from (
  values
    ('BTC','Bitcoin',1::bigint,'bitcoin'),
    ('ETH','Ethereum',1027::bigint,'ethereum'),
    ('USDT','Tether',825::bigint,'tether'),
    ('USDC','USD Coin',3408::bigint,'usd-coin')
) as a(symbol,name,cmc_id,coingecko_id)
cross join (select user_id from public.arbitrage_assets where symbol='ADA' limit 1) u
on conflict (symbol) do update set
  name = excluded.name,
  cmc_id = excluded.cmc_id,
  coingecko_id = excluded.coingecko_id,
  price_source = excluded.price_source,
  enabled = true,
  updated_at = now();

alter table public.arbitrage_configurations
  add constraint arbitrage_configurations_user_id_id_key unique (user_id, id);

-- Strategy configuration writes affect the production monitor. Match the
-- existing Trades/observations AAL2 protection for all mutations.
drop policy if exists arbitrage_configurations_insert_own on public.arbitrage_configurations;
drop policy if exists arbitrage_configurations_update_own on public.arbitrage_configurations;
drop policy if exists arbitrage_configurations_delete_own on public.arbitrage_configurations;

create policy arbitrage_configurations_insert_own
  on public.arbitrage_configurations for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );
create policy arbitrage_configurations_update_own
  on public.arbitrage_configurations for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );
create policy arbitrage_configurations_delete_own
  on public.arbitrage_configurations for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );

drop policy if exists arbitrage_assets_insert_own on public.arbitrage_assets;
drop policy if exists arbitrage_assets_update_own on public.arbitrage_assets;
drop policy if exists arbitrage_assets_delete_own on public.arbitrage_assets;

create policy arbitrage_assets_insert_own
  on public.arbitrage_assets for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );
create policy arbitrage_assets_update_own
  on public.arbitrage_assets for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );
create policy arbitrage_assets_delete_own
  on public.arbitrage_assets for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );

-- Preserve related records by enforcing restrictive references from history,
-- trades and event previews to their stable strategy configuration IDs.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trades_arbitrage_configuration_fkey') then
    alter table public.trades add constraint trades_arbitrage_configuration_fkey
      foreign key (user_id, arbitrage_id)
      references public.arbitrage_configurations(user_id, id)
      on delete restrict not valid;
    alter table public.trades validate constraint trades_arbitrage_configuration_fkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hourly_arbitrage_observations_configuration_fkey') then
    alter table public.hourly_arbitrage_observations add constraint hourly_arbitrage_observations_configuration_fkey
      foreign key (user_id, arbitrage_id)
      references public.arbitrage_configurations(user_id, id)
      on delete restrict not valid;
    alter table public.hourly_arbitrage_observations validate constraint hourly_arbitrage_observations_configuration_fkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hourly_arbitrage_state_configuration_fkey') then
    alter table public.hourly_arbitrage_state add constraint hourly_arbitrage_state_configuration_fkey
      foreign key (user_id, arbitrage_id)
      references public.arbitrage_configurations(user_id, id)
      on delete restrict not valid;
    alter table public.hourly_arbitrage_state validate constraint hourly_arbitrage_state_configuration_fkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hourly_arbitrage_message_preview_configuration_fkey') then
    alter table public.hourly_arbitrage_message_preview add constraint hourly_arbitrage_message_preview_configuration_fkey
      foreign key (user_id, arbitrage_id)
      references public.arbitrage_configurations(user_id, id)
      on delete restrict not valid;
    alter table public.hourly_arbitrage_message_preview validate constraint hourly_arbitrage_message_preview_configuration_fkey;
  end if;
end $$;
