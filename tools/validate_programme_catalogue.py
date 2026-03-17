#!/usr/bin/env python3
"""
Validate programme_catalogue.json for required fields and basic constraints.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOGUE_FILE = ROOT / "data" / "programme_catalogue.json"

REQUIRED_FIELDS = {
  "name",
  "faculty",
  "minimum_aps",
  "competitive_flag",
  "mainstream_or_extended",
  "subject_minimums",
}


def main() -> int:
  payload = json.loads(CATALOGUE_FILE.read_text(encoding="utf-8"))
  errors: list[str] = []

  universities = payload.get("universities", {})
  if not isinstance(universities, dict):
    print("Invalid structure: 'universities' must be an object")
    return 1

  for university_id, programmes in universities.items():
    if not isinstance(programmes, list):
      errors.append(f"{university_id}: programmes must be a list")
      continue
    seen_names = set()
    for i, programme in enumerate(programmes):
      missing = REQUIRED_FIELDS - set(programme.keys())
      if missing:
        errors.append(f"{university_id}[{i}] missing fields: {sorted(missing)}")
      name = programme.get("name", "").strip()
      if not name:
        errors.append(f"{university_id}[{i}] name must be non-empty")
      if name in seen_names:
        errors.append(f"{university_id}[{i}] duplicate programme name: {name}")
      seen_names.add(name)

      minimum_aps = programme.get("minimum_aps")
      if not isinstance(minimum_aps, int):
        errors.append(f"{university_id}[{i}] minimum_aps must be integer")

      stream = programme.get("mainstream_or_extended")
      if stream not in {"mainstream", "extended"}:
        errors.append(f"{university_id}[{i}] mainstream_or_extended must be mainstream|extended")

      subject_mins = programme.get("subject_minimums")
      if not isinstance(subject_mins, list):
        errors.append(f"{university_id}[{i}] subject_minimums must be a list")
      else:
        for j, rule in enumerate(subject_mins):
          if "subject" not in rule or "minimum_mark" not in rule:
            errors.append(f"{university_id}[{i}].subject_minimums[{j}] missing subject/minimum_mark")
          minimum_mark = rule.get("minimum_mark")
          if not isinstance(minimum_mark, int) or minimum_mark < 1 or minimum_mark > 7:
            errors.append(f"{university_id}[{i}].subject_minimums[{j}] minimum_mark must be int 1..7")

  if errors:
    print("Programme catalogue validation failed:")
    for err in errors:
      print(f"- {err}")
    return 1

  print("Programme catalogue validation passed.")
  return 0


if __name__ == "__main__":
  sys.exit(main())
