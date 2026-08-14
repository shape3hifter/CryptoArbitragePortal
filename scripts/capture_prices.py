#!/usr/bin/env python3
"""Capture the daily 21:00 BRT CMC price snapshot into data.csv.

Normal operation:
- The script is allowed to capture only from 21:30 BRT onward.
- It always records the most recent completed 21:00 BRT reference.
- If execution is delayed by GitHub Actions, the historical 21:00 candle is
  still used, so execution time does not change the recorded price.

For local testing:
    python scripts/capture_prices.py --reference-date 2026-08-13

The historical source used here is the public CMC web-data endpoint that was
validated during MVP testing. It returns hourly OHLC data; the OPEN of the
21:00 BRT candle is used as the reference price.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from datetime import date, datetime, time as dt_time, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.json"
CSV_PATH = ROOT / "data.csv"
LOG_PATH = ROOT / "capture-log.json"

CMC_HISTORICAL_URL = (
    "https://api.coinmarketcap.com/"
    "data-api/v3.1/cryptocurrency/historical"
)

USD_CMC_ID = 2781
DEFAULT_TIMEZONE = "America/Sao_Paulo"
DEFAULT_REFERENCE_TIME = "21:00"
DEFAULT_EARLIEST_RUN_TIME = "21:30"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def parse_clock(value: str) -> dt_time:
    return datetime.strptime(value, "%H:%M").time()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture the daily 21:00 BRT CMC historical snapshot."
    )
    parser.add_argument(
        "--reference-date",
        help=(
            "Reference date to capture in YYYY-MM-DD format. Intended for local "
            "testing. Normal scheduled execution should omit this option."
        ),
    )
    return parser.parse_args()


def parse_reference_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(
            f"Data de referência inválida: {value!r}. Use YYYY-MM-DD."
        ) from exc


def fetch_asset_historical_open(
    asset: dict,
    fiat: str,
    target_utc: datetime,
) -> tuple[float, datetime]:
    """Fetch the hourly historical candle that begins at the target UTC time.

    The public CMC web-data endpoint is used because the keyed historical API
    is not part of the keyless catalog. For the model reference we use the
    opening price of the hourly candle whose start matches 21:00 BRT.
    """
    if fiat != "USD":
        raise RuntimeError(
            "A captura histórica sem API key está configurada atualmente "
            "apenas para USD. Mantenha config.json com fiat=USD."
        )

    target_ts = int(target_utc.timestamp())
    window_start = target_utc - timedelta(hours=1)
    window_end = target_utc + timedelta(hours=1)

    params = urlencode(
        {
            "id": int(asset["cmc_id"]),
            "convertId": USD_CMC_ID,
            "timeStart": int(window_start.timestamp()),
            "timeEnd": int(window_end.timestamp()),
            "interval": "1h",
        }
    )

    url = f"{CMC_HISTORICAL_URL}?{params}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "crypto-arbitrage-portal/1.0",
        },
    )

    last_error: Exception | None = None

    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.load(response)

            data = payload.get("data", {})
            quotes = data.get("quotes", []) if isinstance(data, dict) else []

            if not isinstance(quotes, list) or not quotes:
                raise RuntimeError(
                    f"CMC não retornou histórico para {asset['symbol']}"
                )

            parsed_quotes = []
            for item in quotes:
                if not isinstance(item, dict):
                    continue
                time_open = item.get("timeOpen")
                quote = item.get("quote")
                if not time_open or not isinstance(quote, dict):
                    continue

                try:
                    opened_at = datetime.fromisoformat(
                        time_open.replace("Z", "+00:00")
                    )
                    price = float(quote["open"])
                except (KeyError, TypeError, ValueError):
                    continue

                if price > 0:
                    parsed_quotes.append((opened_at, price))

            if not parsed_quotes:
                raise RuntimeError(
                    f"CMC retornou histórico sem preços válidos para {asset['symbol']}"
                )

            # Prefer the exact target candle; otherwise use the nearest hourly
            # candle returned within the one-hour query window.
            exact = [
                item for item in parsed_quotes
                if int(item[0].timestamp()) == target_ts
            ]
            selected_at, selected_price = (
                exact[0]
                if exact
                else min(
                    parsed_quotes,
                    key=lambda item: abs(item[0].timestamp() - target_ts),
                )
            )

            distance = abs(selected_at.timestamp() - target_ts)
            if distance > 3600:
                raise RuntimeError(
                    f"CMC não retornou candle suficientemente próximo de "
                    f"{target_utc.isoformat()} para {asset['symbol']}"
                )

            return selected_price, selected_at

        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(3 * (attempt + 1))

    raise RuntimeError(
        f"Falha ao consultar histórico da CMC após 3 tentativas para "
        f"{asset['symbol']}: {last_error}"
    )


def fetch_prices(
    assets: list[dict],
    fiat: str,
    target_utc: datetime,
) -> tuple[dict[str, float], dict[str, datetime]]:
    prices: dict[str, float] = {}
    candle_times: dict[str, datetime] = {}

    for asset in assets:
        price, candle_time = fetch_asset_historical_open(
            asset,
            fiat,
            target_utc,
        )
        prices[asset["symbol"]] = price
        candle_times[asset["symbol"]] = candle_time

    return prices, candle_times


def read_rows() -> list[dict[str, str]]:
    if not CSV_PATH.exists():
        return []

    with CSV_PATH.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as fh:
        return list(csv.DictReader(fh))


def write_rows(rows: list[dict[str, str]]) -> None:
    tmp = CSV_PATH.with_suffix(".tmp")

    with tmp.open(
        "w",
        encoding="utf-8",
        newline="",
    ) as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "date",
                "time",
                "fiat",
                "symbol",
                "price",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    tmp.replace(CSV_PATH)


def build_assets(config: dict) -> list[dict]:
    anchor = config["anchor"]
    assets = [
        {
            "symbol": anchor["symbol"].upper(),
            "cmc_id": int(anchor["cmc_id"]),
        }
    ]

    for item in config["comparatives"]:
        assets.append(
            {
                "symbol": item["symbol"].upper(),
                "cmc_id": int(item["cmc_id"]),
            }
        )

    unique_assets: list[dict] = []
    seen: set[str] = set()

    for asset in assets:
        if asset["symbol"] not in seen:
            unique_assets.append(asset)
            seen.add(asset["symbol"])

    return unique_assets


def resolve_reference_date(
    now_local: datetime,
    reference_time: dt_time,
    earliest_run_time: dt_time,
    forced_reference_date: str | None,
) -> tuple[date, bool]:
    """Return the reference date and whether this is an explicit test run."""
    if forced_reference_date:
        ref_date = parse_reference_date(forced_reference_date)
        target_local = datetime.combine(
            ref_date,
            reference_time,
            tzinfo=now_local.tzinfo,
        )
        if target_local > now_local:
            raise RuntimeError(
                f"A data de referência {ref_date.isoformat()} às "
                f"{reference_time.strftime('%H:%M')} ainda é futura."
            )
        return ref_date, True

    if now_local.time() < earliest_run_time:
        raise RuntimeError(
            "Captura ainda não liberada. O processo só pode rodar a partir de "
            f"{earliest_run_time.strftime('%H:%M')} "
            f"({now_local.tzinfo})."
        )

    return now_local.date(), False


def main() -> int:
    args = parse_args()
    config = load_json(CONFIG)

    fiat = str(config["fiat"]).upper()
    assets = build_assets(config)

    tz = ZoneInfo(
        config.get("timezone", DEFAULT_TIMEZONE)
    )

    now_local = datetime.now(tz)

    reference_time_str = str(
        config.get("capture_time", DEFAULT_REFERENCE_TIME)
    )
    earliest_run_time_str = str(
        config.get("capture_after_time", DEFAULT_EARLIEST_RUN_TIME)
    )

    reference_time = parse_clock(reference_time_str)
    earliest_run_time = parse_clock(earliest_run_time_str)

    reference_date, is_manual_test = resolve_reference_date(
        now_local,
        reference_time,
        earliest_run_time,
        args.reference_date,
    )

    reference_local = datetime.combine(
        reference_date,
        reference_time,
        tzinfo=tz,
    )
    target_utc = reference_local.astimezone(timezone.utc)

    prices, candle_times = fetch_prices(
        assets,
        fiat,
        target_utc,
    )

    rows = read_rows()

    symbols = {
        asset["symbol"]
        for asset in assets
    }

    # Remove an existing snapshot for the exact reference date/time so a
    # retry or correction replaces the old values instead of duplicating them.
    rows = [
        row
        for row in rows
        if not (
            row.get("date") == reference_date.isoformat()
            and row.get("time") == reference_time_str
            and row.get("fiat", "").upper() == fiat
            and row.get("symbol", "").upper() in symbols
        )
    ]

    for asset in assets:
        symbol = asset["symbol"]
        rows.append(
            {
                "date": reference_date.isoformat(),
                "time": reference_time_str,
                "fiat": fiat,
                "symbol": symbol,
                "price": f"{prices[symbol]:.15g}",
            }
        )

    rows.sort(
        key=lambda row: (
            row["date"],
            row["time"],
            row["symbol"],
        )
    )

    write_rows(rows)

    eligible_at = datetime.combine(
        reference_date,
        earliest_run_time,
        tzinfo=tz,
    )

    execution_delay_minutes = round(
        (now_local - eligible_at).total_seconds() / 60,
        2,
    )

    record = {
        "reference_date": reference_date.isoformat(),
        "reference_time": reference_time_str,
        "reference_timezone": str(tz),
        "reference_utc": target_utc.isoformat(),
        "capture_after_time": earliest_run_time_str,
        "executed_at": now_local.isoformat(),
        "execution_delay_minutes": execution_delay_minutes,
        "status": "manual_test" if is_manual_test else "on_time",
        "price_method": "hourly_open",
        "source": "coinmarketcap_public_historical_web_data",
        "assets": assets,
        "prices": prices,
        "cmc_candle_open": {
            symbol: candle_times[symbol].isoformat()
            for symbol in prices
        },
    }

    LOG_PATH.write_text(
        json.dumps(
            record,
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    print(json.dumps(record, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
