from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from scripts import capture_prices as capture


class CapturePartialFailureTests(unittest.TestCase):
    def run_capture(self, assets, fetch):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        csv_path = root / "data.csv"
        log_path = root / "capture-log.json"

        def fake_fetch(asset, target_utc):
            return fetch(asset, target_utc)

        with (
            patch.object(capture, "CONFIG", root / "config.json"),
            patch.object(capture, "CSV_PATH", csv_path),
            patch.object(capture, "LOG_PATH", log_path),
            patch.object(capture, "load_config", return_value={
                "timezone": "America/Sao_Paulo",
                "capture_time": "21:00",
                "capture_after_time": "21:30",
            }),
            patch.object(capture, "load_configured_assets", return_value=(assets, "supabase")),
            patch.object(capture, "fetch_crypto_open", side_effect=fake_fetch),
            patch.object(capture.time, "sleep"),
            patch.object(sys, "argv", ["capture_prices.py", "--reference-date", "2026-10-29"]),
        ):
            result = capture.main()

        return result, csv_path, log_path

    def test_one_asset_failure_keeps_successful_prices_and_logs_gap(self):
        assets = [
            {"symbol": "ADA", "type": "CRYPTO", "cmc_id": 2010},
            {"symbol": "NEW", "type": "CRYPTO", "cmc_id": None},
        ]

        def fetch(asset, _target):
            if asset["symbol"] == "NEW":
                raise RuntimeError("CoinMarketCap ID não cadastrado")
            return Decimal("0.25"), datetime(2026, 10, 29, 23, tzinfo=timezone.utc)

        result, csv_path, log_path = self.run_capture(assets, fetch)
        self.assertEqual(result, 0)

        with csv_path.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual([row["symbol"] for row in rows], ["ADA"])
        log = json.loads(log_path.read_text(encoding="utf-8"))
        self.assertEqual(log["status"], "partial_manual_test")
        self.assertEqual(log["asset_errors"], [{
            "symbol": "NEW",
            "error": "CoinMarketCap ID não cadastrado",
        }])

    def test_all_asset_failures_do_not_write_an_empty_snapshot(self):
        assets = [{"symbol": "NEW", "type": "CRYPTO", "cmc_id": None}]

        def fetch(_asset, _target):
            raise RuntimeError("source unavailable")

        with self.assertRaisesRegex(RuntimeError, "Nenhum ativo pôde ser capturado"):
            self.run_capture(assets, fetch)


if __name__ == "__main__":
    unittest.main()
