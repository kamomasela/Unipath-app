#!/usr/bin/env python3
"""
Checks reachability and content type of configured official sources.
Writes report to data/source_health_report.json.
"""

from __future__ import annotations

import datetime as dt
import json
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REGISTRY_FILE = DATA_DIR / "source_registry.json"
REPORT_FILE = DATA_DIR / "source_health_report.json"


def read_json(path: Path) -> dict:
  return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
  path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def check_url(url: str) -> dict:
  req = urllib.request.Request(url, method="HEAD")
  try:
    with urllib.request.urlopen(req, timeout=20) as res:
      return {
        "url": url,
        "ok": True,
        "status_code": getattr(res, "status", 200),
        "content_type": res.headers.get("Content-Type", ""),
      }
  except Exception as exc:  # noqa: BLE001
    return {
      "url": url,
      "ok": False,
      "error": str(exc),
    }


def main() -> None:
  registry = read_json(REGISTRY_FILE)
  universities = []
  for uni in registry.get("universities", []):
    results = []
    for source in uni.get("official_sources", []):
      if not source.get("active", True):
        continue
      url = source.get("url", "").strip()
      if not url:
        continue
      results.append(
        {
          "source_id": source.get("id"),
          "source_type": source.get("type"),
          **check_url(url),
        }
      )
    universities.append(
      {
        "id": uni.get("id"),
        "name": uni.get("name"),
        "sources": results,
      }
    )

  payload = {
    "generated_at": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "universities": universities,
  }
  write_json(REPORT_FILE, payload)
  print(f"Wrote {REPORT_FILE}")


if __name__ == "__main__":
  main()
