/**
 * Converts UJ CSV to approved_rules.json course entries.
 *
 * Key rules (per user brief):
 * - Mathematics / Technical Mathematics / Mathematical Literacy are OR alternatives.
 *   A learner only needs ONE of them.
 * - "Not accepted" in Additional_Requirements → block that math type via APS sentinel (999).
 * - When any sentinel is applied and aps_mathematics is still null → set aps_mathematics = minimumAPS
 *   so the per-type routing works for pure-maths learners.
 * - Per-type APS columns drive getRequiredAPS(); subject_minimums drive checkSubjectMinimums().
 */

const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(__dirname, "uj_2026_programmes_pages_selected_FINAL_Phone 2.csv");
const RULES_PATH = path.join(__dirname, "../../data/approved_rules.json");

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAPS(val) {
  if (!val || !val.trim()) return null;
  val = val.trim();
  // "24-26 or 27" → use the lowest number
  const nums = val.match(/\d+/g);
  if (!nums) return null;
  return parseInt(nums[0], 10);
}

function parseLevel(val) {
  if (!val || !val.trim()) return null;
  val = val.trim();
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function isNotAccepted(val) {
  if (!val) return false;
  const lc = val.trim().toLowerCase();
  return lc.includes("not accepted") || lc === "not applicable";
}

function cleanProgrammeName(name) {
  return name.trim().replace(/\s*[✪*]+\s*$/, "").trim();
}

function getStream(name) {
  return /extended/i.test(name) ? "extended" : "mainstream";
}

/**
 * Parse English_Level column.
 */
function parseEnglishLevel(raw) {
  if (!raw || !raw.trim()) return [];
  raw = raw.trim();

  // "Home language:5 OR Additional language:6"
  const hlMatch = raw.match(/home\s*language\s*:\s*(\d)/i);
  if (hlMatch) {
    const hlLevel = parseInt(hlMatch[1], 10);
    const falMatch = raw.match(/additional\s*language\s*:\s*(\d)/i);
    const falLevel = falMatch ? parseInt(falMatch[1], 10) : hlLevel;
    return [
      { subject: "English Home Language", minimum_mark: hlLevel, or_group: "eng" },
      { subject: "English First Additional Language", minimum_mark: falLevel, or_group: "eng" },
    ];
  }

  // "5 OR 4" — pick lower
  const orMatch = raw.match(/(\d)\s*OR\s*(\d)/i);
  if (orMatch) {
    const level = Math.min(parseInt(orMatch[1], 10), parseInt(orMatch[2], 10));
    return [
      { subject: "English Home Language", minimum_mark: level, or_group: "eng" },
      { subject: "English First Additional Language", minimum_mark: level, or_group: "eng" },
    ];
  }

  const level = parseLevel(raw);
  if (!level) return [];
  return [
    { subject: "English Home Language", minimum_mark: level, or_group: "eng" },
    { subject: "English First Additional Language", minimum_mark: level, or_group: "eng" },
  ];
}

/**
 * Parse Mathematics_Level column.
 * Returns the numeric level (for Maths/TechMath), or null.
 * Returns false when the column says "not applicable" (no maths required).
 */
function parseMathLevelCol(raw) {
  if (!raw || !raw.trim()) return null;
  raw = raw.trim();
  const lc = raw.toLowerCase();
  if (lc.includes("not applicable")) return false; // flag: no maths req
  // "Math:3 OR Math Lit/Tech Math:5" → first number
  const m = raw.match(/math\s*[:/]\s*(\d)/i);
  if (m) return parseInt(m[1], 10);
  // "Math/Tech Math:4 OR Math Lit:6" → first number
  const m2 = raw.match(/(\d)/);
  if (m2) return parseInt(m2[1], 10);
  return null;
}

/**
 * Parse Mathematics_Level column for explicit MathLit level when encoded there.
 * e.g. "Math/Tech Math:4 OR Math Lit:6" → 6
 */
function parseMathLitFromLevelCol(raw) {
  if (!raw || !raw.trim()) return null;
  // "Math Lit:6" or "Math Lit/Tech Math:5"
  const m = raw.match(/math\s*lit[^:]*:\s*(\d)/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

/**
 * Parse Additional_Requirements string into a structured object.
 */
function parseAdditional(raw) {
  if (!raw || !raw.trim()) return {};
  const result = {};

  // ── Handle Education-specific patterns (no pipe, different key names) ─────
  const lc = raw.toLowerCase();

  // "Math Lit/Tech Math: Not applicable" → block both
  if (/math\s*lit\s*\/\s*tech\s*math\s*:\s*not\s*applic/i.test(raw)) {
    result.mathLitLevel = "not_accepted";
    result.techMathLevel = "not_accepted";
  }

  // "Mathematics: Not applicable" or "Mathematics/Math Lit: Not applicable" → no maths req
  if (/^\s*mathematics\s*(\/\s*math\s*lit\s*)?\s*:\s*not\s*applic/i.test(raw)) {
    result.noMathsRequired = true;
  }

  // "Life Sciences:X OR Physical Sciences:X" (no pipe)
  if (!raw.includes("|") && /life\s*science/i.test(raw)) {
    const lifem = raw.match(/life\s*sciences?\s*:\s*(\d)/i);
    const physm = raw.match(/physical\s*sciences?\s*:\s*(\d)/i);
    if (lifem) {
      if (!result.lifeSciReqs) result.lifeSciReqs = [];
      const entry = { subject: "Life Sciences", minimum_mark: parseInt(lifem[1], 10) };
      if (physm) {
        entry.or_partner = { subject: "Physical Sciences", minimum_mark: parseInt(physm[1], 10) };
      }
      result.lifeSciReqs.push(entry);
      return result; // done for this type of row
    }
  }

  // ── Standard pipe-delimited parsing ──────────────────────────────────────
  const parts = raw.split("|").map((p) => p.trim());
  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) continue;
    const key = part.substring(0, colonIdx).trim();
    const val = part.substring(colonIdx + 1).trim();
    const keyLc = key.toLowerCase();

    if (/math_lit_level/i.test(key)) {
      if (!result.noMathsRequired) {
        result.mathLitLevel = isNotAccepted(val) ? "not_accepted" : parseLevel(val);
      }
    } else if (/tech_math_level/i.test(key)) {
      if (!result.noMathsRequired) {
        result.techMathLevel = isNotAccepted(val) ? "not_accepted" : parseLevel(val);
      }
    } else if (/technical_mathematics_level|technical_mathematics level/i.test(key)) {
      result.techMathSubjectLevel = isNotAccepted(val) ? "not_accepted" : parseLevel(val);
    } else if (/physical_science/i.test(key)) {
      const orSci = part.match(/technical_science[s]?\s*level\s*:\s*(\d)/i);
      const physLevel = parseLevel(val.split(/\s+or\s+/i)[0]);
      if (!physLevel) continue;
      if (!result.physSciReqs) result.physSciReqs = [];
      const entry = { subject: "Physical Sciences", minimum_mark: physLevel };
      if (orSci) {
        entry.or_partner = { subject: "Technical Sciences", minimum_mark: parseInt(orSci[1], 10) };
      }
      result.physSciReqs.push(entry);
    } else if (/life_science/i.test(key)) {
      const level = isNotAccepted(val) ? null : parseLevel(val);
      if (level) {
        if (!result.lifeSciReqs) result.lifeSciReqs = [];
        result.lifeSciReqs.push({ subject: "Life Sciences", minimum_mark: level });
      }
    } else if (/geography_level/i.test(key)) {
      result.geoLevel = parseLevel(val);
    } else if (/additional_language_level/i.test(key)) {
      result.additionalLangLevel = parseLevel(val);
    }
    // Ignore: selection processes, notes, technical_mathematics_level (supplementary)
  }
  return result;
}

/**
 * Build subject_minimums array for a course.
 */
function buildSubjectMinimums(mathLevel, englishLevelRaw, addl, mathLitBlocked, techMathBlocked) {
  const reqs = [];

  // ── English ───────────────────────────────────────────────────────────────
  reqs.push(...parseEnglishLevel(englishLevelRaw));

  // ── Mathematics ──────────────────────────────────────────────────────────
  // mathLevel === false means "no maths required"
  if (mathLevel !== false && mathLevel != null && !addl.noMathsRequired) {
    const mathLitLevel =
      !mathLitBlocked && addl.mathLitLevel != null && addl.mathLitLevel !== "not_accepted"
        ? addl.mathLitLevel
        : null;
    const techMathLevel =
      !techMathBlocked &&
      ((addl.techMathLevel != null && addl.techMathLevel !== "not_accepted")
        ? addl.techMathLevel
        : addl.techMathSubjectLevel != null && addl.techMathSubjectLevel !== "not_accepted"
          ? addl.techMathSubjectLevel
          : null);

    if (mathLitLevel != null && mathLitLevel !== mathLevel) {
      // Different levels for Maths vs MathLit → explicit OR group
      reqs.push({ subject: "Mathematics", minimum_mark: mathLevel, or_group: "math" });
      reqs.push({ subject: "Mathematical Literacy", minimum_mark: mathLitLevel, or_group: "math" });
    } else if (mathLitBlocked) {
      // Only Maths (and TechMath via SUBJECT_EQUIVALENTS, but TechMath may also be blocked at APS)
      reqs.push({ subject: "Mathematics", minimum_mark: mathLevel });
    } else {
      // MathLit accepted at same level (or no explicit level) → Mathematical Literacy covers all types
      // via SUBJECT_EQUIVALENTS: ["Mathematical Literacy","Mathematics","Technical Mathematics","APM"]
      const level = mathLitLevel != null ? mathLitLevel : mathLevel;
      reqs.push({ subject: "Mathematical Literacy", minimum_mark: level, or_group: "math" });
    }
  }

  // ── Physical Sciences / Technical Sciences ────────────────────────────────
  if (addl.physSciReqs) {
    for (const req of addl.physSciReqs) {
      if (req.or_partner) {
        reqs.push({ subject: req.subject, minimum_mark: req.minimum_mark, or_group: "phys" });
        reqs.push({ subject: req.or_partner.subject, minimum_mark: req.or_partner.minimum_mark, or_group: "phys" });
      } else {
        reqs.push({ subject: req.subject, minimum_mark: req.minimum_mark });
      }
    }
  }

  // ── Life Sciences ─────────────────────────────────────────────────────────
  if (addl.lifeSciReqs) {
    for (const req of addl.lifeSciReqs) {
      if (req.or_partner) {
        reqs.push({ subject: req.subject, minimum_mark: req.minimum_mark, or_group: "life" });
        reqs.push({ subject: req.or_partner.subject, minimum_mark: req.or_partner.minimum_mark, or_group: "life" });
      } else {
        reqs.push({ subject: req.subject, minimum_mark: req.minimum_mark });
      }
    }
  }

  // ── Geography ─────────────────────────────────────────────────────────────
  if (addl.geoLevel) {
    reqs.push({ subject: "Geography", minimum_mark: addl.geoLevel });
  }

  // Remove or_group from single-member groups (promote to standalone)
  const groupCounts = {};
  for (const r of reqs) {
    if (r.or_group != null) groupCounts[r.or_group] = (groupCounts[r.or_group] || 0) + 1;
  }
  for (const r of reqs) {
    if (r.or_group != null && groupCounts[r.or_group] === 1) {
      delete r.or_group;
    }
  }

  return reqs;
}

// ── Main conversion ───────────────────────────────────────────────────────────

const raw = fs.readFileSync(CSV_PATH, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
const dataLines = lines.slice(1); // skip header

const courses = [];

for (const line of dataLines) {
  const cols = line.split(";").map((c) => c.trim());
  if (cols.length < 8) continue;

  const faculty = cols[0];
  const programmeName = cleanProgrammeName(cols[1]);
  const minimumAPSRaw = cols[2];
  const apsMathRaw = cols[3];
  const apsMathLitRaw = cols[4];
  const apsTechMathRaw = cols[5];
  const englishLevelRaw = cols[6];
  const mathLevelRaw = cols[7];
  const additionalRaw = cols[8] || "";

  if (!faculty || !programmeName) continue;

  // ── Parse APS values ──────────────────────────────────────────────────────
  let minimumAPS = parseAPS(minimumAPSRaw);
  let apsMath = parseAPS(apsMathRaw);
  let apsMathLit = parseAPS(apsMathLitRaw);
  let apsTechMath = parseAPS(apsTechMathRaw);

  // ── Parse Additional_Requirements ─────────────────────────────────────────
  const addl = parseAdditional(additionalRaw);

  // Apply "Not accepted" sentinels
  if (addl.mathLitLevel === "not_accepted") apsMathLit = 999;
  if (addl.techMathLevel === "not_accepted") apsTechMath = 999;

  // When sentinels applied and aps_mathematics is null, set it = minimumAPS
  // so per-type routing works for pure-maths learners.
  if ((apsMathLit === 999 || apsTechMath === 999) && apsMath === null) {
    apsMath = minimumAPS;
  }

  const mathLitBlocked = apsMathLit === 999;
  const techMathBlocked = apsTechMath === 999;

  // ── Parse math level columns ──────────────────────────────────────────────
  const mathLevel = parseMathLevelCol(mathLevelRaw);

  // ── Build subject_minimums ────────────────────────────────────────────────
  const subjectMinimums = buildSubjectMinimums(
    mathLevel,
    englishLevelRaw,
    addl,
    mathLitBlocked,
    techMathBlocked
  );

  const stream = getStream(programmeName);

  courses.push({
    name: programmeName,
    faculty,
    minimum_aps: minimumAPS,
    competitive_flag: false,
    mainstream_or_extended: stream,
    subject_minimums: subjectMinimums,
    aps_mathematics: apsMath,
    aps_mathematical_literacy: apsMathLit,
    aps_technical_mathematics: apsTechMath,
  });
}

console.log(`Parsed ${courses.length} courses.`);

// ── Update approved_rules.json ────────────────────────────────────────────────

const rules = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));
const ujIdx = rules.universities.findIndex((u) => u.id === "uj");
if (ujIdx === -1) {
  console.error("UJ not found in approved_rules.json");
  process.exit(1);
}

const oldCount = rules.universities[ujIdx].courses.length;
rules.universities[ujIdx].courses = courses;
rules.universities[ujIdx].rule_version = "manual-2026-04-04";
rules.universities[ujIdx].extraction_confidence = 1.0;

fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2), "utf8");

console.log(`Replaced ${oldCount} old UJ courses with ${courses.length} new courses.`);
console.log("approved_rules.json updated.");
