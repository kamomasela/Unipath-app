#!/usr/bin/env python3
"""
APSWise prospectus extractor — Claude AI edition.

Uploads a prospectus PDF to the Anthropic Files API, then asks Claude to
extract every programme with its minimum APS and subject requirements.
Far more accurate than regex or pdfplumber for complex table layouts.

Usage:
  export ANTHROPIC_API_KEY=sk-...
  python3 tools/extract_with_claude.py --university uwc --pdf sources/prospectuses/UWC_2026.pdf

Output:
  Prints extracted programmes as JSON to stdout.
  Optionally writes directly into data/approved_rules.json with --apply.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import anthropic
except ImportError:
    raise SystemExit("Run: pip install anthropic")

ROOT = Path(__file__).resolve().parents[1]
APPROVED_RULES = ROOT / "data" / "approved_rules.json"

EXTRACTION_PROMPT = """You are an expert at reading South African university prospectuses.

Your task: extract EVERY undergraduate programme from this prospectus that lists a minimum APS (Admission Point Score) or minimum points requirement.

For each programme return:
- name: the full official programme name (e.g. "Bachelor of Commerce", "BSc Computer Science")
- minimum_aps: the minimum APS/points score as an integer (use the lowest published threshold)
- subject_minimums: a list of subject-level requirements, each with:
    - subject: the subject name (use standard SA subject names where possible)
    - minimum_mark: the minimum NSC level (1-7) or percentage required (note which in the description)

Important rules:
1. Include ALL programmes that have a numeric APS/points requirement. Do not skip any.
2. If a programme has multiple streams (e.g. mainstream and extended), include both as separate entries.
3. If APS data is genuinely not present in this document, set programmes to an empty list and explain in notes.
4. Use the university's own terminology for programme names — don't abbreviate.
5. For subject minimums, use NSC levels (1-7) unless the document clearly states percentages.

Respond with a JSON object ONLY — no markdown, no explanation outside the JSON:
{
  "university_name": "...",
  "aps_formula_hint": "brief note on how APS is calculated here, e.g. NSC top 6, percentage sum, etc.",
  "programmes": [
    {
      "name": "...",
      "minimum_aps": 0,
      "subject_minimums": [
        {"subject": "...", "minimum_mark": 0}
      ]
    }
  ],
  "notes": "any important caveats about this data"
}"""


def upload_pdf(client: anthropic.Anthropic, pdf_path: Path) -> str:
    """Upload PDF to Files API, return file_id."""
    print(f"  Uploading {pdf_path.name} ({pdf_path.stat().st_size // 1024} KB)…")
    with pdf_path.open("rb") as f:
        result = client.beta.files.upload(
            file=(pdf_path.name, f, "application/pdf"),
        )
    print(f"  Uploaded → file_id: {result.id}")
    return result.id


def extract_from_file_id(client: anthropic.Anthropic, file_id: str) -> dict:
    """Ask Claude to extract programme data from an uploaded PDF."""
    print("  Sending to Claude for extraction…")

    response = client.beta.messages.create(
        model="claude-opus-4-6",
        max_tokens=8000,
        thinking={"type": "adaptive"},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {"type": "file", "file_id": file_id},
                    },
                    {
                        "type": "text",
                        "text": EXTRACTION_PROMPT,
                    },
                ],
            }
        ],
        betas=["files-api-2025-04-14"],
    )

    # Find the text block (skip thinking blocks)
    text = ""
    for block in response.content:
        if block.type == "text":
            text = block.text
            break

    if not text:
        raise RuntimeError("Claude returned no text content")

    # Strip any accidental markdown fences
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"\n  Raw response:\n{text[:500]}", file=sys.stderr)
        raise RuntimeError(f"Claude returned invalid JSON: {e}") from e


def merge_into_approved_rules(university_id: str, extracted: dict) -> None:
    """Update the matching university entry in approved_rules.json."""
    data = json.loads(APPROVED_RULES.read_text(encoding="utf-8"))

    target = None
    for uni in data["universities"]:
        if uni["id"] == university_id:
            target = uni
            break

    if target is None:
        print(f"  Warning: university id '{university_id}' not found in approved_rules.json. Skipping merge.")
        return

    programmes = extracted.get("programmes", [])
    if not programmes:
        print("  No programmes extracted — approved_rules.json unchanged.")
        return

    target["courses"] = [
        {
            "name": p["name"],
            "minimum_aps": p["minimum_aps"],
            "subject_minimums": [
                {"subject": s["subject"], "minimum_mark": s["minimum_mark"]}
                for s in p.get("subject_minimums", [])
            ],
            "mainstream_or_extended": "mainstream",
        }
        for p in programmes
    ]
    target["status"] = "active"
    target["extraction_confidence"] = 0.95
    target["rule_version"] = "claude-extracted-2026"
    target["aps_formula_hint"] = extracted.get("aps_formula_hint", "")

    APPROVED_RULES.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"  Updated {len(programmes)} programmes in approved_rules.json")


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract APS data from a prospectus PDF using Claude AI.")
    parser.add_argument("--university", required=True, help="University ID (e.g. uwc, uct, up)")
    parser.add_argument("--pdf", required=True, help="Path to the prospectus PDF")
    parser.add_argument("--apply", action="store_true", help="Write results into approved_rules.json")
    parser.add_argument("--keep-file", action="store_true", help="Don't delete the uploaded file after extraction")
    args = parser.parse_args()

    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    api_key = None
    import os
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SystemExit("Set ANTHROPIC_API_KEY environment variable first.")

    client = anthropic.Anthropic(api_key=api_key)

    print(f"\nAPSWise Claude Extractor")
    print(f"University: {args.university}")
    print(f"PDF: {pdf_path.name}")
    print()

    file_id = None
    try:
        file_id = upload_pdf(client, pdf_path)
        extracted = extract_from_file_id(client, file_id)
    finally:
        if file_id and not args.keep_file:
            try:
                client.beta.files.delete(file_id)
                print(f"  Cleaned up uploaded file {file_id}")
            except Exception:
                pass

    programmes = extracted.get("programmes", [])
    print(f"\nExtracted: {len(programmes)} programmes")
    print(f"University name: {extracted.get('university_name', '?')}")
    print(f"APS formula hint: {extracted.get('aps_formula_hint', '?')}")
    if extracted.get("notes"):
        print(f"Notes: {extracted['notes']}")

    print("\nProgrammes found:")
    for p in programmes:
        subs = ", ".join(
            f"{s['subject']} ≥{s['minimum_mark']}"
            for s in p.get("subject_minimums", [])
        )
        print(f"  {p['name']:55s}  APS={p['minimum_aps']:>3}  {subs}")

    if not programmes:
        print("\n  No APS data found in this document.")
        print("  This PDF may be a brochure without APS tables.")
        print("  Try a different source document for this university.")
        return 1

    if args.apply:
        print("\nApplying to approved_rules.json…")
        merge_into_approved_rules(args.university, extracted)
    else:
        print("\nRun with --apply to write these results into approved_rules.json")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
