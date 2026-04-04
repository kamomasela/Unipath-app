const data = JSON.parse(require("fs").readFileSync("../../data/approved_rules.json", "utf8"));
const uj = data.universities.find((u) => u.id === "uj");

function percentageToNSCLevel(pct) {
  if (pct >= 80) return 7;
  if (pct >= 70) return 6;
  if (pct >= 60) return 5;
  if (pct >= 50) return 4;
  if (pct >= 40) return 3;
  if (pct >= 30) return 2;
  return 1;
}

function getRequiredAPS(course, subjectMarks) {
  const hasMath = subjectMarks.some((s) => s.subject === "Mathematics");
  const hasMathLit = subjectMarks.some((s) => s.subject === "Mathematical Literacy");
  const hasTechMath = subjectMarks.some((s) => s.subject === "Technical Mathematics");
  const hasPerTypeData =
    course.aps_mathematics !== null ||
    course.aps_mathematical_literacy !== null ||
    course.aps_technical_mathematics !== null;
  if (!hasPerTypeData) return course.minimum_aps;
  if (hasMath) return course.aps_mathematics !== null ? course.aps_mathematics : Infinity;
  if (hasMathLit) return course.aps_mathematical_literacy !== null ? course.aps_mathematical_literacy : Infinity;
  if (hasTechMath) {
    if (course.aps_technical_mathematics !== null) return course.aps_technical_mathematics;
    if (course.aps_mathematics !== null) return course.aps_mathematics;
    return Infinity;
  }
  return course.minimum_aps;
}

// All learners have 6 subjects. Math subject varies.
// Other subjects at 65% (Level 5)
function makeMarks(mathSubject, mathPct) {
  return [
    { subject: mathSubject, mark: mathPct },
    { subject: "English Home Language", mark: 65 },
    { subject: "Life Sciences", mark: 65 },
    { subject: "Physical Sciences", mark: 65 },
    { subject: "Geography", mark: 65 },
    { subject: "History", mark: 65 },
  ];
}

function calcAPS(marks) {
  return marks
    .map((s) => percentageToNSCLevel(s.mark))
    .sort((a, b) => b - a)
    .slice(0, 6)
    .reduce((s, l) => s + l, 0);
}

// Learner A: Pure Maths L4 (55%), APS ~29
const learnerA = makeMarks("Mathematics", 55);
// Learner B: Tech Maths L4 (55%)
const learnerB = makeMarks("Technical Mathematics", 55);
// Learner C: Math Lit L4 (55%)
const learnerC = makeMarks("Mathematical Literacy", 55);

const apsA = calcAPS(learnerA);
const apsB = calcAPS(learnerB);
const apsC = calcAPS(learnerC);
console.log("APS - A (Maths L4):", apsA, "  B (TechMath L4):", apsB, "  C (MathLit L4):", apsC);

console.log("\n=== Key course tests ===");
const testCourses = [
  "B ARCHITECTURE",
  "BA (COMMUNICATION DESIGN)",
  "ACCOUNTING (CA)",
  "ACCOUNTANCY",
  "CIVIL ENGINEERING",
  "FOUNDATION PHASE TEACHING (Grade R-3)",
  "BA",
];

for (const name of testCourses) {
  const course = uj.courses.find((c) => c.name === name);
  if (!course) {
    console.log("\n" + name + ": NOT FOUND");
    continue;
  }
  const reqA = getRequiredAPS(course, learnerA);
  const reqB = getRequiredAPS(course, learnerB);
  const reqC = getRequiredAPS(course, learnerC);
  const qualA = apsA >= reqA;
  const qualB = apsB >= reqB;
  const qualC = apsC >= reqC;
  console.log("\n" + name + " [min_aps=" + course.minimum_aps + ", aps_m=" + course.aps_mathematics + ", aps_ml=" + course.aps_mathematical_literacy + ", aps_tm=" + course.aps_technical_mathematics + "]");
  console.log("  APS required:  Maths=" + reqA + "  TechMath=" + reqB + "  MathLit=" + reqC);
  console.log("  Qualifies:     A=" + qualA + "  B=" + qualB + "  C=" + qualC);
}

// Summary: which courses does each learner qualify for (APS only, no subject minimums)
console.log("\n=== Summary (APS gate only) ===");
for (const [label, marks] of [["A (Maths L4)", learnerA], ["B (TechMath L4)", learnerB], ["C (MathLit L4)", learnerC]]) {
  const aps = calcAPS(marks);
  const qualCount = uj.courses.filter((c) => {
    const req = getRequiredAPS(c, marks);
    return aps >= req;
  }).length;
  const blockedBy999 = uj.courses.filter((c) => {
    const req = getRequiredAPS(c, marks);
    return req === 999 || req === Infinity;
  }).length;
  console.log("  Learner " + label + ": APS=" + aps + ", qualifies for " + qualCount + "/" + uj.courses.length + " courses, blocked by sentinel/infinity: " + blockedBy999);
}
