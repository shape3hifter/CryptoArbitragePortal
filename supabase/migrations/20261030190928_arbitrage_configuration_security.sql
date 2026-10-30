-- Expose only non-identifying asset metadata through the public catalog.
revoke select on table public.arbitrage_assets from anon, authenticated;
grant select (symbol, name, type, cmc_id, enabled, base_quote)
  on table public.arbitrage_assets to anon, authenticated;

-- Ensure delete protection sees history even when the caller cannot directly
-- select the AAL2-protected history tables. RLS still protects the configuration
-- row itself; this function also checks the authenticated owner explicitly.
create or replace function public.prevent_arbitrage_configuration_history_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.user_id then
    raise exception 'Você não pode remover uma configuração de outro usuário.';
  end if;

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
