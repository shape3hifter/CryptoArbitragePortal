-- Central registry for arbitrage strategies and their required assets.
-- The public asset catalog contains only market metadata; strategy configurations remain owner-scoped.

create table if not exists public.arbitrage_assets (
  symbol text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('CRYPTO','FIAT')),
  cmc_id bigint,
  enabled boolean not null default true,
  base_quote text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arbitrage_assets_symbol_format check (symbol = upper(btrim(symbol)) and symbol ~ '^[A-Z0-9._-]{2,15}$'),
  constraint arbitrage_assets_cmc_id_positive check (cmc_id is null or cmc_id > 0)
);

alter table public.arbitrage_assets enable row level security;
revoke all on table public.arbitrage_assets from anon, authenticated;
grant select on table public.arbitrage_assets to anon, authenticated;
grant insert, update, delete on table public.arbitrage_assets to authenticated;

drop policy if exists arbitrage_assets_public_read on public.arbitrage_assets;
create policy arbitrage_assets_public_read on public.arbitrage_assets
  for select to anon, authenticated using (true);
drop policy if exists arbitrage_assets_insert_own on public.arbitrage_assets;
create policy arbitrage_assets_insert_own on public.arbitrage_assets
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists arbitrage_assets_update_own on public.arbitrage_assets;
create policy arbitrage_assets_update_own on public.arbitrage_assets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists arbitrage_assets_delete_own on public.arbitrage_assets;
create policy arbitrage_assets_delete_own on public.arbitrage_assets
  for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.arbitrage_configurations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  reference_unit text not null references public.arbitrage_assets(symbol),
  anchor_symbol text not null references public.arbitrage_assets(symbol),
  comparative_symbols text[] not null,
  default_lookback_days integer not null default 60,
  auto_monitoring_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arbitrage_configurations_name_not_empty check (length(btrim(name)) between 1 and 80),
  constraint arbitrage_configurations_symbol_format check (
    reference_unit = upper(btrim(reference_unit))
    and anchor_symbol = upper(btrim(anchor_symbol))
    and reference_unit ~ '^[A-Z0-9._-]{2,15}$'
    and anchor_symbol ~ '^[A-Z0-9._-]{2,15}$'
  ),
  constraint arbitrage_configurations_lookback_allowed check (default_lookback_days in (30,60,90,180,365)),
  constraint arbitrage_configurations_comparative_count check (cardinality(comparative_symbols) between 2 and 5),
  constraint arbitrage_configurations_anchor_not_comparative check (not (anchor_symbol = any(comparative_symbols)))
);

create index if not exists arbitrage_configurations_user_idx
  on public.arbitrage_configurations(user_id);

alter table public.arbitrage_configurations enable row level security;
revoke all on table public.arbitrage_configurations from anon, authenticated;
grant select, insert, update, delete on table public.arbitrage_configurations to authenticated;

drop policy if exists arbitrage_configurations_select_own on public.arbitrage_configurations;
create policy arbitrage_configurations_select_own on public.arbitrage_configurations
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists arbitrage_configurations_insert_own on public.arbitrage_configurations;
create policy arbitrage_configurations_insert_own on public.arbitrage_configurations
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists arbitrage_configurations_update_own on public.arbitrage_configurations;
create policy arbitrage_configurations_update_own on public.arbitrage_configurations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists arbitrage_configurations_delete_own on public.arbitrage_configurations;
create policy arbitrage_configurations_delete_own on public.arbitrage_configurations
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.validate_arbitrage_configuration()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  normalized_symbols text[];
  symbol_count integer;
  required_symbol text;
begin
  new.name := btrim(new.name);
  new.reference_unit := upper(btrim(new.reference_unit));
  new.anchor_symbol := upper(btrim(new.anchor_symbol));

  select array_agg(upper(btrim(v)) order by ordinality)
    into normalized_symbols
  from unnest(coalesce(new.comparative_symbols, '{}'::text[]))
       with ordinality as item(v, ordinality);

  new.comparative_symbols := coalesce(normalized_symbols, '{}'::text[]);
  symbol_count := cardinality(new.comparative_symbols);

  if symbol_count < 2 or symbol_count > 5 then
    raise exception 'A arbitragem deve ter entre 2 e 5 comparativos.';
  end if;

  if exists (
    select 1 from unnest(new.comparative_symbols) as item(symbol)
    group by symbol having count(*) > 1
  ) then
    raise exception 'Não são permitidos comparativos duplicados.';
  end if;

  if new.anchor_symbol = any(new.comparative_symbols) then
    raise exception 'O Crypto Anchor não pode ser um comparativo.';
  end if;

  if TG_OP = 'UPDATE' and OLD.auto_monitoring_enabled and (
    new.anchor_symbol is distinct from old.anchor_symbol
    or new.comparative_symbols is distinct from old.comparative_symbols
    or new.default_lookback_days is distinct from old.default_lookback_days
  ) then
    raise exception 'Desligue o monitoramento e salve antes de alterar Anchor, comparativos ou janela.';
  end if;

  if new.auto_monitoring_enabled then
    if not exists (
      select 1 from public.arbitrage_assets a
      where a.symbol = new.reference_unit and a.enabled = true
    ) then
      raise exception 'A unidade de referência não está habilitada no catálogo de ativos.';
    end if;

    foreach required_symbol in array array_prepend(new.anchor_symbol, new.comparative_symbols)
    loop
      if not exists (
        select 1 from public.arbitrage_assets a
        where a.symbol = required_symbol
          and a.enabled = true
          and a.type = 'CRYPTO'
          and a.cmc_id is not null
      ) then
        raise exception 'O ativo % não está habilitado ou não possui CoinMarketCap ID para monitoramento.', required_symbol;
      end if;
    end loop;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_arbitrage_configuration_before_write
  on public.arbitrage_configurations;
create trigger validate_arbitrage_configuration_before_write
  before insert or update on public.arbitrage_configurations
  for each row execute function public.validate_arbitrage_configuration();

create or replace function public.prevent_arbitrage_configuration_history_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.auto_monitoring_enabled then
    raise exception 'Desligue o monitoramento automático antes de remover a arbitragem.';
  end if;

  if exists (
    select 1 from public.hourly_arbitrage_observations
    where user_id = old.user_id and arbitrage_id = old.id
  ) or exists (
    select 1 from public.hourly_arbitrage_state
    where user_id = old.user_id and arbitrage_id = old.id
  ) or exists (
    select 1 from public.hourly_arbitrage_message_preview
    where user_id = old.user_id and arbitrage_id = old.id
  ) or exists (
    select 1 from public.trades
    where user_id = old.user_id and arbitrage_id = old.id
  ) then
    raise exception 'Esta arbitragem possui histórico ou trades associados. Desative o monitoramento em vez de excluí-la.';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_arbitrage_configuration_history_delete_before_delete
  on public.arbitrage_configurations;
create trigger prevent_arbitrage_configuration_history_delete_before_delete
  before delete on public.arbitrage_configurations
  for each row execute function public.prevent_arbitrage_configuration_history_delete();

with owner as (
  select user_id from public.trades order by created_at asc limit 1
),
assets(symbol, name, type, cmc_id) as (
  values
    ('USD','US Dollar','FIAT',null::bigint),
    ('BRL','Brazilian Real','FIAT',null::bigint),
    ('EUR','Euro','FIAT',null::bigint),
    ('ADA','Cardano','CRYPTO',2010::bigint),
    ('NIGHT','NIGHT','CRYPTO',39064::bigint),
    ('SNEK','Snek','CRYPTO',25264::bigint),
    ('SOL','Solana','CRYPTO',5426::bigint),
    ('BONK','Bonk','CRYPTO',23095::bigint),
    ('WIF','dogwifhat','CRYPTO',28752::bigint)
)
insert into public.arbitrage_assets(symbol,user_id,name,type,cmc_id,enabled,base_quote)
select a.symbol,o.user_id,a.name,a.type,a.cmc_id,true,'USD'
from assets a cross join owner o
on conflict (symbol) do nothing;

with owner as (
  select user_id from public.trades order by created_at asc limit 1
),
configs(id,name,reference_unit,anchor_symbol,comparative_symbols,lookback) as (
  values
    ('arb-ada-night-snek','ADA / NIGHT / SNEK','USD','ADA',array['NIGHT','SNEK']::text[],60),
    ('arb-sol-bonk-wif','SOL / BONK / WIF','USD','SOL',array['BONK','WIF']::text[],60)
)
insert into public.arbitrage_configurations(
  id,user_id,name,reference_unit,anchor_symbol,comparative_symbols,
  default_lookback_days,auto_monitoring_enabled
)
select c.id,o.user_id,c.name,c.reference_unit,c.anchor_symbol,c.comparative_symbols,c.lookback,true
from configs c cross join owner o
on conflict (id) do nothing;
