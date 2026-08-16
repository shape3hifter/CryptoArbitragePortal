#!/usr/bin/env python3
"""Capture the official 21:00 BRT snapshot for every registered asset.

Crypto assets come from the CoinMarketCap hourly historical web-data endpoint.
FIAT reference assets (BRL/EUR) come from Frankfurter daily FX rates.

The data.csv schema remains:
    date,time,fiat,symbol,price

For BRL/EUR, price means USD per 1 unit of the fiat (BRL/USD or EUR/USD).
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from datetime import date, datetime, time as dt_time, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.json"
CSV_PATH = ROOT / "data.csv"
LOG_PATH = ROOT / "capture-log.json"

CMC_HISTORICAL_URL = "https://api.coinmarketcap.com/data-api/v3.1/cryptocurrency/historical"
FRANKFURTER_URL = "https://api.frankfurter.dev/v2/rate"
USD_CMC_ID = 2781
DEFAULT_TZ = "America/Sao_Paulo"
DEFAULT_REF = "21:00"
DEFAULT_AFTER = "21:30"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--reference-date", help="YYYY-MM-DD for manual testing")
    return p.parse_args()


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def parse_clock(value: str) -> dt_time:
    return datetime.strptime(value, "%H:%M").time()


def http_json(url: str, *, retries: int = 4, timeout: int = 25):
    last_exc = None
    for attempt in range(retries):
        try:
            req = Request(url, headers={"Accept": "application/json", "User-Agent": "crypto-arbitrage-portal/1.0"})
            with urlopen(req, timeout=timeout) as response:
                return json.load(response, parse_float=Decimal)
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(str(last_exc))


def decimal_text(value: Decimal) -> str:
    s = format(value, "f")
    return s.rstrip("0").rstrip(".") if "." in s else s


def fetch_crypto_open(asset: dict, target_utc: datetime) -> tuple[Decimal, datetime]:
    start = target_utc - timedelta(hours=1)
    end = target_utc + timedelta(hours=1)
    params = urlencode({
        "id": int(asset["cmc_id"]),
        "convertId": USD_CMC_ID,
        "timeStart": int(start.timestamp()),
        "timeEnd": int(end.timestamp()),
        "interval": "1h",
    })
    payload = http_json(f"{CMC_HISTORICAL_URL}?{params}")
    quotes = payload.get("data", {}).get("quotes", [])
    parsed = []
    for item in quotes if isinstance(quotes, list) else []:
        if not isinstance(item, dict) or not item.get("timeOpen"):
            continue
        quote = item.get("quote") or {}
        if "open" not in quote:
            continue
        try:
            opened = datetime.fromisoformat(str(item["timeOpen"]).replace("Z", "+00:00"))
            price = Decimal(str(quote["open"]))
        except Exception:
            continue
        if price > 0:
            parsed.append((opened, price))
    if not parsed:
        raise RuntimeError(f"CMC sem candle válido para {asset['symbol']}")
    target_ts = target_utc.timestamp()
    selected = min(parsed, key=lambda x: abs(x[0].timestamp() - target_ts))
    if abs(selected[0].timestamp() - target_ts) > 3600:
        raise RuntimeError(f"CMC sem candle próximo de 21:00 BRT para {asset['symbol']}")
    return selected[1], selected[0]


def fetch_fiat_rate(symbol: str, reference_date: date) -> tuple[Decimal, date]:
    # Frankfurter is daily. On weekends/holidays, step back until a published rate exists.
    current = reference_date
    for _ in range(7):
        url = f"{FRANKFURTER_URL}/{symbol}/USD?{urlencode({'date': current.isoformat()})}"
        try:
            payload = http_json(url)
            rate = Decimal(str(payload["rate"]))
            return rate, date.fromisoformat(payload["date"])
        except Exception:
            current -= timedelta(days=1)
    raise RuntimeError(f"Frankfurter sem taxa disponível para {symbol} até {reference_date}")


def read_rows() -> list[dict[str, str]]:
    if not CSV_PATH.exists():
        return []
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def write_rows(rows: list[dict[str, str]]) -> None:
    tmp = CSV_PATH.with_suffix(".tmp")
    fields = ["date", "time", "fiat", "symbol", "price"]
    with tmp.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(CSV_PATH)


def resolve_reference_date(now_local: datetime, ref_time: dt_time, after_time: dt_time, forced: str | None) -> tuple[date, bool]:
    if forced:
        d = date.fromisoformat(forced)
        target = datetime.combine(d, ref_time, tzinfo=now_local.tzinfo)
        if target > now_local:
            raise RuntimeError("A referência solicitada ainda é futura.")
        return d, True
    if now_local.time() < after_time:
        raise RuntimeError(f"Captura só é liberada a partir de {after_time.strftime('%H:%M')} ({now_local.tzinfo}).")
    return now_local.date(), False


def main() -> int:
    args = parse_args()
    config = load_config()
    tz = ZoneInfo(config.get("timezone", DEFAULT_TZ))
    ref_time_str = str(config.get("capture_time", DEFAULT_REF))
    after_time_str = str(config.get("capture_after_time", DEFAULT_AFTER))
    ref_time = parse_clock(ref_time_str)
    after_time = parse_clock(after_time_str)
    now_local = datetime.now(tz)
    reference_date, manual = resolve_reference_date(now_local, ref_time, after_time, args.reference_date)
    reference_local = datetime.combine(reference_date, ref_time, tzinfo=tz)
    target_utc = reference_local.astimezone(timezone.utc)

    assets = config.get("assets", [])
    if not assets:
        raise RuntimeError("config.json não possui assets cadastrados.")

    prices: dict[str, str] = {}
    sources: dict[str, str] = {}
    timestamps: dict[str, str] = {}
    for asset in assets:
        symbol = str(asset["symbol"]).upper()
        kind = str(asset.get("type", "CRYPTO")).upper()
        if kind == "FIAT":
            rate, rate_date = fetch_fiat_rate(symbol, reference_date)
            prices[symbol] = decimal_text(rate)
            sources[symbol] = "frankfurter"
            timestamps[symbol] = rate_date.isoformat()
        else:
            price, candle_open = fetch_crypto_open(asset, target_utc)
            prices[symbol] = decimal_text(price)
            sources[symbol] = "coinmarketcap_public_historical_web_data"
            timestamps[symbol] = candle_open.isoformat()
        time.sleep(0.2)

    rows = read_rows()
    symbols = set(prices)
    rows = [
        r for r in rows
        if not (r.get("date") == reference_date.isoformat() and r.get("time") == ref_time_str and r.get("fiat", "").upper() == "USD" and r.get("symbol", "").upper() in symbols)
    ]
    for symbol in sorted(prices):
        rows.append({"date": reference_date.isoformat(), "time": ref_time_str, "fiat": "USD", "symbol": symbol, "price": prices[symbol]})
    rows.sort(key=lambda r: (r["date"], r["time"], r["symbol"]))
    write_rows(rows)

    record = {
        "reference_date": reference_date.isoformat(),
        "reference_time": ref_time_str,
        "reference_timezone": str(tz),
        "reference_utc": target_utc.isoformat(),
        "capture_after_time": after_time_str,
        "executed_at": now_local.isoformat(),
        "status": "manual_test" if manual else "on_time",
        "price_method": "hourly_open_for_crypto; latest_published_daily_fx_for_fiat",
        "assets": [{"symbol": str(a["symbol"]).upper(), "type": str(a.get("type", "CRYPTO")).upper(), "cmc_id": a.get("cmc_id")} for a in assets],
        "prices": prices,
        "sources": sources,
        "source_timestamps": timestamps,
    }
    LOG_PATH.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(record, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
