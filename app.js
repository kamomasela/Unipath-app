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
let lastPdfData = null; // stores latest evaluation for PDF export
let _resultsVisible = false; // true while results are displayed (used for back-button handling)
const ENFORCE_SUBJECT_MINIMUMS = true;

const dom = {
  form: document.getElementById("aps-form"),
  gradeSource: document.getElementById("grade-source"),
  gradeSourceNotice: document.getElementById("grade-source-notice"),
  subjects: document.getElementById("subjects"),
  addSubjectBtn: document.getElementById("add-subject-btn"),
  resetAllBtn: document.getElementById("reset-all-btn"),
  savePdfBtn: document.getElementById("save-pdf-btn"),
  subjectRowTemplate: document.getElementById("subject-row-template"),
  errors: document.getElementById("errors"),
  confidenceNotice: document.getElementById("confidence-notice"),
  improvementModel: document.getElementById("improvement-model"),
  results: document.getElementById("results"),
  debugResults: document.getElementById("debug-results"),
};

function isEnglishSubject(subject) {
  return subject.startsWith("English ");
}

function isMathChoice(subject) {
  return subject === "Mathematics" || subject === "Mathematical Literacy";
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
    errors.push("Select Mathematics or Mathematical Literacy.");
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

function renderResults(visibleUniversities) {
  dom.results.innerHTML = "";
  if (!visibleUniversities.length) {
    dom.results.innerHTML = "<p class='small'>No eligible universities/programmes for this profile yet.</p>";
    return;
  }

  // Push a history entry so the back button can be intercepted.
  // Use replaceState on subsequent calculations to avoid stacking entries.
  if (!_resultsVisible) {
    history.pushState({ view: "results" }, "");
    _resultsVisible = true;
  } else {
    history.replaceState({ view: "results" }, "");
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

function renderDebugReasons(evaluatedUniversities) {
  if (!dom.debugResults) return;
  const sections = evaluatedUniversities
    .map((result) => {
      if (result.status === "unavailable" || result.status === "skipped") {
        return `<details><summary>${result.universityName}: hidden (${result.status})</summary><p>${result.message}</p></details>`;
      }
      const hidden = (result.allProgrammes || []).filter((p) => p.classification === "NOT_ELIGIBLE");
      if (!hidden.length) return "";
      return `
        <details>
          <summary>${result.universityName}: ${hidden.length} hidden programme(s)</summary>
          <ul>${hidden
            .map((p) => {
              const reqLines = formatSubjectRequirements(p.subjectMinimums);
              const reqHtml = reqLines
                ? reqLines.map((l) => `<li>${l}</li>`).join("")
                : "<li>None required</li>";
              return `<li>
                <strong>${p.name}</strong> — ${p.reason}
                <div class="subject-reqs small">
                  <span class="subject-reqs-label">Subject Requirements:</span>
                  <ul class="subject-req-list">${reqHtml}</ul>
                </div>
              </li>`;
            })
            .join("")}</ul>
        </details>
      `;
    })
    .filter(Boolean);

  if (!sections.length) {
    dom.debugResults.innerHTML = "";
    return;
  }

  dom.debugResults.innerHTML = `
    <p><strong>Debug: Why some programmes are hidden</strong></p>
    <p class="small">This section is for troubleshooting only.</p>
    ${sections.join("")}
  `;
}

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

function markToLevel(mark) {
  if (mark >= 80) return 7;
  if (mark >= 70) return 6;
  if (mark >= 60) return 5;
  if (mark >= 50) return 4;
  if (mark >= 40) return 3;
  if (mark >= 30) return 2;
  return 1;
}

function generatePDF() {
  if (!lastPdfData) return;
  const { subjectMarks, visibleUniversities, generatedAt } = lastPdfData;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PRIMARY   = [11, 79, 108];   // #0b4f6c
  const DARK      = [15, 23, 42];    // #0f172a
  const MUTED     = [71, 85, 105];   // #475569
  const LIGHT_BG  = [230, 240, 245]; // #e6f0f5
  const WHITE     = [255, 255, 255];
  const PAGE_W    = 210;
  const MARGIN    = 14;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  let y = 0;

  // ── helpers ──────────────────────────────────────────────────────────────
  function checkPageBreak(needed = 10) {
    if (y + needed > 272) {
      doc.addPage();
      y = 16;
    }
  }

  function sectionHeading(text) {
    checkPageBreak(14);
    doc.setFillColor(...PRIMARY);
    doc.roundedRect(MARGIN, y, CONTENT_W, 9, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...WHITE);
    doc.text(text, MARGIN + 4, y + 6);
    doc.setTextColor(...DARK);
    y += 12;
  }

  function uniHeading(name, aps) {
    checkPageBreak(18);
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(MARGIN, y, CONTENT_W, 13, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PRIMARY);
    doc.text(name, MARGIN + 3, y + 5.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Your APS for this university: ${aps}`, MARGIN + 3, y + 10.5);
    doc.setTextColor(...DARK);
    y += 16;
  }

  // ── Cover / Header ────────────────────────────────────────────────────────
  // Colour bar at top
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_W, 28, "F");

  // App name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...WHITE);
  doc.text("UniPath", MARGIN, 17);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("APS & Course Eligibility Results", MARGIN, 23);

  // Date (right-aligned)
  doc.setFontSize(8);
  const dateStr = "Generated: " + new Date(generatedAt).toLocaleDateString("en-ZA", {
    day: "2-digit", month: "long", year: "numeric"
  });
  doc.text(dateStr, PAGE_W - MARGIN, 23, { align: "right" });

  y = 36;

  // ── 1. Student Subjects & Marks ───────────────────────────────────────────
  sectionHeading("Your Subjects & Marks");

  const subjectRows = subjectMarks.map((s) => [
    s.subject,
    `${s.mark}%`,
    markToLevel(s.mark),
  ]);

  doc.autoTable({
    startY: y,
    head: [["Subject", "Mark", "Level"]],
    body: subjectRows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 9, cellPadding: 3, textColor: DARK },
    headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 22, halign: "center" },
    },
    theme: "grid",
  });

  y = doc.lastAutoTable.finalY + 8;

  // ── 2. Qualifying Programmes grouped by university ────────────────────────
  sectionHeading(`Qualifying Programmes  (${visibleUniversities.length} ${visibleUniversities.length === 1 ? "university" : "universities"})`);

  visibleUniversities.forEach((uni) => {
    const programmes = (uni.programmes || uni.eligibleProgrammes || []).filter(
      (p) => p.classification === "QUALIFY"
    );
    if (!programmes.length) return;

    uniHeading(uni.universityName, uni.aps);

    const progRows = programmes.map((p) => {
      const reqs = formatSubjectRequirements(p.subjectMinimums);
      return [
        p.name + (p.stream === "extended" ? " (Extended)" : ""),
        p.faculty || "—",
        String(p.minimumAPS),
        reqs ? reqs.join("\n") : "—",
      ];
    });

    doc.autoTable({
      startY: y,
      head: [["Programme", "Faculty", "Min APS", "Subject Requirements"]],
      body: progRows,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: DARK, overflow: "linebreak" },
      headStyles: { fillColor: [230, 240, 245], textColor: PRIMARY, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 38 },
        2: { cellWidth: 18, halign: "center" },
        3: { cellWidth: "auto" },
      },
      theme: "grid",
      didDrawPage: () => { y = doc.lastAutoTable.finalY; },
    });

    y = doc.lastAutoTable.finalY + 6;
  });

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      "UniPath · Results are predictive and based on published entry requirements. Verify with universities directly.",
      PAGE_W / 2, 290, { align: "center" }
    );
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, 290, { align: "right" });
  }

  const filename = `UniPath_Results_${new Date(generatedAt).toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
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
    if (Array.isArray(parsed.evaluatedResults)) renderDebugReasons(parsed.evaluatedResults);
    if (parsed.confidenceMessage) dom.confidenceNotice.textContent = parsed.confidenceMessage;
    if (parsed.improvementHtml) dom.improvementModel.innerHTML = parsed.improvementHtml;
    if (parsed.debugHtml && dom.debugResults) dom.debugResults.innerHTML = parsed.debugHtml;
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
  dom.improvementModel.innerHTML = "";

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
  renderResults(evaluation.visible);
  renderDebugReasons(evaluation.evaluated);

  if (evaluation.visible.length > 0) {
    lastPdfData = {
      subjectMarks: input.subjectMarks,
      visibleUniversities: evaluation.visible,
      generatedAt: new Date().toISOString(),
    };
    dom.savePdfBtn.style.display = "";
  } else {
    lastPdfData = null;
    dom.savePdfBtn.style.display = "none";
  }

  const confidence = getConfidenceLabel(input.gradeSource);
  dom.confidenceNotice.textContent = `Confidence: ${confidence}. Results are predictive and may change based on final performance.`;
  renderImprovementModel(input, evaluation.totalEligible);

  saveLastResult({
    gradeSource: input.gradeSource,
    subjectMarks: input.subjectMarks,
    visibleResults: evaluation.visible,
    evaluatedResults: evaluation.evaluated,
    confidenceMessage: dom.confidenceNotice.textContent,
    improvementHtml: dom.improvementModel.innerHTML,
    debugHtml: dom.debugResults ? dom.debugResults.innerHTML : "",
  });
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEYS.lastResult);
  dom.errors.textContent = "";
  dom.confidenceNotice.textContent = "";
  dom.improvementModel.innerHTML = "";
  dom.results.innerHTML = "<p class='small'>No results yet.</p>";
  if (dom.debugResults) dom.debugResults.innerHTML = "";
  dom.gradeSource.value = "grade11_final";
  dom.subjects.innerHTML = "";
  lastPdfData = null;
  _resultsVisible = false;
  dom.savePdfBtn.style.display = "none";
  addSubjectRow();
  addSubjectRow();
  updateGradeSourceNotice();
}

async function init() {
  dom.addSubjectBtn.addEventListener("click", () => addSubjectRow());
  dom.form.addEventListener("submit", onSubmit);
  dom.resetAllBtn.addEventListener("click", resetAll);
  dom.savePdfBtn.addEventListener("click", generatePDF);
  dom.gradeSource.addEventListener("change", updateGradeSourceNotice);

  // Back-button / swipe-back handler.
  // When results are showing and the user presses back (Android hardware button,
  // iOS swipe, Huawei back key, or any browser back navigation):
  //   • If scrolled down  → scroll smoothly to top and stay on this page
  //   • If already at top → let the browser navigate to the previous history
  //     entry, which is this same index.html page at its base state (the
  //     marks-entry form) — NOT the welcome/about screen
  window.addEventListener("popstate", () => {
    if (!_resultsVisible) return; // results not showing, let browser handle normally

    if (window.scrollY > 80) {
      // User is scrolled down into the results — scroll to top, stay on page
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Re-push the results state so a second back press is still interceptable
      history.pushState({ view: "results" }, "");
    } else {
      // Already at the top (form visible) — this popstate consumed the results
      // history entry; the browser is now on the base index.html entry (form state).
      // That IS the marks-entry page, so nothing more to do.
      _resultsVisible = false;
    }
  });

  clearLegacyStorage();
  addSubjectRow();
  addSubjectRow();
  updateGradeSourceNotice();
  await loadRules();
}

init();
