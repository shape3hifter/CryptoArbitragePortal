-- Opt-in MFA enforcement for users with a verified TOTP factor.
-- Users without a verified factor continue to work at AAL1.
-- Once a factor is verified, client access requires an AAL2 JWT.

DROP POLICY IF EXISTS "trades_mfa_assurance" ON public.trades;
CREATE POLICY "trades_mfa_assurance"
  ON public.trades
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  )
  WITH CHECK (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  );

DROP POLICY IF EXISTS "trade_legs_mfa_assurance" ON public.trade_legs;
CREATE POLICY "trade_legs_mfa_assurance"
  ON public.trade_legs
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  )
  WITH CHECK (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  );

DROP POLICY IF EXISTS "trade_alerts_mfa_assurance" ON public.trade_alerts;
CREATE POLICY "trade_alerts_mfa_assurance"
  ON public.trade_alerts
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  )
  WITH CHECK (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  );

DROP POLICY IF EXISTS "trade_alert_events_mfa_assurance" ON public.trade_alert_events;
CREATE POLICY "trade_alert_events_mfa_assurance"
  ON public.trade_alert_events
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  )
  WITH CHECK (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  );

DROP POLICY IF EXISTS "hourly_arbitrage_observations_mfa_assurance" ON public.hourly_arbitrage_observations;
CREATE POLICY "hourly_arbitrage_observations_mfa_assurance"
  ON public.hourly_arbitrage_observations
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  )
  WITH CHECK (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  );

DROP POLICY IF EXISTS "hourly_arbitrage_state_mfa_assurance" ON public.hourly_arbitrage_state;
CREATE POLICY "hourly_arbitrage_state_mfa_assurance"
  ON public.hourly_arbitrage_state
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  )
  WITH CHECK (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  );

DROP POLICY IF EXISTS "hourly_trade_state_mfa_assurance" ON public.hourly_trade_state;
CREATE POLICY "hourly_trade_state_mfa_assurance"
  ON public.hourly_trade_state
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  )
  WITH CHECK (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  );

DROP POLICY IF EXISTS "hourly_arbitrage_message_preview_mfa_assurance" ON public.hourly_arbitrage_message_preview;
CREATE POLICY "hourly_arbitrage_message_preview_mfa_assurance"
  ON public.hourly_arbitrage_message_preview
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  )
  WITH CHECK (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1','aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  );
