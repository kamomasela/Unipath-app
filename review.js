const dom = {
  refreshBtn: document.getElementById("refresh-btn"),
  downloadBtn: document.getElementById("download-decisions-btn"),
  importFile: document.getElementById("import-decisions-file"),
  reviewErrors: document.getElementById("review-errors"),
  reviewList: document.getElementById("review-list"),
};

let pendingPayload = null;
let decisionsPayload = null;

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

function ensureDecisionRecord(universityId) {
  if (!decisionsPayload.universities[universityId]) {
    decisionsPayload.universities[universityId] = {
      approved: false,
      include_life_orientation: false,
      supports_grade12: false,
      notes: "",
    };
  }
  return decisionsPayload.universities[universityId];
}

function render() {
  dom.reviewList.innerHTML = "";
  if (!pendingPayload) return;

  pendingPayload.universities.forEach((uni) => {
    const decision = ensureDecisionRecord(uni.id);
    const courseCount = Array.isArray(uni.courses) ? uni.courses.length : 0;
    const links = (uni.source_links || []).map((url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`).join("<br/>");
    const issues = (uni.ingestion_errors || []).join("; ");

    const card = document.createElement("article");
    card.className = "university-card";
    card.innerHTML = `
      <div class="university-header">
        <strong>${uni.name}</strong>
        <span class="badge">Confidence: ${uni.extraction_confidence ?? "n/a"}</span>
      </div>
      <p class="small">Courses extracted: ${courseCount}</p>
      <p class="small">Sources:<br/>${links || "None"}</p>
      <p class="small">Ingestion issues: ${issues || "None"}</p>

      <label class="label">Approved
        <input type="checkbox" data-id="${uni.id}" data-field="approved" ${decision.approved ? "checked" : ""} />
      </label>
      <label class="label">Include Life Orientation
        <input type="checkbox" data-id="${uni.id}" data-field="include_life_orientation" ${
          decision.include_life_orientation ? "checked" : ""
        } />
      </label>
      <label class="label">Supports Grade 12
        <input type="checkbox" data-id="${uni.id}" data-field="supports_grade12" ${decision.supports_grade12 ? "checked" : ""} />
      </label>
      <label class="label">Notes
        <input type="text" data-id="${uni.id}" data-field="notes" value="${decision.notes || ""}" />
      </label>
    `;
    dom.reviewList.appendChild(card);
  });

  dom.reviewList.querySelectorAll("input[data-id]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const id = event.target.dataset.id;
      const field = event.target.dataset.field;
      const record = ensureDecisionRecord(id);
      if (event.target.type === "checkbox") {
        record[field] = Boolean(event.target.checked);
      } else {
        record[field] = event.target.value;
      }
    });
  });
}

function downloadDecisions() {
  const payload = JSON.stringify(decisionsPayload, null, 2) + "\n";
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "approval_decisions.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function load() {
  dom.reviewErrors.textContent = "";
  try {
    pendingPayload = await fetchJson("./data/pending_rules.json");
    decisionsPayload = await fetchJson("./data/approval_decisions.json");
    if (!decisionsPayload.universities) decisionsPayload.universities = {};
    render();
  } catch (error) {
    dom.reviewErrors.textContent = error.message;
  }
}

function onImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result || "{}"));
      if (!imported.universities || typeof imported.universities !== "object") {
        throw new Error("Imported file is missing 'universities' object.");
      }
      decisionsPayload = imported;
      render();
    } catch (error) {
      dom.reviewErrors.textContent = `Invalid file: ${error.message}`;
    }
  };
  reader.readAsText(file);
}

dom.refreshBtn.addEventListener("click", load);
dom.downloadBtn.addEventListener("click", downloadDecisions);
dom.importFile.addEventListener("change", onImportFile);

load();
