#!/usr/bin/env python3
"""Build a fresh official data.csv for Crypto Arbitrage Portal.

Key rules:
- Crypto history comes from CMC hourly candles.
- Official reference is 21:00 BRT = 00:00 UTC on the NEXT UTC day.
- The API is queried in small chunks to avoid its hourly-candle cap.
- The historical end window is extended through end_date + 1 UTC day so the
  21:00 BRT candle for the requested end_date can actually be captured.
- Fiat history uses Frankfurter daily BRL/USD and EUR/USD rates.
- Prices are written with Decimal precision.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data.csv"
MANIFEST_PATH = ROOT / "bootstrap-manifest.json"

CMC_HISTORICAL_URL = "https://api.coinmarketcap.com/data-api/v3.1/cryptocurrency/historical"
FRANKFURTER_URL = "https://api.frankfurter.dev/v2/rates"
USD_CMC_ID = 2781

TZ = ZoneInfo("America/Sao_Paulo")
REFERENCE_TIME = "21:00"

# Keep hourly requests comfortably below the API candle cap.
CHUNK_DAYS = 14

CRYPTO_ASSETS = [
    {"symbol": "ADA", "cmc_id": 2010},
    {"symbol": "NIGHT", "cmc_id": 39064},
    {"symbol": "SNEK", "cmc_id": 25264},
    {"symbol": "SOL", "cmc_id": 5426},
    {"symbol": "BONK", "cmc_id": 23095},
    {"symbol": "WIF", "cmc_id": 28752},
]
FIAT_ASSETS = ["BRL", "EUR"]


def http_json(url: str, *, retries: int = 4, timeout: int = 30):
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            req = Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "crypto-arbitrage-portal/bootstrap/1.1",
                },
            )
            with urlopen(req, timeout=timeout) as response:
                return json.load(response, parse_float=Decimal)
        except Exception as exc:
            last_exc = exc
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(str(last_exc))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument(
        "--end-date",
        help="YYYY-MM-DD; defaults to the last completed 21:00 BRT reference date",
    )
    return parser.parse_args()


def latest_completed_reference_date() -> date:
    now = datetime.now(TZ)
    today_ref = datetime(now.year, now.month, now.day, 21, 0, tzinfo=TZ)
    return now.date() if now >= today_ref else now.date() - timedelta(days=1)


def date_range(end_date: date, days: int) -> tuple[date, date]:
    if days < 1:
        raise ValueError("--days deve ser >= 1")
    return end_date - timedelta(days=days - 1), end_date


def decimal_text(value: Decimal) -> str:
    if not value.is_finite():
        raise ValueError("Valor não finito")
    s = format(value, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s or "0"


def fetch_crypto_history(
    asset: dict, start_date: date, end_date: date
) -> list[dict[str, str]]:
    rows: dict[str, str] = {}
    cursor = start_date

    while cursor <= end_date:
        chunk_end = min(end_date, cursor + timedelta(days=CHUNK_DAYS - 1))

        # A 21:00 BRT reference for local date D is 00:00 UTC on D+1.
        # Therefore the query must extend into the next UTC day.
        start_utc = datetime(
            cursor.year, cursor.month, cursor.day, tzinfo=timezone.utc
        )
        end_local_plus_one = chunk_end + timedelta(days=1)
        end_utc = datetime(
            end_local_plus_one.year,
            end_local_plus_one.month,
            end_local_plus_one.day,
            0,
            59,
            tzinfo=timezone.utc,
        )

        params = urlencode(
            {
                "id": asset["cmc_id"],
                "convertId": USD_CMC_ID,
                "timeStart": int(start_utc.timestamp()),
                "timeEnd": int(end_utc.timestamp()),
                "interval": "1h",
            }
        )
        payload = http_json(f"{CMC_HISTORICAL_URL}?{params}")

        quotes = payload.get("data", {}).get("quotes", [])
        for item in quotes if isinstance(quotes, list) else []:
            if not isinstance(item, dict):
                continue

            t = item.get("timeOpen")
            q = item.get("quote") or {}
            if not t or not isinstance(q, dict) or "open" not in q:
                continue

            opened = datetime.fromisoformat(str(t).replace("Z", "+00:00"))

            # Official reference candle: 00:00 UTC.
            if opened.hour != 0 or opened.minute != 0 or opened.second != 0:
                continue

            local_date = opened.astimezone(TZ).date()
            if start_date <= local_date <= end_date:
                rows[local_date.isoformat()] = decimal_text(
                    Decimal(str(q["open"]))
                )

        print(
            f"{asset['symbol']}: {len(rows)} candles; "
            f"última data encontrada = {max(rows) if rows else '—'}; "
            f"bloco até {chunk_end}"
        )
        cursor = chunk_end + timedelta(days=1)
        time.sleep(0.25)

    return [
        {
            "date": d,
            "time": REFERENCE_TIME,
            "fiat": "USD",
            "symbol": asset["symbol"],
            "price": p,
        }
        for d, p in sorted(rows.items())
    ]


def fetch_fiat_history(
    symbol: str, start_date: date, end_date: date
) -> list[dict[str, str]]:
    params = urlencode(
        {
            "base": symbol,
            "quotes": "USD",
            "from": start_date.isoformat(),
            "to": end_date.isoformat(),
        }
    )
    payload = http_json(f"{FRANKFURTER_URL}?{params}")

    by_date: dict[date, Decimal] = {}
    for item in payload if isinstance(payload, list) else []:
        try:
            if item.get("base") != symbol or item.get("quote") != "USD":
                continue
            by_date[date.fromisoformat(item["date"])] = Decimal(str(item["rate"]))
        except Exception:
            continue

    rows: list[dict[str, str]] = []
    last_rate: Decimal | None = None
    d = start_date

    while d <= end_date:
        if d in by_date:
            last_rate = by_date[d]
        if last_rate is not None:
            rows.append(
                {
                    "date": d.isoformat(),
                    "time": REFERENCE_TIME,
                    "fiat": "USD",
                    "symbol": symbol,
                    "price": decimal_text(last_rate),
                }
            )
        d += timedelta(days=1)

    return rows


def write_csv(rows: list[dict[str, str]]) -> None:
    tmp = CSV_PATH.with_suffix(".fresh.tmp")
    fields = ["date", "time", "fiat", "symbol", "price"]

    with tmp.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    tmp.replace(CSV_PATH)


def main() -> int:
    args = parse_args()

    end_date = (
        date.fromisoformat(args.end_date)
        if args.end_date
        else latest_completed_reference_date()
    )
    start_date, end_date = date_range(end_date, args.days)

    print(
        f"Fresh start: {start_date} → {end_date} · "
        f"referência {REFERENCE_TIME} BRT"
    )

    all_rows: list[dict[str, str]] = []

    for asset in CRYPTO_ASSETS:
        all_rows.extend(fetch_crypto_history(asset, start_date, end_date))

    for symbol in FIAT_ASSETS:
        fiat_rows = fetch_fiat_history(symbol, start_date, end_date)
        print(f"{symbol}: {len(fiat_rows)} taxas diárias")
        all_rows.extend(fiat_rows)

    dedup: dict[tuple[str, str, str, str], dict[str, str]] = {}
    for row in all_rows:
        key = (row["date"], row["time"], row["fiat"], row["symbol"])
        dedup[key] = row

    rows = sorted(
        dedup.values(),
        key=lambda r: (r["date"], r["time"], r["symbol"]),
    )
    write_csv(rows)

    coverage = {}
    for symbol in [a["symbol"] for a in CRYPTO_ASSETS] + FIAT_ASSETS:
        dates = sorted(
            r["date"] for r in rows if r["symbol"] == symbol
        )
        coverage[symbol] = {
            "count": len(dates),
            "first": dates[0] if dates else None,
            "last": dates[-1] if dates else None,
            "has_requested_end_date": (
                dates[-1] == end_date.isoformat() if dates else False
            ),
        }

    # Refuse to call the bootstrap successful if the requested end date
    # was not captured for a crypto that had a matching source candle.
    missing_end = [
        symbol
        for symbol, meta in coverage.items()
        if symbol in {a["symbol"] for a in CRYPTO_ASSETS}
        and meta["count"] > 0
        and not meta["has_requested_end_date"]
    ]
    if missing_end:
        print(
            "WARNING: cripto(s) sem candle no end-date solicitado: "
            + ", ".join(missing_end)
        )

    manifest = {
        "fresh_start": True,
        "reference_time": REFERENCE_TIME,
        "timezone": "America/Sao_Paulo",
        "requested_days": args.days,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "crypto_source": (
            "CoinMarketCap public historical web data, hourly open at "
            "00:00 UTC (21:00 BRT)"
        ),
        "fiat_source": (
            "Frankfurter v2 daily rates, USD-anchored; prior published "
            "rate carried across non-business days"
        ),
        "rows": len(rows),
        "coverage": coverage,
    }

    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"OK: {len(rows)} observações gravadas em {CSV_PATH}")
    print(f"Manifesto: {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
