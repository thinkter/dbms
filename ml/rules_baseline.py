#!/usr/bin/env python3
"""Run an explainable fraud-rules baseline over generator CSV files.

This is deliberately independent of scikit-learn. It gives the coursework a
working baseline and a reference implementation for the later TypeScript
``rules.run`` tool. The same feature thresholds can then be compared with ML
and agent results.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter, defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path

IST = timezone(timedelta(hours=5, minutes=30))


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(IST)


def haversine_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    radius = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = math.radians(b_lat - a_lat), math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def read_rows(path: Path, locations_path: Path) -> list[dict]:
    locations = {}
    with locations_path.open(newline="", encoding="utf-8") as fh:
        # The database identity column is omitted from generator CSVs. COPY
        # preserves file order, so locations receive IDs 1..N on load.
        for location_id, row in enumerate(csv.DictReader(fh), start=1):
            locations[location_id] = (float(row["latitude"]), float(row["longitude"]))
    rows = []
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            row["amount"] = float(row["amount_inr"])
            row["payer"] = int(row["payer_account_id"])
            row["payee"] = int(row["payee_account_id"])
            row["channel"] = int(row["channel_code"])
            row["status"] = int(row["status_code"])
            row["device"] = int(row["device_id"])
            row["time"] = parse_time(row["created_at"])
            row["location"] = locations[int(row["location_id"])]
            row["score"] = 0.0
            row["reasons"] = []
            rows.append(row)
    return rows


def add(row: dict, weight: float, reason: str) -> None:
    row["score"] += weight
    row["reasons"].append(reason)


def score(rows: list[dict]) -> None:
    by_payer = defaultdict(list)
    inbound = Counter()
    outbound = Counter()
    inbound_amount = Counter()
    outbound_amount = Counter()
    for row in rows:
        by_payer[row["payer"]].append(row)
        if row["status"] == 1:
            inbound[row["payee"]] += 1
            outbound[row["payer"]] += 1
            inbound_amount[row["payee"]] += row["amount"]
            outbound_amount[row["payer"]] += row["amount"]
    mule_accounts = set()
    for account in inbound:
        ratio = outbound_amount[account] / inbound_amount[account] if inbound_amount[account] else 0
        if inbound[account] >= 8 and outbound[account] >= 2 and ratio >= 0.60:
            mule_accounts.add(account)

    for payer_rows in by_payer.values():
        payer_rows.sort(key=lambda r: r["time"])
        one_hour, day = deque(), deque()
        seen_devices = set()
        previous_card = None
        split_counts = Counter()
        for row in payer_rows:
            now = row["time"]
            while one_hour and now - one_hour[0]["time"] > timedelta(hours=1):
                one_hour.popleft()
            while day and now - day[0]["time"] > timedelta(hours=24):
                day.popleft()
            one_hour.append(row)
            day.append(row)
            if len(one_hour) >= 8:
                add(row, 0.35, "payer velocity >= 8 transactions in one hour")
            failed_small = sum(1 for item in one_hour if item["status"] == 2 and item["channel"] == 4 and item["amount"] <= 50)
            if failed_small >= 5:
                add(row, 0.35, "repeated failed card-ecommerce attempts")
            day_key = now.date()
            if 98_000 <= row["amount"] < 100_000:
                split_counts[day_key] += 1
            if split_counts[day_key] >= 3:
                add(row, 0.35, "repeated transfers just below 1 lakh")
            if now.hour < 5 and row["amount"] >= 20_000:
                add(row, 0.20, "large transaction during 00:00-05:00 IST")
            if row["device"] not in seen_devices and row["amount"] >= 20_000:
                add(row, 0.20, "large transaction from a first-seen device")
            seen_devices.add(row["device"])
            if row["payer"] in mule_accounts or row["payee"] in mule_accounts:
                add(row, 0.40, "account participates in high fan-in/fan-out flow")
            if row["channel"] == 3:
                if previous_card:
                    previous, previous_time = previous_card
                    minutes = max((now - previous_time).total_seconds() / 60, 0.01)
                    speed = haversine_km(*previous, *row["location"]) / (minutes / 60)
                    if speed > 900:
                        add(row, 0.50, f"card travel speed {speed:.0f} km/h")
                previous_card = (row["location"], now)
            # A row's reasons describe the evidence that caused its score.
            row["score"] = min(row["score"], 1.0)


def metrics(rows: list[dict], labels: set[str], threshold: float) -> dict:
    tp = sum(row["score"] >= threshold and row["txn_ref"] in labels for row in rows)
    fp = sum(row["score"] >= threshold and row["txn_ref"] not in labels for row in rows)
    fn = sum(row["score"] < threshold and row["txn_ref"] in labels for row in rows)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"threshold": threshold, "true_positive": tp, "false_positive": fp, "false_negative": fn,
            "precision": round(precision, 6), "recall": round(recall, 6), "f1": round(f1, 6)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True, help="generator output directory")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--scores-out", type=Path)
    args = parser.parse_args()
    rows = read_rows(args.data / "transactions.csv", args.data / "locations.csv")
    labels = set()
    with (args.data / "fraud_labels.csv").open(newline="", encoding="utf-8") as fh:
        labels = {row["txn_ref"] for row in csv.DictReader(fh)}
    score(rows)
    output = {"rows": len(rows), "label_rows": len(labels), "metrics": metrics(rows, labels, args.threshold),
              "top_flagged": [{"txn_ref": r["txn_ref"], "score": round(r["score"], 4), "reasons": r["reasons"]}
                              for r in sorted(rows, key=lambda x: x["score"], reverse=True)[:20]]}
    if args.scores_out:
        with args.scores_out.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=["txn_ref", "score", "reasons"])
            writer.writeheader()
            for row in rows:
                writer.writerow({"txn_ref": row["txn_ref"], "score": f"{row['score']:.6f}",
                                 "reasons": json.dumps(row["reasons"], separators=(",", ":"))})
        output["scores_out"] = str(args.scores_out)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
