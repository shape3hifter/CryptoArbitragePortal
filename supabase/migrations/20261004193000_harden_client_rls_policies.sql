-- Harden browser-facing RLS policies and explicitly lock down scheduler configuration.
-- Applied in production on 2026-10-04; kept here as versioned schema history.

DROP POLICY IF EXISTS "hourly_arbitrage_observations_select_own" ON public.hourly_arbitrage_observations;
CREATE POLICY "hourly_arbitrage_observations_select_own" ON public.hourly_arbitrage_observations FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "hourly_arbitrage_state_select_own" ON public.hourly_arbitrage_state;
CREATE POLICY "hourly_arbitrage_state_select_own" ON public.hourly_arbitrage_state FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "hourly_trade_state_select_own" ON public.hourly_trade_state;
CREATE POLICY "hourly_trade_state_select_own" ON public.hourly_trade_state FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "hourly_arbitrage_message_preview_insert_own" ON public.hourly_arbitrage_message_preview;
CREATE POLICY "hourly_arbitrage_message_preview_insert_own" ON public.hourly_arbitrage_message_preview FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "hourly_arbitrage_message_preview_select_own" ON public.hourly_arbitrage_message_preview;
CREATE POLICY "hourly_arbitrage_message_preview_select_own" ON public.hourly_arbitrage_message_preview FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "hourly_arbitrage_message_preview_update_own" ON public.hourly_arbitrage_message_preview;
CREATE POLICY "hourly_arbitrage_message_preview_update_own" ON public.hourly_arbitrage_message_preview FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_alert_events_insert_own" ON public.trade_alert_events;
CREATE POLICY "trade_alert_events_insert_own" ON public.trade_alert_events FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_alert_events_select_own" ON public.trade_alert_events;
CREATE POLICY "trade_alert_events_select_own" ON public.trade_alert_events FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_alerts_delete_own" ON public.trade_alerts;
CREATE POLICY "trade_alerts_delete_own" ON public.trade_alerts FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_alerts_insert_own" ON public.trade_alerts;
CREATE POLICY "trade_alerts_insert_own" ON public.trade_alerts FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_alerts_select_own" ON public.trade_alerts;
CREATE POLICY "trade_alerts_select_own" ON public.trade_alerts FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_alerts_update_own" ON public.trade_alerts;
CREATE POLICY "trade_alerts_update_own" ON public.trade_alerts FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_legs_delete_own" ON public.trade_legs;
CREATE POLICY "trade_legs_delete_own" ON public.trade_legs FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_legs_insert_own" ON public.trade_legs;
CREATE POLICY "trade_legs_insert_own" ON public.trade_legs FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_legs_select_own" ON public.trade_legs;
CREATE POLICY "trade_legs_select_own" ON public.trade_legs FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trade_legs_update_own" ON public.trade_legs;
CREATE POLICY "trade_legs_update_own" ON public.trade_legs FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trades_delete_own" ON public.trades;
CREATE POLICY "trades_delete_own" ON public.trades FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trades_insert_own" ON public.trades;
CREATE POLICY "trades_insert_own" ON public.trades FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trades_select_own" ON public.trades;
CREATE POLICY "trades_select_own" ON public.trades FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "trades_update_own" ON public.trades;
CREATE POLICY "trades_update_own" ON public.trades FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "hourly_arbitrage_scheduler_config_no_client_access" ON public.hourly_arbitrage_scheduler_config;
CREATE POLICY "hourly_arbitrage_scheduler_config_no_client_access"
  ON public.hourly_arbitrage_scheduler_config
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.hourly_arbitrage_scheduler_config FROM public, anon, authenticated;
