#!/usr/bin/env python3
"""
Apply per-math-type APS values from data/uj_aps_by_qualcode.json to
the UJ programmes in data/programme_catalogue.json.

Uses a curated name-to-qualcode mapping for reliable matching.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
QUALCODE_FILE = DATA_DIR / "uj_aps_by_qualcode.json"
CATALOGUE_FILE = DATA_DIR / "programme_catalogue.json"

# ---------------------------------------------------------------------------
# Curated catalogue-name → qualcode mapping
# First occurrence of each name maps to this code.
# For duplicate names, MULTI_CODES below overrides with the full ordered list.
# ---------------------------------------------------------------------------
CATALOGUE_TO_QUALCODE: dict[str, str] = {
    # Art, Design and Architecture
    "B ARCHITECTURE": "B8BA3Q",
    "BA (COMMUNICATION DESIGN)": "B8CD2Q",
    "BA (DIGITAL MEDIA DESIGN)": "B8ID1Q",
    "BA (INDUSTRIAL DESIGN)": "B8DM3Q",
    "BA (INTERIOR DESIGN)": "B8BA6Q",
    "BA (FASHION DESIGN)": "B8BA7Q",
    "BA (VISUAL ART)": "B8FD1Q",
    # FADA Diplomas
    "ARCHITECTURE": "D8AT1Q",
    "FASHION PRODUCTION": "D8FP1Q",
    "JEWELLERY DESIGN AND MANUFACTURE": "D8JD1Q",

    # College of Business and Economics – BCom 3-year
    "ACCOUNTING (CA)": "B34CAQ",
    "HOSPITALITY MANAGEMENT": "B34TDQ",
    "HUMAN RESOURCE MANAGEMENT": "B34HRQ",
    "TOURISM DEVELOPMENT AND MANAGEMENT": "B34HNQ",
    "PUBLIC MANAGEMENT AND GOVERNANCE": "B34PKQ",
    "ACCOUNTING": "B34F5Q",
    "BUSINESS MANAGEMENT": "B34INQ",
    "ECONOMICS AND ECONOMETRICS": "B1CEMQ",
    "ENTREPRENEURIAL MANAGEMENT": "B3N14Q",
    "FINANCE": "B34BMQ",
    "INDUSTRIAL PSYCHOLOGY": "B34A5Q",
    "INFORMATION MANAGEMENT": "B34TLQ",
    "INFORMATION SYSTEMS": "B1CMMQ",
    "MARKETING MANAGEMENT": "B1CISQ",
    "TRANSPORT AND LOGISTICS MANAGEMENT": "B34IMQ",

    # CBE Diplomas 3-year
    "ACCOUNTANCY": "D3A15Q",
    "BUSINESS INFORMATION TECHNOLOGY": "D34FBQ",
    "FINANCIAL SERVICES OPERATIONS": "D34F9Q",
    "FOOD AND BEVERAGE OPERATIONS": "D34SEQ",
    "LOGISTICS": "D34P2Q",
    "MARKETING": "D34MKQ",
    "PEOPLE MANAGEMENT": "D34LGQ",
    "RETAIL BUSINESS MANAGEMENT": "D34TMQ",
    "SMALL BUSINESS MANAGEMENT": "D34SBQ",
    "TOURISM MANAGEMENT": "D34TRQ",
    "TRANSPORTATION MANAGEMENT": "D34TEQ",

    # CBE Extended diplomas
    "BACHELOR OF COMMERCE IN ACCOUNTANCY": "D34LEQ",
    "BACHELOR OF HUMAN RESOURCE MANAGEMENT": "D34PEQ",

    # Education (BEd 4-year = flat 28)
    "FOUNDATION PHASE TEACHING (Grade R-3)": "B5BFPQ",
    "INTERMEDIATE PHASE TEACHING (Grade 4-7)": "B5BITQ",
    "SENIOR PHASE & FET TEACHING – LIFE ORIENTATION (PSYCHOLOGY)": "B5LOPQ",
    "SENIOR PHASE & FET TEACHING – COMMERCE EDUCATION (ACCOUNTING)": "B5BSAQ",
    "SENIOR PHASE & FET TEACHING – COMMERCE EDUCATION (BUSINESS MANAGEMENT)": "B5BSBQ",
    "SENIOR PHASE & FET TEACHING – COMMERCE EDUCATION (ECONOMICS)": "B5BSEQ",
    "SENIOR PHASE & FET TEACHING – LANGUAGE EDUCATION (ISIZULU)": "B5LAZQ",
    "SENIOR PHASE & FET TEACHING – LANGUAGE EDUCATION (SEPEDI)": "B5LASQ",
    "SENIOR PHASE & FET TEACHING – LANGUAGE EDUCATION (AFRIKAANS)": "B5LAFQ",
    "SENIOR PHASE & FET TEACHING – LANGUAGE EDUCATION (ENGLISH)": "B5LAEQ",
    "SENIOR PHASE & FET TEACHING – PHYSICAL SCIENCE": "B5SPSQ",
    "SENIOR PHASE & FET TEACHING – MATHEMATICS": "B5SMMQ",
    "SENIOR PHASE & FET TEACHING – LIFE SCIENCES": "B5SLSQ",
    "SENIOR PHASE & FET TEACHING – GEOGRAPHY": "B5SGEQ",

    # Engineering (BEng 4-year) – Maths only
    "ELECTRICAL AND ELECTRONIC ENGINEERING": "B6ELSQ",

    # Engineering Technology (BEngTech 3-year)
    "CHEMICAL ENGINEERING": "B6PY2Q",
    "EXTRACTION METALLURGY": "B6EXTQ",
    "INDUSTRIAL ENGINEERING": "B6IN2Q",
    "PHYSICAL METALLURGY": "B6CE1Q",
    "MINING ENGINEERING": "B6CV3Q",
    "MINE SURVEYING": "B6SU0Q",
    "CONSTRUCTION": "B6CN0Q",
    "URBAN AND REGIONAL PLANNING": "B6UP0Q",

    # Engineering Operations/Management Diplomas
    "DIPLOMA PROGRAMMES (3 years) MANAGEMENT SERVICES": "D6OPMQ",
    "OPERATIONS MANAGEMENT": "D6MASQ",

    # Health Sciences
    "BIOKINETICS": "B9S15Q",
    "DIAGNOSTIC RADIOGRAPHY": "B9M04Q",
    "DIAGNOSTIC UL TRASOUND": "B9M02Q",
    "NUCLEAR MEDICINE": "B9M03Q",
    "RADIATION THERAPY": "B9M01Q",
    "CHIROPRACTIC": "B9C01Q",
    "COMPLEMENTARY MEDICINE": "B9CM1Q",
    "EMERGENCY MEDICAL CARE (EMC)": "B9E01Q",
    "MEDICAL LABORATORY SCIENCE": "B9B01Q",
    "PODIATRY": "B9P01Q",
    "NURSING": "B9N02Q",
    "B OPTOM": "B9O02Q",
    "ENVIRONMENTAL HEALTH": "B9ENV1",
    "SPORT AND EXERCISE SCIENCES": "B9SE1Q",
    "SPORT MANAGEMENT": "B9S14Q",
    "DIPLOMA SPORT MANAGEMENT": "D9S01Q",

    # Humanities / Social Sciences
    "SOCIAL WORK": "B7025Q",
    "BA": "B7023Q",
    "BA with specialisation in LANGUAGE PRACTICE": "B7026Q",
    "BA with specialisation in POLITICS, ECONOMICS AND TECHNOLOGY": "B7024Q",
    "COMMUNITY DEVELOPMENT AND LEADERSHIP": "B7015Q",
    "DIPLOMA IN PUBLIC RELATIONS AND COMMUNICATION": "D7002Q",
    "EXTENDED DIPLOMA IN PUBLIC RELATIONS AND COMMUNICATION": "D7EX2Q",

    # Law
    "BA (LAW)": "B4C01Q",
    "BCOM (LAW)": "B4A01Q",
    "LLB": "B4L03Q",

    # Science – Information Technology
    "INFORMATION TECHNOLOGY": "B2I04Q",
    "COMPUTER SCIENCE AND INFORMATICS": "B2I02Q",
    "COMPUTER SCIENCE AND INFORMATICS specialising in AI": "B2I01Q",

    # Science – Life & Environmental Sciences
    "PHYSIOLOGY AND PSYCHOLOGY": "B2L10Q",
    "PHYSIOLOGY AND BIOCHEMISTRY": "B2L11Q",
    "ZOOLOGY AND PHYSIOLOGY": "B2L12Q",
    "ZOOLOGY AND GEOGRAPHY": "B2L13Q",
    "ZOOLOGY AND ENVIRONMENTAL MANAGEMENT": "B2L14Q",
    "ZOOLOGY AND CHEMISTRY": "B2L15Q",
    "ZOOLOGY AND BIOCHEMISTRY": "B2L16Q",
    "BOTANY AND ZOOLOGY": "B2L17Q",
    "BOTANY AND CHEMISTRY": "B2L18Q",
    "BIOCHEMISTRY AND BOTANY": "B2L26Q",
    "GEOGRAPHY AND ENVIRONMENTAL MANAGEMENT": "B2L20Q",
    "GEOLOGY AND ENVIRONMENTAL MANAGEMENT": "B2L24Q",
    "GEOLOGY AND GEOGRAPHY": "B2L25Q",

    # Science – Mathematical Sciences
    "MATHEMATICS AND MATHEMATICAL STATISTICS (WITH FINANCIAL ORIENTATION)": "B2M40Q",
    "MATHEMATICS AND PSYCHOLOGY": "B2M41Q",
    "MATHEMATICAL STATISTICS AND ECONOMICS (WITH FINANCIAL ORIENTATION)": "B2M52Q",
    "MATHEMATICS AND INFORMATICS": "B2M43Q",
    "MATHEMATICS AND COMPUTER SCIENCE": "B2M44Q",
    "COMPUTATIONAL SCIENCE": "B2M46Q",
    "APPLIED MATHEMATICS AND COMPUTER SCIENCE": "B2M55Q",
    "APPLIED MATHEMATICS AND MATHEMATICAL STATISTICS": "B2M54Q",
    "APPLIED MATHEMATICS AND MATHEMATICS": "B2M47Q",
    "MATHEMATICAL STATISTICS AND COMPUTER SCIENCE": "B2M45Q",
    "ACTUARIAL SCIENCE": "B2M56Q",
    "MATHEMATICS AND MATHEMATICAL STATISTICS": "B2M42Q",
    "MATHEMATICS AND ECONOMICS (WITH FINANCIAL ORIENTATION)": "B2M57Q",

    # Science – Physical Sciences
    "GEOLOGY AND CHEMISTRY": "B2P70Q",
    "CHEMISTRY AND PHYSICS": "B2P71Q",
    "CHEMISTRY AND MATHEMATICS": "B2P72Q",
    "BIOCHEMISTRY AND CHEMISTRY": "B2P81Q",
    "PHYSICS AND MATHEMATICS": "B2P82Q",
    "PHYSICS AND APPLIED MATHEMATICS": "B2P83Q",
    "GEOLOGY AND PHYSICS": "B2P77Q",
    "GEOLOGY AND MATHEMATICS": "B2P78Q",

    # Science Diplomas
    "ANALYTICAL CHEMISTRY": "D2FTEQ",
    "BIOTECHNOLOGY": "D2BTEQ",
    "FOOD TECHNOLOGY": "D2ACXQ",
}

# ---------------------------------------------------------------------------
# Multi-occurrence names: ordered list of qual codes (most selective first,
# matching the ordering in programme_catalogue.json / approved_rules.json).
# Each position in the list corresponds to the Nth occurrence of that name.
# ---------------------------------------------------------------------------
MULTI_CODES: dict[str, list[str]] = {
    # CBE 3-year mainstream → Extended variants
    "ACCOUNTING": ["B34F5Q", "B34AEQ"],              # mainstream (B34F5Q), extended
    "BUSINESS MANAGEMENT": ["B34INQ", "B34FEQ"],     # mainstream (B34INQ), extended
    "ECONOMICS AND ECONOMETRICS": ["B1CEMQ", "B3NE4Q"],
    "FINANCE": ["B34BMQ", "B34BEQ"],                 # mainstream (B34BMQ), extended

    # CBE Diploma mainstream → Extended variants
    "LOGISTICS": ["D34P2Q", "D34LEQ"],
    "PEOPLE MANAGEMENT": ["D34LGQ", "D34SEQ"],          # 3yr mainstream, extended
    "SMALL BUSINESS MANAGEMENT": ["D34SBQ", "D34PEQ"],  # 3yr mainstream, extended
    "TRANSPORTATION MANAGEMENT": ["D34TEQ", "D34RMQ"],

    # Engineering – 3 occurrences: BEng → BEngTech → Extended
    # Confirmed from prospectus ordering in uj_2026.txt
    "CIVIL ENGINEERING": ["B6MESQ", "B6MC2Q", "B6PX2Q"],
    "MECHANICAL ENGINEERING": ["B6CISQ", "B6EL1Q", "B6L1XQ"],
    "ELECTRICAL ENGINEERING": ["B6IN2Q", "B6IX2Q"],

    # Engineering – 2 occurrences: BEngTech mainstream → Extended
    "EXTRACTION METALLURGY": ["B6EXTQ", "B6IX2Q"],   # BEngTech, Extended
    "INDUSTRIAL ENGINEERING": ["B6IN2Q", "B6EX0Q"],
    "PHYSICAL METALLURGY": ["B6CE1Q", "B6CX3Q"],
    "CONSTRUCTION": ["B6CN0Q", "B6SC0Q"],

    # Engineering Diplomas
    "MANAGEMENT SERVICES": ["D6OPEQ", "D6OPEQ"],       # extended only pair
    "OPERATIONS MANAGEMENT": ["D6MASQ", "D6MAEQ"],

    # Science Life & Environmental – mainstream → Extended
    "PHYSIOLOGY AND PSYCHOLOGY": ["B2L10Q", "B2E17Q"],
    "PHYSIOLOGY AND BIOCHEMISTRY": ["B2L11Q", "B2E14Q"],
    "ZOOLOGY AND GEOGRAPHY": ["B2L13Q", "B2E22Q"],
    "ZOOLOGY AND ENVIRONMENTAL MANAGEMENT": ["B2L14Q", "B2E20Q"],
    "ZOOLOGY AND CHEMISTRY": ["B2L15Q", "B2E19Q"],
    "ZOOLOGY AND BIOCHEMISTRY": ["B2L16Q", "B2E18Q"],
    "BOTANY AND ZOOLOGY": ["B2L17Q", "B2E12Q"],
    "BOTANY AND CHEMISTRY": ["B2L18Q", "B2E11Q"],
    "BIOCHEMISTRY AND BOTANY": ["B2L26Q", "B2E10Q"],
    "GEOGRAPHY AND ENVIRONMENTAL MANAGEMENT": ["B2L20Q", "B2E13Q"],

    # Science Math – mainstream → Extended
    # Extended codes per prospectus uj_2026.txt lines 8660-8714
    "MATHEMATICS AND PSYCHOLOGY": ["B2M41Q", "B2E40Q"],
    "MATHEMATICS AND INFORMATICS": ["B2M43Q", "B2E42Q"],
    "MATHEMATICS AND COMPUTER SCIENCE": ["B2M44Q", "B2E43Q"],
    "APPLIED MATHEMATICS AND COMPUTER SCIENCE": ["B2M55Q", "B2E49Q"],
    "APPLIED MATHEMATICS AND MATHEMATICAL STATISTICS": ["B2M54Q", "B2E46Q"],
    "APPLIED MATHEMATICS AND MATHEMATICS": ["B2M47Q", "B2E45Q"],
    "MATHEMATICAL STATISTICS AND COMPUTER SCIENCE": ["B2M45Q", "B2E44Q"],
    "MATHEMATICS AND MATHEMATICAL STATISTICS": ["B2M42Q", "B2E41Q"],

    # Science Physical – mainstream → Extended
    # Extended codes per prospectus uj_2026.txt lines 8819-8846
    "BIOCHEMISTRY AND CHEMISTRY": ["B2P81Q", "B2E74Q"],
    "CHEMISTRY AND MATHEMATICS": ["B2P72Q", "B2E73Q"],
    "CHEMISTRY AND PHYSICS": ["B2P71Q", "B2E72Q"],
    "PHYSICS AND APPLIED MATHEMATICS": ["B2P83Q", "B2E71Q"],
    "PHYSICS AND MATHEMATICS": ["B2P82Q", "B2E70Q"],

    # Science IT
    "COMPUTER SCIENCE AND INFORMATICS": ["B2I02Q", "B2E01Q"],
}

# ---------------------------------------------------------------------------
# Special-case codes that don't match the standard qual code pattern
# (e.g. missing trailing Q, or the code appears as two codes on one line)
# ---------------------------------------------------------------------------
SPECIAL_CODES: dict[str, dict] = {
    # B9ENV1 doesn't end in Q – manually curated APS
    "B9ENV1": {
        "minimum_aps": 24,
        "aps_mathematics": None,
        "aps_mathematical_literacy": None,
        "aps_technical_mathematics": None,
    },
    # PUBLIC MANAGEMENT AND GOVERNANCE maps to "B34PKQ / B34PSQ" dual-code line
    # in the prospectus (not extracted); same BCom APS pattern as peers
    "B34PKQ": {
        "minimum_aps": None,
        "aps_mathematics": 26,
        "aps_mathematical_literacy": 28,
        "aps_technical_mathematics": 26,
    },
}


def get_aps_entry(qc_data: dict[str, dict], code: str | None) -> dict | None:
    """Return the APS entry for a qual code, or None."""
    if code is None:
        return None
    if code in qc_data:
        return qc_data[code]
    return None


def apply_aps_to_programme(prog: dict, entry: dict) -> None:
    """Write APS fields from entry into prog, updating minimum_aps if appropriate."""
    prog["aps_mathematics"] = entry.get("aps_mathematics")
    prog["aps_mathematical_literacy"] = entry.get("aps_mathematical_literacy")
    prog["aps_technical_mathematics"] = entry.get("aps_technical_mathematics")

    if entry.get("minimum_aps") is not None:
        prog["minimum_aps"] = entry["minimum_aps"]
    else:
        type_vals = [
            v for k, v in entry.items()
            if k.startswith("aps_") and v is not None
        ]
        if type_vals:
            prog["minimum_aps"] = min(type_vals)


def main() -> None:
    with open(QUALCODE_FILE, encoding="utf-8") as f:
        qc_data: dict[str, dict] = json.load(f)

    with open(CATALOGUE_FILE, encoding="utf-8") as f:
        catalogue = json.load(f)

    uj_programmes = catalogue.get("universities", {}).get("uj", [])
    if not uj_programmes:
        print("No UJ programmes found in catalogue.")
        return

    print(f"Processing {len(uj_programmes)} UJ programmes...")

    # Build name → ordered list of positions in uj_programmes
    name_positions: dict[str, list[int]] = {}
    for i, prog in enumerate(uj_programmes):
        name_positions.setdefault(prog["name"], []).append(i)

    matched = 0
    unmatched = []

    for name, positions in name_positions.items():
        # Get the ordered list of qual codes for this name
        if name in MULTI_CODES:
            codes = MULTI_CODES[name]
        else:
            base = CATALOGUE_TO_QUALCODE.get(name)
            codes = [base] if base else []

        for idx, pos in enumerate(positions):
            prog = uj_programmes[pos]

            # Pick the code for this occurrence (last code reused for excess)
            if idx < len(codes):
                code = codes[idx]
            elif codes:
                code = codes[-1]
            else:
                code = None

            # Handle non-standard codes (e.g. B9ENV1)
            if code is not None and code in SPECIAL_CODES:
                entry = SPECIAL_CODES[code]
                apply_aps_to_programme(prog, entry)
                matched += 1
                continue

            entry = get_aps_entry(qc_data, code)

            if entry is None:
                unmatched.append(f"  {name!r} (occurrence {idx+1}, code={code!r})")
                continue

            apply_aps_to_programme(prog, entry)
            matched += 1

    print(f"Matched: {matched}")
    if unmatched:
        print(f"Unmatched ({len(unmatched)}):")
        for u in unmatched:
            print(u)

    # Write updated catalogue
    with open(CATALOGUE_FILE, "w", encoding="utf-8") as f:
        json.dump(catalogue, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\nUpdated {CATALOGUE_FILE.name}")

    # Stats
    updated = [
        p for p in uj_programmes
        if any(p.get(k) is not None for k in (
            "aps_mathematics", "aps_mathematical_literacy", "aps_technical_mathematics"
        ))
    ]
    flat_only = [
        p for p in uj_programmes
        if all(p.get(k) is None for k in (
            "aps_mathematics", "aps_mathematical_literacy", "aps_technical_mathematics"
        ))
    ]
    print(f"\nFinal breakdown:")
    print(f"  With per-type APS: {len(updated)}")
    print(f"  Flat APS only:     {len(flat_only)}")

    # Spot-check key programmes
    print("\nSample UJ programmes:")
    samples = {
        "B ARCHITECTURE", "BA (COMMUNICATION DESIGN)", "ACCOUNTING (CA)",
        "CIVIL ENGINEERING", "MECHANICAL ENGINEERING", "ELECTRICAL ENGINEERING",
        "BIOKINETICS", "COMPUTER SCIENCE AND INFORMATICS",
    }
    for p in uj_programmes:
        if p["name"] in samples:
            print(
                f"  {p['name']}: min={p['minimum_aps']} "
                f"math={p.get('aps_mathematics')} "
                f"mathlit={p.get('aps_mathematical_literacy')} "
                f"techmath={p.get('aps_technical_mathematics')}"
            )


if __name__ == "__main__":
    main()
