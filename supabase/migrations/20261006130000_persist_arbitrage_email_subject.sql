ALTER TABLE public.hourly_arbitrage_message_preview
  ADD COLUMN IF NOT EXISTS email_subject text;

COMMENT ON COLUMN public.hourly_arbitrage_message_preview.email_subject IS
  'Rendered email subject captured when the message preview is generated, so delivery does not depend on trade data being reloaded later.';
