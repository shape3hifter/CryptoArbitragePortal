-- Strengthen validation so every saved anchor/comparative is a catalogued crypto,
-- even while automatic monitoring is switched off.
create or replace function public.validate_arbitrage_configuration()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  normalized_symbols text[];
  required_symbol text;
  asset_type text;
  asset_enabled boolean;
  asset_cmc_id bigint;
begin
  new.name := btrim(new.name);
  new.reference_unit := upper(btrim(new.reference_unit));
  new.anchor_symbol := upper(btrim(new.anchor_symbol));

  select array_agg(upper(btrim(v)) order by ordinality)
    into normalized_symbols
  from unnest(coalesce(new.comparative_symbols, '{}'::text[]))
       with ordinality as item(v, ordinality);

  new.comparative_symbols := coalesce(normalized_symbols, '{}'::text[]);

  if cardinality(new.comparative_symbols) < 2 or cardinality(new.comparative_symbols) > 5 then
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

  if not exists (
    select 1 from public.arbitrage_assets a
    where a.symbol = new.reference_unit
  ) then
    raise exception 'A unidade de referência não existe no catálogo de ativos.';
  end if;

  foreach required_symbol in array array_prepend(new.anchor_symbol, new.comparative_symbols)
  loop
    select a.type, a.enabled, a.cmc_id
      into asset_type, asset_enabled, asset_cmc_id
    from public.arbitrage_assets a
    where a.symbol = required_symbol;

    if not found or asset_type <> 'CRYPTO' then
      raise exception 'O ativo % não está cadastrado como criptomoeda.', required_symbol;
    end if;

    if new.auto_monitoring_enabled and (not asset_enabled or asset_cmc_id is null) then
      raise exception 'O ativo % não está habilitado ou não possui CoinMarketCap ID para monitoramento.', required_symbol;
    end if;
  end loop;

  if new.auto_monitoring_enabled and not exists (
    select 1 from public.arbitrage_assets a
    where a.symbol = new.reference_unit and a.enabled = true
  ) then
    raise exception 'A unidade de referência não está habilitada no catálogo de ativos.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
