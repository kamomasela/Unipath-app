const SUBJECT_GROUPS = [
  {
    label: "Core and Mainstream",
    options: [
      "Accounting",
      "Agricultural Management Practices",
      "Agricultural Sciences",
      "Agricultural Technology",
      "Business Studies",
      "Civil Technology",
      "Computer Applications Technology",
      "Consumer Studies",
      "Dance Studies",
      "Design",
      "Dramatic Arts",
      "Economics",
      "Electrical Technology",
      "Engineering Graphics and Design",
      "Geography",
      "History",
      "Hospitality Studies",
      "Information Technology",
      "Life Orientation",
      "Life Sciences",
      "Marine Sciences",
      "Mathematical Literacy",
      "Mathematics",
      "Mathematics (Paper 3)",
      "Mechanical Technology",
      "Music",
      "Physical Sciences",
      "Religion Studies",
      "Technical Mathematics",
      "Technical Sciences",
      "Tourism",
      "Visual Arts",
    ],
  },
  {
    label: "Technical Specialisations",
    options: [
      "Civil Technology (Civil Services)",
      "Civil Technology (Construction)",
      "Civil Technology (Woodworking)",
      "Electrical Technology (Digital Systems)",
      "Electrical Technology (Electronics)",
      "Electrical Technology (Power Systems)",
      "Mechanical Technology (Automotive)",
      "Mechanical Technology (Fitting and Machining)",
      "Mechanical Technology (Welding and Metalwork)",
    ],
  },
  {
    label: "Official SA Languages",
    options: [
      "Afrikaans Home Language",
      "Afrikaans First Additional Language",
      "Afrikaans Second Additional Language",
      "English Home Language",
      "English First Additional Language",
      "English Second Additional Language",
      "isiNdebele Home Language",
      "isiNdebele First Additional Language",
      "isiNdebele Second Additional Language",
      "isiXhosa Home Language",
      "isiXhosa First Additional Language",
      "isiXhosa Second Additional Language",
      "isiZulu Home Language",
      "isiZulu First Additional Language",
      "isiZulu Second Additional Language",
      "Sepedi Home Language",
      "Sepedi First Additional Language",
      "Sepedi Second Additional Language",
      "Sesotho Home Language",
      "Sesotho First Additional Language",
      "Sesotho Second Additional Language",
      "Setswana Home Language",
      "Setswana First Additional Language",
      "Setswana Second Additional Language",
      "SiSwati Home Language",
      "SiSwati First Additional Language",
      "SiSwati Second Additional Language",
      "South African Sign Language Home Language",
      "Tshivenda Home Language",
      "Tshivenda First Additional Language",
      "Tshivenda Second Additional Language",
      "Xitsonga Home Language",
      "Xitsonga First Additional Language",
      "Xitsonga Second Additional Language",
    ],
  },
  {
    label: "Other Approved Languages",
    options: [
      "Arabic Second Additional Language",
      "French Second Additional Language",
      "German Home Language",
      "German Second Additional Language",
      "Gujarati Home Language",
      "Gujarati First Additional Language",
      "Gujarati Second Additional Language",
      "Hebrew Second Additional Language",
      "Hindi Home Language",
      "Hindi First Additional Language",
      "Hindi Second Additional Language",
      "Italian Second Additional Language",
      "Latin Second Additional Language",
      "Portuguese Home Language",
      "Portuguese First Additional Language",
      "Portuguese Second Additional Language",
      "Spanish Second Additional Language",
      "Tamil Home Language",
      "Tamil First Additional Language",
      "Tamil Second Additional Language",
      "Telugu Home Language",
      "Telugu First Additional Language",
      "Telugu Second Additional Language",
      "Urdu Home Language",
      "Urdu First Additional Language",
      "Urdu Second Additional Language",
    ],
  },
  {
    label: "Legacy / Track-Specific",
    options: [
      "French First Additional Language (Abitur)",
      "German Mother Tongue (Abitur)",
      "History (Abitur)",
      "Biology (Abitur)",
      "Chemistry (Abitur)",
      "Physics (Abitur)",
    ],
  },
  {
    label: "IEB / Advanced Programme",
    options: [
      "Advanced Programme English",
      "Advanced Programme Afrikaans",
      "Advanced Programme Mathematics",
      "Advanced Programme Physics",
      "Advanced Programme French",
    ],
  },
];

const STORAGE_KEYS = {
  lastResult: "unipath_last_result_v4",
  rulesCache: "unipath_rules_cache_v3",
};

let universityRules = [];
let _currentScreen = 2; // tracks which screen is active: 2 = enter marks, 3 = aps list, 4 = results, 5 = improve, 6 = chances
let _lastEvaluation = null; // { input, evaluation } stored after each Calculate APS
const ENFORCE_SUBJECT_MINIMUMS = true;

const dom = {
  form: document.getElementById("aps-form"),
  gradeSource: document.getElementById("grade-source"),
  gradeSourceNotice: document.getElementById("grade-source-notice"),
  subjects: document.getElementById("subjects"),
  addSubjectBtn: document.getElementById("add-subject-btn"),
  resetAllBtn: document.getElementById("reset-all-btn"),
  viewProgramsBtn: document.getElementById("view-programs-btn"),
  whatIfBtn: document.getElementById("what-if-btn"),
  checkChancesBtn: document.getElementById("check-chances-btn"),
  subjectRowTemplate: document.getElementById("subject-row-template"),
  errors: document.getElementById("errors"),
  confidenceNotice: document.getElementById("confidence-notice"),
  results: document.getElementById("results"),
  apsListContainer: document.getElementById("aps-list"),
};

function isEnglishSubject(subject) {
  return subject.startsWith("English ");
}

function isMathChoice(subject) {
  return (
    subject === "Mathematics" ||
    subject === "Mathematical Literacy" ||
    subject === "Technical Mathematics"
  );
}

function isPredictiveGradeSource(gradeSource) {
  return gradeSource === "grade11_final" || gradeSource === "grade12_midyear";
}

function getConfidenceLabel(gradeSource) {
  if (gradeSource === "grade11_final") return "Moderate";
  if (gradeSource === "grade12_midyear") return "High";
  return "Confirmed";
}

function updateGradeSourceNotice() {
  if (dom.gradeSource.value === "grade11_final") {
    dom.gradeSourceNotice.textContent = "Please enter your final Grade 11 year-end marks only.";
    return;
  }
  dom.gradeSourceNotice.textContent = "";
}

function populateSubjectSelect(select, query = "", selectedSubject = "") {
  const normalizedQuery = query.trim().toLowerCase();
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = normalizedQuery ? "Select subject (filtered)" : "Select subject";
  select.appendChild(placeholder);

  let totalMatches = 0;
  SUBJECT_GROUPS.forEach((group) => {
    const matches = group.options.filter((subject) => subject.toLowerCase().includes(normalizedQuery));
    if (!matches.length) return;

    const optGroup = document.createElement("optgroup");
    optGroup.label = group.label;
    matches.forEach((subject) => {
      const opt = document.createElement("option");
      opt.value = subject;
      opt.textContent = subject;
      optGroup.appendChild(opt);
      totalMatches += 1;
    });
    select.appendChild(optGroup);
  });

  if (!totalMatches) {
    const none = document.createElement("option");
    none.value = "";
    none.disabled = true;
    none.textContent = "No matching subjects";
    select.appendChild(none);
  }

  select.value = selectedSubject;
}

function percentageToNSCLevel(mark) {
  if (mark >= 80) return 7;
  if (mark >= 70) return 6;
  if (mark >= 60) return 5;
  if (mark >= 50) return 4;
  if (mark >= 40) return 3;
  if (mark >= 30) return 2;
  return 1;
}

function pointsOtherFromMark(mark) {
  if (mark >= 90) return 8;
  if (mark >= 80) return 7;
  if (mark >= 70) return 6;
  if (mark >= 60) return 5;
  if (mark >= 50) return 4;
  if (mark >= 40) return 3;
  if (mark >= 30) return 2;
  return 0;
}

function pointsEnglishMathWits(mark) {
  if (mark >= 90) return 10;
  if (mark >= 80) return 9;
  if (mark >= 70) return 8;
  if (mark >= 60) return 7;
  if (mark >= 50) return 4;
  if (mark >= 40) return 3;
  return 0;
}

function pointsLifeOrientationWits(mark) {
  if (mark >= 90) return 4;
  if (mark >= 80) return 3;
  if (mark >= 70) return 2;
  if (mark >= 60) return 1;
  return 0;
}

function pointsUwcEnglishMath(mark) {
  if (mark >= 90) return 15;
  if (mark >= 80) return 13;
  if (mark >= 70) return 11;
  if (mark >= 60) return 9;
  if (mark >= 50) return 7;
  if (mark >= 40) return 5;
  if (mark >= 30) return 3;
  if (mark >= 20) return 1;
  return 0;
}

function pointsUwcOther(mark) {
  if (mark >= 90) return 8;
  if (mark >= 80) return 7;
  if (mark >= 70) return 6;
  if (mark >= 60) return 5;
  if (mark >= 50) return 4;
  if (mark >= 40) return 3;
  if (mark >= 30) return 2;
  if (mark >= 20) return 1;
  return 0;
}

function pointsUwcLO(mark) {
  if (mark >= 80) return 3;
  if (mark >= 50) return 2;
  if (mark >= 20) return 1;
  return 0;
}

function addSubjectRow(selectedSubject = "", mark = "") {
  const node = dom.subjectRowTemplate.content.cloneNode(true);
  const row = node.querySelector(".subject-row");
  const searchInput = node.querySelector(".subject-search");
  const select = node.querySelector(".subject-select");
  const input = node.querySelector(".mark-input");
  const removeBtn = node.querySelector(".remove-subject");

  searchInput.value = selectedSubject || "";
  populateSubjectSelect(select, searchInput.value, selectedSubject);
  searchInput.addEventListener("input", () => populateSubjectSelect(select, searchInput.value, select.value));
  select.addEventListener("change", () => {
    if (select.value) searchInput.value = select.value;
  });

  input.value = mark;
  removeBtn.addEventListener("click", () => row.remove());
  dom.subjects.appendChild(node);
}

function collectInput() {
  const rows = dom.subjects.querySelectorAll(".subject-row");
  const subjectMarks = [];
  const errors = [];
  const seen = new Set();

  if (!rows.length) errors.push("Add at least one subject.");

  rows.forEach((row, index) => {
    const subject = row.querySelector(".subject-select").value;
    const markValue = row.querySelector(".mark-input").value;
    const mark = Number(markValue);

    if (!subject) {
      errors.push(`Row ${index + 1}: select a subject.`);
      return;
    }
    if (seen.has(subject)) {
      errors.push(`Row ${index + 1}: duplicate subject "${subject}".`);
      return;
    }
    seen.add(subject);
    if (markValue === "" || Number.isNaN(mark) || mark < 0 || mark > 100 || !Number.isInteger(mark)) {
      errors.push(`Row ${index + 1}: mark must be an integer between 0 and 100.`);
      return;
    }
    subjectMarks.push({ subject, mark });
  });

  const nonLO = subjectMarks.filter((s) => s.subject !== "Life Orientation");
  if (nonLO.length < 6) errors.push("Enter at least 6 subjects excluding Life Orientation.");
  if (!subjectMarks.some((s) => isEnglishSubject(s.subject))) {
    errors.push("English (HL or FAL) is compulsory.");
  }
  if (!subjectMarks.some((s) => isMathChoice(s.subject))) {
    errors.push("Select Mathematics, Mathematical Literacy, or Technical Mathematics.");
  }

  return { gradeSource: dom.gradeSource.value, subjectMarks, errors };
}

function calculateAPS(university, subjectMarks) {
  const formula = university.aps_formula || "nsc_top6_excl_lo";

  if (formula === "uct_percentage_sum_top6_excl_lo") {
    const english = subjectMarks.find((s) => isEnglishSubject(s.subject));
    const nonLO = subjectMarks.filter((s) => s.subject !== "Life Orientation");
    if (!english) return 0;
    const others = nonLO
      .filter((s) => s.subject !== english.subject)
      .sort((a, b) => b.mark - a.mark)
      .slice(0, 5);
    return [english, ...others].reduce((sum, s) => sum + s.mark, 0);
  }

  if (formula === "uwc_weighted_points") {
    return subjectMarks.reduce((sum, s) => {
      if (s.subject === "Life Orientation") return sum + pointsUwcLO(s.mark);
      if (isEnglishSubject(s.subject) || isMathChoice(s.subject)) return sum + pointsUwcEnglishMath(s.mark);
      return sum + pointsUwcOther(s.mark);
    }, 0);
  }

  if (formula === "wits_weighted_best7_including_lo") {
    const scored = subjectMarks.map((s) => {
      if (s.subject === "Life Orientation") return { ...s, points: pointsLifeOrientationWits(s.mark) };
      if (isEnglishSubject(s.subject) || isMathChoice(s.subject)) return { ...s, points: pointsEnglishMathWits(s.mark) };
      return { ...s, points: pointsOtherFromMark(s.mark) };
    });
    return scored.sort((a, b) => b.points - a.points).slice(0, 7).reduce((sum, s) => sum + s.points, 0);
  }

  if (formula === "sun_selection_mark_average") {
    const nonLO = subjectMarks.filter((s) => s.subject !== "Life Orientation");
    const top6 = [...nonLO].sort((a, b) => b.mark - a.mark).slice(0, 6);
    if (!top6.length) return 0;
    return Math.round(top6.reduce((sum, s) => sum + s.mark, 0) / top6.length);
  }

  // Default: NSC top 6 levels excluding Life Orientation.
  const filtered = subjectMarks.filter((entry) => university.include_life_orientation || entry.subject !== "Life Orientation");
  const top6 = [...filtered].map((entry) => ({ ...entry, level: percentageToNSCLevel(entry.mark) })).sort((a, b) => b.level - a.level).slice(0, 6);
  return top6.reduce((total, entry) => total + entry.level, 0);
}

function checkSubjectMinimums(subjectMarks, requirements) {
  if (!ENFORCE_SUBJECT_MINIMUMS) return [];
  const SUBJECT_EQUIVALENTS = {
    Mathematics: [
      "Mathematics",
      "Advanced Programme Mathematics",
      "Technical Mathematics",
      "Mathematics (Paper 3)",
    ],
    "Mathematical Literacy": [
      "Mathematical Literacy",
      "Mathematics",
      "Technical Mathematics",
      "Advanced Programme Mathematics",
    ],
    "Physical Sciences": [
      "Physical Sciences",
      "Technical Sciences",
      "Advanced Programme Physics",
      "Physics (Abitur)",
      "Chemistry (Abitur)",
    ],
    "Life Sciences": [
      "Life Sciences",
      "Marine Sciences",
      "Biology (Abitur)",
    ],
  };

  const resolveAllowedSubjects = (requiredSubject) =>
    SUBJECT_EQUIVALENTS[requiredSubject] || [requiredSubject];

  const standalone = [];
  const orGroups = {};
  (requirements || []).forEach((rule) => {
    if (rule.or_group != null) {
      if (!orGroups[rule.or_group]) orGroups[rule.or_group] = [];
      orGroups[rule.or_group].push(rule);
    } else {
      standalone.push(rule);
    }
  });

  const failed = [];

  standalone.forEach((rule) => {
    const allowedSubjects = resolveAllowedSubjects(rule.subject);
    const found = subjectMarks.find((x) => allowedSubjects.includes(x.subject));
    if (!found || percentageToNSCLevel(found.mark) < rule.minimum_mark) {
      failed.push(rule);
    }
  });

  Object.values(orGroups).forEach((groupRules) => {
    const anyPasses = groupRules.some((rule) => {
      const allowedSubjects = resolveAllowedSubjects(rule.subject);
      const found = subjectMarks.find((x) => allowedSubjects.includes(x.subject));
      return found && percentageToNSCLevel(found.mark) >= rule.minimum_mark;
    });
    if (!anyPasses) {
      failed.push(groupRules[0]);
    }
  });

  return failed;
}

function formatSubjectRequirements(subjectMinimums) {
  if (!subjectMinimums || !subjectMinimums.length) return null;

  const standalone = [];
  const orGroups = {};
  subjectMinimums.forEach((rule) => {
    if (rule.or_group != null) {
      if (!orGroups[rule.or_group]) orGroups[rule.or_group] = [];
      orGroups[rule.or_group].push(rule);
    } else {
      standalone.push(rule);
    }
  });

  const lines = [];
  standalone.forEach((rule) => lines.push(`${rule.subject} (Level ${rule.minimum_mark})`));
  Object.values(orGroups).forEach((groupRules) => {
    lines.push(groupRules.map((r) => `${r.subject} (Level ${r.minimum_mark})`).join(" or "));
  });
  return lines;
}

function getRequiredAPS(course, subjectMarks) {
  // Return the APS threshold that applies to this student's mathematics type.
  //
  // If the course has ANY per-type APS data set (at least one of aps_mathematics,
  // aps_mathematical_literacy, aps_technical_mathematics is non-null), then the
  // course uses per-type admission: the student's math type must have a non-null
  // entry or they are ineligible (return Infinity so aps < required is always true).
  //
  // If the course has NO per-type data (all three null), any math type is accepted
  // and we fall back to minimum_aps.
  const hasMath = subjectMarks.some((s) => s.subject === 'Mathematics');
  const hasMathLit = subjectMarks.some((s) => s.subject === 'Mathematical Literacy');
  const hasTechMath = subjectMarks.some((s) => s.subject === 'Technical Mathematics');

  const hasPerTypeData =
    course.aps_mathematics != null ||
    course.aps_mathematical_literacy != null ||
    course.aps_technical_mathematics != null;

  if (!hasPerTypeData) {
    // No per-type data: flat threshold, any math type accepted
    return course.minimum_aps;
  }

  // Per-type data exists: return the threshold for student's math type,
  // or Infinity if this programme does not accept that math type.
  if (hasMath) {
    return course.aps_mathematics != null ? course.aps_mathematics : Infinity;
  }
  if (hasMathLit) {
    return course.aps_mathematical_literacy != null ? course.aps_mathematical_literacy : Infinity;
  }
  if (hasTechMath) {
    // TechMath: use the dedicated threshold when set; otherwise fall back to
    // the Mathematics threshold (TechMath is treated as equivalent to Maths for
    // programmes that pre-date its inclusion). If neither is set, ineligible.
    if (course.aps_technical_mathematics != null) return course.aps_technical_mathematics;
    if (course.aps_mathematics != null) return course.aps_mathematics;
    return Infinity;
  }
  // No recognised math subject: fall back to minimum_aps
  return course.minimum_aps;
}

function classifyProgramme({ aps, minimumAPS, failedSubjectMinimums, competitive, gradeSource }) {
  if (failedSubjectMinimums.length > 0) {
    return {
      classification: "NOT_ELIGIBLE",
      reason: `Subject minimum gap: ${failedSubjectMinimums
        .map((r) => `${r.subject} Level ${r.minimum_mark}`)
        .join(", ")}`,
    };
  }

  if (aps < minimumAPS) {
    return {
      classification: "NOT_ELIGIBLE",
      reason: `APS ${aps} is below minimum ${minimumAPS}.`,
    };
  }

  return {
    classification: "QUALIFY",
    reason: `APS ${aps} meets minimum ${minimumAPS}.`,
  };
}

function evaluateUniversity(university, gradeSource, subjectMarks) {
  if (university.status !== "active") {
    return {
      universityId: university.id,
      universityName: university.name,
      status: "unavailable",
      message: university.unavailable_reason || "No verified active rule set available.",
      programmes: [],
      allProgrammes: [],
    };
  }

  if (gradeSource === "grade12_final" && !university.supports_grade12) {
    return {
      universityId: university.id,
      universityName: university.name,
      status: "skipped",
      message: "Final Grade 12 results are not enabled for this university.",
      programmes: [],
      allProgrammes: [],
    };
  }

  const aps = calculateAPS(university, subjectMarks);
  const programmes = (university.courses || []).map((course) => {
    const failedSubjectMinimums = checkSubjectMinimums(subjectMarks, course.subject_minimums);
    const requiredAPS = getRequiredAPS(course, subjectMarks);
    const classificationData = classifyProgramme({
      aps,
      minimumAPS: requiredAPS,
      failedSubjectMinimums,
      competitive: Boolean(course.competitive_flag),
      gradeSource,
    });

    return {
      name: course.name,
      minimumAPS: requiredAPS,
      classification: classificationData.classification,
      reason: classificationData.reason,
      subjectMinimums: course.subject_minimums || [],
      competitive: Boolean(course.competitive_flag),
      stream: course.mainstream_or_extended || "mainstream",
    };
  });

  const eligibleProgrammes = programmes.filter((p) =>
    p.classification === "QUALIFY"
  );

  return {
    universityId: university.id,
    universityName: university.name,
    status: eligibleProgrammes.length ? "visible" : "hidden",
    aps,
    apsFormula: university.aps_formula || "nsc_top6_excl_lo",
    applicationFee: university.application_fee || "Not provided",
    ruleVersion: university.rule_version || "unknown",
    confidence: university.extraction_confidence,
    programmes: eligibleProgrammes,
    allProgrammes: programmes,
    eligibleProgrammes,
  };
}

function evaluateForInput(input) {
  const evaluated = universityRules.map((uni) => evaluateUniversity(uni, input.gradeSource, input.subjectMarks));
  const visible = evaluated.filter((u) => u.status === "visible");
  const totalEligible = visible.reduce((sum, u) => sum + u.eligibleProgrammes.length, 0);
  return { evaluated, visible, totalEligible };
}

function renderImprovementModel(input, baselineTotal) {
  if (!dom.improvementModel) return;
  const improvements = [];
  input.subjectMarks.forEach((entry, index) => {
    if (entry.mark >= 100) return;
    const nextMark = Math.min(100, entry.mark + 10);
    const cloned = input.subjectMarks.map((s, i) =>
      i === index ? { ...s, mark: nextMark } : { ...s }
    );
    const scenario = evaluateForInput({
      gradeSource: input.gradeSource,
      subjectMarks: cloned,
    });
    const unlocked = scenario.totalEligible - baselineTotal;
    if (unlocked > 0) {
      improvements.push(
        `${entry.subject}: ${entry.mark}% -> ${nextMark}% unlocks ${unlocked} programme(s)`
      );
    }
  });

  if (!improvements.length) {
    dom.improvementModel.innerHTML = "";
    return;
  }

  dom.improvementModel.innerHTML = `
    <p><strong>Improvement Modelling</strong></p>
    <ul>${improvements.map((i) => `<li>${i}</li>`).join("")}</ul>
  `;
}

function showScreen(n) {
  [2, 3, 4, 5, 6].forEach((s) => {
    const el = document.getElementById("screen-" + s);
    if (el) el.classList.toggle("active", s === n);
  });
  const views = { 3: "aps", 4: "results", 5: "improve", 6: "chances" };
  if (views[n]) {
    if (_currentScreen === n) {
      history.replaceState({ view: views[n] }, "");
    } else {
      history.pushState({ view: views[n] }, "");
    }
  }
  _currentScreen = n;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderScreen5() {
  if (!_lastEvaluation) return;
  const { input, evaluation } = _lastEvaluation;
  const baselineTotal = evaluation.totalEligible;
  const container = document.getElementById("improvement-detail");
  if (!container) return;

  const improvements = [];
  input.subjectMarks.forEach((entry, index) => {
    if (entry.mark >= 100) return;
    const nextMark = Math.min(100, entry.mark + 10);
    const cloned = input.subjectMarks.map((s, i) =>
      i === index ? { ...s, mark: nextMark } : { ...s }
    );
    const scenario = evaluateForInput({ gradeSource: input.gradeSource, subjectMarks: cloned });
    const unlocked = scenario.totalEligible - baselineTotal;
    if (unlocked > 0) {
      improvements.push({ subject: entry.subject, mark: entry.mark, nextMark, unlocked });
    }
  });

  if (!improvements.length) {
    container.innerHTML = "<p class='small' style='margin-top:0.75rem'>No improvements modelled — you may already qualify for the maximum available programmes.</p>";
    return;
  }

  container.innerHTML = improvements.map((item) =>
    `<div class="improve-row">
      <div class="improve-subject">${item.subject}</div>
      <div class="improve-detail">
        <span class="improve-marks">${item.mark}% → ${item.nextMark}%</span>
        <span class="improve-unlock">unlocks ${item.unlocked} programme${item.unlocked !== 1 ? "s" : ""}</span>
      </div>
    </div>`
  ).join("");
}

function renderChancesDetail(uni, container) {
  const notEligible = (uni.allProgrammes || [])
    .filter((p) => p.classification === "NOT_ELIGIBLE")
    .sort((a, b) => a.minimumAPS - b.minimumAPS);

  if (!notEligible.length) {
    container.innerHTML = "<p class='small'>No programme data available for this university.</p>";
    return;
  }

  const programmesHtml = notEligible.map((p) => {
    const reqLines = formatSubjectRequirements(p.subjectMinimums);
    const reqHtml = reqLines
      ? `<ul class="subject-req-list">${reqLines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<span class="muted">None required</span>`;
    return `<div class="chances-programme">
      <div class="chances-prog-header">
        <strong>${p.name}</strong>
        <span class="stream-badge">${p.stream}</span>
      </div>
      <p class="small chances-reason">${p.reason}</p>
      <div class="subject-reqs">
        <span class="subject-reqs-label">Requirements:</span>
        ${reqHtml}
      </div>
    </div>`;
  }).join("");

  container.innerHTML =
    `<div class="chances-uni-header">
      <span class="small">Your APS for this university: <strong>${uni.aps}</strong></span>
    </div>` + programmesHtml;
}

function renderScreen6() {
  if (!_lastEvaluation) return;
  const { evaluation } = _lastEvaluation;
  const hiddenUnis = evaluation.evaluated.filter((u) =>
    (u.allProgrammes || []).some((p) => p.classification === "NOT_ELIGIBLE")
  );
  const select = document.getElementById("chances-uni-select");
  const detail = document.getElementById("chances-detail");
  if (!select || !detail) return;

  select.innerHTML = '<option value="">— Select a university —</option>' +
    hiddenUnis.map((u) =>
      `<option value="${u.universityId}">${u.universityName}</option>`
    ).join("");
  detail.innerHTML = "";

  select.onchange = () => {
    const uniId = select.value;
    if (!uniId) { detail.innerHTML = ""; return; }
    const uni = hiddenUnis.find((u) => u.universityId === uniId);
    if (!uni) return;
    renderChancesDetail(uni, detail);
  };
}

function renderAPSScreen(visibleUniversities) {
  const container = dom.apsListContainer;
  if (!container) return;
  if (!visibleUniversities.length) {
    container.innerHTML = "<p class='small' style='margin-top:0.75rem'>No qualifying universities found for this profile.</p>";
    return;
  }
  container.innerHTML = '<div class="aps-uni-list">' +
    visibleUniversities.map((u) =>
      `<div class="aps-uni-row">
        <span class="aps-uni-name">${u.universityName}</span>
        <span class="aps-uni-score">${u.aps}</span>
      </div>`
    ).join("") +
  "</div>";
}

function renderResults(visibleUniversities) {
  dom.results.innerHTML = "";
  if (!visibleUniversities.length) {
    dom.results.innerHTML = "<p class='small'>No eligible universities/programmes for this profile yet.</p>";
    return;
  }

  visibleUniversities.forEach((result) => {
    const displayProgrammes = (result.programmes || result.eligibleProgrammes || []).filter((p) =>
      p.classification === "QUALIFY"
    );
    const count = displayProgrammes.length;

    const programmesHtml = displayProgrammes
      .map((p) => {
        const reqLines = formatSubjectRequirements(p.subjectMinimums);
        const reqHtml = reqLines
          ? `<ul class="subject-req-list">${reqLines.map((l) => `<li>${l}</li>`).join("")}</ul>`
          : `<span class="muted">None required</span>`;
        return `<li class="accordion-programme">
          <div class="accordion-programme-header">
            <strong>${p.name}</strong>
            <span class="stream-badge">${p.stream}</span>
          </div>
          <span class="small">${p.reason}</span>
          <div class="subject-reqs">
            <span class="subject-reqs-label">Subject Requirements:</span>
            ${reqHtml}
          </div>
        </li>`;
      })
      .join("");

    const card = document.createElement("article");
    card.className = "university-card accordion-card";
    card.innerHTML = `
      <button type="button" class="accordion-toggle" aria-expanded="false">
        <span class="accordion-uni-name">${result.universityName}</span>
        <span class="accordion-meta">
          <span class="badge">${count} programme${count !== 1 ? "s" : ""}</span>
          <svg class="accordion-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
      <div class="accordion-body">
        <ul class="accordion-programme-list">${programmesHtml}</ul>
      </div>
    `;

    const toggle = card.querySelector(".accordion-toggle");
    const body = card.querySelector(".accordion-body");
    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      body.style.maxHeight = isOpen ? "0" : body.scrollHeight + "px";
    });

    dom.results.appendChild(card);
  });
}


// ---------------------------------------------------------------------------
// IIE PRIVATE UNIVERSITIES (NSC Pass Type Based)
// ---------------------------------------------------------------------------

const IIE_UNIVERSITIES = [
  {
    id: 'emeris',
    name: 'Emeris (IIE Varsity College)',
    programmes: [
      // Higher Certificate (NQF 5) — HC pass, English 30%, 40% in any 3 non-LO subjects
      { name: 'IIE Higher Certificate in Business Principles and Practice', faculty: 'Faculty of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      { name: 'IIE Higher Certificate in Communication Practice', faculty: 'Faculty of Humanities', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      { name: 'IIE Higher Certificate in Creative Development', faculty: 'Vega School', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      { name: 'IIE Higher Certificate in Digital Marketing', faculty: 'Vega School', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      { name: 'IIE Higher Certificate in Early Childhood Care and Education', faculty: 'Faculty of Education', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      { name: 'IIE Higher Certificate in Hospitality Management', faculty: 'Faculty of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      { name: 'IIE Higher Certificate in Human Resource Practices', faculty: 'Faculty of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      { name: 'IIE Higher Certificate in Legal Studies', faculty: 'Faculty of Law', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      { name: 'IIE Higher Certificate in Logistics and Supply Chain Management', faculty: 'Faculty of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      { name: 'IIE Higher Certificate in Mobile Application and Web Development', faculty: 'School of Computer Science', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 3, pct: 40 } },
      // Bachelor (NQF 7) — Bachelor's pass required
      { name: 'IIE Bachelor of Accounting', faculty: 'School of Finance and Accounting', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Arts', faculty: 'Faculty of Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Arts in Interior Design', faculty: 'Vega School', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Arts in Law', faculty: 'Faculty of Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Arts in Strategic Brand Communication', faculty: 'Vega School', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Business Administration', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Business Administration in Logistics and Supply Chain Management', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Commerce', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Commerce in Digital Marketing', faculty: 'Vega School', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Commerce in Entrepreneurship', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Commerce in Law', faculty: 'Faculty of Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Commerce in Strategic Brand Management', faculty: 'Vega School', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Communication Design', faculty: 'Vega School', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Computer and Information Science in Application Development', faculty: 'School of Computer Science', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Computer and Information Sciences in Game Design and Development', faculty: 'Vega School', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Education in Foundation Phase Teaching', faculty: 'Faculty of Education', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: [{ subject: 'First Additional Language', min: 40 }], minNSubjectsAt: null },
      { name: 'IIE Bachelor of Education in Intermediate Phase Teaching', faculty: 'Faculty of Education', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: [{ subject: 'First Additional Language', min: 40 }], minNSubjectsAt: null },
      // Engineering (NQF 8) — Pure Mathematics only
      { name: 'IIE Bachelor of Engineering in Civil Engineering (4yr)', faculty: 'School of Engineering, Science and Health', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 70, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 60 }], minNSubjectsAt: null },
      { name: 'IIE Bachelor of Engineering in Civil Engineering (5yr)', faculty: 'School of Engineering, Science and Health', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 60, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 50 }], minNSubjectsAt: null },
      { name: 'IIE Bachelor of Engineering in Electrical and Electronic Engineering (4yr)', faculty: 'School of Engineering, Science and Health', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 70, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 60 }], minNSubjectsAt: null },
      { name: 'IIE Bachelor of Engineering in Electrical and Electronic Engineering (5yr)', faculty: 'School of Engineering, Science and Health', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 60, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 50 }], minNSubjectsAt: null },
      { name: 'IIE Bachelor of Engineering in Mechanical Engineering (4yr)', faculty: 'School of Engineering, Science and Health', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 70, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 60 }], minNSubjectsAt: null },
      { name: 'IIE Bachelor of Engineering in Mechanical Engineering (5yr)', faculty: 'School of Engineering, Science and Health', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 60, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 50 }], minNSubjectsAt: null },
      // Other Bachelor (NQF 7/8)
      { name: 'IIE Bachelor of Experience Design', faculty: 'Vega School', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Hospitality Management', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Laws (LLB)', faculty: 'Faculty of Law', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Public Health', faculty: 'School of Engineering, Science and Health', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Social Science', faculty: 'Faculty of Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
    ],
  },
  {
    id: 'rosebank',
    name: 'Rosebank College (IIE)',
    programmes: [
      // Higher Certificate (NQF 5) — HC pass, English 30%, no specific maths or minN requirement
      { name: 'IIE Higher Certificate in Business Management', faculty: 'Faculty of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Higher Certificate in Bookkeeping', faculty: 'Faculty of Finance and Accounting', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Higher Certificate in Business Principles and Practice', faculty: 'Faculty of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Higher Certificate in Legal Studies', faculty: 'Faculty of Law', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Higher Certificate in Communication Practice', faculty: 'Faculty of Humanities and Social Science', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Higher Certificate in Early Childhood Care and Education', faculty: 'Faculty of Education', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Higher Certificate in IT in Support Services', faculty: 'Faculty of Information and Communications Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Higher Certificate in Construction and Engineering Drafting', faculty: 'Faculty of Information and Communications Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Higher Certificate in Human Resource Practices', faculty: 'Faculty of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Higher Certificate in Logistics and Supply Chain Management', faculty: 'Faculty of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      // Diploma (NQF 6) — accept HC pass or Diploma pass (min: hc)
      { name: 'IIE Diploma in Commerce in Business Management', faculty: 'Faculty of Commerce', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Diploma in Digital Marketing', faculty: 'Faculty of Commerce', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Diploma in Human Resource Management Practice', faculty: 'Faculty of Commerce', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Diploma in Logistics and Supply Chain Management', faculty: 'Faculty of Commerce', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Diploma in IT in Software Development', faculty: 'Faculty of Information and Communications Technology', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Diploma in IT in Network Management', faculty: 'Faculty of Information and Communications Technology', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Diploma in Information Technology Management', faculty: 'Faculty of Information and Communications Technology', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Diploma in Journalism Studies', faculty: 'Faculty of Humanities and Social Science', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7) — Bachelor's pass required
      { name: 'IIE Bachelor of Arts', faculty: 'Faculty of Humanities and Social Science', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Social Science', faculty: 'Faculty of Humanities and Social Science', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Commerce', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Business Administration', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Business Administration in Logistics and Supply Chain Management', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Public Administration', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Accounting', faculty: 'Faculty of Finance and Accounting', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Arts in Law', faculty: 'Faculty of Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Commerce in Law', faculty: 'Faculty of Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'IIE Bachelor of Education in Foundation Phase Teaching', faculty: 'Faculty of Education', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, otherSubjects: [{ subject: 'First Additional Language', min: 40 }], minNSubjectsAt: null },
      { name: 'IIE Bachelor of Education in Intermediate Phase Teaching', faculty: 'Faculty of Education', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, otherSubjects: [{ subject: 'First Additional Language', min: 40 }], minNSubjectsAt: null },
      { name: 'IIE Bachelor of Computer and Information Sciences in Application Development', faculty: 'Faculty of Information and Communications Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      { name: 'IIE Bachelor of Computer and Information Sciences in Network Management', faculty: 'Faculty of Information and Communications Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: { count: 4, pct: 50 } },
      // LLB (NQF 8)
      { name: 'IIE Bachelor of Laws (LLB)', faculty: 'Faculty of Law', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 50 }, otherSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'iie_msa',
    name: 'IIE MSA',
    programmes: [
      // Higher Certificate (NQF 5)
      { name: 'Higher Certificate in Business Principles and Practice', faculty: 'Faculty of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Communication Practices', faculty: 'Faculty of Humanities', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Early Childhood Care and Education', faculty: 'Faculty of Education', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Legal Studies', faculty: 'Faculty of Law', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Mobile Application and Web Development', faculty: 'Faculty of Science and Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7)
      { name: 'Bachelor of Accounting', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 80, techMath: 'not_accepted' }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Arts', faculty: 'Faculty of Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 60, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 'not_accepted' }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Economics', faculty: 'Faculty of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 80, techMath: 'not_accepted' }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Law', faculty: 'Faculty of Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 30, mathLit: 50, techMath: 'not_accepted' }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Computer and Information Sciences in Application Development', faculty: 'Faculty of Science and Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: { pure: 40, mathLit: 60, techMath: 'not_accepted' }, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Education in Foundation Phase Teaching', faculty: 'Faculty of Education', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, otherSubjects: [{ subject: 'First Additional Language', min: 40 }], minNSubjectsAt: null },
      { name: 'Bachelor of Education in Intermediate Phase Teaching', faculty: 'Faculty of Education', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, otherSubjects: [{ subject: 'First Additional Language', min: 40 }], minNSubjectsAt: null },
      { name: 'Bachelor of Public Health', faculty: 'Faculty of Science and Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Social Science', faculty: 'Faculty of Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      // Engineering (NQF 8) — Pure Mathematics only
      { name: 'Bachelor of Engineering in Civil Engineering (4-year)', faculty: 'Faculty of Science and Technology', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 70, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 60 }], minNSubjectsAt: null },
      { name: 'Bachelor of Engineering in Electrical and Electronic Engineering (4-year)', faculty: 'Faculty of Science and Technology', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 70, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 60 }], minNSubjectsAt: null },
      { name: 'Bachelor of Engineering in Electrical and Electronic Engineering (5-year)', faculty: 'Faculty of Science and Technology', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 60, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 50 }], minNSubjectsAt: null },
      { name: 'Bachelor of Engineering in Mechanical Engineering (4-year)', faculty: 'Faculty of Science and Technology', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 70, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 60 }], minNSubjectsAt: null },
      { name: 'Bachelor of Engineering in Mechanical Engineering (5-year)', faculty: 'Faculty of Science and Technology', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 60, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Physical Sciences', min: 50 }], minNSubjectsAt: null },
      // LLB (NQF 8)
      { name: 'Bachelor of Laws (LLB)', faculty: 'Faculty of Law', nqfLevel: 8, passType: 'bachelors', minEnglish: 60, mathReq: { pure: 50, mathLit: 60, techMath: 'not_accepted' }, otherSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'boston',
    name: 'Boston City Campus',
    programmes: [
      // Higher Certificate (NQF 5) — HC pass, English passed, no maths requirement
      { name: 'Higher Certificate in Business Management Practice', faculty: 'Business Administration and Service', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Accounting Practice', faculty: 'Accounting and Financial Services', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Human Resource Management Practice', faculty: 'Business Administration and Service', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Logistics and Supply Chain Management Practice', faculty: 'Business Administration and Service', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Marketing Practice', faculty: 'Business Administration and Service', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Public Relations Practice', faculty: 'Humanities and Social Science', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in IT Support Services', faculty: 'Information and Communications Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Early Childhood Care and Education', faculty: 'Education', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      // Diploma (NQF 6) — Diploma pass required (Boston specifies Diploma pass, not HC pass)
      { name: 'Diploma in Business Management', faculty: 'Business Administration and Service', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Financial Accounting', faculty: 'Accounting and Financial Services', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: [{ subject: 'Accounting', min: 50 }], minNSubjectsAt: null },
      { name: 'Diploma in Human Resource Management', faculty: 'Business Administration and Service', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Marketing Management', faculty: 'Business Administration and Service', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Event Management', faculty: 'Business Administration and Service', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Systems Development', faculty: 'Information and Communications Technology', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Network Systems', faculty: 'Information and Communications Technology', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Office Administration', faculty: 'Business Administration and Service', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Commerce in Public Relations', faculty: 'Humanities and Social Science', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7/8) — Bachelor's pass required
      { name: 'Bachelor of Accounting', faculty: 'Accounting and Financial Services', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: { pure: 30, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: [{ subject: 'Accounting', min: 30 }], minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Marketing Management', faculty: 'Business Administration and Service', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Human Resource Management', faculty: 'Business Administration and Service', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Law', faculty: 'Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Social Science', faculty: 'Humanities and Social Science', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Laws (LLB)', faculty: 'Law', nqfLevel: 8, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'richfield',
    name: 'Richfield Graduate Institute of Technology',
    programmes: [
      // Higher Certificate (NQF 5) — any NSC pass type accepted (minimum: HC pass)
      { name: 'Higher Certificate in Information Technology', faculty: 'Faculty of Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Business Administration', faculty: 'Faculty of Business Science', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Office Administration', faculty: 'Faculty of Business Science', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Local Government Management', faculty: 'Faculty of Business Science', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Diploma (NQF 6) — any NSC pass type accepted (minimum: HC pass)
      { name: 'Diploma in Information Technology', faculty: 'Faculty of Information Technology', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Business Administration', faculty: 'Faculty of Business Science', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Local Government Management', faculty: 'Faculty of Business Science', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Public Sector Accounting', faculty: 'Faculty of Business Science', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7) — Bachelor's pass required
      { name: 'Bachelor of Science in Information Technology', faculty: 'Faculty of Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: { pure: 30, mathLit: 'not_accepted', techMath: 'not_accepted' }, otherSubjects: null, minOneOfSubjects: { subjects: ['Physical Sciences', 'Life Sciences', 'Information Technology', 'Computer Applications Technology'], min: 30 }, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce', faculty: 'Faculty of Business Science', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Business Administration', faculty: 'Faculty of Business Science', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Public Management', faculty: 'Faculty of Business Science', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'ctu',
    name: 'CTU Training Solutions',
    programmes: [
      // Higher Certificate (NQF 5)
      { name: 'Higher Certificate in Management', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Graphic Design', faculty: 'Design', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Diploma (NQF 6) — Diploma pass required
      { name: 'Diploma in Visual Communication', faculty: 'Design', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in IT Network Design and Administration', faculty: 'Information Technology', nqfLevel: 6, passType: 'diploma', minEnglish: 40, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7)
      { name: 'Bachelor of Business Administration in Project Management', faculty: 'Business and Management', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Occupational Certificates
      { name: 'Software Developer', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Software Engineer', faculty: 'Information Technology', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Artificial Intelligence Software Developer', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Data Science Practitioner', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Cybersecurity Analyst', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Cloud Administrator', faculty: 'Information Technology', nqfLevel: 4, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Internet-of-Things Developer', faculty: 'Information Technology', nqfLevel: 4, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Computer Technician', faculty: 'Information Technology', nqfLevel: 4, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Project Manager', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: { pure: 30, mathLit: 30, techMath: null }, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Human Resource Management', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Management Accounting Officer', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Early Childhood Development', faculty: 'Business and Humanities', nqfLevel: 4, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Environmental Science Technician', faculty: 'Sustainability', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Architectural Draughtsperson', faculty: 'Engineering', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: { pure: 30, mathLit: 30, techMath: 30 }, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Vocational Certificates (NQF 4)
      { name: 'Computer Aided Drawing Office Practice (CAD)', faculty: 'Engineering / Design', nqfLevel: 4, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Design Foundation (Creative Media Design)', faculty: 'Design', nqfLevel: 4, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // National N Diplomas (NQF 5)
      { name: 'Business Management N4-N6', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Human Resource Management N4-N6', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Civil Engineering N4-N6', faculty: 'Engineering', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: { pure: 30, mathLit: 30, techMath: 30 }, otherSubjects: [{ subject: 'Physical Sciences', min: 30 }], minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Electrical Engineering N4-N6', faculty: 'Engineering', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: { pure: 30, mathLit: 30, techMath: 30 }, otherSubjects: [{ subject: 'Physical Sciences', min: 30 }], minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Mechanical Engineering N4-N6', faculty: 'Engineering', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: { pure: 30, mathLit: 30, techMath: 30 }, otherSubjects: [{ subject: 'Physical Sciences', min: 30 }], minOneOfSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'stadio',
    name: 'Stadio Higher Education',
    programmes: [
      // Higher Certificate (NQF 5)
      { name: 'Higher Certificate in Management Extended Programme', faculty: 'School of Administration & Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Software Development', faculty: 'School of Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: { pure: 40, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Graphic Web Design', faculty: 'School of Media & Design', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Photography', faculty: 'School of Media & Design', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Diploma (NQF 6) — Diploma pass required
      { name: 'Diploma in Management', faculty: 'School of Administration & Management', nqfLevel: 6, passType: 'diploma', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7)
      { name: 'Bachelor of Business Administration', faculty: 'School of Administration & Management', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Arts', faculty: 'School of Arts & Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 40, mathLit: 60, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Accounting', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 40, mathLit: 60, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Education in Foundation Phase Teaching', faculty: 'School of Education', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Education in Intermediate Phase Teaching', faculty: 'School of Education', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 40, mathLit: 50, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Arts in Fashion', faculty: 'School of Fashion', nqfLevel: 7, passType: 'bachelors', minEnglish: 45, mathReq: { pure: 55, mathLit: 75, techMath: null }, mathAlternative: [{ subject: 'Accounting', min: 50 }], otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Fashion', faculty: 'School of Fashion', nqfLevel: 7, passType: 'bachelors', minEnglish: 45, mathReq: { pure: 55, mathLit: 75, techMath: null }, mathAlternative: [{ subject: 'Accounting', min: 50 }], otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Information Technology in Web Design and Development', faculty: 'School of Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Business Information Systems', faculty: 'School of Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: [{ subject: 'Information Technology', min: 50 }, { subject: 'Computer Applications Technology', min: 70 }], otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Computing', faculty: 'School of Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Laws (LLB)', faculty: 'School of Law', nqfLevel: 8, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Arts in Law', faculty: 'School of Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Law', faculty: 'School of Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 40, mathLit: 60, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Arts in Visual Arts in Visual Communication Design', faculty: 'School of Media & Design', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Policing Practices (Police Officials)', faculty: 'School of Policing & Law Enforcement', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Policing Practices (Traffic & Metropolitan Law Enforcement)', faculty: 'School of Policing & Law Enforcement', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'regent',
    name: 'Regent Business School',
    programmes: [
      // Higher Certificate (NQF 5) — HC pass, English 30%, no maths requirement
      { name: 'Higher Certificate in Business Management', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Accounting', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Entrepreneurship', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Management for Estate Agents', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Marketing Management', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Retail Management', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Supply Chain Management', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Healthcare Services Management', faculty: 'Health and Business', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Human Resource Management', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Islamic Finance Banking and Law', faculty: 'Business and Law', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Project Management', faculty: 'Business and Management', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Advanced Certificate (NQF 6) — Diploma pass
      { name: 'Advanced Certificate in Management', faculty: 'Business and Management', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Diploma (NQF 6) — Diploma pass
      { name: 'Diploma in Financial Management', faculty: 'Commerce', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Public Relations Management', faculty: 'Business and Communication', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7) — Bachelor's pass
      { name: 'Bachelor of Commerce', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Accounting', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: { pure: 40, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Business Administration', faculty: 'Business and Management', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Human Resource Management', faculty: 'Business and Management', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Law', faculty: 'Law and Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Public Administration', faculty: 'Public Administration', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Retail Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Supply Chain Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Advanced Diploma (NQF 7) — Diploma pass or equivalent NQF 6
      { name: 'Advanced Diploma in Management', faculty: 'Business and Management', nqfLevel: 7, passType: 'diploma', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Advanced Diploma in Financial Management', faculty: 'Commerce', nqfLevel: 7, passType: 'diploma', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'imm',
    name: 'IMM Graduate School',
    programmes: [
      // Higher Certificate (NQF 5) — HC pass, English 40%, no maths requirement
      { name: 'Higher Certificate in Marketing', faculty: 'Marketing', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Supply Chain Management', faculty: 'Supply Chain Management', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Project Management', faculty: 'Supply Chain Management / Project Management', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Diploma (NQF 6) — HC pass accepted (CSV specifies "Higher Certificate pass" as entry requirement)
      { name: 'Diploma in Marketing Management', faculty: 'Marketing', nqfLevel: 6, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7) — Bachelor's pass, Pure Maths 40% or Maths Lit 60%, TechMath not stated (not blocked)
      { name: 'Bachelor of Business Administration in Marketing Management', faculty: 'Marketing', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 40, mathLit: 60, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Marketing and Management Science', faculty: 'Marketing', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 40, mathLit: 60, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in International Supply Chain Management', faculty: 'Supply Chain Management', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 40, mathLit: 60, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'milpark',
    name: 'Milpark Education',
    programmes: [
      // Higher Certificate (NQF 5) — HC pass, English passed (30%), no maths
      { name: 'Higher Certificate in Management', faculty: 'School of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Management with Human Resource Management', faculty: 'School of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Management with Risk and Compliance', faculty: 'School of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Management with Logistics & Supply Chain', faculty: 'School of Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Banking Services', faculty: 'School of Financial Services', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Financial Planning', faculty: 'School of Financial Services', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Financial Products', faculty: 'School of Financial Services', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Short-Term Insurance', faculty: 'School of Financial Services', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Advanced Certificate (NQF 6) — HC pass, English passed (30%), no maths (note: require prior NQF 5 per prospectus)
      { name: 'Advanced Certificate in Management', faculty: 'School of Commerce', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Advanced Certificate in Management with Risk and Compliance', faculty: 'School of Commerce', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Advanced Certificate in Banking Services', faculty: 'School of Financial Services', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Advanced Certificate in Financial Planning', faculty: 'School of Financial Services', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Advanced Certificate in Short-Term Insurance', faculty: 'School of Financial Services', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // BBA (NQF 7) — Bachelor's pass, English 50%, no maths
      { name: 'Bachelor of Business Administration', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Business Administration Majoring in Banking', faculty: 'School of Financial Services', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Business Administration Majoring in Human Resources', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Business Administration Majoring in Marketing', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Business Administration Majoring in Public Administration', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // BCom Accounting (NQF 7) — Bachelor's pass, English 50%, Pure Maths 50% or Maths Lit 70%
      { name: 'Bachelor of Commerce in Accounting', faculty: 'School of Professional Accounting', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Accounting specialising in Management Accountancy', faculty: 'School of Professional Accounting', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // BCom variants (NQF 7) — Bachelor's pass, English 50%, Pure Maths 50% or Maths Lit 70%
      { name: 'Bachelor of Commerce', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Banking', faculty: 'School of Financial Services', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Banking and Investment', faculty: 'School of Financial Services', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Credit', faculty: 'School of Financial Services', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Compliance and Risk Management', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Digital Business', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Economics', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Law', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Financial Management', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Financial Planning', faculty: 'School of Financial Services', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Investment Management', faculty: 'School of Financial Services', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Marketing Management', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Human Resource Management', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce with a Major in Short-Term Insurance', faculty: 'School of Financial Services', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Logistics & Supply Chain', faculty: 'School of Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce Majoring in Taxation', faculty: 'School of Financial Services', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 70, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'mancosa',
    name: 'MANCOSA',
    programmes: [
      // Higher Certificate (NQF 5) — HC pass, no maths requirement
      { name: 'Higher Certificate in Accounting', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Business Management', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Coding', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 50, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Digital Marketing', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Events Management', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Healthcare Management', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 50, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Human Resource Management', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Information Technology', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Local Government and Development Management', faculty: 'Public Administration', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Logistics Management', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 50, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Marketing', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Paralegal Studies', faculty: 'Law', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Project Management', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Public Management', faculty: 'Public Administration', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Public Sector Procurement', faculty: 'Public Administration', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Social Media and Communication', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Supply Chain Management', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Tax Administration', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Higher Certificate in Tourism Management', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Advanced Certificate (NQF 6) — HC pass, English passed (30%), no maths (require prior NQF 5 per prospectus)
      { name: 'Advanced Certificate in Financial Planning', faculty: 'Commerce', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Advanced Certificate in Management Studies', faculty: 'Commerce', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7) — Bachelor's pass, English passed (30%), no maths requirement
      { name: 'Bachelor of Business Administration', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Public Administration', faculty: 'Public Administration', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Accounting', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Corporate Communication', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Digital Marketing', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Entrepreneurship', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Financial Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Human Resource Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Information and Technology Management', faculty: 'Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in International Business', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Marketing Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Project Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Retail Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Commerce in Supply Chain Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'belgium_campus',
    name: 'Belgium Campus iTversity',
    programmes: [
      // National Certificate (NQF 5) — HC pass, no specific English or Maths % required
      { name: 'National Certificate in IT: Systems Development', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Certificate (NQF 6) — HC pass, requires prior NQF 5 per prospectus, no specific English or Maths % required
      { name: 'Certificate in IT: Database Development', faculty: 'Information Technology', nqfLevel: 6, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Diploma (NQF 6) — Diploma pass, Pure Maths 50% only (Maths Lit and Technical Maths not accepted), no English % specified
      { name: 'Diploma in Information Technology', faculty: 'Information Technology', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Diploma in Information Technology for Deaf Students', faculty: 'Information Technology', nqfLevel: 6, passType: 'diploma', minEnglish: 30, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Bachelor (NQF 7) — Bachelor's pass, English 50%, Pure Maths 50% only (Maths Lit and Technical Maths not accepted)
      { name: 'Bachelor of Information Technology', faculty: 'Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      { name: 'Bachelor of Information Technology (Part-Time)', faculty: 'Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
      // Bachelor of Computing (NQF 8) — Bachelor's pass, English 50%, Pure Maths 50% only
      { name: 'Bachelor of Computing', faculty: 'Information Technology', nqfLevel: 8, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null },
    ],
  },
  {
    id: 'eduvos',
    name: 'Eduvos',
    programmes: [
      // Pre-degree Foundation Programmes (NQF 5) — any NSC pass type (HC pass = lowest accepted), English 40%
      { name: 'Pre-degree Foundation Programme (Commerce and Law)', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Pre-degree Foundation Programme (Graphic Design)', faculty: 'Humanities', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Pre-degree Foundation Programme (Information Technology)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: { pure: 30, mathLit: null, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Pre-degree Foundation Programme (Science)', faculty: 'Applied Science', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: { pure: 30, mathLit: null, techMath: null }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Pre-degree Foundation Programme (Social Sciences)', faculty: 'Humanities', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      // Access Programmes (NQF 5) — Bachelor's pass, for students meeting pass type but lacking subject minimums
      { name: 'Bachelor of Commerce Access Programme (Accounting)', faculty: 'Commerce', nqfLevel: 5, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts Access Programme (Humanities)', faculty: 'Humanities', nqfLevel: 5, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Science Access Programme (Information Technology)', faculty: 'Information Technology', nqfLevel: 5, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Science Access Programme (Science)', faculty: 'Applied Science', nqfLevel: 5, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      // Higher Certificate (NQF 5) — HC pass, English 40%
      { name: 'Higher Certificate in Bioscience', faculty: 'Applied Science', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: { pure: 40, mathLit: 50, techMath: 40 }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Business Management', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Business Management (Tourism)', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Business Management (Digital Banking)', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Business Management (Employment Relations)', faculty: 'Commerce', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Art and Design', faculty: 'Humanities', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Computing (Computer Systems Architecture)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Computing (Data Analytics)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Computing (Software Development Lifecycles)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Computing (Strategic Information Systems)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Computing (Website Design and Development)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Cloud Computing)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Cyber Security)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Data Analytics)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Engineering)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Game Design and Development)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Machine Learning)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Network Engineering)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Robotics and Intelligent Systems)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Software Development)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Higher Certificate in Information Systems (Web Development)', faculty: 'Information Technology', nqfLevel: 5, passType: 'hc', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      // Bachelor of Arts (NQF 7) — Bachelor's pass, English 40%
      { name: 'Bachelor of Arts (Communication Science and English)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Industrial Psychology and English Literature Studies)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Industrial Psychology and HR Management)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Industrial Psychology and Linguistics)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Industrial Psychology and Political Science)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Law and Economics)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 30, mathLit: 50, techMath: 30 }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Law and Politics)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Media Studies)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Politics, Philosophy and Economics)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 30, mathLit: 50, techMath: 30 }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Psychology and English Literature Studies)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Psychology and HR Management)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Psychology and Linguistics)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts (Psychology and Political Science)', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Arts in Graphic Design', faculty: 'Humanities', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Business Administration', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      // BCom (NQF 7) — Bachelor's pass, English 40%
      { name: 'Bachelor of Commerce', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 30, mathLit: 50, techMath: 30 }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Commerce in Accounting', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Commerce in Human Resource Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Commerce in Law', faculty: 'Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 30, mathLit: 50, techMath: 30 }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Commerce in Marketing Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 30, mathLit: 50, techMath: 30 }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Commerce in Tourism Management', faculty: 'Commerce', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 30, mathLit: 50, techMath: 30 }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      // BSc (NQF 7) — Bachelor's pass
      { name: 'Bachelor of Science in Biomedicine', faculty: 'Applied Science', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: [{ subject: 'Life Sciences', min: 50 }, { subject: 'Physical Sciences', min: 50 }], minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Science in Biotechnology Management', faculty: 'Applied Science', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: [{ subject: 'Life Sciences', min: 50 }, { subject: 'Physical Sciences', min: 50 }], minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Science in Computer Science', faculty: 'Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 50, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Science in Information Technology (Data Science)', faculty: 'Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Science in Information Technology (Robotics)', faculty: 'Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Science in Information Technology (Security and Network Engineering)', faculty: 'Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      { name: 'Bachelor of Science in Information Technology (Software Engineering)', faculty: 'Information Technology', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 50, mathLit: 'not_accepted', techMath: 'not_accepted' }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
      // LLB (NQF 7) — Bachelor's pass, English 40%, all Maths types accepted
      { name: 'Bachelor of Laws', faculty: 'Law', nqfLevel: 7, passType: 'bachelors', minEnglish: 40, mathReq: { pure: 30, mathLit: 50, techMath: 30 }, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: Eduvos uses their own points system with a minimum of 25 points. Please verify your points at eduvos.ac.za' },
    ],
  },
  {
    id: 'afda',
    name: 'AFDA',
    programmes: [
      // Higher Certificate (NQF 5) — HC pass, no English minimum, no maths requirement
      { name: 'Higher Certificate in Film TV and Entertainment Production', faculty: 'Film and Entertainment', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: AFDA programmes may require a creative portfolio or entrance exam. Please verify at afda.ac.za' },
      { name: 'Higher Certificate in Performing Arts', faculty: 'Performing Arts', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: AFDA programmes may require a creative portfolio or entrance exam. Please verify at afda.ac.za' },
      { name: 'Higher Certificate in Radio and Podcasting', faculty: 'Radio and Media', nqfLevel: 5, passType: 'hc', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: AFDA programmes may require a creative portfolio or entrance exam. Please verify at afda.ac.za' },
      // Bachelor (NQF 7) — Bachelor's pass, no English minimum, no maths requirement
      { name: 'Bachelor of Arts in Motion Picture Medium', faculty: 'Film and Entertainment', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: AFDA programmes may require a creative portfolio or entrance exam. Please verify at afda.ac.za' },
      { name: 'Bachelor of Arts in Live Performance', faculty: 'Performing Arts', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: AFDA programmes may require a creative portfolio or entrance exam. Please verify at afda.ac.za' },
      { name: 'Bachelor of Commerce in Business Innovation and Entrepreneurship', faculty: 'Business Innovation', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: AFDA programmes may require a creative portfolio or entrance exam. Please verify at afda.ac.za' },
      { name: 'Bachelor of Creative Writing', faculty: 'Creative Writing', nqfLevel: 7, passType: 'bachelors', minEnglish: 30, mathReq: null, mathAlternative: null, otherSubjects: null, minOneOfSubjects: null, minNSubjectsAt: null, note: 'Note: AFDA programmes may require a creative portfolio or entrance exam. Please verify at afda.ac.za' },
    ],
  },
];

function calculateNSCPassType(subjectMarks) {
  const english = subjectMarks.find((s) => isEnglishSubject(s.subject));
  const englishMark = english ? english.mark : 0;
  const nonLONonEnglish = subjectMarks.filter(
    (s) => s.subject !== 'Life Orientation' && !isEnglishSubject(s.subject)
  );
  const at40 = nonLONonEnglish.filter((s) => s.mark >= 40).length;
  const at30 = nonLONonEnglish.filter((s) => s.mark >= 30).length;
  if (englishMark >= 40 && at40 >= 4) return 'bachelors';
  if (englishMark >= 40 && at40 >= 3) return 'diploma';
  if (englishMark >= 30 && at30 >= 3) return 'hc';
  return null;
}

function evaluateIIEProgramme(programme, subjectMarks, nscPassType) {
  const PASS_ORDER = { hc: 1, diploma: 2, bachelors: 3 };
  const studentLevel = nscPassType ? (PASS_ORDER[nscPassType] || 0) : 0;
  const requiredLevel = PASS_ORDER[programme.passType] || 99;

  if (studentLevel < requiredLevel) {
    return { qualifies: false, reason: `Requires ${programme.passType} pass` };
  }

  const english = subjectMarks.find((s) => isEnglishSubject(s.subject));
  const englishMark = english ? english.mark : 0;
  if (englishMark < programme.minEnglish) {
    return { qualifies: false, reason: `English ${englishMark}% below required ${programme.minEnglish}%` };
  }

  if (programme.mathReq) {
    const mathSubject = subjectMarks.find((s) => isMathChoice(s.subject));
    let mathSatisfied = false;

    if (mathSubject) {
      const mathType = mathSubject.subject;
      const mathMark = mathSubject.mark;
      let mathMin;
      if (mathType === 'Mathematics') mathMin = programme.mathReq.pure;
      else if (mathType === 'Mathematical Literacy') mathMin = programme.mathReq.mathLit;
      else if (mathType === 'Technical Mathematics') mathMin = programme.mathReq.techMath;

      if (mathMin !== 'not_accepted' && (mathMin === null || mathMin === undefined || mathMark >= mathMin)) {
        mathSatisfied = true;
      }
    }

    // Check alternative subjects that can substitute for maths (e.g. Accounting for Fashion)
    if (!mathSatisfied && programme.mathAlternative) {
      mathSatisfied = programme.mathAlternative.some((alt) => {
        const found = subjectMarks.find((s) => s.subject === alt.subject);
        return found && found.mark >= alt.min;
      });
    }

    if (!mathSatisfied) {
      if (!mathSubject) {
        const altNames = programme.mathAlternative
          ? programme.mathAlternative.map((a) => a.subject).join(' or ')
          : '';
        return { qualifies: false, reason: altNames ? `Mathematics or ${altNames} required` : 'Mathematics subject required' };
      }
      const mathType = mathSubject.subject;
      const mathMark = mathSubject.mark;
      let mathMin;
      if (mathType === 'Mathematics') mathMin = programme.mathReq.pure;
      else if (mathType === 'Mathematical Literacy') mathMin = programme.mathReq.mathLit;
      else if (mathType === 'Technical Mathematics') mathMin = programme.mathReq.techMath;
      if (mathMin === 'not_accepted') {
        return { qualifies: false, reason: `${mathType} not accepted for this programme` };
      }
      return { qualifies: false, reason: `${mathType} ${mathMark}% below required ${mathMin}%` };
    }
  }

  if (programme.otherSubjects) {
    for (const req of programme.otherSubjects) {
      let found;
      if (req.subject === 'First Additional Language') {
        found = subjectMarks.find((s) => s.subject.includes('First Additional Language'));
      } else if (req.subject === 'Physical Sciences') {
        found = subjectMarks.find((s) => s.subject === 'Physical Sciences' || s.subject === 'Technical Sciences');
      } else {
        found = subjectMarks.find((s) => s.subject === req.subject);
      }
      if (!found || found.mark < req.min) {
        return { qualifies: false, reason: `${req.subject} below ${req.min}%` };
      }
    }
  }

  if (programme.minOneOfSubjects) {
    const { subjects, min } = programme.minOneOfSubjects;
    const found = subjectMarks.find((s) => subjects.includes(s.subject) && s.mark >= min);
    if (!found) {
      return { qualifies: false, reason: `Need one of: ${subjects.join(', ')} at ${min}%+` };
    }
  }

  if (programme.minNSubjectsAt) {
    const { count, pct } = programme.minNSubjectsAt;
    const nonLO = subjectMarks.filter((s) => s.subject !== 'Life Orientation');
    const qualified = nonLO.filter((s) => s.mark >= pct).length;
    if (qualified < count) {
      return { qualifies: false, reason: `Need at least ${count} subjects at ${pct}%+` };
    }
  }

  return { qualifies: true };
}

function renderPrivateResults(subjectMarks) {
  const container = document.getElementById('private-results');
  if (!container) return;

  const nscPassType = calculateNSCPassType(subjectMarks);
  const visible = IIE_UNIVERSITIES
    .map((uni) => ({
      ...uni,
      qualifying: uni.programmes.filter(
        (p) => evaluateIIEProgramme(p, subjectMarks, nscPassType).qualifies
      ),
    }))
    .filter((uni) => uni.qualifying.length > 0);

  if (!visible.length) {
    container.innerHTML = '';
    return;
  }

  let html = '<h3 class="private-unis-heading">Private Universities</h3>';

  visible.forEach((uni) => {
    const count = uni.qualifying.length;
    const programmesHtml = uni.qualifying.map((p) => {
      const reqs = [];
      if (p.minEnglish) reqs.push(`English: ${p.minEnglish}%+`);
      if (p.mathReq) {
        const parts = [];
        if (p.mathReq.pure !== 'not_accepted' && p.mathReq.pure != null) parts.push(`Pure Maths: ${p.mathReq.pure}%+`);
        if (p.mathReq.mathLit !== 'not_accepted' && p.mathReq.mathLit != null) parts.push(`Maths Lit: ${p.mathReq.mathLit}%+`);
        if (p.mathReq.techMath !== 'not_accepted' && p.mathReq.techMath != null) parts.push(`Tech Maths: ${p.mathReq.techMath}%+`);
        if (parts.length) reqs.push(parts.join(' or '));
      }
      if (p.mathAlternative) {
        p.mathAlternative.forEach((a) => reqs.push(`${a.subject}: ${a.min}%+ (maths alternative)`));
      }
      if (p.otherSubjects) {
        p.otherSubjects.forEach((s) => reqs.push(`${s.subject}: ${s.min}%+`));
      }
      if (p.minOneOfSubjects) {
        reqs.push(`One of: ${p.minOneOfSubjects.subjects.join(' / ')} at ${p.minOneOfSubjects.min}%+`);
      }
      if (p.minNSubjectsAt) {
        reqs.push(`Any ${p.minNSubjectsAt.count} subjects at ${p.minNSubjectsAt.pct}%+`);
      }
      const reqHtml = reqs.length
        ? `<ul class="subject-req-list">${reqs.map((r) => `<li>${r}</li>`).join('')}</ul>`
        : `<span class="muted">No additional requirements</span>`;

      return `<li class="accordion-programme">
        <div class="accordion-programme-header">
          <strong>${p.name}</strong>
          <span class="stream-badge">${p.faculty}</span>
        </div>
        <span class="small">NQF Level ${p.nqfLevel}</span>
        <div class="subject-reqs">
          <span class="subject-reqs-label">Minimum Requirements:</span>
          ${reqHtml}
        </div>
        ${p.note ? `<p class="small" style="margin-top:0.4rem;color:var(--warn);font-style:italic">${p.note}</p>` : ''}
      </li>`;
    }).join('');

    html += `<article class="university-card accordion-card">
      <button type="button" class="accordion-toggle" aria-expanded="false">
        <span class="accordion-uni-name">${uni.name}</span>
        <span class="accordion-meta">
          <span class="badge">${count} programme${count !== 1 ? 's' : ''}</span>
          <svg class="accordion-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
      <div class="accordion-body">
        <ul class="accordion-programme-list">${programmesHtml}</ul>
      </div>
    </article>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.accordion-toggle').forEach((toggle) => {
    const body = toggle.nextElementSibling;
    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      body.style.maxHeight = isOpen ? '0' : body.scrollHeight + 'px';
    });
  });
}

function saveLastResult(payload) {
  localStorage.setItem(STORAGE_KEYS.lastResult, JSON.stringify(payload));
}

function clearLegacyStorage() {
  [
    "unipath_last_result",
    "unipath_last_result_v2",
    "unipath_last_result_v3",
    "unipath_rules_cache",
    "unipath_rules_cache_v2",
  ].forEach((key) => localStorage.removeItem(key));
}

function loadLastResult() {
  const raw = localStorage.getItem(STORAGE_KEYS.lastResult);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.subjectMarks)) {
      dom.subjects.innerHTML = "";
      parsed.subjectMarks.forEach((s) => addSubjectRow(s.subject, s.mark));
    }
    if (parsed.gradeSource) dom.gradeSource.value = parsed.gradeSource;
    updateGradeSourceNotice();
    if (Array.isArray(parsed.visibleResults)) renderResults(parsed.visibleResults);
    if (parsed.confidenceMessage) dom.confidenceNotice.textContent = parsed.confidenceMessage;
  } catch {
    localStorage.removeItem(STORAGE_KEYS.lastResult);
  }
}

function saveRulesCache(payload) {
  localStorage.setItem(STORAGE_KEYS.rulesCache, JSON.stringify(payload));
}

function loadRulesCache() {
  const raw = localStorage.getItem(STORAGE_KEYS.rulesCache);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEYS.rulesCache);
    return null;
  }
}

async function loadRules() {
  try {
    const response = await fetch("./data/approved_rules.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load rules file");
    const payload = await response.json();
    if (!Array.isArray(payload.universities)) throw new Error("Invalid rules schema");
    universityRules = payload.universities;
    saveRulesCache(payload);
  } catch (error) {
    const fallback = loadRulesCache();
    if (fallback && Array.isArray(fallback.universities)) {
      universityRules = fallback.universities;
      dom.errors.textContent = "Using cached rules. Connect to refresh latest university data.";
      return;
    }
    dom.errors.textContent = `Rules unavailable: ${error.message}`;
  }
}

function onSubmit(event) {
  event.preventDefault();
  dom.errors.textContent = "";
  dom.confidenceNotice.textContent = "";

  if (!Array.isArray(universityRules) || universityRules.length === 0) {
    dom.errors.textContent = "No university rules loaded yet. Try again in a few seconds.";
    return;
  }

  const input = collectInput();
  if (input.errors.length) {
    dom.errors.textContent = input.errors.join(" ");
    return;
  }

  const evaluation = evaluateForInput(input);
  // Store for Screens 5 and 6
  _lastEvaluation = { input, evaluation };
  // Pre-render Screen 4 content while showing Screen 3
  renderResults(evaluation.visible);
  renderPrivateResults(input.subjectMarks);
  // Render Screen 3 APS list and navigate to it
  renderAPSScreen(evaluation.visible);
  showScreen(3);

  const confidence = getConfidenceLabel(input.gradeSource);
  dom.confidenceNotice.textContent = `Confidence: ${confidence}. Results are predictive and may change based on final performance.`;

  saveLastResult({
    gradeSource: input.gradeSource,
    subjectMarks: input.subjectMarks,
    visibleResults: evaluation.visible,
    evaluatedResults: evaluation.evaluated,
    confidenceMessage: dom.confidenceNotice.textContent,
  });
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEYS.lastResult);
  dom.errors.textContent = "";
  dom.confidenceNotice.textContent = "";
  dom.results.innerHTML = "<p class='small'>No results yet.</p>";
  const privateContainer = document.getElementById('private-results');
  if (privateContainer) privateContainer.innerHTML = '';
  dom.gradeSource.value = "grade11_final";
  dom.subjects.innerHTML = "";
  _lastEvaluation = null;
  showScreen(2);
  addSubjectRow();
  addSubjectRow();
  updateGradeSourceNotice();
}

async function init() {
  dom.addSubjectBtn.addEventListener("click", () => addSubjectRow());
  dom.form.addEventListener("submit", onSubmit);
  dom.resetAllBtn.addEventListener("click", resetAll);
  dom.gradeSource.addEventListener("change", updateGradeSourceNotice);
  dom.viewProgramsBtn.addEventListener("click", () => showScreen(4));
  dom.whatIfBtn.addEventListener("click", () => { renderScreen5(); showScreen(5); });
  dom.checkChancesBtn.addEventListener("click", () => { renderScreen6(); showScreen(6); });

  // Back-button / swipe-back handler.
  // Screens 5/6 → back to Screen 4.
  // Screen 4 → scroll-to-top first, then back to Screen 3.
  // Screen 3 → scroll-to-top first, then back to Screen 2.
  // Screen 2 → let the browser navigate normally (to about.html).
  window.addEventListener("popstate", () => {
    if (_currentScreen === 5 || _currentScreen === 6) {
      if (window.scrollY > 80) {
        const view = _currentScreen === 5 ? "improve" : "chances";
        window.scrollTo({ top: 0, behavior: "smooth" });
        history.pushState({ view }, "");
      } else {
        _currentScreen = 4;
        document.getElementById("screen-5").classList.remove("active");
        document.getElementById("screen-6").classList.remove("active");
        document.getElementById("screen-4").classList.add("active");
        window.scrollTo({ top: 0 });
      }
    } else if (_currentScreen === 4) {
      if (window.scrollY > 80) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        history.pushState({ view: "results" }, "");
      } else {
        _currentScreen = 3;
        document.getElementById("screen-4").classList.remove("active");
        document.getElementById("screen-3").classList.add("active");
        window.scrollTo({ top: 0 });
      }
    } else if (_currentScreen === 3) {
      if (window.scrollY > 80) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        history.pushState({ view: "aps" }, "");
      } else {
        _currentScreen = 2;
        document.getElementById("screen-3").classList.remove("active");
        document.getElementById("screen-2").classList.add("active");
        window.scrollTo({ top: 0 });
      }
    }
    // _currentScreen === 2: let browser handle (navigates to about.html)
  });

  clearLegacyStorage();
  addSubjectRow();
  addSubjectRow();
  updateGradeSourceNotice();
  await loadRules();
}

init();
