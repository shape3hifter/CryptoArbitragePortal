-- Hourly Arbitrage Scheduler
-- This is intentionally DRY RUN during the first operational phase.
-- It invokes only the new hourly-arbitrage Edge Function and does not alter
-- any existing portal tables or production portal routines.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.hourly_arbitrage_scheduler_config (
  id integer primary key check (id = 1),
  cron_secret text not null,
  enabled boolean not null default true,
  dry_run boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.hourly_arbitrage_scheduler_config (id, cron_secret)
values (1, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

revoke all on table public.hourly_arbitrage_scheduler_config from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'hourly-arbitrage-evaluation'
  ) then
    perform cron.schedule(
      'hourly-arbitrage-evaluation',
      '0 * * * *',
      $job$
        select net.http_post(
          url := 'https://ckslcyemlwphmilvduzf.supabase.co/functions/v1/hourly-arbitrage',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              select cron_secret
              from public.hourly_arbitrage_scheduler_config
              where id = 1 and enabled = true
            )
          ),
          body := jsonb_build_object(
            'dry_run', (
              select dry_run
              from public.hourly_arbitrage_scheduler_config
              where id = 1 and enabled = true
            )
          )
        );
      $job$
    );
  end if;
end
$$;
