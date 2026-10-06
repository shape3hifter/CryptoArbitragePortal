-- Finalize MFA enforcement for the remaining client-facing trade/hourly tables.
-- Client access requires an AAL2 JWT after TOTP verification.

ALTER POLICY trade_legs_mfa_assurance
  ON public.trade_legs
  USING ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');

ALTER POLICY trade_alerts_mfa_assurance
  ON public.trade_alerts
  USING ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');

ALTER POLICY trade_alert_events_mfa_assurance
  ON public.trade_alert_events
  USING ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');

ALTER POLICY hourly_arbitrage_observations_mfa_assurance
  ON public.hourly_arbitrage_observations
  USING ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');

ALTER POLICY hourly_arbitrage_state_mfa_assurance
  ON public.hourly_arbitrage_state
  USING ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');

ALTER POLICY hourly_trade_state_mfa_assurance
  ON public.hourly_trade_state
  USING ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');

ALTER POLICY hourly_arbitrage_message_preview_mfa_assurance
  ON public.hourly_arbitrage_message_preview
  USING ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');
