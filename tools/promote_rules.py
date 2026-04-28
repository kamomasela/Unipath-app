#!/usr/bin/env python3
"""
Promote pending extracted rules to approved active rules.

Workflow:
1. Run ingest_rules.py -> data/pending_rules.json
2. Edit data/approval_decisions.json
3. Run promote_rules.py -> data/approved_rules.json
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PENDING_FILE = DATA_DIR / "pending_rules.json"
DECISIONS_FILE = DATA_DIR / "approval_decisions.json"
SUBJECT_MIN_OVERRIDES_FILE = DATA_DIR / "subject_minimum_overrides.json"
PROGRAMME_METADATA_OVERRIDES_FILE = DATA_DIR / "programme_metadata_overrides.json"
PROGRAMME_CATALOGUE_FILE = DATA_DIR / "programme_catalogue.json"
APPROVED_FILE = DATA_DIR / "approved_rules.json"


def read_json(path: Path) -> dict:
  return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
  path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def apply_subject_minimum_overrides(university: dict, overrides: dict) -> None:
  by_university = overrides.get("universities", {}).get(university.get("id", ""), {})
  if not by_university:
    return
  for course in university.get("courses", []):
    course_name = course.get("name", "")
    if course_name not in by_university:
      continue
    course["subject_minimums"] = by_university[course_name]


def apply_programme_metadata_overrides(university: dict, overrides: dict) -> None:
  uni_overrides = overrides.get("universities", {}).get(university.get("id", ""), {})
  if not uni_overrides:
    return

  if "application_fee" in uni_overrides:
    university["application_fee"] = uni_overrides["application_fee"]
  if "aps_formula" in uni_overrides:
    university["aps_formula"] = uni_overrides["aps_formula"]

  programme_overrides = uni_overrides.get("programmes", {})
  existing_by_name = {course.get("name", ""): course for course in university.get("courses", [])}

  # Update existing programmes.
  for name, meta in programme_overrides.items():
    if name not in existing_by_name:
      continue
    course = existing_by_name[name]
    if "minimum_aps" in meta:
      course["minimum_aps"] = int(meta["minimum_aps"])
    course["competitive_flag"] = bool(meta.get("competitive_flag", False))
    course["mainstream_or_extended"] = meta.get("mainstream_or_extended", "mainstream")

  # Add missing override programmes (e.g. explicit extended tracks).
  for name, meta in programme_overrides.items():
    if name in existing_by_name:
      continue
    university.setdefault("courses", []).append(
      {
        "name": name,
        "minimum_aps": int(meta.get("minimum_aps", 0)),
        "subject_minimums": [],
        "competitive_flag": bool(meta.get("competitive_flag", False)),
        "mainstream_or_extended": meta.get("mainstream_or_extended", "mainstream"),
      }
    )


def apply_programme_catalogue(university: dict, catalogue: dict) -> None:
  records = catalogue.get("universities", {}).get(university.get("id", ""), [])
  if not records:
    return
  normalized = []
  for record in records:
    normalized.append(
      {
        "name": record["name"],
        "faculty": record.get("faculty", ""),
        "minimum_aps": int(record["minimum_aps"]),
        "competitive_flag": bool(record.get("competitive_flag", False)),
        "mainstream_or_extended": record.get("mainstream_or_extended", "mainstream"),
        "subject_minimums": record.get("subject_minimums", []),
        "aps_mathematics": record.get("aps_mathematics"),
        "aps_mathematical_literacy": record.get("aps_mathematical_literacy"),
        "aps_technical_mathematics": record.get("aps_technical_mathematics"),
        "notes": record.get("notes"),
        "admission_notes": record.get("admission_notes"),
      }
    )
  # Authoritative: replace extracted programmes with curated catalogue entries.
  university["courses"] = normalized


def main() -> None:
  pending = read_json(PENDING_FILE)
  decisions = read_json(DECISIONS_FILE).get("universities", {})
  overrides = read_json(SUBJECT_MIN_OVERRIDES_FILE)
  programme_metadata_overrides = read_json(PROGRAMME_METADATA_OVERRIDES_FILE)
  programme_catalogue = read_json(PROGRAMME_CATALOGUE_FILE)

  approved_universities = []
  for uni in pending.get("universities", []):
    decision = decisions.get(uni.get("id", ""), {})
    if decision.get("approved", False):
      updated = dict(uni)
      updated["status"] = "active"
      if "include_life_orientation" in decision:
        updated["include_life_orientation"] = bool(decision["include_life_orientation"])
      if "supports_grade12" in decision:
        updated["supports_grade12"] = bool(decision["supports_grade12"])
      apply_programme_metadata_overrides(updated, programme_metadata_overrides)
      apply_subject_minimum_overrides(updated, overrides)
      apply_programme_catalogue(updated, programme_catalogue)
      updated["approval_notes"] = decision.get("notes", "")
      updated["approved_at"] = dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
      approved_universities.append(updated)
      continue

    blocked = dict(uni)
    blocked["status"] = "temporarily_unavailable"
    blocked["unavailable_reason"] = "Pending manual approval"
    blocked["courses"] = []
    approved_universities.append(blocked)

  payload = {
    "schema_version": pending.get("schema_version", "1.0"),
    "generated_at": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "source_pending_file": str(PENDING_FILE),
    "source_decisions_file": str(DECISIONS_FILE),
    "source_subject_minimum_overrides_file": str(SUBJECT_MIN_OVERRIDES_FILE),
    "source_programme_metadata_overrides_file": str(PROGRAMME_METADATA_OVERRIDES_FILE),
    "source_programme_catalogue_file": str(PROGRAMME_CATALOGUE_FILE),
    "universities": approved_universities,
  }
  write_json(APPROVED_FILE, payload)
  print(f"Wrote {APPROVED_FILE} with {len(approved_universities)} university entries.")


if __name__ == "__main__":
  main()
