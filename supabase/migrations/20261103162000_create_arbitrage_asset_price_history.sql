create table if not exists public.arbitrage_asset_price_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  date date not null,
  time text not null default '21:00',
  fiat text not null default 'USD',
  price numeric(38,18) not null check (price > 0),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arbitrage_asset_price_history_pkey
    primary key (user_id, symbol, date, time, fiat)
);

create index if not exists arbitrage_asset_price_history_lookup_idx
  on public.arbitrage_asset_price_history (user_id, fiat, symbol, date);

alter table public.arbitrage_asset_price_history enable row level security;

grant select, insert, update on table public.arbitrage_asset_price_history to authenticated;

drop policy if exists arbitrage_asset_price_history_select_own
  on public.arbitrage_asset_price_history;
create policy arbitrage_asset_price_history_select_own
  on public.arbitrage_asset_price_history for select to authenticated
  using ((select auth.uid()) = user_id);

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
