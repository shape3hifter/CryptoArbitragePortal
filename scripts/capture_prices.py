#!/usr/bin/env python3
"""Capture one daily CMC price snapshot and append it to data.csv."""

from __future__ import annotations

import csv
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.json"
CSV_PATH = ROOT / "data.csv"
LOG_PATH = ROOT / "capture-log.json"

CMC_URL = (
    "https://pro-api.coinmarketcap.com/"
    "public-api/v3/cryptocurrency/quotes/latest"
)


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def fetch_prices(assets: list[dict], fiat: str) -> dict[str, float]:
    """Fetch prices from CMC using CoinMarketCap IDs."""

    ids = ",".join(str(asset["cmc_id"]) for asset in assets)

    params = urlencode({
        "id": ids,
        "convert": fiat,
    })

    url = f"{CMC_URL}?{params}"

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

            status = payload.get("status", {})

            if str(status.get("error_code", "0")) != "0":
                raise RuntimeError(
                    status.get("error_message")
                    or f"CMC error {status.get('error_code')}"
                )

            data = payload.get("data", [])

            if not isinstance(data, list):
                raise RuntimeError(
                    f"Formato inesperado da CMC: data={type(data).__name__}"
                )

            prices: dict[str, float] = {}

            # Transform the CMC list into a lookup by ID.
            by_id = {
                str(item["id"]): item
                for item in data
                if isinstance(item, dict) and "id" in item
            }

            for asset in assets:
                symbol = asset["symbol"]
                cmc_id = str(asset["cmc_id"])

                item = by_id.get(cmc_id)

                if not item:
                    raise RuntimeError(
                        f"CMC não retornou {symbol} (ID {cmc_id})"
                    )

                quote_data = item.get("quote", [])

                if not isinstance(quote_data, list):
                    raise RuntimeError(
                        f"Formato inesperado de quote para {symbol}"
                    )

                quote = next(
                    (
                        q
                        for q in quote_data
                        if isinstance(q, dict)
                        and str(q.get("symbol", "")).upper() == fiat
                    ),
                    None,
                )

                if not quote:
                    raise RuntimeError(
                        f"CMC não retornou cotação {fiat} para {symbol}"
                    )

                price = quote.get("price")

                if price is None or float(price) <= 0:
                    raise RuntimeError(
                        f"Preço inválido para {symbol}: {price}"
                    )

                prices[symbol] = float(price)

            return prices

        except Exception as exc:
            last_error = exc
            time.sleep(3 * (attempt + 1))

    raise RuntimeError(
        f"Falha ao consultar CMC após 3 tentativas: {last_error}"
    )

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


def main() -> int:
    config = load_json(CONFIG)

    fiat = str(config["fiat"]).upper()

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

    # Remove duplicated symbols while preserving order.
    unique_assets = []
    seen = set()

    for asset in assets:
        if asset["symbol"] not in seen:
            unique_assets.append(asset)
            seen.add(asset["symbol"])

    assets = unique_assets

    tz = ZoneInfo(
        config.get(
            "timezone",
            "America/Sao_Paulo",
        )
    )

    now_local = datetime.now(tz)

    reference_date = now_local.date().isoformat()
    reference_time = config.get(
        "capture_time",
        "21:00",
    )

    prices = fetch_prices(
        assets,
        fiat,
    )

    rows = read_rows()

    symbols = {
        asset["symbol"]
        for asset in assets
    }

    # Remove an existing snapshot for this exact date/time,
    # so a manual retry does not create duplicates.
    rows = [
        row
        for row in rows
        if not (
            row.get("date") == reference_date
            and row.get("time") == reference_time
            and row.get("fiat", "").upper() == fiat
            and row.get("symbol", "").upper() in symbols
        )
    ]

    for asset in assets:
        symbol = asset["symbol"]

        rows.append(
            {
                "date": reference_date,
                "time": reference_time,
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

    scheduled = datetime.combine(
        now_local.date(),
        datetime.strptime(
            reference_time,
            "%H:%M",
        ).time(),
        tzinfo=tz,
    )

    delay_minutes = round(
        (
            now_local - scheduled
        ).total_seconds() / 60,
        2,
    )

    record = {
        "reference_date": reference_date,
        "reference_time": reference_time,
        "timezone": str(tz),
        "executed_at": now_local.isoformat(),
        "delay_minutes": delay_minutes,
        "status": (
            "on_time"
            if -5 <= delay_minutes <= 10
            else "late"
        ),
        "assets": assets,
        "prices": prices,
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

    print(
        json.dumps(
            record,
            ensure_ascii=False,
        )
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(
            f"ERROR: {exc}",
            file=sys.stderr,
        )
        raise