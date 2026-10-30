-- Restrict direct invocation of trigger-only functions.
-- PostgreSQL invokes installed trigger functions as part of table operations;
-- browser-facing roles do not need EXECUTE on these routines.
revoke all on function public.prevent_arbitrage_configuration_history_delete() from public, anon, authenticated;
revoke all on function public.validate_arbitrage_configuration() from public, anon, authenticated;
