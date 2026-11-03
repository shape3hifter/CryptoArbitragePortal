alter table public.arbitrage_assets
  add column if not exists is_currency boolean not null default false;

update public.arbitrage_assets
set is_currency = (symbol in ('BRL','BTC','EUR','USD')),
    updated_at = now()
where symbol in ('BRL','BTC','EUR','USD')
   or is_currency is distinct from false;
