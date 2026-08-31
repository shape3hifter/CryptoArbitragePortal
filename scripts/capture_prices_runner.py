#!/usr/bin/env python3
"""Robust daily snapshot runner.

Behavior:
- Can be executed at any time; never fails merely because it is before 21:30 BRT.
- Treats 21:00 BRT of the most recently completed day as the latest eligible snapshot.
- If the latest eligible snapshot is already complete, exits successfully without
  changing data.
- Fills missing/incomplete snapshots starting from the latest date already present
  in data.csv through the latest eligible snapshot. This avoids trying to backfill
  the entire historical range when an asset was not yet available on older dates.
- Preserves all existing complete snapshots.

The actual per-date capture remains implemented by capture_prices.py so there is
one canonical source for CMC/Frankfurter retrieval and CSV writing.
"""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import date, datetime, time as dt_time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import capture_prices as capture

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.json"
CSV_PATH = ROOT / "data.csv"
DEFAULT_TZ = "America/Sao_Paulo"
DEFAULT_REF = "21:00"
DEFAULT_AFTER = "21:30"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--reference-date", help="Capture one specific YYYY-MM-DD date")
    return p.parse_args()


def load_config() -> dict:
    import json
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def parse_clock(value: str) -> dt_time:
    return datetime.strptime(value, "%H:%M").time()


def read_rows() -> list[dict[str, str]]:
    if not CSV_PATH.exists():
        return []
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def expected_symbols(config: dict) -> set[str]:
    return {str(asset["symbol"]).upper() for asset in config.get("assets", [])}


def date_status(rows: list[dict[str, str]], expected: set[str], day: date, ref_time: str) -> tuple[bool, set[str]]:
    found = {
        str(row.get("symbol", "")).upper()
        for row in rows
        if row.get("date") == day.isoformat()
        and row.get("time") == ref_time
        and str(row.get("fiat", "")).upper() == "USD"
    }
    missing = expected - found
    return not missing, missing


def latest_eligible_date(now_local: datetime, after_time: dt_time) -> date:
    """Return the latest 21:00 snapshot whose publication window is complete."""
    if now_local.time() >= after_time:
        return now_local.date()
    return now_local.date() - timedelta(days=1)


def run_one(day: date) -> None:
    old_argv = sys.argv
    try:
        sys.argv = ["capture_prices.py", "--reference-date", day.isoformat()]
        result = capture.main()
        if result != 0:
            raise RuntimeError(f"captura de {day.isoformat()} retornou código {result}")
    finally:
        sys.argv = old_argv


def main() -> int:
    args = parse_args()
    config = load_config()
    tz = ZoneInfo(config.get("timezone", DEFAULT_TZ))
    ref_time = str(config.get("capture_time", DEFAULT_REF))
    after_time = parse_clock(str(config.get("capture_after_time", DEFAULT_AFTER)))
    now_local = datetime.now(tz)

    # Explicit/manual date: preserve the old one-date behavior for testing.
    if args.reference_date:
        requested = date.fromisoformat(args.reference_date)
        requested_target = datetime.combine(requested, parse_clock(ref_time), tzinfo=tz)
        if requested_target > now_local:
            raise RuntimeError("A referência solicitada ainda é futura.")
        run_one(requested)
        return 0

    expected = expected_symbols(config)
    if not expected:
        raise RuntimeError("config.json não possui assets cadastrados.")

    latest = latest_eligible_date(now_local, after_time)
    rows = read_rows()

    # No data yet: capture only the latest eligible snapshot.
    if not rows:
        print(f"Nenhum snapshot encontrado; capturando {latest.isoformat()} {ref_time} BRT.")
        run_one(latest)
        return 0

    existing_dates: list[date] = []
    for row in rows:
        value = row.get("date")
        if value:
            try:
                existing_dates.append(date.fromisoformat(value))
            except ValueError:
                pass

    if not existing_dates:
        print(f"Nenhuma data válida encontrada; capturando {latest.isoformat()} {ref_time} BRT.")
        run_one(latest)
        return 0

    # Operational backfill starts from the most recent date already represented
    # in the file. This is the intended behavior for repairing recent gaps while
    # avoiding attempts to reconstruct obsolete historical ranges.
    start_date = max(existing_dates)
    if start_date > latest:
        start_date = latest

    missing_dates: list[date] = []
    day = start_date
    while day <= latest:
        complete, _missing = date_status(rows, expected, day, ref_time)
        if not complete:
            missing_dates.append(day)
        day += timedelta(days=1)

    if not missing_dates:
        print(f"Snapshot até {latest.isoformat()} {ref_time} BRT já está completo. Nenhuma atualização necessária.")
        return 0

    print(
        f"Encontrados {len(missing_dates)} snapshot(s) ausentes/incompletos; "
        f"preenchendo de {missing_dates[0].isoformat()} até {missing_dates[-1].isoformat()}."
    )

    for day in missing_dates:
        print(f"Capturando {day.isoformat()} {ref_time} BRT...")
        run_one(day)
        rows = read_rows()

    print(f"Captura concluída. Último snapshot elegível: {latest.isoformat()} {ref_time} BRT.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
