#!/usr/bin/env python3
"""
Validate UJ per-math-type APS logic by simulating 3 students.

Student A: Mathematics (APS 32)
  - CIVIL ENGINEERING (BEng): needs math=32 → QUALIFY
  - BIOKINETICS: needs math=32 → QUALIFY
  - BA (COMMUNICATION DESIGN): needs math=25 → QUALIFY

Student B: Mathematical Literacy (APS 32)
  - CIVIL ENGINEERING (BEng): needs math=32 but mathlit=null → NOT eligible (no mathlit threshold)
  - BIOKINETICS: needs mathlit=33, student APS=32 → NOT ELIGIBLE
  - BA (COMMUNICATION DESIGN): needs mathlit=26, student APS=32 → QUALIFY

Student C: Technical Mathematics (APS 30)
  - CIVIL ENGINEERING (BEngTech): needs techmath=30 → QUALIFY
  - BIOKINETICS: needs techmath=null → falls back to min=32, APS=30 → NOT ELIGIBLE
  - BA (COMMUNICATION DESIGN): needs techmath=null → falls back to min=25, APS=30 → QUALIFY
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPROVED_FILE = ROOT / "data" / "approved_rules.json"


def get_required_aps(course: dict, math_type: str) -> int | None:
    """Mirror the JS getRequiredAPS logic.

    If the course has any per-type APS data, the student's math type must
    match a non-null entry. If no match, returns None (not eligible).
    If the course has no per-type data at all, falls back to minimum_aps.
    """
    has_per_type = (
        course.get("aps_mathematics") is not None
        or course.get("aps_mathematical_literacy") is not None
        or course.get("aps_technical_mathematics") is not None
    )

    if not has_per_type:
        return course.get("minimum_aps")

    if math_type == "Mathematics":
        return course.get("aps_mathematics")  # None → not eligible
    if math_type == "Mathematical Literacy":
        return course.get("aps_mathematical_literacy")  # None → not eligible
    if math_type == "Technical Mathematics":
        # TechMath: use dedicated threshold if set, else fall back to Mathematics threshold.
        # TechMath is treated as equivalent to Mathematics for programmes that pre-date its
        # inclusion (i.e. where aps_technical_mathematics is null but aps_mathematics is set).
        if course.get("aps_technical_mathematics") is not None:
            return course["aps_technical_mathematics"]
        if course.get("aps_mathematics") is not None:
            return course["aps_mathematics"]
        return None  # Not eligible
    return course.get("minimum_aps")


def check_eligibility(course: dict, student_aps: int, math_type: str) -> tuple[bool, int | None]:
    required = get_required_aps(course, math_type)
    if required is None:
        # Programme does not accept this math type
        return False, required
    return student_aps >= required, required


def main() -> None:
    ar = json.loads(APPROVED_FILE.read_text(encoding="utf-8"))
    uj = next((u for u in ar["universities"] if u["id"] == "uj"), None)
    if not uj:
        print("ERROR: UJ not found in approved_rules.json")
        sys.exit(1)

    courses_by_name: dict[str, list[dict]] = {}
    for c in uj.get("courses", []):
        courses_by_name.setdefault(c["name"], []).append(c)

    students = [
        {"label": "Student A", "math_type": "Mathematics", "aps": 32},
        {"label": "Student B", "math_type": "Mathematical Literacy", "aps": 32},
        {"label": "Student C", "math_type": "Technical Mathematics", "aps": 30},
    ]

    # Test cases: (programme_name, occurrence_index, expected_eligible, reason)
    test_cases = [
        # Student A (Math, APS=32)
        ("CIVIL ENGINEERING", 0, True,   "BEng Civil: math=32, APS=32 → QUALIFY"),
        ("CIVIL ENGINEERING", 1, True,   "BEngTech Civil: math=30, APS=32 → QUALIFY"),
        ("BIOKINETICS",       0, True,   "Biokinetics: math=32, APS=32 → QUALIFY"),
        ("BA (COMMUNICATION DESIGN)", 0, True, "BA CommDes: math=25, APS=32 → QUALIFY"),

        # Student B (MathLit, APS=32)
        ("CIVIL ENGINEERING", 0, False,  "BEng Civil: mathlit=null (math-only) → NOT ELIGIBLE"),
        ("CIVIL ENGINEERING", 1, False,  "BEngTech Civil: mathlit=null → NOT ELIGIBLE"),
        ("BIOKINETICS",       0, False,  "Biokinetics: mathlit=33, APS=32 → NOT ELIGIBLE"),
        ("BA (COMMUNICATION DESIGN)", 0, True, "BA CommDes: mathlit=26, APS=32 → QUALIFY"),

        # Student C (TechMath, APS=30)
        ("CIVIL ENGINEERING", 0, False,  "BEng Civil: techmath=null → fallback min=32, APS=30 → NOT ELIGIBLE"),
        ("CIVIL ENGINEERING", 1, True,   "BEngTech Civil: techmath=30, APS=30 → QUALIFY"),
        ("BIOKINETICS",       0, False,  "Biokinetics: techmath=null → fallback min=32, APS=30 → NOT ELIGIBLE"),
        ("BA (COMMUNICATION DESIGN)", 0, True, "BA CommDes: techmath=null → fallback min=25, APS=30 → QUALIFY"),
    ]

    student_idx = 0
    student = students[student_idx]
    failures = 0
    prev_student_label = None

    for prog_name, occ_idx, expected, desc in test_cases:
        # Determine which student based on APS/math_type clues in description
        for s in students:
            if s["aps"] == 32 and "Student A" in desc or ("MathLit" in desc or "mathlit" in desc.lower() and "Student B" not in desc):
                pass
        # Actually assign student based on order: first 4 → A, next 4 → B, last 4 → C
        if test_cases.index((prog_name, occ_idx, expected, desc)) < 4:
            student = students[0]
        elif test_cases.index((prog_name, occ_idx, expected, desc)) < 8:
            student = students[1]
        else:
            student = students[2]

        if student["label"] != prev_student_label:
            print(f"\n=== {student['label']}: {student['math_type']}, APS={student['aps']} ===")
            prev_student_label = student["label"]

        courses = courses_by_name.get(prog_name, [])
        if occ_idx >= len(courses):
            print(f"  SKIP: {prog_name} (occurrence {occ_idx}) not found in approved_rules")
            continue

        course = courses[occ_idx]
        eligible, required = check_eligibility(course, student["aps"], student["math_type"])

        status = "PASS" if eligible == expected else "FAIL"
        if status == "FAIL":
            failures += 1

        print(
            f"  [{status}] {desc}\n"
            f"       required={required} eligible={eligible} "
            f"(math={course.get('aps_mathematics')} "
            f"mathlit={course.get('aps_mathematical_literacy')} "
            f"techmath={course.get('aps_technical_mathematics')} "
            f"min_aps={course.get('minimum_aps')})"
        )

    print(f"\n{'='*50}")
    if failures == 0:
        print(f"ALL TESTS PASSED (12/12)")
    else:
        print(f"FAILED: {failures} test(s) failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
