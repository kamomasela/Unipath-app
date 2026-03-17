#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import difflib
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "data" / "programme_catalogue.json"


def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\(.*?\)", " ", text)
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def token_set(text: str) -> set[str]:
    return set(normalize(text).split())


def text_from_pdf(pdf_path: Path) -> str:
    result = subprocess.run([
        "pdftotext", "-layout", str(pdf_path), "-"
    ], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "pdftotext failed")
    return result.stdout


def score_line_to_programme(line: str, programme: str) -> float:
    lnorm = normalize(line)
    pnorm = normalize(programme)
    if not lnorm or not pnorm:
        return 0.0
    seq = difflib.SequenceMatcher(a=pnorm, b=lnorm).ratio()
    ltoks = token_set(line)
    ptoks = token_set(programme)
    if not ptoks:
        return seq
    overlap = len(ptoks & ltoks) / len(ptoks)
    return 0.65 * seq + 0.35 * overlap


def find_aps_numbers(line: str) -> list[int]:
    nums = [int(x) for x in re.findall(r"\b\d{2,3}\b", line)]
    # Avoid years/page refs where possible
    return [n for n in nums if 20 <= n <= 500 and n not in {2025, 2026}]


def detect_scale_bounds(programmes: list[dict]) -> tuple[int, int]:
    values = [int(p["minimum_aps"]) for p in programmes if isinstance(p.get("minimum_aps"), int)]
    lo = max(20, min(values) - 10)
    hi = min(500, max(values) + 40)
    return lo, hi


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--university", required=True, help="university id in programme_catalogue.json")
    parser.add_argument("--pdf", required=True, help="prospectus PDF path")
    parser.add_argument("--apply-threshold", type=float, default=0.88)
    parser.add_argument("--report-threshold", type=float, default=0.70)
    args = parser.parse_args()

    data = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    programmes = data["universities"].get(args.university)
    if not programmes:
        raise SystemExit(f"No university id '{args.university}' in catalogue")

    pdf_path = Path(args.pdf).expanduser()
    text = text_from_pdf(pdf_path)
    lines = [" ".join(x.split()) for x in text.splitlines()]
    lines = [x for x in lines if len(x) >= 8]

    lo, hi = detect_scale_bounds(programmes)

    best_for_programme: dict[str, dict] = {}
    for line in lines:
        nums = [n for n in find_aps_numbers(line) if lo <= n <= hi]
        if not nums:
            continue
        if "aps" not in line.lower() and "points" not in line.lower() and len(nums) == 0:
            continue
        for p in programmes:
            pname = p["name"]
            score = score_line_to_programme(line, pname)
            if score < args.report_threshold:
                continue
            aps = nums[0]
            rec = {
                "programme": pname,
                "current_aps": int(p["minimum_aps"]),
                "proposed_aps": int(aps),
                "score": round(score, 4),
                "line": line,
                "auto_apply": score >= args.apply_threshold,
            }
            prev = best_for_programme.get(pname)
            if prev is None or rec["score"] > prev["score"]:
                best_for_programme[pname] = rec

    updates = [r for r in best_for_programme.values() if r["proposed_aps"] != r["current_aps"]]
    updates.sort(key=lambda x: (-x["score"], x["programme"]))

    report = ROOT / "data" / f"{args.university}_aps_extraction_report.csv"
    with report.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["programme", "current_aps", "proposed_aps", "score", "auto_apply", "line"])
        for u in updates:
            w.writerow([u["programme"], u["current_aps"], u["proposed_aps"], u["score"], u["auto_apply"], u["line"]])

    applied = 0
    for u in updates:
        if not u["auto_apply"]:
            continue
        for p in programmes:
            if p["name"] == u["programme"]:
                p["minimum_aps"] = int(u["proposed_aps"])
                applied += 1
                break

    CATALOGUE.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    print(f"University: {args.university}")
    print(f"Scale bounds used: {lo}..{hi}")
    print(f"Candidate updates found: {len(updates)}")
    print(f"Auto-applied (score >= {args.apply_threshold}): {applied}")
    print(f"Report: {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
