#!/usr/bin/env python3
"""
Parse university CSVs and update data/programme_catalogue.json.

Each university has a dedicated parser function that reads its CSV and returns
a list of programme dicts with subject_minimums (including English requirements).

Run:
  python3 tools/parse_csv_catalogue.py
  python3 tools/apply_uj_aps.py
  python3 tools/promote_rules.py
  npm run build:web
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PROSPECTUS_DIR = ROOT / "sources" / "prospectuses"
CATALOGUE_FILE = DATA_DIR / "programme_catalogue.json"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_TRAILING_JUNK = re.compile(r"[\s✪*✦†‡#@]+$")
_WHITESPACE = re.compile(r"\s+")


def clean_name(text: str) -> str:
    """Normalize whitespace and strip trailing non-alphanumeric decoration."""
    text = _WHITESPACE.sub(" ", text).strip()
    text = _TRAILING_JUNK.sub("", text).strip()
    return text


def is_extended(name: str) -> bool:
    low = name.lower()
    return "extended" in low or "4-year" in low or "(ecp)" in low


def to_int(raw: str) -> Optional[int]:
    raw = raw.strip()
    if raw.isdigit():
        return int(raw)
    return None


def _pct_to_nsc(pct: int) -> int:
    """Convert percentage to NSC level (1-7)."""
    if pct >= 80: return 7
    if pct >= 70: return 6
    if pct >= 60: return 5
    if pct >= 50: return 4
    if pct >= 40: return 3
    if pct >= 30: return 2
    return 1


def _extract_level_from_text(text: str) -> Optional[int]:
    """
    Extract a single NSC level (1-7) from free-text like:
      'Level 4 (50-59%)', 'L4 (50%)', '50%', '4', 'Level 4', 'NSC Level 4'
    Returns None for 'Not specified', 'Not required', etc.
    """
    if not text or not text.strip():
        return None
    t = text.strip()
    low = t.lower()
    if any(x in low for x in ("not specified", "not required", "not applicable",
                               "n/a", "see ", "postgraduate")):
        return None
    # "Adequate achievement" with no percentage is too vague
    if re.fullmatch(r'adequate\s+achievement', low):
        return None

    # 'Level N' or 'L N' (NSC levels 1-7)
    m = re.search(r'\blevel\s+([1-7])\b', low)
    if m:
        return int(m.group(1))

    # 'LN' shorthand: e.g. 'L4', 'L5'
    m = re.search(r'\bl([1-7])\b', low)
    if m:
        return int(m.group(1))

    # Bare percentage: e.g. '50%', '60%'
    m = re.search(r'\b(\d{2,3})%', t)
    if m:
        return _pct_to_nsc(int(m.group(1)))

    # Bare single digit 1-7 at end: e.g. '4'
    m = re.fullmatch(r'([1-7])', t.strip())
    if m:
        return int(m.group(1))

    return None


# ---------------------------------------------------------------------------
# Canonical subject names
# ---------------------------------------------------------------------------

_COMMON_SUBJECT_ALIASES: dict[str, str] = {
    "mathematics":            "Mathematics",
    "mathematical literacy":  "Mathematical Literacy",
    "maths literacy":         "Mathematical Literacy",
    "maths lit":              "Mathematical Literacy",
    "math literacy":          "Mathematical Literacy",
    "math lit":               "Mathematical Literacy",
    "technical mathematics":  "Technical Mathematics",
    "tech maths":             "Technical Mathematics",
    "tech math":              "Technical Mathematics",
    "physical sciences":      "Physical Sciences",
    "physical science":       "Physical Sciences",
    "life sciences":          "Life Sciences",
    "life science":           "Life Sciences",
    "accounting":             "Accounting",
    "economics":              "Economics",
    "information technology": "Information Technology",
    "geography":              "Geography",
    "history":                "History",
    "life orientation":       "Life Orientation",
    "business studies":       "Business Studies",
    "agricultural sciences":  "Agricultural Sciences",
    "agricultural science":   "Agricultural Sciences",
    "agriculture":            "Agricultural Sciences",
}

_MATH_TYPES = {"Mathematics", "Mathematical Literacy", "Technical Mathematics"}

# English canonical names for HL/FAL
ENG_HL  = "English Home Language"
ENG_FAL = "English First Additional Language"

# Default English levels used as fallback when source CSV omits English.
# English HL Level 4 (50%) OR English FAL Level 5 (60%) is the standard
# minimum across virtually all South African universities.
_DEFAULT_ENG_HL  = 4
_DEFAULT_ENG_FAL = 5


def _ensure_english(
    minimums: list[dict],
    seen: set[tuple],
    or_group_id: list[int],
    hl_lvl: int = _DEFAULT_ENG_HL,
    fal_lvl: int = _DEFAULT_ENG_FAL,
) -> None:
    """If no English requirement exists yet, add HL/FAL as an OR group."""
    has_english = any(
        e.get("subject") in (ENG_HL, ENG_FAL) for e in minimums
    )
    if not has_english:
        _build_or_group([(ENG_HL, hl_lvl), (ENG_FAL, fal_lvl)], minimums, seen, or_group_id)


def _resolve_common_subject(text: str) -> Optional[str]:
    """Return canonical subject name; return None if unrecognised or English."""
    t = text.strip().lower()
    if "english" in t:
        return None   # English handled separately
    for alias, canonical in _COMMON_SUBJECT_ALIASES.items():
        if t == alias or t.startswith(alias):
            return canonical
    return None


def _build_or_group(
    items: list[tuple[str, int]],
    minimums: list[dict],
    seen: set[tuple],
    or_group_id: list[int],
) -> None:
    """Add items as a single OR group (or standalone if only one item)."""
    valid = [(s, l) for s, l in items if s and l is not None and (s, l) not in seen]
    if not valid:
        return
    if len(valid) == 1:
        subj, lvl = valid[0]
        seen.add((subj, lvl))
        minimums.append({"subject": subj, "minimum_mark": lvl})
    else:
        or_group_id[0] += 1
        grp = or_group_id[0]
        for subj, lvl in valid:
            seen.add((subj, lvl))
            minimums.append({"subject": subj, "minimum_mark": lvl, "or_group": grp})


# ---------------------------------------------------------------------------
# English requirement parser
# ---------------------------------------------------------------------------

def _parse_english_requirement(raw: str, or_group_id: list[int],
                                 minimums: list[dict], seen: set[tuple]) -> None:
    """
    Parse an English requirement field and append to minimums.

    Handles formats like:
      'English Home Language OR English First Additional Language OR English 5'
      'English HL or FAL Level 4'
      'HL 50% or FAL 60%'
      'English HL: NSC Level 4 OR English FAL: NSC Level 5'
      'Level 4 (50-59%)'   (bare level — applies to English generally)
      'English HL / FAL L4 (50-59%)'
      '50% (adequate achievement)'
    """
    if not raw or not raw.strip():
        return
    t = raw.strip()
    low = t.lower()

    # Skip non-requirements (but NOT "50% (adequate achievement)" which has a pct)
    if any(x in low for x in ("not specified", "not required", "n/a",
                               "not applicable", "see ", "postgraduate")):
        return
    # "Adequate achievement" alone (no %) is too vague — skip
    if re.fullmatch(r'adequate\s+achievement', low):
        return

    # ---- Detect different HL/FAL patterns ----

    # Pattern: 'HL 50% or FAL 60%' → HL=L4, FAL=L5
    m = re.match(r'hl\s+(\d+)%.*?fal\s+(\d+)%', low)
    if m:
        hl_lvl  = _pct_to_nsc(int(m.group(1)))
        fal_lvl = _pct_to_nsc(int(m.group(2)))
        _build_or_group([(ENG_HL, hl_lvl), (ENG_FAL, fal_lvl)], minimums, seen, or_group_id)
        return

    # Pattern: '65% (HL or FAL)' → single percentage, both at same level
    m = re.match(r'(\d+)%\s*\(hl\s+or\s+fal\)', low)
    if m:
        lvl = _pct_to_nsc(int(m.group(1)))
        _build_or_group([(ENG_HL, lvl), (ENG_FAL, lvl)], minimums, seen, or_group_id)
        return

    # Pattern: 'English HL: NSC Level N OR English FAL: NSC Level M'
    m = re.search(r'english\s+hl[^a-z]*level\s+([1-7]).*?english\s+fal[^a-z]*level\s+([1-7])', low)
    if m:
        _build_or_group([(ENG_HL, int(m.group(1))), (ENG_FAL, int(m.group(2)))],
                        minimums, seen, or_group_id)
        return

    # Pattern: 'English HL or FAL Level N' or 'English HL / FAL L4'
    m = re.search(r'english\s+(?:hl|home\s+language)[^a-z]*(?:or\s+)?(?:fal|first\s+additional)[^a-z]*(?:level\s+)?([1-7])', low)
    if not m:
        m = re.search(r'english.*?(?:hl|home\s+language).*?(?:fal|first\s+additional).*?([1-7])', low)
    if m:
        lvl = int(m.group(1))
        _build_or_group([(ENG_HL, lvl), (ENG_FAL, lvl)], minimums, seen, or_group_id)
        return

    # Pattern: 'English or Afrikaans (HL or FAL) 50%' → English at that level
    m = re.search(r'english.*?(\d+)%', low)
    if m:
        lvl = _pct_to_nsc(int(m.group(1)))
        _build_or_group([(ENG_HL, lvl), (ENG_FAL, lvl)], minimums, seen, or_group_id)
        return

    # Pattern: bare level (e.g. 'Level 4 (50-59%)') → both HL and FAL at that level
    lvl = _extract_level_from_text(t)
    if lvl is not None:
        _build_or_group([(ENG_HL, lvl), (ENG_FAL, lvl)], minimums, seen, or_group_id)
        return


# ---------------------------------------------------------------------------
# Mathematics requirement parser (shared)
# ---------------------------------------------------------------------------

def _parse_math_requirement(raw: str, mathlit_accepted_raw: str,
                              or_group_id: list[int],
                              minimums: list[dict], seen: set[tuple]) -> None:
    """
    Parse a mathematics requirement field.

    Handles formats like:
      'Level 4 (50%)'            → Mathematics at Level 4
      'Level 4 (50%) OR Math Literacy Level 5'
      '40% or Math Lit 60%'
      'Mathematics L5 (65%) minimum'
      'Not required' / 'Not specified'
    Also consults mathlit_accepted_raw to decide if MathLit is an OR alternative.
    """
    if not raw or not raw.strip():
        return
    t = raw.strip()
    low = t.lower()

    if any(x in low for x in ("not specified", "not required", "n/a", "see ")):
        return

    # Remove qualifier phrases to simplify parsing
    cleaned = re.sub(r'(?:mathematics?\s+)?nsc\s+', '', t, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*(minimum|compulsory|only|pure maths? only)\s*', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip()
    low_c = cleaned.lower()

    # Detect if 'OR Mathematical Literacy / Math Lit' is explicitly mentioned in raw
    or_mathlit = re.search(
        r'or\s+(?:mathematical\s+literacy|maths?\s+lit(?:eracy)?)',
        low_c, re.IGNORECASE
    )

    if or_mathlit:
        # Parse the two alternatives
        # e.g. 'Mathematics Level 4 OR Mathematical Literacy Level 5'
        # e.g. '40% or Math Lit 60%'
        parts = re.split(r'\s+or\s+', low_c, maxsplit=1, flags=re.IGNORECASE)
        if len(parts) == 2:
            m_lvl = _extract_level_from_text(parts[0])
            ml_lvl = _extract_level_from_text(parts[1])
            if m_lvl and ml_lvl:
                _build_or_group([("Mathematics", m_lvl), ("Mathematical Literacy", ml_lvl)],
                                minimums, seen, or_group_id)
                return
            # Fallback: extract numbers from the original
            nums = re.findall(r'(\d+)%?', low_c)
            if len(nums) >= 2:
                m_lvl2 = _pct_to_nsc(int(nums[0])) if int(nums[0]) > 7 else int(nums[0])
                ml_lvl2 = _pct_to_nsc(int(nums[1])) if int(nums[1]) > 7 else int(nums[1])
                if 1 <= m_lvl2 <= 7 and 1 <= ml_lvl2 <= 7:
                    _build_or_group([("Mathematics", m_lvl2), ("Mathematical Literacy", ml_lvl2)],
                                    minimums, seen, or_group_id)
                    return

    # Single level
    lvl = _extract_level_from_text(cleaned)
    if lvl is None:
        # Try extracting from percentage
        m = re.search(r'(\d+)%', cleaned)
        if m:
            lvl = _pct_to_nsc(int(m.group(1)))

    if lvl is None:
        return

    # Check mathlit_accepted to decide if we add MathLit as OR
    mathlit_acc = mathlit_accepted_raw.strip().lower() if mathlit_accepted_raw else ""
    mathlit_accepted = (
        mathlit_acc.startswith("yes") or
        "mathlit" in mathlit_acc.replace(" ", "") or
        "math lit" in mathlit_acc
    )
    mathlit_not_accepted = (
        mathlit_acc.startswith("no") or
        "not accepted" in mathlit_acc or
        "only" in mathlit_acc
    )

    if mathlit_accepted and not mathlit_not_accepted:
        # Extract MathLit level from mathlit_accepted_raw if present
        ml_lvl = _extract_level_from_text(mathlit_accepted_raw)
        if ml_lvl is None:
            ml_lvl = lvl  # Same level as maths if not specified
        _build_or_group([("Mathematics", lvl), ("Mathematical Literacy", ml_lvl)],
                        minimums, seen, or_group_id)
    else:
        key = ("Mathematics", lvl)
        if key not in seen:
            seen.add(key)
            minimums.append({"subject": "Mathematics", "minimum_mark": lvl})


def _parse_science_requirement(raw: str, subject_name: str,
                                 or_group_id: list[int],
                                 minimums: list[dict], seen: set[tuple]) -> None:
    """
    Parse a Physical Sciences or Life Sciences requirement column.

    subject_name: 'Physical Sciences' or 'Life Sciences'
    Handles:
      'Level 4 (50-59%)' → subject at L4
      'Level 4 (50-59%) OR Life Sciences Level 4' → OR group
      'Not required'
    """
    if not raw or not raw.strip():
        return
    t = raw.strip()
    low = t.lower()

    if any(x in low for x in ("not specified", "not required", "n/a", "none", "not applicable")):
        return

    # OR with another science
    or_match = re.search(r'\bor\b', low)
    if or_match:
        # Try 'Physical Sciences Level N OR Life Sciences Level M' style
        parts = re.split(r'\s+or\s+', t, maxsplit=1, flags=re.IGNORECASE)
        items: list[tuple[str, int]] = []
        for i_part, part in enumerate(parts):
            part = part.strip()
            # Is this a different named subject?
            known = None
            for alias, canonical in _COMMON_SUBJECT_ALIASES.items():
                if alias in part.lower():
                    known = canonical
                    break
            if known is None:
                # First part defaults to subject_name; unrecognised secondary parts are skipped
                # to avoid duplicates (e.g. "Engineering Sciences" → skip, not repeat PhysSci)
                if i_part == 0:
                    known = subject_name
                else:
                    continue
            lvl = _extract_level_from_text(part)
            if lvl and known:
                items.append((known, lvl))
        if items:
            if len(items) == 1:
                s, l = items[0]
                if (s, l) not in seen:
                    seen.add((s, l))
                    minimums.append({"subject": s, "minimum_mark": l})
            else:
                _build_or_group(items, minimums, seen, or_group_id)
        return

    lvl = _extract_level_from_text(t)
    if lvl:
        key = (subject_name, lvl)
        if key not in seen:
            seen.add(key)
            minimums.append({"subject": subject_name, "minimum_mark": lvl})


def _parse_additional_subjects(raw: str, or_group_id: list[int],
                                  minimums: list[dict], seen: set[tuple]) -> None:
    """
    Parse Additional_Subject_Requirements column.

    Examples:
      'History OR Geography at Level 4 (50%)'
      'Life Sciences Level 4'
      'Accounting Level 4 OR Economics Level 4'
    """
    if not raw or not raw.strip():
        return
    t = raw.strip()
    low = t.lower()

    if any(x in low for x in ("not specified", "not required", "n/a", "none", "any two",
                               "additional subjects", "best average", "bachelor endorsement",
                               "diploma pass", "selection", "compulsory", "recommended")):
        return

    # Split on AND first
    for clause in re.split(r'\s+and\s+', t, flags=re.IGNORECASE):
        clause = clause.strip()
        if not clause:
            continue

        # Split on OR
        or_parts = re.split(r'\s+or\s+', clause, flags=re.IGNORECASE)
        items: list[tuple[str, int]] = []
        for part in or_parts:
            part = part.strip()
            # Try to extract subject + level
            canon = None
            lvl = None
            for alias, canonical in _COMMON_SUBJECT_ALIASES.items():
                if alias in part.lower():
                    canon = canonical
                    break
            if canon:
                lvl = _extract_level_from_text(part)
                # If no level in this part, look at whole clause
                if lvl is None:
                    lvl = _extract_level_from_text(clause)
                if lvl:
                    items.append((canon, lvl))

        if not items:
            continue
        if len(items) == 1:
            s, l = items[0]
            if (s, l) not in seen:
                seen.add((s, l))
                minimums.append({"subject": s, "minimum_mark": l})
        else:
            _build_or_group(items, minimums, seen, or_group_id)


# ---------------------------------------------------------------------------
# Generic "structured column" parser for universities with separate columns per subject
# Covers: UFH, WSU, UKZN, UFS, UMP, UniZulu, SPU, TUT, DUT, CUT, VUT, MUT, SMU,
#         NMU, Rhodes, UNIVEN, NWU
# ---------------------------------------------------------------------------

def _parse_structured_columns(
    row: dict,
    eng_col: str,
    math_col: str,
    mathlit_col: str,
    phys_col: str,
    life_col: str,
    addl_col: str,
) -> list[dict]:
    """
    Build subject_minimums from individual subject columns.

    eng_col:     column name for English requirement
    math_col:    column name for Maths requirement
    mathlit_col: column name indicating if MathLit accepted (and at what level)
    phys_col:    column name for Physical Sciences
    life_col:    column name for Life Sciences
    addl_col:    column name for additional subject requirements
    """
    minimums: list[dict] = []
    seen: set[tuple] = set()
    or_group_id = [0]

    eng_raw  = row.get(eng_col, "").strip()
    math_raw = row.get(math_col, "").strip()
    ml_raw   = row.get(mathlit_col, "").strip()
    phys_raw = row.get(phys_col, "").strip()
    life_raw = row.get(life_col, "").strip()
    addl_raw = row.get(addl_col, "").strip()

    _parse_english_requirement(eng_raw, or_group_id, minimums, seen)
    _parse_math_requirement(math_raw, ml_raw, or_group_id, minimums, seen)
    _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums, seen)
    _parse_science_requirement(life_raw, "Life Sciences", or_group_id, minimums, seen)
    _parse_additional_subjects(addl_raw, or_group_id, minimums, seen)

    return minimums


# ---------------------------------------------------------------------------
# UJ parser helpers
# ---------------------------------------------------------------------------

_UJ_ADDL_SUBJECT_MAP: dict[str, str] = {
    "physical_sciences_level": "Physical Sciences",
    "physical_science_level":  "Physical Sciences",
    "life_sciences_level":     "Life Sciences",
    "life_science_level":      "Life Sciences",
    "geography_level":         "Geography",
}

_UJ_MATH_ALIASES: dict[str, str] = {
    "math":                  "Mathematics",
    "maths":                 "Mathematics",
    "mathematics":           "Mathematics",
    "math lit":              "Mathematical Literacy",
    "maths lit":             "Mathematical Literacy",
    "math literacy":         "Mathematical Literacy",
    "mathematical literacy": "Mathematical Literacy",
    "tech math":             "Technical Mathematics",
    "tech maths":            "Technical Mathematics",
    "technical mathematics": "Technical Mathematics",
}


def _uj_math_alias(text: str) -> Optional[str]:
    return _UJ_MATH_ALIASES.get(text.strip().lower())


def _parse_uj_addl_flags(additional: str) -> tuple[bool, bool, Optional[int], list[tuple[str, int]]]:
    mathlit_not_accepted = False
    techmath_not_accepted = False
    mathlit_level: Optional[int] = None
    extra_subjects: list[tuple[str, int]] = []

    for flag in additional.split("|"):
        flag = flag.strip()
        if not flag or ":" not in flag:
            continue
        raw_key, _, val = flag.partition(":")
        key = raw_key.strip().lower().replace(" ", "_")
        val = val.strip()

        if key == "math_lit_level":
            if "not" in val.lower():
                mathlit_not_accepted = True
            else:
                ml = to_int(val)
                if ml is not None:
                    mathlit_level = ml

        elif key == "tech_math_level":
            if "not" in val.lower():
                techmath_not_accepted = True

        elif key in _UJ_ADDL_SUBJECT_MAP:
            lvl = to_int(val)
            if lvl is not None:
                extra_subjects.append((_UJ_ADDL_SUBJECT_MAP[key], lvl))

    return mathlit_not_accepted, techmath_not_accepted, mathlit_level, extra_subjects


def _parse_uj_math_requirements(
    math_level_raw: str,
    mathlit_not_accepted: bool,
    mathlit_level: Optional[int],
    aps_mathlit: Optional[int],
    subject_minimums: list[dict],
    seen: set[tuple],
    or_group_id: list[int],
) -> None:
    raw = math_level_raw.strip()
    if not raw:
        return

    if ":" in raw:
        items: list[tuple[str, int]] = []
        for segment in re.split(r"\s+OR\s+", raw, flags=re.IGNORECASE):
            m = re.match(r"^(.+?)\s*:\s*(\d+)\s*$", segment.strip())
            if not m:
                continue
            lvl = int(m.group(2))
            for part in m.group(1).split("/"):
                canon = _uj_math_alias(part)
                if canon:
                    items.append((canon, lvl))
        if items:
            _build_or_group(items, subject_minimums, seen, or_group_id)
        return

    math_level = to_int(raw)
    if math_level is None:
        return

    if mathlit_not_accepted:
        key = ("Mathematics", math_level)
        if key not in seen:
            seen.add(key)
            subject_minimums.append({"subject": "Mathematics", "minimum_mark": math_level})
        return

    eff_mathlit: Optional[int] = mathlit_level
    if eff_mathlit is None and aps_mathlit is not None:
        eff_mathlit = math_level

    if eff_mathlit is not None:
        _build_or_group(
            [("Mathematics", math_level), ("Mathematical Literacy", eff_mathlit)],
            subject_minimums, seen, or_group_id,
        )
    else:
        key = ("Mathematics", math_level)
        if key not in seen:
            seen.add(key)
            subject_minimums.append({"subject": "Mathematics", "minimum_mark": math_level})


def _parse_uj_education_addl(
    additional: str,
    subject_minimums: list[dict],
    seen: set[tuple],
    or_group_id: list[int],
) -> None:
    raw = re.sub(r"[()]", "", additional).strip()
    if not raw:
        return
    low = raw.lower()
    if "_level" in low or "not applicable" in low or "not accepted" in low:
        return

    for clause in re.split(r"\s+AND\s+", raw, flags=re.IGNORECASE):
        clause = clause.strip()
        if not clause:
            continue
        or_parts = [p.strip() for p in re.split(r"\s+OR\s+", clause, flags=re.IGNORECASE)]
        items: list[tuple[str, int]] = []
        for part in or_parts:
            m = re.match(r"^(.+?)\s*:\s*(\d+)\s*$", part)
            if not m:
                continue
            canon = _resolve_common_subject(m.group(1))
            lvl = int(m.group(2))
            if canon:
                items.append((canon, lvl))
        if not items:
            continue
        if len(items) == 1:
            subj, lvl = items[0]
            if (subj, lvl) not in seen:
                seen.add((subj, lvl))
                subject_minimums.append({"subject": subj, "minimum_mark": lvl})
        else:
            _build_or_group(items, subject_minimums, seen, or_group_id)


# ---------------------------------------------------------------------------
# UJ parser
# ---------------------------------------------------------------------------

def parse_uj(csv_path: Path) -> list[dict]:
    """
    Parse uj_2026_programmes_pages_selected_FINAL_Phone.csv.
    NOTE: UJ programmes come from data/programme_catalogue.json (written by apply_uj_aps.py).
    This parser is kept for backward compatibility but UJ is handled separately.
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme", ""))
            if not programme:
                continue

            faculty = row.get("Faculty", "").strip()
            additional = row.get("Additional_Requirements", "").strip()
            math_level_raw = row.get("Math_Level", "").strip()

            flat_aps = to_int(row.get("Minimum APS", ""))
            aps_math = to_int(row.get("APS_Mathematics", ""))
            aps_mathlit = to_int(row.get("APS_Math_Literacy", ""))
            aps_techmath = to_int(row.get("APS _Tech_Maths", ""))

            if flat_aps is not None:
                minimum_aps = flat_aps
            else:
                candidates = [v for v in (aps_math, aps_mathlit, aps_techmath) if v is not None]
                if not candidates:
                    continue
                minimum_aps = min(candidates)

            mathlit_na, techmath_na, mathlit_lvl, extra_subjects = _parse_uj_addl_flags(additional)

            subject_minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            _parse_uj_math_requirements(
                math_level_raw,
                mathlit_na, mathlit_lvl, aps_mathlit,
                subject_minimums, seen, or_group_id,
            )

            for subj, lvl in extra_subjects:
                if (subj, lvl) not in seen:
                    seen.add((subj, lvl))
                    subject_minimums.append({"subject": subj, "minimum_mark": lvl})

            if faculty == "Education" and additional:
                _parse_uj_education_addl(additional, subject_minimums, seen, or_group_id)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": subject_minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# UL parser
# ---------------------------------------------------------------------------

_UL_OR_SEP = re.compile(r"\s+or\s+", re.IGNORECASE)
_UL_LANG_PREFIXES = (
    "english", "first language", "another language", "additional language",
    "language (", "two (2)",
)


def _ul_extract_levels(level_text: str) -> list[int]:
    clean = re.sub(r"\([^)]*\)", "", level_text)
    return [int(m.group()) for m in re.finditer(r"(?<!\d)([1-7])(?!\d)", clean)]


def _parse_ul_subject_requirements(raw: str) -> list[dict]:
    """
    Parse UL's pipe-separated Subject Requirements field.
    Now also captures English requirements.
    """
    minimums: list[dict] = []
    seen: set[tuple] = set()
    or_group_id = [0]

    for segment in raw.split("|"):
        segment = segment.strip().strip('"')
        if not segment:
            continue
        low = segment.lower()
        if low.startswith("additional"):
            continue
        if ":" not in segment:
            continue

        colon_pos = segment.index(":")
        subj_text = segment[:colon_pos].strip().replace("*", "")
        level_text = segment[colon_pos + 1:].strip()

        levels = _ul_extract_levels(level_text)
        if not levels:
            continue

        subj_lower = subj_text.lower().strip()

        # Handle English segments
        if "english" in subj_lower:
            lvl = min(levels)
            _build_or_group([(ENG_HL, lvl), (ENG_FAL, lvl)], minimums, seen, or_group_id)
            continue

        # Skip other language prefixes
        if any(subj_lower.startswith(pfx) for pfx in _UL_LANG_PREFIXES):
            continue

        # Split subject on OR
        subj_parts = [s.strip().lstrip("*").strip()
                      for s in _UL_OR_SEP.split(subj_text)]
        canonicals = [c for s in subj_parts if (c := _resolve_common_subject(s))]

        if not canonicals:
            continue

        if len(canonicals) == 1:
            lvl = min(levels)
            key = (canonicals[0], lvl)
            if key not in seen:
                seen.add(key)
                minimums.append({"subject": canonicals[0], "minimum_mark": lvl})
        else:
            items = [
                (canon, levels[i] if i < len(levels) else levels[-1])
                for i, canon in enumerate(canonicals)
            ]
            _build_or_group(items, minimums, seen, or_group_id)

    return minimums


def parse_ul(csv_path: Path) -> list[dict]:
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme Name", ""))
            if not programme:
                continue

            faculty = row.get("Faculty", "").strip()
            aps_raw = row.get("APS Requirement", "").strip()
            subject_req = row.get("Subject Requirements", "").strip()

            aps_values: list[int] = []
            for part in aps_raw.split("/"):
                v = to_int(part)
                if v is not None:
                    aps_values.append(v)

            if not aps_values:
                continue

            subject_minimums = _parse_ul_subject_requirements(subject_req)
            seen_ul: set[tuple] = {(e["subject"], e["minimum_mark"]) for e in subject_minimums}
            or_grp_ul = [max((e.get("or_group", 0) or 0) for e in subject_minimums) if subject_minimums else 0]
            _ensure_english(subject_minimums, seen_ul, or_grp_ul)
            already_extended = is_extended(programme)

            if len(aps_values) == 1:
                entries.append({
                    "name": programme,
                    "faculty": faculty,
                    "minimum_aps": aps_values[0],
                    "competitive_flag": False,
                    "mainstream_or_extended": "extended" if already_extended else "mainstream",
                    "subject_minimums": subject_minimums,
                })
            elif already_extended:
                entries.append({
                    "name": programme,
                    "faculty": faculty,
                    "minimum_aps": min(aps_values),
                    "competitive_flag": False,
                    "mainstream_or_extended": "extended",
                    "subject_minimums": subject_minimums,
                })
            else:
                aps_ext, aps_main = sorted(aps_values)[:2]
                entries.append({
                    "name": f"{programme} (Extended)",
                    "faculty": faculty,
                    "minimum_aps": aps_ext,
                    "competitive_flag": False,
                    "mainstream_or_extended": "extended",
                    "subject_minimums": subject_minimums,
                })
                entries.append({
                    "name": programme,
                    "faculty": faculty,
                    "minimum_aps": aps_main,
                    "competitive_flag": False,
                    "mainstream_or_extended": "mainstream",
                    "subject_minimums": subject_minimums,
                })

    return entries


# ---------------------------------------------------------------------------
# UWC parser
# ---------------------------------------------------------------------------

_UWC_APS = re.compile(r"(\d+)")
_CODE_LEVEL = re.compile(r"\b[Cc]ode\s+(\d)")
_AND = re.compile(r"\s+AND\s+", re.IGNORECASE)
_OR = re.compile(r"\s+OR\s+", re.IGNORECASE)

_UWC_SUBJECT_ALIASES: dict[str, str] = {
    "maths literacy": "Mathematical Literacy",
    "maths lit":      "Mathematical Literacy",
    "maths":          "Mathematics",
    "math literacy":  "Mathematical Literacy",
    "mathematics":    "Mathematics",
    "mathematical literacy": "Mathematical Literacy",
    "physical sciences": "Physical Sciences",
    "physical science":  "Physical Sciences",
    "life sciences":  "Life Sciences",
    "life science":   "Life Sciences",
    "accounting":     "Accounting",
    "economics":      "Economics",
    "information technology": "Information Technology",
    "geography":      "Geography",
    "history":        "History",
    "life orientation": "Life Orientation",
    "business studies": "Business Studies",
}


def _uwc_resolve_subject(text: str) -> Optional[str]:
    t = text.strip().lower()
    # Handle English explicitly
    if "english" in t:
        if "home" in t or "hl" in t:
            return ENG_HL
        return ENG_FAL  # default to FAL for general 'english'
    if t.startswith("another lang") or t.startswith("another subject"):
        return None
    for alias, canonical in _UWC_SUBJECT_ALIASES.items():
        if t == alias or t.startswith(alias):
            return canonical
    return None


def _extract_code(text: str) -> Optional[int]:
    m = _CODE_LEVEL.search(text)
    return int(m.group(1)) if m else None


def _subject_text(segment: str) -> str:
    s = re.sub(r"\b[Cc]ode\s+\d.*", "", segment)
    s = re.sub(r"\(.*?\)", "", s)
    return s.strip()


def _parse_uwc_subjects(raw: str) -> list[dict]:
    if not raw.strip():
        return []

    minimums: list[dict] = []
    seen: set[tuple] = set()
    or_group_id = 0

    def add(subj: str, level: int, grp: Optional[int] = None) -> None:
        key = (subj, level, grp)
        if key in seen:
            return
        seen.add(key)
        entry: dict = {"subject": subj, "minimum_mark": level}
        if grp is not None:
            entry["or_group"] = grp
        minimums.append(entry)

    for clause in raw.split(";"):
        clause = clause.strip()
        if not clause:
            continue

        for piece in _AND.split(clause):
            piece = piece.strip()
            if not piece:
                continue

            if _OR.search(piece):
                or_alts = [a.strip() for a in _OR.split(piece)]
                parsed: list[tuple[Optional[str], Optional[int]]] = []
                last_level: Optional[int] = None

                # Handle English HL/FAL OR pattern: 'English (home lang) Code 4 OR English (first additional) Code 5'
                eng_alts = [a for a in or_alts if "english" in a.lower()]
                if len(eng_alts) >= 2:
                    # English HL OR English FAL
                    codes = [_extract_code(a) for a in eng_alts]
                    items: list[tuple[str, int]] = []
                    hl_lvl = None
                    fal_lvl = None
                    for alt in eng_alts:
                        lvl = _extract_code(alt)
                        if "home" in alt.lower() or " hl" in alt.lower():
                            hl_lvl = lvl
                        else:
                            fal_lvl = lvl or lvl
                    # assign
                    for alt in eng_alts:
                        lvl = _extract_code(alt)
                        t = alt.lower()
                        if "home" in t or " hl" in t:
                            if lvl:
                                items.append((ENG_HL, lvl))
                        else:
                            if lvl:
                                items.append((ENG_FAL, lvl))
                    if items:
                        or_group_id += 1
                        for subj, level in items:
                            add(subj, level, or_group_id)
                    # Remove English alts and continue with non-english alts
                    or_alts = [a for a in or_alts if "english" not in a.lower()]
                    if not or_alts:
                        continue

                for alt in reversed(or_alts):
                    lvl = _extract_code(alt)
                    if lvl is not None:
                        last_level = lvl
                    canon = _uwc_resolve_subject(_subject_text(alt))
                    if canon and "English" in canon:
                        canon = None  # already handled above
                    parsed.append((canon, lvl))
                parsed.reverse()

                items2: list[tuple[str, int]] = []
                for canon, lvl in parsed:
                    effective = lvl if lvl is not None else last_level
                    if canon and effective is not None:
                        items2.append((canon, effective))

                if not items2:
                    continue
                if len(items2) == 1:
                    add(*items2[0])
                else:
                    or_group_id += 1
                    for subj, level in items2:
                        add(subj, level, or_group_id)
            else:
                canon = _uwc_resolve_subject(_subject_text(piece))
                if not canon:
                    continue
                # English standalone: e.g. 'English (home lang) Code 4'
                if canon in (ENG_HL, ENG_FAL):
                    lvl = _extract_code(piece)
                    if lvl:
                        add(canon, lvl)
                    continue
                lvl = _extract_code(piece)
                if lvl is None:
                    for sibling in _AND.split(clause):
                        lvl = _extract_code(sibling)
                        if lvl is not None:
                            break
                if lvl is not None:
                    add(canon, lvl)

    return minimums


def parse_uwc(csv_path: Path) -> list[dict]:
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme Name", ""))
            if not programme:
                continue

            aps_raw = row.get("APS Requirement", "").strip()
            m = _UWC_APS.search(aps_raw)
            if not m:
                continue
            minimum_aps = int(m.group(1))

            faculty_raw = row.get("Faculty", "").strip()
            faculty = re.sub(r"^Faculty of\s+", "", faculty_raw, flags=re.IGNORECASE).strip()

            required_raw = row.get("Required Subjects", "").strip()
            subject_minimums = _parse_uwc_subjects(required_raw)

            # UWC CSV omits English for most rows — add default if missing
            seen_uwc: set[tuple] = {(e["subject"], e["minimum_mark"]) for e in subject_minimums}
            or_grp_uwc = [max((e.get("or_group", 0) or 0) for e in subject_minimums) if subject_minimums else 0]
            _ensure_english(subject_minimums, seen_uwc, or_grp_uwc)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": subject_minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# UP parser
# ---------------------------------------------------------------------------

_UP_AND = re.compile(r"\s+AND\s+", re.IGNORECASE)
_UP_OR  = re.compile(r"\s+OR\s+",  re.IGNORECASE)


def _extract_trailing_level(text: str) -> tuple[str, Optional[int]]:
    text = text.strip()
    m = re.search(r"\s+(\d+)(%?)\s*$", text)
    if not m:
        return text, None
    raw = int(m.group(1))
    is_pct = bool(m.group(2))
    level = _pct_to_nsc(raw) if is_pct else (raw if 1 <= raw <= 7 else None)
    subject_text = text[: m.start()].strip()
    return subject_text, level


def _parse_up_subjects(raw: str) -> list[dict]:
    """
    Parse UP subject requirements.
    Now handles English HL/FAL pieces explicitly.
    Format: 'English Home Language OR English First Additional Language OR English 5 AND Mathematics 5'
    """
    if not raw.strip():
        return []

    minimums: list[dict] = []
    seen: set[tuple] = set()
    or_group_id = [0]

    for piece in _UP_AND.split(raw):
        piece = piece.strip()
        if not piece:
            continue

        piece_low = piece.lower()

        # English pieces — build HL/FAL OR group
        if "english" in piece_low:
            # This piece may contain multiple OR alternatives all being English
            alts = [a.strip() for a in _UP_OR.split(piece)]
            eng_items: list[tuple[str, int]] = []
            level: Optional[int] = None

            # Find any trailing level number
            for alt in alts:
                _, lvl = _extract_trailing_level(alt)
                if lvl:
                    level = lvl
                    break

            for alt in alts:
                alt_low = alt.lower()
                if "english" not in alt_low:
                    continue
                _, lvl = _extract_trailing_level(alt)
                eff_lvl = lvl if lvl else level
                if eff_lvl is None:
                    eff_lvl = 4  # default: Level 4 if not specified

                if "home language" in alt_low or " hl" in alt_low:
                    eng_items.append((ENG_HL, eff_lvl))
                elif "first additional" in alt_low or " fal" in alt_low:
                    eng_items.append((ENG_FAL, eff_lvl))
                else:
                    # Generic 'English N' — add both HL and FAL
                    eng_items.append((ENG_HL, eff_lvl))
                    eng_items.append((ENG_FAL, eff_lvl))

            # Deduplicate
            seen_eng: set[tuple] = set()
            unique_eng: list[tuple[str, int]] = []
            for item in eng_items:
                if item not in seen_eng:
                    seen_eng.add(item)
                    unique_eng.append(item)

            if unique_eng:
                _build_or_group(unique_eng, minimums, seen, or_group_id)
            continue

        if _UP_OR.search(piece):
            alts = [a.strip() for a in _UP_OR.split(piece)]
            items: list[tuple[Optional[str], Optional[int]]] = []
            last_level: Optional[int] = None

            for alt in reversed(alts):
                subj_text, lvl = _extract_trailing_level(alt)
                if lvl is not None:
                    last_level = lvl
                canon = _resolve_common_subject(subj_text)
                items.append((canon, lvl))
            items.reverse()

            resolved = [
                (s, l if l is not None else last_level)
                for s, l in items
                if s and (l is not None or last_level is not None)
            ]
            _build_or_group(resolved, minimums, seen, or_group_id)

        else:
            subj_text, lvl = _extract_trailing_level(piece)
            if lvl is None:
                continue
            canon = _resolve_common_subject(subj_text)
            if canon and (canon, lvl) not in seen:
                seen.add((canon, lvl))
                minimums.append({"subject": canon, "minimum_mark": lvl})

    return minimums


def parse_up(csv_path: Path) -> list[dict]:
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme Name", ""))
            if not programme:
                continue

            faculty_raw = row.get("Faculty", "").strip()
            if not faculty_raw:
                continue
            faculty = re.sub(r"^Faculty of\s+", "", faculty_raw, flags=re.IGNORECASE).strip()

            try:
                minimum_aps = int(row.get("APS Requirement", "").strip())
            except ValueError:
                continue

            subj_raw = row.get("Subject Requirements", "").strip()
            subject_minimums = _parse_up_subjects(subj_raw)

            seen_up: set[tuple] = {(e["subject"], e["minimum_mark"]) for e in subject_minimums}
            or_grp_up = [max((e.get("or_group", 0) or 0) for e in subject_minimums) if subject_minimums else 0]
            _ensure_english(subject_minimums, seen_up, or_grp_up)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": subject_minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# WITS parser
# ---------------------------------------------------------------------------

_WITS_PIPE    = re.compile(r"\s*\|\s*")
_WITS_ANDOR   = re.compile(r"\s+and/or\s+", re.IGNORECASE)
_WITS_SUBJ_LV = re.compile(r"^(.+?):\s*(\d+)\s*$")
_WITS_APS     = re.compile(r"^(\d+)")


def _parse_wits_subjects(raw: str) -> list[dict]:
    """
    Parse Wits subject requirements.
    Now also captures English requirements.
    Format: 'English Home Language or First Additional Language: 5 | Mathematics: 5 | ...'
    """
    if not raw.strip():
        return []

    raw = re.split(r"\|\s*All applicants", raw, flags=re.IGNORECASE)[0]
    raw = re.split(r"\|\s*\*\s*All applicants", raw, flags=re.IGNORECASE)[0]

    minimums: list[dict] = []
    seen: set[tuple] = set()
    or_group_id = [0]

    math_items: list[tuple[str, int]] = []
    other_items: list[tuple[str, int]] = []
    english_items: list[tuple[str, int]] = []  # Collect English HL/FAL entries

    for segment in _WITS_PIPE.split(raw):
        segment = segment.strip().rstrip("*").strip()
        if not segment:
            continue
        if segment.lower().startswith("additional requirements"):
            continue

        # Handle English segments
        if "english" in segment.lower():
            m = _WITS_SUBJ_LV.match(segment)
            if m:
                lvl = int(m.group(2))
                subj_part = m.group(1).lower()
                # 'English Home Language or First Additional Language'
                if "home" in subj_part or " hl" in subj_part:
                    english_items.append((ENG_HL, lvl))
                if "first additional" in subj_part or " fal" in subj_part:
                    english_items.append((ENG_FAL, lvl))
                if "home" not in subj_part and "first additional" not in subj_part and " hl" not in subj_part and " fal" not in subj_part:
                    # Generic 'English ... : N'
                    english_items.append((ENG_HL, lvl))
                    english_items.append((ENG_FAL, lvl))
            continue

        # Handle 'Life Sciences and/or Physical Sciences: N'
        if _WITS_ANDOR.search(segment):
            m = _WITS_SUBJ_LV.match(segment)
            if m:
                lvl = int(m.group(2))
                for raw_subj in _WITS_ANDOR.split(m.group(1)):
                    canon = _resolve_common_subject(raw_subj)
                    if canon:
                        other_items.append((canon, lvl))
                if len(other_items) >= 2:
                    _build_or_group(other_items[-2:], minimums, seen, or_group_id)
                    other_items = other_items[:-2]
            continue

        m = _WITS_SUBJ_LV.match(segment)
        if not m:
            continue
        canon = _resolve_common_subject(m.group(1))
        if not canon:
            continue
        lvl = int(m.group(2))

        if canon in _MATH_TYPES:
            math_items.append((canon, lvl))
        else:
            other_items.append((canon, lvl))

    # English items → OR group
    if english_items:
        # Deduplicate
        unique_eng: list[tuple[str, int]] = []
        seen_eng: set[tuple] = set()
        for item in english_items:
            if item not in seen_eng:
                seen_eng.add(item)
                unique_eng.append(item)
        _build_or_group(unique_eng, minimums, seen, or_group_id)

    # Math-type subjects → OR group
    if math_items:
        _build_or_group(math_items, minimums, seen, or_group_id)

    # All other subjects → standalone AND requirements
    for subj, lvl in other_items:
        if (subj, lvl) not in seen:
            seen.add((subj, lvl))
            minimums.append({"subject": subj, "minimum_mark": lvl})

    return minimums


def parse_wits(csv_path: Path) -> list[dict]:
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            programme = clean_name(row.get("Programme Name", ""))
            if not programme:
                continue
            programme = programme.lstrip("•· ").strip()
            if not programme:
                continue

            aps_raw = row.get("APS Requirement", "").strip()
            m = _WITS_APS.match(aps_raw)
            if not m:
                continue
            minimum_aps = int(m.group(1))

            faculty = row.get("Faculty", "").strip()

            subj_raw = row.get("Subject Requirements", "").strip()
            subject_minimums = _parse_wits_subjects(subj_raw)

            seen_w: set[tuple] = {(e["subject"], e["minimum_mark"]) for e in subject_minimums}
            or_grp_w = [max((e.get("or_group", 0) or 0) for e in subject_minimums) if subject_minimums else 0]
            _ensure_english(subject_minimums, seen_w, or_grp_w)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": subject_minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# UCT parser
# ---------------------------------------------------------------------------

def _uct_pct_to_level(pct_str: str) -> Optional[int]:
    """Convert percentage string like '50%' or '60%' to NSC level."""
    m = re.search(r'(\d+)%', pct_str)
    if m:
        return _pct_to_nsc(int(m.group(1)))
    return None


def _parse_uct_english(raw: str) -> list[tuple[str, int]]:
    """
    Parse UCT English requirement.
    Formats: 'HL 50% or FAL 60%', '65% (HL or FAL)', '50%'
    Returns list of (subject, level) tuples.
    """
    if not raw or not raw.strip():
        return []
    t = raw.strip()
    low = t.lower()

    # 'HL N% or FAL M%'
    m = re.match(r'hl\s+(\d+)%.*?fal\s+(\d+)%', low)
    if m:
        hl_lvl  = _pct_to_nsc(int(m.group(1)))
        fal_lvl = _pct_to_nsc(int(m.group(2)))
        return [(ENG_HL, hl_lvl), (ENG_FAL, fal_lvl)]

    # '65% (HL or FAL)' or '50%'
    m = re.search(r'(\d+)%', low)
    if m:
        lvl = _pct_to_nsc(int(m.group(1)))
        return [(ENG_HL, lvl), (ENG_FAL, lvl)]

    return []


def _parse_uct_math(math_raw: str, addl_raw: str) -> list[tuple[str, int]]:
    """
    Parse UCT math requirement.
    Formats: '60%', '70%'
    UCT typically only accepts pure Mathematics (MathLit not accepted for most).
    """
    if not math_raw or not math_raw.strip():
        # Try additional requirements
        if addl_raw:
            m = re.search(r'mathematics\s+(\d+)%', addl_raw.lower())
            if m:
                return [("Mathematics", _pct_to_nsc(int(m.group(1))))]
        return []
    m = re.search(r'(\d+)%', math_raw)
    if m:
        lvl = _pct_to_nsc(int(m.group(1)))
        return [("Mathematics", lvl)]
    return []


def parse_uct(csv_path: Path) -> list[dict]:
    """
    Parse uct_2026_programmes_final.csv.
    UCT uses FPS (Faculty Points Score) not standard APS.
    We use Minimum_FPS_BandC (most permissive threshold) as minimum_aps.
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme", ""))
            if not programme:
                continue

            faculty = row.get("Faculty", "").strip()

            # APS: use the most permissive (lowest) FPS value
            fps_c = to_int(row.get("Minimum_FPS_BandC", ""))
            fps_a = to_int(row.get("Minimum_FPS_BandA", ""))
            fps_b = to_int(row.get("Minimum_WPS_BandB", ""))

            candidates = [v for v in (fps_c, fps_a, fps_b) if v is not None]
            if not candidates:
                continue
            minimum_aps = min(candidates)

            minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            # English
            eng_raw  = row.get("English_Requirement", "").strip()
            eng_items = _parse_uct_english(eng_raw)
            if eng_items:
                _build_or_group(eng_items, minimums, seen, or_group_id)

            # Mathematics
            math_raw = row.get("Mathematics_Requirement", "").strip()
            addl_raw = row.get("Additional_Requirements", "").strip()
            math_items = _parse_uct_math(math_raw, addl_raw)
            for subj, lvl in math_items:
                if (subj, lvl) not in seen:
                    seen.add((subj, lvl))
                    minimums.append({"subject": subj, "minimum_mark": lvl})

            # Physical Sciences
            phys_raw = row.get("Physical_Sciences_Requirement", "").strip()
            _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums, seen)

            # Guarantee English HL/FAL is always present
            _ensure_english(minimums, seen, or_group_id)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# SU (Stellenbosch) parser
# ---------------------------------------------------------------------------

def _su_pct_to_level(raw: str) -> Optional[int]:
    """Convert SU percentage aggregate to APS. SU uses percentage aggregate, not standard APS."""
    raw = raw.strip()
    m = re.search(r'(\d+)%', raw)
    if m:
        return int(m.group(1))  # Return raw percentage (SU uses % as their aggregate)
    # Check for bare numbers
    m = re.fullmatch(r'(\d+)', raw)
    if m:
        return int(m.group(1))
    return None


def _parse_su_math(math_raw: str) -> list[tuple[str, int]]:
    """
    Parse SU math requirement.
    Formats: '60%', '50% OR Math Lit 60%', '70%'
    """
    if not math_raw or not math_raw.strip():
        return []
    t = math_raw.strip()
    low = t.lower()

    if any(x in low for x in ("not specified", "not required", "n/a")):
        return []

    # 'N% OR Math Lit M%'
    m = re.match(r'(\d+)%\s+or\s+math\s+lit\s+(\d+)%', low)
    if m:
        return [("Mathematics", _pct_to_nsc(int(m.group(1)))),
                ("Mathematical Literacy", _pct_to_nsc(int(m.group(2))))]

    m = re.search(r'(\d+)%', low)
    if m:
        return [("Mathematics", _pct_to_nsc(int(m.group(1))))]

    return []


def _parse_su_phys(phys_raw: str) -> list[tuple[str, int]]:
    """
    Parse SU Physical Sciences requirement.
    Formats: '50%', '50% OR Life Sciences 50% OR Agricultural Sciences 50%'
    """
    if not phys_raw or not phys_raw.strip():
        return []
    t = phys_raw.strip()
    low = t.lower()

    if any(x in low for x in ("not specified", "not required", "n/a")):
        return []

    # OR group with multiple subjects
    or_parts = re.split(r'\s+or\s+', low, flags=re.IGNORECASE)
    if len(or_parts) > 1:
        items: list[tuple[str, int]] = []
        for part in or_parts:
            canon = None
            for alias, canonical in _COMMON_SUBJECT_ALIASES.items():
                if alias in part:
                    canon = canonical
                    break
            if canon is None:
                canon = "Physical Sciences"  # default first item
            m = re.search(r'(\d+)%', part)
            if m:
                items.append((canon, _pct_to_nsc(int(m.group(1)))))
        return items

    m = re.search(r'(\d+)%', low)
    if m:
        return [("Physical Sciences", _pct_to_nsc(int(m.group(1))))]

    return []


def parse_su(csv_path: Path) -> list[dict]:
    """
    Parse su_2027_programmes_final .csv.
    SU uses NSC Aggregate Minimum (percentage, not standard APS points).
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme", ""))
            if not programme:
                continue

            faculty = row.get("Faculty", "").strip()

            nsc_raw = row.get("NSC Aggregate Minimum", "").strip()
            minimum_aps = _su_pct_to_level(nsc_raw)
            if minimum_aps is None:
                continue

            minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            # English/Language
            lang_raw = row.get("Language Requirement", "").strip()
            _parse_english_requirement(lang_raw, or_group_id, minimums, seen)

            # Mathematics
            math_raw = row.get("Mathematics Requirement", "").strip()
            math_items = _parse_su_math(math_raw)
            if len(math_items) > 1:
                _build_or_group(math_items, minimums, seen, or_group_id)
            elif math_items:
                subj, lvl = math_items[0]
                if (subj, lvl) not in seen:
                    seen.add((subj, lvl))
                    minimums.append({"subject": subj, "minimum_mark": lvl})

            # Physical Sciences
            phys_raw = row.get("Physical Sciences Requirement", "").strip()
            phys_items = _parse_su_phys(phys_raw)
            if len(phys_items) > 1:
                _build_or_group(phys_items, minimums, seen, or_group_id)
            elif phys_items:
                subj, lvl = phys_items[0]
                if (subj, lvl) not in seen:
                    seen.add((subj, lvl))
                    minimums.append({"subject": subj, "minimum_mark": lvl})

            # Guarantee English HL/FAL is always present
            _ensure_english(minimums, seen, or_group_id)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# Generic structured-column parser for most remaining universities
# ---------------------------------------------------------------------------

def _generic_parse(
    csv_path: Path,
    *,
    prog_col: str,
    fac_col: str,
    aps_col: str,
    eng_col: str,
    math_col: str,
    mathlit_col: str,
    phys_col: str = "",
    life_col: str = "",
    addl_col: str = "",
    delimiter: str = ";",
    has_note_row: bool = False,
    aps_maths_col: str = "",     # separate APS for math route
    aps_mathlit_aps_col: str = "", # separate APS for mathlit route
) -> list[dict]:
    """
    Generic parser for universities with a consistent column structure.
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=delimiter)
        for row in reader:
            prog_raw = row.get(prog_col, "").strip()
            programme = clean_name(prog_raw)
            if not programme:
                continue

            # Skip note rows (common first row in many CSVs)
            fac_check = row.get(fac_col, "").strip().upper()
            if "APS NOTE" in fac_check or "IMPORTANT NOTE" in fac_check:
                continue
            if has_note_row and (
                len(programme) > 100 or
                "uses the standard" in programme.lower() or
                "aps system" in programme.lower() or
                "nsc" in programme.lower()[:20] or
                "aps note" in programme.lower()
            ):
                continue

            faculty = row.get(fac_col, "").strip()

            # APS
            minimum_aps: Optional[int] = None
            if aps_maths_col and aps_mathlit_aps_col:
                m1 = to_int(row.get(aps_maths_col, ""))
                m2 = to_int(row.get(aps_mathlit_aps_col, ""))
                candidates = [v for v in (m1, m2) if v is not None]
                if candidates:
                    minimum_aps = min(candidates)
            if minimum_aps is None:
                aps_raw = row.get(aps_col, "").strip()
                # Handle 'N/A', ranges, 'Not specified', etc.
                m = re.match(r'^(\d+)', aps_raw)
                if m:
                    minimum_aps = int(m.group(1))

            if minimum_aps is None:
                continue

            minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            # English
            eng_raw = row.get(eng_col, "").strip() if eng_col else ""
            _parse_english_requirement(eng_raw, or_group_id, minimums, seen)

            # Mathematics
            math_raw = row.get(math_col, "").strip() if math_col else ""
            ml_raw   = row.get(mathlit_col, "").strip() if mathlit_col else ""
            _parse_math_requirement(math_raw, ml_raw, or_group_id, minimums, seen)

            # Physical Sciences
            phys_raw = row.get(phys_col, "").strip() if phys_col else ""
            _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums, seen)

            # Life Sciences
            life_raw = row.get(life_col, "").strip() if life_col else ""
            _parse_science_requirement(life_raw, "Life Sciences", or_group_id, minimums, seen)

            # Additional subjects
            addl_raw = row.get(addl_col, "").strip() if addl_col else ""
            _parse_additional_subjects(addl_raw, or_group_id, minimums, seen)

            # Guarantee English HL/FAL is always present
            _ensure_english(minimums, seen, or_group_id)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# UNIVEN parser
# ---------------------------------------------------------------------------

def parse_univen(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty",
        aps_col="Minimum APS",
        eng_col="English Requirement",
        math_col="Mathematics Requirement",
        mathlit_col="",  # no separate column; inline in math_col
        phys_col="Physical Sciences Requirement",
        life_col="Life Sciences Requirement",
        addl_col="Additional Subject Requirements",
        has_note_row=False,
    )


# ---------------------------------------------------------------------------
# NWU parser
# ---------------------------------------------------------------------------

def parse_nwu(csv_path: Path) -> list[dict]:
    """
    NWU has Language of Tuition Requirement and Other Subject Requirements.
    Also has Field/Specialisation which can be appended to programme name.
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            prog_raw = row.get("Programme", "").strip()
            programme = clean_name(prog_raw)
            if not programme:
                continue

            # Skip note rows
            if len(programme) > 100 or "uses the" in programme.lower():
                continue

            faculty = row.get("Faculty", "").strip()

            # Append Field/Specialisation to distinguish multiple rows with same programme name
            field = row.get("Field/Specialisation", "").strip()
            if field and field.lower() not in programme.lower():
                programme = f"{programme} ({field})"

            aps_raw = row.get("Minimum APS", "").strip()
            m = re.match(r'^(\d+)', aps_raw)
            if not m:
                continue
            minimum_aps = int(m.group(1))

            minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            # English: 'Language of Tuition Requirement'
            eng_raw = row.get("Language of Tuition Requirement", "").strip()
            _parse_english_requirement(eng_raw, or_group_id, minimums, seen)

            # Mathematics
            math_raw = row.get("Mathematics Requirement", "").strip()
            _parse_math_requirement(math_raw, "", or_group_id, minimums, seen)

            # Physical Sciences
            phys_raw = row.get("Physical Sciences Requirement", "").strip()
            _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums, seen)

            # Other Subject Requirements
            other_raw = row.get("Other Subject Requirements", "").strip()
            _parse_additional_subjects(other_raw, or_group_id, minimums, seen)

            # Guarantee English HL/FAL is always present
            _ensure_english(minimums, seen, or_group_id)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# NMU parser
# ---------------------------------------------------------------------------

def parse_nmu(csv_path: Path) -> list[dict]:
    """
    NMU uses Admission Score (AS) — 290–500 range.
    Has Minimum_AS_Maths and Minimum_AS_MathLit columns.
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme", ""))
            if not programme:
                continue

            faculty = row.get("Faculty", "").strip()

            # APS (NMU Admission Score)
            as_maths  = to_int(row.get("Minimum_AS_Maths", ""))
            as_mathl  = to_int(row.get("Minimum_AS_MathLit", ""))
            candidates = [v for v in (as_maths, as_mathl) if v is not None and v > 0]
            if not candidates:
                continue
            minimum_aps = min(candidates)

            minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            # English
            eng_raw = row.get("English_Requirement", "").strip()
            _parse_english_requirement(eng_raw, or_group_id, minimums, seen)

            # Mathematics
            math_raw = row.get("Mathematics_Requirement", "").strip()
            ml_raw   = ""  # inline in math_raw
            _parse_math_requirement(math_raw, ml_raw, or_group_id, minimums, seen)

            # Physical Sciences
            phys_raw = row.get("Physical_Sciences_Requirement", "").strip()
            _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums, seen)

            # Life Sciences
            life_raw = row.get("Life_Sciences_Requirement", "").strip()
            _parse_science_requirement(life_raw, "Life Sciences", or_group_id, minimums, seen)

            # Additional
            addl_raw = row.get("Additional_Subject_Requirements", "").strip()
            _parse_additional_subjects(addl_raw, or_group_id, minimums, seen)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# Rhodes parser
# ---------------------------------------------------------------------------

def parse_rhodes(csv_path: Path) -> list[dict]:
    """
    Rhodes uses Min_APS_Automatic (automatic admission) as the primary APS.
    Falls back to Min_APS_Deans_Discretion (first number).
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme", ""))
            if not programme:
                continue

            # Skip note rows
            if len(programme) > 150:
                continue

            faculty = row.get("Faculty", "").strip()

            # APS
            auto_raw = row.get("Min_APS_Automatic", "").strip()
            disc_raw = row.get("Min_APS_Deans_Discretion", "").strip()
            ext_raw  = row.get("Min_APS_Extended_Studies", "").strip()

            minimum_aps: Optional[int] = None
            # Try extended first, then discretion
            for raw_val in (ext_raw, disc_raw, auto_raw):
                m = re.match(r'^(\d+)', raw_val)
                if m:
                    minimum_aps = int(m.group(1))
                    break
            if minimum_aps is None:
                continue

            minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            eng_raw  = row.get("English_Requirement", "").strip()
            math_raw = row.get("Mathematics_Requirement", "").strip()
            ml_raw   = row.get("MathLit_Accepted", "").strip()
            phys_raw = row.get("Physical_Sciences_Requirement", "").strip()
            life_raw = row.get("Life_Sciences_Requirement", "").strip()
            addl_raw = row.get("Additional_Subject_Requirements", "").strip()

            _parse_english_requirement(eng_raw, or_group_id, minimums, seen)
            _parse_math_requirement(math_raw, ml_raw, or_group_id, minimums, seen)
            _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums, seen)
            _parse_science_requirement(life_raw, "Life Sciences", or_group_id, minimums, seen)
            _parse_additional_subjects(addl_raw, or_group_id, minimums, seen)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# UFH parser
# ---------------------------------------------------------------------------

def parse_ufh(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty",
        aps_col="Min_APS",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=False,
    )


# ---------------------------------------------------------------------------
# WSU parser
# ---------------------------------------------------------------------------

def parse_wsu(csv_path: Path) -> list[dict]:
    """
    WSU has Min_APS_Main and Min_APS_ECP columns.
    English_Requirement_Main column.
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme", ""))
            if not programme:
                continue
            # Skip note row
            fac = row.get("Faculty", "").strip()
            if "IMPORTANT NOTE" in fac or "APS SYSTEM" in fac.upper():
                continue
            if len(programme) > 100:
                continue

            faculty = fac

            main_aps = to_int(row.get("Min_APS_Main", ""))
            ecp_aps  = to_int(row.get("Min_APS_ECP", ""))

            if main_aps is None:
                continue

            minimums_main: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            eng_raw  = row.get("English_Requirement_Main", "").strip()
            math_raw = row.get("Mathematics_Requirement_Main", "").strip()
            ml_raw   = row.get("MathLit_Accepted_Main", "").strip()
            phys_raw = row.get("Physical_Sciences_Requirement", "").strip()
            life_raw = row.get("Life_Sciences_Requirement", "").strip()
            addl_raw = row.get("Additional_Subject_Requirements", "").strip()

            _parse_english_requirement(eng_raw, or_group_id, minimums_main, seen)
            _parse_math_requirement(math_raw, ml_raw, or_group_id, minimums_main, seen)
            _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums_main, seen)
            _parse_science_requirement(life_raw, "Life Sciences", or_group_id, minimums_main, seen)
            _parse_additional_subjects(addl_raw, or_group_id, minimums_main, seen)
            _ensure_english(minimums_main, seen, or_group_id)

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": main_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "mainstream",
                "subject_minimums": minimums_main,
            })

            # ECP variant
            if ecp_aps is not None and ecp_aps != main_aps:
                entries.append({
                    "name": f"{programme} (Extended)",
                    "faculty": faculty,
                    "minimum_aps": ecp_aps,
                    "competitive_flag": False,
                    "mainstream_or_extended": "extended",
                    "subject_minimums": minimums_main,
                })

    return entries


# ---------------------------------------------------------------------------
# UKZN parser
# ---------------------------------------------------------------------------

def parse_ukzn(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="College",
        aps_col="Min_APS",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=True,
    )


# ---------------------------------------------------------------------------
# UFS parser
# ---------------------------------------------------------------------------

def parse_ufs(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty",
        aps_col="Min_AP",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=True,
    )


# ---------------------------------------------------------------------------
# UMP parser
# ---------------------------------------------------------------------------

def parse_ump(csv_path: Path) -> list[dict]:
    """UMP has separate APS columns for Maths and MathLit routes."""
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty",
        aps_col="Min_APS_with_Maths",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=True,
        aps_maths_col="Min_APS_with_Maths",
        aps_mathlit_aps_col="Min_APS_with_MathLit",
    )


# ---------------------------------------------------------------------------
# UniZulu parser
# ---------------------------------------------------------------------------

def parse_unizulu(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty",
        aps_col="Min_APS",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=True,
    )


# ---------------------------------------------------------------------------
# SPU parser
# ---------------------------------------------------------------------------

def parse_spu(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty",
        aps_col="Min_APS",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=True,
    )


# ---------------------------------------------------------------------------
# TUT parser
# ---------------------------------------------------------------------------

def parse_tut(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty/College",
        aps_col="Min_APS",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=True,
    )


# ---------------------------------------------------------------------------
# DUT parser
# ---------------------------------------------------------------------------

def parse_dut(csv_path: Path) -> list[dict]:
    """
    DUT does not have a composite APS — uses subject level requirements.
    We assign a default minimum_aps of 0 to include all programmes.
    Actually, we skip if no subject-level requirements are meaningful.
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme", ""))
            if not programme:
                continue

            faculty = row.get("Faculty/College", "").strip()

            # Skip note rows (Faculty='APS NOTE' or long programme description)
            if "APS NOTE" in faculty.upper() or "APS NOTE" in programme.upper():
                continue
            if len(programme) > 120:
                continue
            # Skip rows where programme looks like a sentence/note
            if programme.lower().startswith("dut uses") or programme.lower().startswith("aps note"):
                continue

            # DUT has no composite APS — use English level as proxy if present
            eng_raw  = row.get("English_Requirement", "").strip()
            math_raw = row.get("Mathematics_Requirement", "").strip()
            ml_raw   = row.get("MathLit_Accepted", "").strip()
            phys_raw = row.get("Physical_Sciences_Requirement", "").strip()
            life_raw = row.get("Life_Sciences_Requirement", "").strip()
            addl_raw = row.get("Additional_Subject_Requirements", "").strip()

            minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            _parse_english_requirement(eng_raw, or_group_id, minimums, seen)
            _parse_math_requirement(math_raw, ml_raw, or_group_id, minimums, seen)
            _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums, seen)
            _parse_science_requirement(life_raw, "Life Sciences", or_group_id, minimums, seen)
            _parse_additional_subjects(addl_raw, or_group_id, minimums, seen)

            # Estimate a rough APS from English level
            eng_lvl = None
            for sm in minimums:
                if sm["subject"] in (ENG_HL, ENG_FAL):
                    eng_lvl = sm["minimum_mark"]
                    break
            minimum_aps = (eng_lvl or 3) * 6  # rough estimate

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# CUT parser
# ---------------------------------------------------------------------------

def parse_cut(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty/College",
        aps_col="Min_APS",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=True,
    )


# ---------------------------------------------------------------------------
# VUT parser
# ---------------------------------------------------------------------------

def parse_vut(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty/College",
        aps_col="Min_APS",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=True,
    )


# ---------------------------------------------------------------------------
# MUT parser
# ---------------------------------------------------------------------------

def parse_mut(csv_path: Path) -> list[dict]:
    """
    MUT also has no composite APS. Similar to DUT.
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme", ""))
            if not programme:
                continue

            faculty = row.get("Faculty/College", "").strip()

            # Skip note rows
            if "APS NOTE" in faculty.upper() or len(programme) > 120:
                continue
            if programme.lower().startswith("mut ") or programme.lower().startswith("aps note"):
                continue

            eng_raw  = row.get("English_Requirement", "").strip()
            math_raw = row.get("Mathematics_Requirement", "").strip()
            ml_raw   = row.get("MathLit_Accepted", "").strip()
            phys_raw = row.get("Physical_Sciences_Requirement", "").strip()
            life_raw = row.get("Life_Sciences_Requirement", "").strip()
            addl_raw = row.get("Additional_Subject_Requirements", "").strip()

            minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            _parse_english_requirement(eng_raw, or_group_id, minimums, seen)
            _parse_math_requirement(math_raw, ml_raw, or_group_id, minimums, seen)
            _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums, seen)
            _parse_science_requirement(life_raw, "Life Sciences", or_group_id, minimums, seen)
            _parse_additional_subjects(addl_raw, or_group_id, minimums, seen)

            eng_lvl = None
            for sm in minimums:
                if sm["subject"] in (ENG_HL, ENG_FAL):
                    eng_lvl = sm["minimum_mark"]
                    break
            minimum_aps = (eng_lvl or 3) * 6

            entries.append({
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": minimums,
            })

    return entries


# ---------------------------------------------------------------------------
# SMU parser
# ---------------------------------------------------------------------------

def parse_smu(csv_path: Path) -> list[dict]:
    return _generic_parse(
        csv_path,
        prog_col="Programme",
        fac_col="Faculty/College",
        aps_col="Min_APS",
        eng_col="English_Requirement",
        math_col="Mathematics_Requirement",
        mathlit_col="MathLit_Accepted",
        phys_col="Physical_Sciences_Requirement",
        life_col="Life_Sciences_Requirement",
        addl_col="Additional_Subject_Requirements",
        has_note_row=True,
    )


# ---------------------------------------------------------------------------
# CPUT parser
# ---------------------------------------------------------------------------

# Regex for CPUT APS patterns like:
#   "30 with Maths (APS Method 1)"
#   "23 with Maths / 25 with MathLit (APS Method 1)"
#   "26 (APS Method 1)"
#   "26+ (APS Method 1)"
#   "30 - 34 (APS Method 1)"
_CPUT_MATH_APS   = re.compile(r'(\d+)\s+with\s+Maths\b', re.IGNORECASE)
_CPUT_ML_APS     = re.compile(r'(\d+)\s+with\s+MathLit\b', re.IGNORECASE)
_CPUT_TM_APS     = re.compile(r'(\d+)\s+with\s+(?:Tech(?:nical)?\s*Maths?|TM)\b', re.IGNORECASE)
_CPUT_FLAT_APS   = re.compile(r'^(\d+)\s*(?:\+|[-–]\s*\d+)?\s*\(', )

# From Special_Notes ECP patterns like "28(Maths)/29(TM)/30(ML)" or "28 with Maths"
_CPUT_NOTE_MAIN_MATH = re.compile(r'[Mm]ainstream[^.]*?(\d+)\s*\([Mm]aths\)', re.IGNORECASE)
_CPUT_NOTE_MAIN_TM   = re.compile(r'[Mm]ainstream[^.]*?(\d+)\s*\(TM\)', re.IGNORECASE)
_CPUT_NOTE_MAIN_ML   = re.compile(r'[Mm]ainstream[^.]*?(\d+)\s*\(ML\)', re.IGNORECASE)

# MathLit level from "Yes - Level N" pattern
_CPUT_ML_LEVEL = re.compile(r'Level\s+(\d)', re.IGNORECASE)


def _parse_cput_aps(aps_raw: str, notes_raw: str) -> tuple[Optional[int], Optional[int], Optional[int], Optional[int]]:
    """Return (minimum_aps, aps_math, aps_mathlit, aps_techmath).

    If the Special_Notes Mainstream override is present, use those values.
    Otherwise, parse from Min_APS column.
    """
    aps_math: Optional[int] = None
    aps_ml:   Optional[int] = None
    aps_tm:   Optional[int] = None

    # Prefer Mainstream values from Special_Notes when present
    nm = _CPUT_NOTE_MAIN_MATH.search(notes_raw)
    ntm = _CPUT_NOTE_MAIN_TM.search(notes_raw)
    nml = _CPUT_NOTE_MAIN_ML.search(notes_raw)
    if nm or ntm or nml:
        if nm:
            aps_math = int(nm.group(1))
        if ntm:
            aps_tm = int(ntm.group(1))
        if nml:
            aps_ml = int(nml.group(1))
    else:
        # Parse from Min_APS column
        m_math = _CPUT_MATH_APS.search(aps_raw)
        m_ml   = _CPUT_ML_APS.search(aps_raw)
        m_tm   = _CPUT_TM_APS.search(aps_raw)
        if m_math:
            aps_math = int(m_math.group(1))
        if m_ml:
            aps_ml = int(m_ml.group(1))
        if m_tm:
            aps_tm = int(m_tm.group(1))

    # Flat APS (no math type qualifier)
    if aps_math is None and aps_ml is None and aps_tm is None:
        m_flat = _CPUT_FLAT_APS.match(aps_raw.strip())
        if m_flat:
            flat = int(m_flat.group(1))
            return flat, None, None, None
        # fallback: first number
        m_any = re.search(r'(\d+)', aps_raw)
        if m_any:
            flat = int(m_any.group(1))
            return flat, None, None, None
        return None, None, None, None

    minimum_aps = min(v for v in (aps_math, aps_ml, aps_tm) if v is not None)
    return minimum_aps, aps_math, aps_ml, aps_tm


def _parse_cput_ml_level(ml_raw: str) -> Optional[int]:
    """Extract numeric level from MathLit_Accepted column.
    Returns None if MathLit not accepted.
    """
    t = ml_raw.strip().lower()
    if not t or t == 'no' or 'not specified' in t:
        return None
    m = _CPUT_ML_LEVEL.search(ml_raw)
    return int(m.group(1)) if m else None


def parse_cput(csv_path: Path) -> list[dict]:
    """Parse CPUT 2026 programmes CSV.

    CPUT uses a percentage-based APS (not the standard 7-point NSC scale).
    Per-math-type APS thresholds are stored in aps_mathematics,
    aps_mathematical_literacy, aps_technical_mathematics to match UJ's model.
    """
    entries = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            programme = clean_name(row.get("Programme", ""))
            if not programme:
                continue
            # Skip the APS NOTE header row
            fac_raw = row.get("Faculty/College", "").strip()
            if "APS NOTE" in fac_raw:
                continue

            faculty = fac_raw

            aps_raw   = row.get("Min_APS", "").strip()
            notes_raw = row.get("Special_Notes", "").strip()

            minimum_aps, aps_math, aps_ml, aps_tm = _parse_cput_aps(aps_raw, notes_raw)
            if minimum_aps is None:
                continue

            # Subject minimums
            minimums: list[dict] = []
            seen: set[tuple] = set()
            or_group_id = [0]

            # English
            eng_raw = row.get("English_Requirement", "").strip()
            _parse_english_requirement(eng_raw, or_group_id, minimums, seen)

            # Mathematics + MathLit
            math_raw = row.get("Mathematics_Requirement", "").strip()
            ml_raw   = row.get("MathLit_Accepted", "").strip()
            # If MathLit not accepted, pass empty string to prevent OR group
            ml_level = _parse_cput_ml_level(ml_raw)
            effective_ml = ml_raw if ml_level is not None else ""
            _parse_math_requirement(math_raw, effective_ml, or_group_id, minimums, seen)

            # Physical Sciences
            phys_raw = row.get("Physical_Sciences_Requirement", "").strip()
            _parse_science_requirement(phys_raw, "Physical Sciences", or_group_id, minimums, seen)

            # Life Sciences
            life_raw = row.get("Life_Sciences_Requirement", "").strip()
            _parse_science_requirement(life_raw, "Life Sciences", or_group_id, minimums, seen)

            # Additional subjects
            addl_raw = row.get("Additional_Subject_Requirements", "").strip()
            _parse_additional_subjects(addl_raw, or_group_id, minimums, seen)

            # Guarantee English HL/FAL is always present
            _ensure_english(minimums, seen, or_group_id)

            entry: dict = {
                "name": programme,
                "faculty": faculty,
                "minimum_aps": minimum_aps,
                "competitive_flag": False,
                "mainstream_or_extended": "extended" if is_extended(programme) else "mainstream",
                "subject_minimums": minimums,
            }
            # Attach per-math-type APS when present (same model as UJ)
            if aps_math is not None or aps_ml is not None or aps_tm is not None:
                entry["aps_mathematics"] = aps_math
                entry["aps_mathematical_literacy"] = aps_ml
                entry["aps_technical_mathematics"] = aps_tm

            entries.append(entry)

    return entries


# ---------------------------------------------------------------------------
# University registry
# ---------------------------------------------------------------------------

UNIVERSITY_PARSERS: list[dict] = [
    {
        "id": "uj",
        "name": "University of Johannesburg",
        "csv_filename": "uj_2026_programmes_pages_selected_FINAL_Phone.csv",
        "parser": parse_uj,
    },
    {
        "id": "ul",
        "name": "University of Limpopo",
        "csv_filename": "ul_2026_pages1-2_programmes.csv",
        "parser": parse_ul,
    },
    {
        "id": "uwc",
        "name": "University of the Western Cape",
        "csv_filename": "UWC_page2_review.csv",
        "parser": parse_uwc,
    },
    {
        "id": "up",
        "name": "University of Pretoria",
        "csv_filename": "UP_2026_pages6-20_extracted_table_logic.csv",
        "parser": parse_up,
    },
    {
        "id": "wits",
        "name": "University of the Witwatersrand",
        "csv_filename": "wits_2026_pages9-25_programmes.csv",
        "parser": parse_wits,
    },
    {
        "id": "uct",
        "name": "University of Cape Town",
        "csv_filename": "uct_2026_programmes_final.csv",
        "parser": parse_uct,
    },
    {
        "id": "sun",
        "name": "Stellenbosch University",
        "csv_filename": "su_2027_programmes_final .csv",
        "parser": parse_su,
    },
    {
        "id": "univen",
        "name": "University of Venda",
        "csv_filename": "univen_2026_programmes_final.csv",
        "parser": parse_univen,
    },
    {
        "id": "nwu",
        "name": "North-West University",
        "csv_filename": "nwu_2027_programmes_ Final.csv",
        "parser": parse_nwu,
    },
    {
        "id": "nmu",
        "name": "Nelson Mandela University",
        "csv_filename": "nmu_2026_programmes_final.csv",
        "parser": parse_nmu,
    },
    {
        "id": "rhodes",
        "name": "Rhodes University",
        "csv_filename": "rhodes_2026_programmes_final.csv",
        "parser": parse_rhodes,
    },
    {
        "id": "ufh",
        "name": "University of Fort Hare",
        "csv_filename": "ufh_2026_programmes.csv",
        "parser": parse_ufh,
    },
    {
        "id": "wsu",
        "name": "Walter Sisulu University",
        "csv_filename": "wsu_2026_programmes.csv",
        "parser": parse_wsu,
    },
    {
        "id": "ukzn",
        "name": "University of KwaZulu-Natal",
        "csv_filename": "ukzn_2026_programmes.csv",
        "parser": parse_ukzn,
    },
    {
        "id": "ufs",
        "name": "University of the Free State",
        "csv_filename": "ufs_2026_programmes.csv",
        "parser": parse_ufs,
    },
    {
        "id": "ump",
        "name": "University of Mpumalanga",
        "csv_filename": "ump_2026_programmes_1.csv",
        "parser": parse_ump,
    },
    {
        "id": "unizulu",
        "name": "University of Zululand",
        "csv_filename": "unizulu_2021_programmes_1.csv",
        "parser": parse_unizulu,
    },
    {
        "id": "spu",
        "name": "Sol Plaatje University",
        "csv_filename": "spu_2026_programmes.csv",
        "parser": parse_spu,
    },
    {
        "id": "tut",
        "name": "Tshwane University of Technology",
        "csv_filename": "tut_2027_programmes.csv",
        "parser": parse_tut,
    },
    {
        "id": "dut",
        "name": "Durban University of Technology",
        "csv_filename": "dut_2026_programmes.csv",
        "parser": parse_dut,
    },
    {
        "id": "cut",
        "name": "Central University of Technology",
        "csv_filename": "cut_2026_programmes_2.csv",
        "parser": parse_cut,
    },
    {
        "id": "vut",
        "name": "Vaal University of Technology",
        "csv_filename": "vut_2027_programmes.csv",
        "parser": parse_vut,
    },
    {
        "id": "mut",
        "name": "Mangosuthu University of Technology",
        "csv_filename": "mut_undergraduate_programmes.csv",
        "parser": parse_mut,
    },
    {
        "id": "smu",
        "name": "Sefako Makgatho Health Sciences University",
        "csv_filename": "smu_2025_2026_programmes_1.csv",
        "parser": parse_smu,
    },
    {
        "id": "cput",
        "name": "Cape Peninsula University of Technology",
        "csv_filename": "cput_2026_programmes.csv",
        "parser": parse_cput,
    },
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def read_json(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    catalogue = read_json(CATALOGUE_FILE)
    if "universities" not in catalogue:
        catalogue["universities"] = {}

    total_added = 0

    for entry in UNIVERSITY_PARSERS:
        uid = entry["id"]
        csv_path = PROSPECTUS_DIR / entry["csv_filename"]

        if not csv_path.exists():
            print(f"  SKIP {uid}: CSV not found at {csv_path}", file=sys.stderr)
            continue

        try:
            programmes = entry["parser"](csv_path)
        except Exception as exc:
            import traceback
            print(f"  ERROR parsing {uid}: {exc}", file=sys.stderr)
            traceback.print_exc()
            continue

        if not programmes:
            print(f"  WARN {uid}: parser returned 0 entries", file=sys.stderr)
            continue

        eng_count = sum(1 for p in programmes if any(
            s["subject"] in (ENG_HL, ENG_FAL) for s in p.get("subject_minimums", [])
        ))
        catalogue["universities"][uid] = programmes
        print(f"  {uid}: {len(programmes)} programmes "
              f"({eng_count} with English requirements) from {csv_path.name}")
        total_added += len(programmes)

    catalogue["generated_at"] = dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    catalogue["phase"] = "2"
    catalogue["notes"] = (
        "Phase 2: All 24 universities loaded from prospectus CSVs. "
        "English Home Language / First Additional Language requirements now captured. "
        "UJ APS applied separately via apply_uj_aps.py."
    )

    write_json(CATALOGUE_FILE, catalogue)
    print(f"\nWrote {CATALOGUE_FILE.name} — {total_added} entries across "
          f"{len(UNIVERSITY_PARSERS)} universities.")
    print("Run  python3 tools/apply_uj_aps.py && python3 tools/promote_rules.py  "
          "to regenerate approved_rules.json.")


if __name__ == "__main__":
    main()
