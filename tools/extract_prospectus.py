#!/usr/bin/env python3
"""
UniPath prospectus extractor — pdfplumber edition.

Uses pdfplumber instead of pdftotext so that multi-column table layouts
are correctly reassembled before we search for programme/APS data.

Usage:
  python3 tools/extract_prospectus.py --university uwc --pdf sources/prospectuses/UWC_2026.pdf

Output:
  data/<university>_aps_extraction_report.csv  (candidate matches)
  stdout summary
"""
from __future__ import annotations

import argparse
import csv
import difflib
import json
import re
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    raise SystemExit("pdfplumber not installed. Run: pip install pdfplumber")

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "data" / "programme_catalogue.json"


# ── helpers ──────────────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\(.*?\)", " ", text)
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def token_overlap(a: str, b: str) -> float:
    ta = set(normalize(a).split())
    tb = set(normalize(b).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta)


def sequence_score(a: str, b: str) -> float:
    return difflib.SequenceMatcher(a=normalize(a), b=normalize(b)).ratio()


def score_match(line: str, programme: str) -> float:
    return 0.6 * sequence_score(line, programme) + 0.4 * token_overlap(line, programme)


def find_aps_numbers(text: str, lo: int, hi: int) -> list[int]:
    nums = re.findall(r"\b(\d{2,3})\b", text)
    result = []
    for n in nums:
        val = int(n)
        if lo <= val <= hi and val not in {2024, 2025, 2026}:
            result.append(val)
    return result


def detect_scale(programmes: list[dict]) -> tuple[int, int]:
    vals = [int(p["minimum_aps"]) for p in programmes if isinstance(p.get("minimum_aps"), (int, float))]
    if not vals:
        return 20, 500
    return max(15, min(vals) - 10), min(600, max(vals) + 50)


def extract_text_blocks(pdf_path: Path) -> list[str]:
    """
    Extract text from every page using pdfplumber.
    For each page we pull:
      1. Structured table cells (preserves column alignment)
      2. Plain page text as fallback

    Returns a flat list of text chunks (one per table cell or text line).
    """
    blocks: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        print(f"  PDF pages: {len(pdf.pages)}")
        aps_pages = 0
        for page in pdf.pages:
            text = page.extract_text() or ""
            # Count pages that look relevant
            if "aps" in text.lower() or "points" in text.lower() or "minimum" in text.lower():
                aps_pages += 1

            # Extract table cell content first (best for tabular data)
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    for cell in row:
                        if cell and cell.strip():
                            # Each line within a cell is its own block
                            for line in cell.splitlines():
                                line = " ".join(line.split())
                                if len(line) >= 6:
                                    blocks.append(line)

            # Also add plain text lines (catches non-table layouts)
            for line in text.splitlines():
                line = " ".join(line.split())
                if len(line) >= 6:
                    blocks.append(line)

        print(f"  Pages with APS/minimum/points keywords: {aps_pages}")
    return blocks


# ── main logic ────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Extract APS requirements from a prospectus PDF.")
    parser.add_argument("--university", required=True, help="University ID in programme_catalogue.json")
    parser.add_argument("--pdf", required=True, help="Path to prospectus PDF")
    parser.add_argument("--apply-threshold", type=float, default=0.85,
                        help="Score threshold to auto-apply update (default 0.85)")
    parser.add_argument("--report-threshold", type=float, default=0.65,
                        help="Score threshold to include in report (default 0.65)")
    args = parser.parse_args()

    # Load programme catalogue
    data = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    programmes = data["universities"].get(args.university)
    if not programmes:
        raise SystemExit(f"No university id '{args.university}' in programme_catalogue.json")

    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    print(f"\nExtracting from: {pdf_path.name}")
    print(f"University: {args.university} ({len(programmes)} programmes in catalogue)")

    lo, hi = detect_scale(programmes)
    print(f"APS scale bounds: {lo}–{hi}")

    # Extract all text blocks via pdfplumber
    blocks = extract_text_blocks(pdf_path)
    print(f"Text blocks extracted: {len(blocks)}")

    # Count blocks containing numbers in our APS range
    numeric_blocks = [b for b in blocks if find_aps_numbers(b, lo, hi)]
    print(f"Blocks with numbers in APS range: {len(numeric_blocks)}")

    if not numeric_blocks:
        print("\n⚠  No APS-range numbers found in this PDF.")
        print("   This document likely does not contain programme APS requirements.")
        print("   Possible causes:")
        print("   • The PDF is a brochure/flyer (not the full prospectus)")
        print("   • APS data is on the university website (requires browser rendering)")
        print("   • The university uses a different scoring system in this document")
        return 1

    # Match each numeric block against programme names
    best: dict[str, dict] = {}
    for block in numeric_blocks:
        nums = find_aps_numbers(block, lo, hi)
        if not nums:
            continue
        for prog in programmes:
            name = prog["name"]
            score = score_match(block, name)
            if score < args.report_threshold:
                continue
            proposed = nums[0]
            current = int(prog["minimum_aps"])
            rec = {
                "programme": name,
                "current_aps": current,
                "proposed_aps": proposed,
                "score": round(score, 4),
                "auto_apply": score >= args.apply_threshold,
                "line": block[:200],
            }
            prev = best.get(name)
            if prev is None or rec["score"] > prev["score"]:
                best[name] = rec

    updates = [r for r in best.values() if r["proposed_aps"] != r["current_aps"]]
    updates.sort(key=lambda x: (-x["score"], x["programme"]))

    # Write CSV report
    report_path = ROOT / "data" / f"{args.university}_aps_extraction_report.csv"
    with report_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["programme", "current_aps", "proposed_aps", "score", "auto_apply", "line"])
        for u in updates:
            w.writerow([u["programme"], u["current_aps"], u["proposed_aps"],
                        u["score"], u["auto_apply"], u["line"]])

    # Apply high-confidence updates
    applied = 0
    for u in updates:
        if not u["auto_apply"]:
            continue
        for p in programmes:
            if p["name"] == u["programme"]:
                p["minimum_aps"] = u["proposed_aps"]
                applied += 1
                break

    if applied:
        CATALOGUE.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    print(f"\nResults:")
    print(f"  Candidate updates found: {len(updates)}")
    print(f"  Auto-applied (score ≥ {args.apply_threshold}): {applied}")
    print(f"  Report written: {report_path}")

    if updates:
        print("\nTop matches:")
        for u in updates[:10]:
            flag = "✓ AUTO" if u["auto_apply"] else "  review"
            print(f"  [{flag}] {u['programme']}: {u['current_aps']} → {u['proposed_aps']} (score={u['score']})")
            print(f"          \"{u['line'][:80]}\"")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
