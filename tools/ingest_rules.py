#!/usr/bin/env python3
"""
APSWise Phase 1 ingestion pipeline (lightweight).

What this script does:
1. Reads data/source_registry.json
2. Fetches official sources (HTTP URLs) or reads local files
3. Extracts text from PDFs with pdftotext (if needed)
4. Applies simple regex heuristics to detect APS and course thresholds
5. Writes data/pending_rules.json in a versioned structure

Notes:
- This is an initial ingestion skeleton. It favors transparency over aggressive parsing.
- Low-confidence extraction keeps university status as temporarily_unavailable.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REGISTRY_FILE = DATA_DIR / "source_registry.json"
PENDING_RULES_FILE = DATA_DIR / "pending_rules.json"


@dataclass
class ExtractedCourse:
  name: str
  minimum_aps: int


def read_json(path: Path) -> dict:
  return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
  path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def fetch_to_temp(url: str) -> Tuple[Path, str]:
  suffix = ".pdf" if url.lower().endswith(".pdf") else ".txt"
  with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
    with urllib.request.urlopen(url, timeout=30) as response:
      tmp.write(response.read())
      ctype = response.headers.get("Content-Type", "")
    return Path(tmp.name), ctype


def discover_prospectus_pdf_urls(page_url: str, html_text: str) -> List[str]:
  candidates = []
  href_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
  for match in href_pattern.finditer(html_text):
    href = match.group(1).strip()
    lower = href.lower()
    if ".pdf" not in lower:
      continue
    if "prospectus" not in lower and "undergraduate" not in lower and "admission" not in lower:
      continue
    absolute = urllib.parse.urljoin(page_url, href)
    candidates.append(absolute)

  dedup = []
  seen = set()
  for url in candidates:
    if url in seen:
      continue
    seen.add(url)
    dedup.append(url)
  return dedup


def discover_catalog_urls(page_url: str, html_text: str) -> List[str]:
  candidates = []
  href_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
  for match in href_pattern.finditer(html_text):
    href = match.group(1).strip()
    absolute = urllib.parse.urljoin(page_url, href)
    lower = absolute.lower()
    if "/course-finder/undergraduate/" not in lower:
      continue
    if "#" in absolute:
      continue
    candidates.append(absolute)

  dedup = []
  seen = set()
  for url in candidates:
    if url in seen:
      continue
    seen.add(url)
    dedup.append(url)
  return dedup


def extract_text_from_pdf(pdf_path: Path) -> str:
  result = subprocess.run(
    ["pdftotext", str(pdf_path), "-"],
    check=False,
    capture_output=True,
    text=True,
  )
  if result.returncode != 0:
    raise RuntimeError(f"pdftotext failed: {result.stderr.strip()}")
  return result.stdout


def extract_aps_thresholds(text: str) -> List[ExtractedCourse]:
  """
  Very simple heuristic:
  - looks for lines like "BCom ... APS 36" or "Engineering - minimum APS: 42"
  """
  results: List[ExtractedCourse] = []
  patterns = [
    re.compile(
      r"(?P<course>[A-Za-z][A-Za-z0-9&/,\-\s]{2,80}?)\s*(?:-|:)?\s*(?:minimum\s*)?APS\s*(?:score)?\s*(?:is\s*)?(?P<aps>\d{2})",
      re.IGNORECASE,
    ),
    re.compile(
      r"APS\s*(?P<aps>\d{2})\s*(?:for|to\s+enter)\s*(?P<course>[A-Za-z][A-Za-z0-9&/,\-\s]{2,80})",
      re.IGNORECASE,
    ),
  ]

  for line in text.splitlines():
    normalized = " ".join(line.split())
    if len(normalized) < 8:
      continue
    for pattern in patterns:
      match = pattern.search(normalized)
      if not match:
        continue
      course = match.group("course").strip(" -:.,")
      aps = int(match.group("aps"))
      if aps < 10 or aps > 60:
        continue
      results.append(ExtractedCourse(name=course, minimum_aps=aps))
      break

  dedup: Dict[str, ExtractedCourse] = {}
  for item in results:
    key = item.name.lower()
    if key not in dedup:
      dedup[key] = item
  return list(dedup.values())


def estimate_confidence(courses: List[ExtractedCourse], has_aps_keyword: bool) -> float:
  if not has_aps_keyword:
    return 0.2
  if len(courses) >= 8:
    return 0.9
  if len(courses) >= 4:
    return 0.82
  if len(courses) >= 3:
    return 0.78
  if len(courses) >= 1:
    return 0.55
  return 0.3


def read_source_text(source_url: str) -> Tuple[str, Optional[str]]:
  """
  Returns (text, error_message).
  Supports:
  - http(s) URLs
  - local file paths
  """
  try:
    if source_url.startswith("http://") or source_url.startswith("https://"):
      local_file, ctype = fetch_to_temp(source_url)
      try:
        if local_file.suffix.lower() == ".pdf" or "pdf" in ctype.lower():
          return extract_text_from_pdf(local_file), None
        html_or_text = local_file.read_text(encoding="utf-8", errors="ignore")
        return html_or_text, None
      finally:
        local_file.unlink(missing_ok=True)
    path = Path(source_url).expanduser()
    if not path.exists():
      return "", f"local source not found: {source_url}"
    if path.suffix.lower() == ".pdf":
      return extract_text_from_pdf(path), None
    return path.read_text(encoding="utf-8", errors="ignore"), None
  except Exception as exc:  # noqa: BLE001 - keep script resilient
    return "", str(exc)


def build_university_rule(university: dict, min_confidence: float) -> dict:
  all_text = []
  source_links = []
  errors = []
  for source in university.get("official_sources", []):
    if not source.get("active", True):
      continue
    source_url = source.get("url", "").strip()
    source_local = source.get("dev_local_path", "").strip()
    read_targets = []
    if source_url:
      read_targets.append(source_url)
      source_links.append(source_url)
    if source_local:
      read_targets.append(source_local)
    if not read_targets:
      continue

    text = ""
    err = None
    used_target = ""
    for target in read_targets:
      used_target = target
      text, err = read_source_text(target)
      if not err and text.strip():
        break
    if err or not text.strip():
      errors.append(f"{used_target}: {err or 'empty source text'}")
      continue

    # If the source is an HTML page, discover prospectus PDFs and parse them.
    source_type = source.get("type")

    if (
      source_type == "prospectus_page"
      and source_url.startswith("http")
      and ".pdf" not in source_url.lower()
      and not source_local
    ):
      pdf_urls = discover_prospectus_pdf_urls(source_url, text)
      if not pdf_urls:
        errors.append(f"{source_url}: no prospectus-like PDF links discovered")
      for pdf_url in pdf_urls[:3]:
        source_links.append(pdf_url)
        pdf_text, pdf_err = read_source_text(pdf_url)
        if pdf_err:
          errors.append(f"{pdf_url}: {pdf_err}")
          continue
        all_text.append(pdf_text)
      continue

    if source_type == "aps_catalog_page" and source_url.startswith("http") and not source_local:
      discovered = discover_catalog_urls(source_url, text)
      crawl_targets = [source_url] + discovered[:15]
      crawled_any = False
      for target in crawl_targets:
        page_text, page_err = read_source_text(target)
        if page_err:
          errors.append(f"{target}: {page_err}")
          continue
        if target not in source_links:
          source_links.append(target)
        all_text.append(page_text)
        crawled_any = True
      if not crawled_any:
        errors.append(f"{source_url}: unable to crawl catalog pages")
      continue

    all_text.append(text)

  joined = "\n".join(all_text)
  courses = extract_aps_thresholds(joined)
  confidence = estimate_confidence(courses, "aps" in joined.lower())
  rule_version = f"auto-{dt.date.today().isoformat()}"

  supports_grade11 = bool(university.get("ingestion_policy", {}).get("supports_grade11", True))
  supports_grade12 = bool(university.get("ingestion_policy", {}).get("supports_grade12", False))

  if confidence < min_confidence or not courses:
    return {
      "id": university["id"],
      "name": university["name"],
      "status": "temporarily_unavailable",
      "rule_version": rule_version,
      "supports_grade11": supports_grade11,
      "supports_grade12": supports_grade12,
      "include_life_orientation": False,
      "source_links": source_links,
      "unavailable_reason": "Low-confidence extraction or missing clear APS/course linkage",
      "ingestion_errors": errors,
      "extraction_confidence": round(confidence, 2),
      "courses": [],
    }

  return {
    "id": university["id"],
    "name": university["name"],
    "status": "active",
    "rule_version": rule_version,
    "supports_grade11": supports_grade11,
    "supports_grade12": supports_grade12,
    "include_life_orientation": False,
    "source_links": source_links,
    "ingestion_errors": errors,
    "extraction_confidence": round(confidence, 2),
    "courses": [
      {
        "name": course.name,
        "minimum_aps": course.minimum_aps,
        "subject_minimums": [],
      }
      for course in courses
    ],
  }


def main() -> None:
  parser = argparse.ArgumentParser(description="Generate APSWise rules from official sources.")
  parser.add_argument("--min-confidence", type=float, default=0.7)
  parser.add_argument("--registry", type=Path, default=REGISTRY_FILE)
  parser.add_argument("--out", type=Path, default=PENDING_RULES_FILE)
  args = parser.parse_args()

  registry = read_json(args.registry)
  universities = registry.get("universities", [])

  generated = []
  for uni in universities:
    generated.append(build_university_rule(uni, args.min_confidence))

  payload = {
    "schema_version": "1.0",
    "generated_at": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "universities": generated,
  }

  write_json(args.out, payload)
  print(f"Wrote {args.out} with {len(generated)} university entries.")


if __name__ == "__main__":
  main()
