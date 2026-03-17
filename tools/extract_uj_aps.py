#!/usr/bin/env python3
"""
Extract per-math-type APS thresholds for UJ programmes from uj_2026.txt.

Reads sources/prospectuses/uj_2026.txt line by line, finds qualification
code lines, scans ±40 lines around each to extract:
  - programme name hint (ALL-CAPS text near the code)
  - APS pattern (flat number or "N with Maths ... OR M with Maths Lit" text)

Outputs data/uj_aps_by_qualcode.json with per-type APS values.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TXT_FILE = ROOT / "sources" / "prospectuses" / "uj_2026.txt"
OUTPUT_FILE = ROOT / "data" / "uj_aps_by_qualcode.json"

# Manual overrides for codes whose APS cannot be reliably auto-extracted.
# These were verified by reading the relevant table in uj_2026.txt.
MANUAL_OVERRIDES: dict[str, dict] = {
    # BCom degrees: 27/28 with Maths/MathLit; some only accept Maths
    "B34IMQ": {"minimum_aps": None, "aps_mathematics": 27, "aps_mathematical_literacy": 28, "aps_technical_mathematics": None},
    "B1CISQ": {"minimum_aps": None, "aps_mathematics": 26, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    "B1CMMQ": {"minimum_aps": None, "aps_mathematics": 26, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    "B34TLQ": {"minimum_aps": None, "aps_mathematics": 26, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    # BCom Accounting: 28 for Maths takers, mathlit not accepted for some
    "B34F5Q": {"minimum_aps": None, "aps_mathematics": 28, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    "B34INQ": {"minimum_aps": None, "aps_mathematics": 28, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    "B1CEMQ": {"minimum_aps": None, "aps_mathematics": 28, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    # BCom diploma LOGISTICS: 22 with Maths/Tech Maths OR 24 with Maths Lit
    "D34P2Q": {"minimum_aps": None, "aps_mathematics": 22, "aps_mathematical_literacy": 24, "aps_technical_mathematics": 22},
    # Diploma Operations Management: 20 with Maths OR 22 with Maths Lit (3-year)
    # Management Services: 19 with Maths OR 21 with Maths Lit
    "D6OPMQ": {"minimum_aps": None, "aps_mathematics": 19, "aps_mathematical_literacy": 21, "aps_technical_mathematics": None},
    "D6OPEQ": {"minimum_aps": None, "aps_mathematics": 19, "aps_mathematical_literacy": 21, "aps_technical_mathematics": None},
    # Extended Management Services (D6OPEQ → same as diploma but extended)
    # BEng degrees: Maths only, MathLit and TechMath not accepted
    "B6CISQ": {"minimum_aps": None, "aps_mathematics": 32, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    "B6ELSQ": {"minimum_aps": None, "aps_mathematics": 32, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    "B6MESQ": {"minimum_aps": None, "aps_mathematics": 32, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    # BEngTech degrees (3-year, flat APS, Maths/TechMaths but NOT MathLit)
    "B6CE1Q": {"minimum_aps": None, "aps_mathematics": 30, "aps_mathematical_literacy": None, "aps_technical_mathematics": 30},
    "B6CV3Q": {"minimum_aps": None, "aps_mathematics": 30, "aps_mathematical_literacy": None, "aps_technical_mathematics": 30},
    "B6EL1Q": {"minimum_aps": None, "aps_mathematics": 30, "aps_mathematical_literacy": None, "aps_technical_mathematics": 30},
    "B6EXTQ": {"minimum_aps": None, "aps_mathematics": 30, "aps_mathematical_literacy": None, "aps_technical_mathematics": 30},
    "B6IN2Q": {"minimum_aps": None, "aps_mathematics": 28, "aps_mathematical_literacy": None, "aps_technical_mathematics": 28},
    "B6MC2Q": {"minimum_aps": None, "aps_mathematics": 30, "aps_mathematical_literacy": None, "aps_technical_mathematics": 30},
    "B6MINQ": {"minimum_aps": None, "aps_mathematics": 30, "aps_mathematical_literacy": None, "aps_technical_mathematics": 30},
    "B6PY2Q": {"minimum_aps": None, "aps_mathematics": 30, "aps_mathematical_literacy": None, "aps_technical_mathematics": 30},
    "B6SU0Q": {"minimum_aps": None, "aps_mathematics": 23, "aps_mathematical_literacy": None, "aps_technical_mathematics": 23},
    "B6CN0Q": {"minimum_aps": None, "aps_mathematics": 30, "aps_mathematical_literacy": None, "aps_technical_mathematics": 30},
    # Extended BEngTech (flat, Maths/TechMaths only)
    "B6CX3Q": {"minimum_aps": None, "aps_mathematics": 22, "aps_mathematical_literacy": None, "aps_technical_mathematics": 22},
    "B6L1XQ": {"minimum_aps": None, "aps_mathematics": 22, "aps_mathematical_literacy": None, "aps_technical_mathematics": 22},
    "B6EX0Q": {"minimum_aps": None, "aps_mathematics": 26, "aps_mathematical_literacy": None, "aps_technical_mathematics": 26},
    "B6IX2Q": {"minimum_aps": None, "aps_mathematics": 26, "aps_mathematical_literacy": None, "aps_technical_mathematics": 26},
    "B6MX2Q": {"minimum_aps": None, "aps_mathematics": 26, "aps_mathematical_literacy": None, "aps_technical_mathematics": 26},
    "B6PX2Q": {"minimum_aps": None, "aps_mathematics": 26, "aps_mathematical_literacy": None, "aps_technical_mathematics": 26},
    # BSc Construction (Maths/TechMaths, no MathLit for mainstream)
    "B6SC0Q": {"minimum_aps": None, "aps_mathematics": 26, "aps_mathematical_literacy": None, "aps_technical_mathematics": 26},
    # Urban and Regional Planning
    "B6UP0Q": {"minimum_aps": None, "aps_mathematics": 27, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    # Health Sciences (Diagnostic radiography etc.) – Mathematics ONLY per notes
    "B9M01Q": {"minimum_aps": None, "aps_mathematics": 31, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    "B9M02Q": {"minimum_aps": None, "aps_mathematics": 31, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    "B9M03Q": {"minimum_aps": None, "aps_mathematics": 31, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    "B9M04Q": {"minimum_aps": None, "aps_mathematics": 31, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    # Sport Management BCom – Maths only (23 with Maths)
    "B9S14Q": {"minimum_aps": None, "aps_mathematics": 23, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    # BA with Politics/Economics/Technology – 27 with Mathematics only
    "B7024Q": {"minimum_aps": None, "aps_mathematics": 27, "aps_mathematical_literacy": None, "aps_technical_mathematics": None},
    # FADA BA (Fashion Design) – 25 with Maths/Tech Maths OR 26 with Maths Lit
    "B8BA7Q": {"minimum_aps": None, "aps_mathematics": 25, "aps_mathematical_literacy": 26, "aps_technical_mathematics": 25},
    # FADA Diplomas: Architecture D8AT1Q (22 Maths OR 23 Maths Lit), no Tech Maths
    "D8AT1Q": {"minimum_aps": None, "aps_mathematics": 22, "aps_mathematical_literacy": 23, "aps_technical_mathematics": None},
    # Diploma Architecture (Jewellery Design) D8JD1Q same as D8FP1Q
    "D8JD1Q": {"minimum_aps": None, "aps_mathematics": 20, "aps_mathematical_literacy": 21, "aps_technical_mathematics": 22},
    # BCom Sport Management – only Maths accepted, APS 23
    "D9S01Q": {"minimum_aps": None, "aps_mathematics": 22, "aps_mathematical_literacy": 23, "aps_technical_mathematics": None},
    # BCom Sport and Exercise Sciences – 27 with Maths OR 28 with Maths Lit
    "B9SE1Q": {"minimum_aps": None, "aps_mathematics": 27, "aps_mathematical_literacy": 28, "aps_technical_mathematics": None},
}

# Qualification code pattern: 5-8 chars, starts with letter, ends in Q, contains digit(s)
QUAL_CODE_RE = re.compile(r"^([A-Z][0-9A-Z]{4,7}Q)\s*$")

# A qualification code inside parentheses (reference, not definition)
QUAL_CODE_PARENS_RE = re.compile(r"^\(([A-Z][0-9A-Z]{4,7}Q)\)\s*$")

# Lines that are clearly NOT programme names or APS
SKIP_LINE_PATTERNS = [
    re.compile(r"UNIVERSITY OF JOHANNESBURG", re.IGNORECASE),
    re.compile(r"UNDERGRADUATE PROSPECTUS", re.IGNORECASE),
    re.compile(r"ADMISSION REQUIREMENTS", re.IGNORECASE),
    re.compile(r"^DEGREE PROGRAMMES?\s*$", re.IGNORECASE),
    re.compile(r"^DIPLOMA PROGRAMMES?\s*$", re.IGNORECASE),
    re.compile(r"CAREER\s*$", re.IGNORECASE),
    re.compile(r"CAMPUS\s*$", re.IGNORECASE),
    re.compile(r"^PROGRAMME\s*$", re.IGNORECASE),
    re.compile(r"^Qualification Code\s*$", re.IGNORECASE),
    re.compile(r"^Minimum APS\s*$", re.IGNORECASE),
    re.compile(r"^English\s*$", re.IGNORECASE),
    re.compile(r"^Mathematics\s*$", re.IGNORECASE),
    re.compile(r"^Mathematical Literacy\s*$", re.IGNORECASE),
    re.compile(r"^Technical Mathematics", re.IGNORECASE),
    re.compile(r"^Physical Sciences?\s*$", re.IGNORECASE),
    re.compile(r"^Life Sciences?\s*$", re.IGNORECASE),
    re.compile(r"^Geography\s*$", re.IGNORECASE),
    re.compile(r"^\d+\s*$"),                     # pure numbers
    re.compile(r"^\d+\s*\(.*%.*\)\s*$"),         # level ratings like "5 (60%+)"
    re.compile(r"^Not accepted\s*$", re.IGNORECASE),
    re.compile(r"^Not applicable\s*$", re.IGNORECASE),
    re.compile(r"^APB\s*$|^APK\s*$|^DFC\s*$|^SWC\s*$"),
    re.compile(r"^OR\s*$|^AND\s*$"),
    re.compile(r"^\-+\s*$"),
]

# Programme name: all-caps line
_UPPER_WORD = re.compile(r"^[A-Z\s()\-,/&✪*0-9]+$")
_MIN_UPPER_WORDS = re.compile(r"[A-Z]{3,}")

# Page number detection – lines that are just a number 1-100 are likely page nums
_PAGE_NUM_RE = re.compile(r"^\s*(\d{1,3})\s*$")

# Known page numbers to exclude from APS
_KNOWN_NON_APS = {
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44,
    45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58,
    59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72,
    73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86,
    87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
}


def is_likely_page_number(lines: list[str], idx: int) -> bool:
    """
    Return True if the number on this line is likely a page number.
    Page numbers typically appear immediately before/after
    'UNIVERSITY OF JOHANNESBURG' or 'UNDERGRADUATE PROSPECTUS' headings.
    """
    stripped = lines[idx].strip()
    m = _PAGE_NUM_RE.match(stripped)
    if not m:
        return False
    val = int(m.group(1))
    if val > 100:
        return False
    # Check context: if within 3 lines of a university/prospectus header, it's a page num
    lo = max(0, idx - 3)
    hi = min(len(lines), idx + 3)
    for j in range(lo, hi):
        if j == idx:
            continue
        t = lines[j].strip()
        if re.search(r"UNIVERSITY OF JOHANNESBURG|UNDERGRADUATE PROSPECTUS|2026 UNDERGRADUATE", t, re.IGNORECASE):
            return True
    return False


def is_skip_line(text: str) -> bool:
    t = text.strip()
    for pat in SKIP_LINE_PATTERNS:
        if pat.match(t):
            return True
    return False


def looks_like_programme_name(text: str) -> bool:
    """Return True if a line looks like an ALL-CAPS programme name."""
    t = text.strip()
    if not t or len(t) < 3:
        return False
    if not _UPPER_WORD.match(t):
        return False
    if not _MIN_UPPER_WORDS.search(t):
        return False
    if len(t) <= 4 and t.isupper():
        return False
    if is_skip_line(t):
        return False
    # Reject lines that look like subject levels or percentages
    if re.match(r"^\d", t):
        return False
    return True


def parse_aps_text(text: str) -> dict:
    """
    Parse an APS pattern text into per-type APS values.
    Returns dict with keys: minimum_aps, aps_mathematics, aps_mathematical_literacy,
    aps_technical_mathematics (all int or None).
    """
    result = {
        "minimum_aps": None,
        "aps_mathematics": None,
        "aps_mathematical_literacy": None,
        "aps_technical_mathematics": None,
    }
    t = text.strip()
    if not t:
        return result

    if re.search(r"not\s+accepted", t, re.IGNORECASE):
        result["_not_accepted"] = True
        return result

    # --- 3-type patterns (most specific first) ---

    # "N with Maths OR M with Maths Lit OR P with Tech Maths"
    m = re.search(
        r"(\d+)\s+with\s+(?:Maths?|Mathematics?)\s+OR\s+(\d+)\s+with\s+(?:Maths?\s*Lit(?:eracy)?|Mathematical\s+Literacy)\s+OR\s+(\d+)\s+with\s+Tech(?:nical)?\s*Maths?",
        t, re.IGNORECASE
    )
    if m:
        result["aps_mathematics"] = int(m.group(1))
        result["aps_mathematical_literacy"] = int(m.group(2))
        result["aps_technical_mathematics"] = int(m.group(3))
        return result

    # "N with Maths OR M with Tech Maths OR P with Maths Lit" (alt order)
    m = re.search(
        r"(\d+)\s+with\s+(?:Maths?|Mathematics?)\s+OR\s+(\d+)\s+with\s+Tech(?:nical)?\s*Maths?\s+OR\s+(\d+)\s+with\s+(?:Maths?\s*Lit(?:eracy)?|Mathematical\s+Literacy)",
        t, re.IGNORECASE
    )
    if m:
        result["aps_mathematics"] = int(m.group(1))
        result["aps_technical_mathematics"] = int(m.group(2))
        result["aps_mathematical_literacy"] = int(m.group(3))
        return result

    # --- 2-type: Maths/TechMaths OR MathLit (both math types get same APS) ---

    m = re.search(
        r"(\d+)\s+with\s+Maths?\s*/\s*Tech(?:nical)?\s*Maths?\s+OR\s+(\d+)\s+with\s+(?:Mathematical\s+Literacy|Maths?\s*Lit(?:eracy)?)",
        t, re.IGNORECASE
    )
    if m:
        result["aps_mathematics"] = int(m.group(1))
        result["aps_technical_mathematics"] = int(m.group(1))
        result["aps_mathematical_literacy"] = int(m.group(2))
        return result

    # "N with Maths / Tech Maths OR M with ..." (space around slash)
    m = re.search(
        r"(\d+)\s+with\s+Maths?\s+/\s+Tech(?:nical)?\s*Maths?\s+OR\s+(\d+)\s+with\s+(?:Mathematical\s+Literacy|Maths?\s*Lit(?:eracy)?)",
        t, re.IGNORECASE
    )
    if m:
        result["aps_mathematics"] = int(m.group(1))
        result["aps_technical_mathematics"] = int(m.group(1))
        result["aps_mathematical_literacy"] = int(m.group(2))
        return result

    # --- 2-type: Maths OR MathLit ---
    m = re.search(
        r"(\d+)\s+with\s+(?:Maths?|Mathematics?)\s+OR\s+(\d+)\s+with\s+(?:Maths?\s*Lit(?:eracy)?|Mathematical\s+Literacy)",
        t, re.IGNORECASE
    )
    if m:
        result["aps_mathematics"] = int(m.group(1))
        result["aps_mathematical_literacy"] = int(m.group(2))
        return result

    # --- 2-type: Maths OR TechMaths ---
    m = re.search(
        r"(\d+)\s+with\s+(?:Maths?|Mathematics?)\s+OR\s+(\d+)\s+with\s+Tech(?:nical)?\s*Maths?",
        t, re.IGNORECASE
    )
    if m:
        result["aps_mathematics"] = int(m.group(1))
        result["aps_technical_mathematics"] = int(m.group(2))
        return result

    # --- MathLit OR Maths (inverted order) ---
    m = re.search(
        r"(\d+)\s+with\s+(?:Maths?\s*Lit(?:eracy)?|Mathematical\s+Literacy)\s+OR\s+(\d+)\s+with\s+(?:Maths?|Mathematics?)",
        t, re.IGNORECASE
    )
    if m:
        result["aps_mathematical_literacy"] = int(m.group(1))
        result["aps_mathematics"] = int(m.group(2))
        return result

    # --- Maths only ("N with Mathematics ONLY" or "N with Mathematics") ---
    m = re.search(
        r"(\d+)\s+with\s+(?:Maths?|Mathematics?)\s*(?:ONLY)?(?:\s|$)",
        t, re.IGNORECASE
    )
    if m:
        result["aps_mathematics"] = int(m.group(1))
        return result

    # --- MathLit only ---
    m = re.search(
        r"(\d+)\s+with\s+(?:Maths?\s*Lit(?:eracy)?|Mathematical\s+Literacy)",
        t, re.IGNORECASE
    )
    if m:
        result["aps_mathematical_literacy"] = int(m.group(1))
        return result

    # --- Flat APS (standalone 2-digit number in range 15-45) ---
    m = re.match(r"^\s*(\d{2})\s*$", t)
    if m:
        val = int(m.group(1))
        if 15 <= val <= 45:
            result["minimum_aps"] = val
            return result

    return result


def get_next_code_line(lines: list[str], code_idx: int, window: int = 60) -> int:
    """Return the line index of the next qual code after code_idx, or code_idx+window."""
    hi = min(len(lines), code_idx + window + 1)
    for i in range(code_idx + 1, hi):
        stripped = lines[i].strip()
        if QUAL_CODE_RE.match(stripped) and not QUAL_CODE_PARENS_RE.match(stripped):
            return i
    return hi


def get_prev_code_line(lines: list[str], code_idx: int, window: int = 60) -> int:
    """Return the line index of the previous qual code before code_idx, or code_idx-window."""
    lo = max(0, code_idx - window)
    for i in range(code_idx - 1, lo - 1, -1):
        stripped = lines[i].strip()
        if QUAL_CODE_RE.match(stripped) and not QUAL_CODE_PARENS_RE.match(stripped):
            return i
    return lo


def _find_best_aps_in_segment(
    lines: list[str], start: int, end: int, code_idx: int
) -> tuple[dict | None, int]:
    """
    Like _search_segment but also returns the distance to the best APS found.
    Returns (result_dict_or_None, distance).
    """
    if start >= end:
        return None, 999

    # Flat candidates
    flat_candidates: list[tuple[int, int, int]] = []
    for i in range(start, end):
        stripped = lines[i].strip()
        m = re.match(r"^\s*(\d{2})\s*$", stripped)
        if m:
            val = int(m.group(1))
            if 15 <= val <= 45 and not is_likely_page_number(lines, i):
                dist = abs(i - code_idx)
                flat_candidates.append((dist, i, val))
    flat_candidates.sort()
    best_flat_dist = flat_candidates[0][0] if flat_candidates else 999

    # Type-specific candidates
    aps_region_indices: list[int] = []
    for i in range(start, end):
        stripped = lines[i].strip()
        if re.search(
            r"\bwith\s*(?:Maths?|Mathematics?|Mathematical|Technical|Tech\.?)?",
            stripped, re.IGNORECASE,
        ):
            context = " ".join(
                lines[j].strip()
                for j in range(max(start, i - 1), min(end, i + 4))
                if lines[j].strip()
            )
            cond1 = bool(re.search(
                r"\bwith\s+(?:Maths?|Mathematics?|Mathematical\s+Literacy|Tech(?:nical)?\s*Maths?)",
                context, re.IGNORECASE,
            ))
            cond2 = bool(re.search(r"\d+\s+with\b", stripped, re.IGNORECASE))
            if cond1 or cond2:
                aps_region_indices.append(i)

    best_type_dist = 999
    best_type_result = None
    if aps_region_indices:
        groups: list[list[int]] = []
        current: list[int] = [aps_region_indices[0]]
        for idx in aps_region_indices[1:]:
            if idx <= current[-1] + 6:
                current.append(idx)
            else:
                groups.append(current)
                current = [idx]
        groups.append(current)
        groups.sort(key=lambda g: min(abs(i - code_idx) for i in g))

        for group in groups:
            group_dist = min(abs(i - code_idx) for i in group)
            if flat_candidates and (group_dist - best_flat_dist) > 8:
                break  # flat APS much closer — stop looking for type-specific
            g_start = max(start, min(group) - 2)
            g_end = min(end, max(group) + 6)
            joined = " ".join(
                lines[j].strip() for j in range(g_start, g_end) if lines[j].strip()
            )
            parsed = parse_aps_text(joined)
            if parsed.get("_not_accepted"):
                continue
            has_type = any(parsed[k] is not None for k in (
                "aps_mathematics", "aps_mathematical_literacy", "aps_technical_mathematics",
            ))
            if has_type:
                best_type_dist = group_dist
                best_type_result = parsed
                break

    # Choose: type-specific if closer (or equal) to flat, otherwise flat
    if best_type_result is not None:
        if best_flat_dist < best_type_dist - 5:
            # flat is meaningfully closer — use flat
            if flat_candidates:
                return (
                    {
                        "minimum_aps": flat_candidates[0][2],
                        "aps_mathematics": None,
                        "aps_mathematical_literacy": None,
                        "aps_technical_mathematics": None,
                    },
                    best_flat_dist,
                )
        return best_type_result, best_type_dist

    if flat_candidates:
        return (
            {
                "minimum_aps": flat_candidates[0][2],
                "aps_mathematics": None,
                "aps_mathematical_literacy": None,
                "aps_technical_mathematics": None,
            },
            best_flat_dist,
        )

    return None, 999


def extract_aps_for_code(lines: list[str], code_idx: int) -> dict | None:
    """
    Extract the APS pattern for a qualification code.

    Searches both AFTER and BEFORE the code and returns the match that is
    closest to the code. This handles cases where the APS appears either
    right after the code (most common) or in a column layout before the code.
    """
    next_code_line = get_next_code_line(lines, code_idx, window=50)
    prev_code_line = get_prev_code_line(lines, code_idx, window=50)

    after_start = code_idx + 1
    after_end = min(next_code_line, code_idx + 40)

    before_start = max(prev_code_line + 1, code_idx - 40)
    before_end = code_idx

    after_result, after_dist = _find_best_aps_in_segment(lines, after_start, after_end, code_idx)
    before_result, before_dist = _find_best_aps_in_segment(lines, before_start, before_end, code_idx)

    if after_result is None and before_result is None:
        return None
    if after_result is None:
        return before_result
    if before_result is None:
        return after_result
    # Both found — pick the closer one (with a 5-line tie-breaker to prefer after)
    return after_result if (after_dist <= before_dist + 5) else before_result




def extract_programme_name(lines: list[str], code_idx: int) -> str:
    """
    Extract the most likely programme name from lines near code_idx.
    We look for ALL-CAPS lines in a ±30 line window.
    Programme names typically appear just BEFORE or just AFTER the qual code.
    """
    window = 30
    lo = max(0, code_idx - window)
    hi = min(len(lines), code_idx + window + 1)

    candidates: list[tuple[int, int, str]] = []
    for i in range(lo, hi):
        t = lines[i].strip()
        if not looks_like_programme_name(t):
            continue
        dist = abs(i - code_idx)
        candidates.append((dist, i, t))

    if not candidates:
        return ""

    candidates.sort(key=lambda x: x[0])
    best_dist, best_i, best_name = candidates[0]

    # Try to merge multi-line names (adjacent candidates)
    parts = [best_name]
    for dist, i, name in candidates[1:4]:
        if dist > best_dist + 5:
            break
        if abs(i - best_i) <= 3 and name not in parts:
            parts.append(name)

    if len(parts) > 1:
        # Merge if they seem to form one name
        merged = " ".join(parts)
        # Simple heuristic: if merged is longer but reasonable
        if len(merged) <= 100:
            return merged

    return best_name


def main() -> None:
    if not TXT_FILE.exists():
        print(f"ERROR: {TXT_FILE} not found", file=sys.stderr)
        sys.exit(1)

    lines = TXT_FILE.read_text(encoding="utf-8").splitlines()
    print(f"Loaded {len(lines)} lines from {TXT_FILE.name}")

    # Pass 1: find all qual code first-occurrences (skip parenthetical references)
    seen_first: dict[str, int] = {}
    for i, line in enumerate(lines):
        stripped = line.strip()
        if QUAL_CODE_PARENS_RE.match(stripped):
            continue
        m = QUAL_CODE_RE.match(stripped)
        if m:
            code = m.group(1)
            if code not in seen_first:
                seen_first[code] = i

    print(f"Found {len(seen_first)} unique qualification codes")

    results: dict[str, dict] = {}
    ordered_codes = sorted(seen_first.items(), key=lambda x: x[1])

    for code, code_idx in ordered_codes:
        name_hint = extract_programme_name(lines, code_idx)
        aps_data = extract_aps_for_code(lines, code_idx)

        if aps_data is None:
            aps_data = {
                "minimum_aps": None,
                "aps_mathematics": None,
                "aps_mathematical_literacy": None,
                "aps_technical_mathematics": None,
            }

        # Apply manual overrides before saving
        if code in MANUAL_OVERRIDES:
            override = MANUAL_OVERRIDES[code]
            results[code] = {
                "programme_name_hint": name_hint,
                "minimum_aps": override.get("minimum_aps"),
                "aps_mathematics": override.get("aps_mathematics"),
                "aps_mathematical_literacy": override.get("aps_mathematical_literacy"),
                "aps_technical_mathematics": override.get("aps_technical_mathematics"),
            }
        else:
            results[code] = {
                "programme_name_hint": name_hint,
                "minimum_aps": aps_data.get("minimum_aps"),
                "aps_mathematics": aps_data.get("aps_mathematics"),
                "aps_mathematical_literacy": aps_data.get("aps_mathematical_literacy"),
                "aps_technical_mathematics": aps_data.get("aps_technical_mathematics"),
            }

    # Post-processing: propagate APS from adjacent codes to fill gaps.
    # When codes appear in clusters (sharing the same APS row), nearby codes
    # that didn't individually find an APS should inherit from the closest
    # neighbour that has one — but ONLY if they are very close (<= 20 lines apart)
    # and within the same section boundary.
    def has_aps(entry: dict) -> bool:
        return (
            entry["minimum_aps"] is not None
            or any(entry[k] is not None for k in (
                "aps_mathematics", "aps_mathematical_literacy", "aps_technical_mathematics"
            ))
        )

    codes_by_line = [(code, idx) for code, idx in ordered_codes]
    for pos, (code, code_idx) in enumerate(codes_by_line):
        if has_aps(results[code]):
            continue

        # Look at adjacent codes (prev and next) within 25 lines
        candidates = []
        if pos > 0:
            prev_code, prev_idx = codes_by_line[pos - 1]
            if abs(code_idx - prev_idx) <= 25 and has_aps(results[prev_code]):
                candidates.append((abs(code_idx - prev_idx), results[prev_code]))
        if pos < len(codes_by_line) - 1:
            next_code, next_idx = codes_by_line[pos + 1]
            if abs(code_idx - next_idx) <= 25 and has_aps(results[next_code]):
                candidates.append((abs(code_idx - next_idx), results[next_code]))

        if candidates:
            candidates.sort(key=lambda x: x[0])
            donor = candidates[0][1]
            results[code]["minimum_aps"] = donor["minimum_aps"]
            results[code]["aps_mathematics"] = donor["aps_mathematics"]
            results[code]["aps_mathematical_literacy"] = donor["aps_mathematical_literacy"]
            results[code]["aps_technical_mathematics"] = donor["aps_technical_mathematics"]
            results[code]["_propagated_from"] = True

    # Write output
    OUTPUT_FILE.write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(results)} entries to {OUTPUT_FILE}")

    # Summary
    flat_count = sum(
        1 for v in results.values()
        if v["minimum_aps"] is not None
        and all(v[k] is None for k in ("aps_mathematics", "aps_mathematical_literacy", "aps_technical_mathematics"))
    )
    typed_count = sum(
        1 for v in results.values()
        if any(v[k] is not None for k in ("aps_mathematics", "aps_mathematical_literacy", "aps_technical_mathematics"))
    )
    no_aps = sum(
        1 for v in results.values()
        if v["minimum_aps"] is None
        and all(v[k] is None for k in ("aps_mathematics", "aps_mathematical_literacy", "aps_technical_mathematics"))
    )
    print(f"\nSummary:")
    print(f"  Flat APS only:      {flat_count}")
    print(f"  Type-specific APS:  {typed_count}")
    print(f"  No APS found:       {no_aps}")

    # Print all extracted entries for review
    print("\nExtracted entries:")
    for code, data in sorted(results.items(), key=lambda x: seen_first[x[0]]):
        aps_str = ""
        if data["minimum_aps"] is not None:
            aps_str = f"flat={data['minimum_aps']}"
        type_parts = []
        if data["aps_mathematics"] is not None:
            type_parts.append(f"math={data['aps_mathematics']}")
        if data["aps_mathematical_literacy"] is not None:
            type_parts.append(f"mathlit={data['aps_mathematical_literacy']}")
        if data["aps_technical_mathematics"] is not None:
            type_parts.append(f"techmath={data['aps_technical_mathematics']}")
        if type_parts:
            aps_str = ", ".join(type_parts)
        print(f"  {code:12s} | {data['programme_name_hint'][:40]:40s} | {aps_str}")


if __name__ == "__main__":
    main()
