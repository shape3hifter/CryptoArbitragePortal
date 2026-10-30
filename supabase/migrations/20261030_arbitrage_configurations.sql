
create table if not exists public.arbitrage_assets (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9._-]{2,15}$'),
  name text not null,
  asset_type text not null check (asset_type in ('CRYPTO','FIAT')),
  cmc_id bigint,
  coingecko_id text,
  price_source text not null check (price_source in ('coinmarketcap','frankfurter','internal')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol),
  check (
    (asset_type = 'CRYPTO' and cmc_id is not null and cmc_id > 0 and price_source = 'coinmarketcap')
    or
    (asset_type = 'FIAT' and price_source in ('frankfurter','internal'))
  )
);

create table if not exists public.arbitrage_configurations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  reference_unit text not null,
  anchor_symbol text not null,
  comparative_symbols text[] not null,
  default_lookback_days integer not null default 60 check (default_lookback_days in (30,60,90,180,365)),
  auto_monitoring_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, reference_unit) references public.arbitrage_assets(user_id, symbol) on update cascade on delete restrict,
  foreign key (user_id, anchor_symbol) references public.arbitrage_assets(user_id, symbol) on update cascade on delete restrict,
  check (cardinality(comparative_symbols) between 2 and 5),
  check (not (anchor_symbol = any(comparative_symbols)))
);

create index if not exists arbitrage_configurations_user_idx
  on public.arbitrage_configurations(user_id);
create index if not exists arbitrage_assets_enabled_idx
  on public.arbitrage_assets(enabled, symbol);

alter table public.arbitrage_assets enable row level security;
alter table public.arbitrage_configurations enable row level security;

drop policy if exists arbitrage_assets_select_own on public.arbitrage_assets;
create policy arbitrage_assets_select_own
  on public.arbitrage_assets for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists arbitrage_assets_manage_own on public.arbitrage_assets;
create policy arbitrage_assets_manage_own
  on public.arbitrage_assets for all to authenticated
  using ((select auth.uid()) = user_id and (select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.uid()) = user_id and (select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists arbitrage_configurations_select_own on public.arbitrage_configurations;
create policy arbitrage_configurations_select_own
  on public.arbitrage_configurations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists arbitrage_configurations_manage_own on public.arbitrage_configurations;
create policy arbitrage_configurations_manage_own
  on public.arbitrage_configurations for all to authenticated
  using ((select auth.uid()) = user_id and (select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.uid()) = user_id and (select auth.jwt() ->> 'aal') = 'aal2');

grant select, insert, update, delete on public.arbitrage_assets to authenticated, service_role;
grant select, insert, update, delete on public.arbitrage_configurations to authenticated, service_role;

create or replace view public.capture_asset_catalog as
select distinct on (symbol)
  symbol, asset_type, cmc_id, coingecko_id, price_source
from public.arbitrage_assets
where enabled = true
order by symbol, created_at asc;

revoke all on public.capture_asset_catalog from public;
grant select on public.capture_asset_catalog to anon, authenticated, service_role;

insert into public.arbitrage_assets
  (user_id, symbol, name, asset_type, cmc_id, coingecko_id, price_source, enabled)
select u.user_id, a.symbol, a.name, a.asset_type, a.cmc_id, a.coingecko_id, a.price_source, true
from (select distinct user_id from public.trades) u
cross join (values
  ('USD','US Dollar','FIAT',null::bigint,null::text,'internal'),
  ('BRL','Brazilian Real','FIAT',null::bigint,null::text,'frankfurter'),
  ('EUR','Euro','FIAT',null::bigint,null::text,'frankfurter'),
  ('ADA','Cardano','CRYPTO',2010::bigint,'cardano','coinmarketcap'),
  ('NIGHT','NIGHT','CRYPTO',39064::bigint,'midnight-3','coinmarketcap'),
  ('SNEK','Snek','CRYPTO',25264::bigint,'snek','coinmarketcap'),
  ('SOL','Solana','CRYPTO',5426::bigint,'solana','coinmarketcap'),
  ('BONK','Bonk','CRYPTO',23095::bigint,'bonk','coinmarketcap'),
  ('WIF','dogwifhat','CRYPTO',28752::bigint,'dogwifcoin','coinmarketcap'),
  ('BTC','Bitcoin','CRYPTO',1::bigint,'bitcoin','coinmarketcap'),
  ('ETH','Ethereum','CRYPTO',1027::bigint,'ethereum','coinmarketcap'),
  ('USDT','Tether','CRYPTO',825::bigint,'tether','coinmarketcap'),
  ('USDC','USDC','CRYPTO',3408::bigint,'usd-coin','coinmarketcap')
) as a(symbol,name,asset_type,cmc_id,coingecko_id,price_source)
on conflict (user_id, symbol) do update set
  name = excluded.name,
  asset_type = excluded.asset_type,
  cmc_id = excluded.cmc_id,
  coingecko_id = excluded.coingecko_id,
  price_source = excluded.price_source,
  enabled = true,
  updated_at = now();

insert into public.arbitrage_configurations
  (id, user_id, name, reference_unit, anchor_symbol, comparative_symbols, default_lookback_days, auto_monitoring_enabled)
select c.id, u.user_id, c.name, 'USD', c.anchor, c.comparatives, 60, true
from (select distinct user_id from public.trades) u
cross join (values
  ('arb-ada-night-snek','ADA / NIGHT / SNEK','ADA',array['NIGHT','SNEK']::text[]),
  ('arb-sol-bonk-wif','SOL / BONK / WIF','SOL',array['BONK','WIF']::text[])
) as c(id,name,anchor,comparatives)
on conflict (id) do nothing;

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
