#!/usr/bin/env python3
"""Wrapper for the daily capture that tolerates delayed GitHub Actions runs.

GitHub Actions schedules are best-effort and may start hours after the requested
cron time. In that case we want the most recent completed 21:00 BRT snapshot,
which is yesterday's date when the job starts before today's 21:30 BRT window.
"""
from __future__ import annotations

from datetime import date, datetime, time as dt_time, timedelta

import capture_prices as capture


def resolve_reference_date_fixed(
    now_local: datetime,
    ref_time: dt_time,
    after_time: dt_time,
    forced: str | None,
) -> tuple[date, bool]:
    if forced:
        d = date.fromisoformat(forced)
        target = datetime.combine(d, ref_time, tzinfo=now_local.tzinfo)
        if target > now_local:
            raise RuntimeError("A referência solicitada ainda é futura.")
        return d, True

    # Scheduled jobs are not guaranteed to start exactly at 21:30 BRT.
    # Before today's release window, capture the previous day's 21:00 snapshot.
    if now_local.time() < after_time:
        return now_local.date() - timedelta(days=1), False

    return now_local.date(), False


capture.resolve_reference_date = resolve_reference_date_fixed

if __name__ == "__main__":
    raise SystemExit(capture.main())
