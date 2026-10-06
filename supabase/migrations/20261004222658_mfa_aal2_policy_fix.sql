-- Finalize MFA enforcement for the primary trades table.
-- Client access requires an AAL2 JWT after TOTP verification.
ALTER POLICY trades_mfa_assurance
  ON public.trades
  USING ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');
