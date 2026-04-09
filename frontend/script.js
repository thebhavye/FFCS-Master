// ============================================================================
// DOM ELEMENTS
// ============================================================================
// All timetable cells the user can click.
const selectableCells = Array.from(
  document.querySelectorAll(".timetable td.slot")
);
// Top-level action buttons.
const resetButton = document.getElementById("resetSelections");
const confirmButton = document.getElementById("confirmSelections");
// Subject form inputs.
const API_BASE = `http://${window.location.hostname}:5000`;
const subjectTypeSelect = document.getElementById("subjectType");
const subjectDomainSelect = document.getElementById("subjectDomain");
const subjectNameSelect = document.getElementById("subjectName");
const facultyTheoryList = document.getElementById("facultyTheoryList");
const facultyLabList = document.getElementById("facultyLabList");
const theorySelectAll = document.getElementById("theorySelectAll");
const labSelectAll = document.getElementById("labSelectAll");
const labFacultyError = document.getElementById("labFacultyError");
// Subject list controls.
const saveSubjectButton = document.getElementById("saveSubject");
const savedSubjectsContainer = document.getElementById("savedSubjects");
const resetSubjectsButton = document.getElementById("resetSubjects");
// Slot bundle choice popup (for A1/TA1/TAA1 etc.).
const slotChoiceMenu = document.getElementById("slotChoiceMenu");
const slotChoiceOptions = document.getElementById("slotChoiceOptions");
const slotChoiceTitle = document.querySelector(".slot-choice-title");
const slotChoiceCancel = document.getElementById("slotChoiceCancel");
// Generate output controls.
const generateButton = document.getElementById("generateOutput");
const generatedCombosContainer = document.getElementById("generatedCombos");
// ============================================================================
// CONSTANTS + STATE
// ============================================================================
// Max number of subjects user can save.
const MAX_SUBJECTS = 10;
// Mapping for backend: dropdown value -> numeric code.
const SUBJECT_TYPE_CODE = {
  theory: 1,
  theory_lab: 2,
  integrated: 3,
};
// Tracks which base slot (A1, B1, etc.) the popup is currently for.
let pendingSlotChoiceCode = null;
// Bundle choices for base theory slots.
// Example: picking A1 can mean A1 only, A1+TA1, or A1+TA1+TAA1.
const SLOT_BUNDLE_OPTIONS = {
  A1: [["A1"], ["A1", "TA1"], ["A1", "TA1", "TAA1"]],
  B1: [["B1"], ["B1", "TB1"]],
  C1: [["C1"], ["C1", "TC1"], ["C1", "TC1", "TCC1"]],
  D1: [["D1"], ["D1", "TD1"]],
  E1: [["E1"], ["E1", "TE1"]],
  F1: [["F1"], ["F1", "TF1"]],
  A2: [["A2"], ["A2", "TA2"], ["A2", "TA2", "TAA2"]],
  B2: [["B2"], ["B2", "TB2"]],
  C2: [["C2"], ["C2", "TC2"], ["C2", "TC2", "TCC2"]],
  D2: [["D2"], ["D2", "TD2"]],
  E2: [["E2"], ["E2", "TE2"]],
  F2: [["F2"], ["F2", "TF2"]],
};

// All conflicts are stored here so we can quickly disable invalid cells.
const conflictMap = new Map();

// Store a conflict relationship between two cells.
const addConflict = (a, b) => {
  if (!conflictMap.has(a)) conflictMap.set(a, new Set());
  if (!conflictMap.has(b)) conflictMap.set(b, new Set());
  conflictMap.get(a).add(b);
  conflictMap.get(b).add(a);
};

// Helper: return only real slot cells (ignore break cells).
const getSlotsExcludingBreak = (row) =>
  Array.from(row.querySelectorAll("td.slot")).filter(
    (cell) => !cell.classList.contains("break")
  );

// Build theory <-> lab conflicts by aligning the lab row with theory row.
const buildConflicts = () => {
  const dayHeaders = Array.from(document.querySelectorAll("th.day"));

  dayHeaders.forEach((dayHeader) => {
    const theoryRow = dayHeader.closest("tr");
    const labRow = theoryRow ? theoryRow.nextElementSibling : null;
    if (!theoryRow || !labRow) return;

    const theoryCells = getSlotsExcludingBreak(theoryRow);
    const labCells = getSlotsExcludingBreak(labRow);

    let cursor = 0;
    labCells.forEach((labCell) => {
      const span = Math.max(labCell.colSpan || 1, 1);
      const covered = theoryCells.slice(cursor, cursor + span);
      covered.forEach((theoryCell) => addConflict(labCell, theoryCell));
      cursor += span;
    });
  });
};

// Disable slots that clash with any currently selected slot.
const updateDisabledStates = () => {
  selectableCells.forEach((cell) => {
    cell.classList.remove("disabled");
  });

  selectableCells.forEach((cell) => {
    if (!cell.classList.contains("selected")) return;
    const conflicts = conflictMap.get(cell);
    if (!conflicts) return;
    conflicts.forEach((conflictCell) => {
      if (!conflictCell.classList.contains("selected")) {
        conflictCell.classList.add("disabled");
      }
    });
  });
};

// Read the slot code text inside a cell (e.g., "A1", "L31+L32").
const getSlotCode = (cell) => cell.textContent.trim();

// Find all cells with a given slot code (some codes appear multiple times).
const getCellsByCode = (code) =>
  selectableCells.filter((cell) => getSlotCode(cell) === code);

// Check if a code can be selected without conflicts.
const canSelectCode = (code) => {
  const matchingCells = getCellsByCode(code);
  if (!matchingCells.length) return false;
  return matchingCells.every(
    (cell) => cell.classList.contains("selected") || !cell.classList.contains("disabled")
  );
};

// Remove selection from all cells with this code.
const deselectCode = (code) => {
  getCellsByCode(code).forEach((targetCell) => {
    targetCell.classList.remove("selected");
  });
};

// Mark all cells with this code as selected.
const selectCode = (code) => {
  getCellsByCode(code).forEach((targetCell) => {
    targetCell.classList.add("selected");
  });
};

// Apply one of the bundle options (A1 only, A1+TA1, etc.).
const applyBundleSelectionChoice = (baseCode, choiceIndex) => {
  const bundleOptions = SLOT_BUNDLE_OPTIONS[baseCode];
  if (!bundleOptions) return;

  const slotCodes = bundleOptions[choiceIndex];
  if (!slotCodes) return;

  // Reset all slots in this bundle so user can change option.
  const allBundleCodes = Array.from(new Set(bundleOptions.flat()));
  allBundleCodes.forEach((code) => deselectCode(code));
  updateDisabledStates();

  const unavailable = slotCodes.find((code) => !canSelectCode(code));
  if (unavailable) {
    alert(`Cannot select ${unavailable} due to slot conflict.`);
    return;
  }

  slotCodes.forEach((code) => selectCode(code));
  updateDisabledStates();
  scheduleConstraintsSync();
};

// Remove all slots that belong to a bundle (clear A1/TA1/TAA1 together).
const clearBundleSelection = (baseCode) => {
  const bundleOptions = SLOT_BUNDLE_OPTIONS[baseCode];
  if (!bundleOptions) return;
  const allBundleCodes = Array.from(new Set(bundleOptions.flat()));
  allBundleCodes.forEach((code) => deselectCode(code));
  updateDisabledStates();
  scheduleConstraintsSync();
};

// Check if any slot from a bundle is currently selected.
const bundleHasSelection = (baseCode) => {
  const bundleOptions = SLOT_BUNDLE_OPTIONS[baseCode];
  if (!bundleOptions) return false;
  return bundleOptions
    .flat()
    .some((code) => getCellsByCode(code).some((cell) => cell.classList.contains("selected")));
};

// Hide the bundle selection popup.
const hideSlotChoiceMenu = () => {
  if (!slotChoiceMenu) return;
  slotChoiceMenu.classList.add("hidden");
  slotChoiceMenu.setAttribute("aria-hidden", "true");
  if (slotChoiceOptions) slotChoiceOptions.innerHTML = "";
  pendingSlotChoiceCode = null;
};

// Show the bundle selection popup next to the clicked cell.
const showSlotChoiceMenu = (slotCode, anchorCell) => {
  if (!slotChoiceMenu || !slotChoiceOptions || !anchorCell) return;
  const bundleOptions = SLOT_BUNDLE_OPTIONS[slotCode];
  if (!bundleOptions) return;

  pendingSlotChoiceCode = slotCode;
  slotChoiceOptions.innerHTML = "";

  if (slotChoiceTitle) {
    slotChoiceTitle.textContent = `Choose ${slotCode} combination`;
  }

  bundleOptions.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-choice-btn";
    button.setAttribute("data-choice-index", String(index));
    button.textContent = option.length === 1 ? `${option[0]} only` : option.join(" + ");
    slotChoiceOptions.appendChild(button);
  });

  if (bundleHasSelection(slotCode)) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "slot-choice-btn slot-choice-clear";
    clearBtn.setAttribute("data-choice-index", "clear");
    clearBtn.textContent = `Clear ${slotCode} selection`;
    slotChoiceOptions.appendChild(clearBtn);
  }

  const rect = anchorCell.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 6;
  const left = rect.left + window.scrollX;

  slotChoiceMenu.style.top = `${top}px`;
  slotChoiceMenu.style.left = `${left}px`;
  slotChoiceMenu.classList.remove("hidden");
  slotChoiceMenu.setAttribute("aria-hidden", "false");
};

// ============================================================================
// SUBJECT + FACULTY SELECTION
// ============================================================================
// Prepare the conflict map once on load.
buildConflicts();

// Enable/disable lab faculty selection based on subject type.
const updateLabFacultyState = () => {
  if (!subjectTypeSelect || !facultyLabList || !labSelectAll) return;
  const type = subjectTypeSelect.value;
  const disableLab = type === "theory" || type === "";
  const container = facultyLabList.closest(".faculty-select");
  if (container) {
    container.classList.toggle("disabled", disableLab);
  }
  labSelectAll.disabled = disableLab;
  Array.from(facultyLabList.querySelectorAll("input[type='checkbox']")).forEach((cb) => {
    cb.disabled = disableLab;
    if (disableLab) cb.checked = false;
  });
  if (disableLab && labSelectAll) {
    labSelectAll.checked = false;
  }
  if (labFacultyError) {
    labFacultyError.classList.add("hidden");
  }
};

if (subjectTypeSelect) {
  subjectTypeSelect.addEventListener("change", updateLabFacultyState);
  updateLabFacultyState();
}

// ============================================================================
// DATA: FACULTY OPTIONS BY SUBJECT
// ============================================================================
// Loaded from facultyOptions.json so data edits are isolated from logic.
let facultyOptionsBySubject = {};

const loadFacultyOptions = async () => {
  try {
    const response = await fetch(`${API_BASE}/faculty-options`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    facultyOptionsBySubject = (data && typeof data === "object") ? data : {};
    console.log("[faculty] Loaded options for subjects:", Object.keys(facultyOptionsBySubject));
  } catch (error) {
    console.error("[faculty] Failed to load faculty options from /faculty-options:", error);
    facultyOptionsBySubject = {};
  }
  // Rebuild checkboxes now that data is available
  updateFacultyOptions();
  disableSelectedSubjectOptions();
};

const buildFacultyCheckboxList = (listEl, names) => {
  if (!listEl) return;
  listEl.innerHTML = "";
  names.forEach((name) => {
    const label = document.createElement("label");
    label.className = "faculty-option";
    label.innerHTML = `<input type="checkbox" value="${name}"> ${name}`;
    listEl.appendChild(label);
  });
};

// Update "Select all" checkbox based on individual selections.
const updateSelectAllState = (listEl, selectAllEl) => {
  if (!listEl || !selectAllEl) return;
  const boxes = Array.from(listEl.querySelectorAll("input[type='checkbox']"));
  if (!boxes.length) {
    selectAllEl.checked = false;
    return;
  }
  const allChecked = boxes.every((cb) => cb.checked);
  selectAllEl.checked = allChecked;
};

const updateFacultyOptions = () => {
  if (!subjectNameSelect) return;
  const subject = subjectNameSelect.value;
  const options = facultyOptionsBySubject[subject] || { theory: [], lab: [] };
  console.log(`[faculty] Updating lists for "${subject}": ${(options.theory||[]).length} theory, ${(options.lab||[]).length} lab`);
  buildFacultyCheckboxList(facultyTheoryList, options.theory || []);
  buildFacultyCheckboxList(facultyLabList, options.lab || []);
  if (theorySelectAll) theorySelectAll.checked = false;
  if (labSelectAll) labSelectAll.checked = false;
  updateLabFacultyState();
};

if (subjectNameSelect) {
  subjectNameSelect.addEventListener("change", updateFacultyOptions);
}

loadFacultyOptions();

if (theorySelectAll && facultyTheoryList) {
  theorySelectAll.addEventListener("change", () => {
    const checked = theorySelectAll.checked;
    Array.from(facultyTheoryList.querySelectorAll("input[type='checkbox']")).forEach(
      (cb) => {
        cb.checked = checked;
      }
    );
  });
  facultyTheoryList.addEventListener("change", () =>
    updateSelectAllState(facultyTheoryList, theorySelectAll)
  );
}

if (labSelectAll && facultyLabList) {
  labSelectAll.addEventListener("change", () => {
    const checked = labSelectAll.checked;
    Array.from(facultyLabList.querySelectorAll("input[type='checkbox']")).forEach((cb) => {
      if (!cb.disabled) cb.checked = checked;
    });
  });
  facultyLabList.addEventListener("change", () =>
    updateSelectAllState(facultyLabList, labSelectAll)
  );
}
// Local list of subjects saved by the user (front-end state).
const savedSubjects = [];

// ============================================================================
// SAVED SUBJECTS (UI STATE)
// ============================================================================
// Render the saved subject cards.
const renderSavedSubjects = () => {
  if (!savedSubjectsContainer) return;
  savedSubjectsContainer.innerHTML = "";

  if (!savedSubjects.length) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "saved-card";
    emptyCard.textContent = "No subjects saved yet.";
    savedSubjectsContainer.appendChild(emptyCard);
    return;
  }

  savedSubjects.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "saved-card";
    card.innerHTML = `
      <div class="saved-card-content">
        <strong>Subject</strong><span>${item.name}</span>
        <strong>Type</strong><span>${item.typeLabel || "-"}</span>
      </div>
      <button type="button" class="delete-subject-btn" data-index="${index}">Delete</button>
    `;
    savedSubjectsContainer.appendChild(card);
  });
};

// Prevent the same subject from being selected twice.
const disableSelectedSubjectOptions = () => {
  if (!subjectNameSelect) return;
  const selectedSet = new Set(savedSubjects.map((item) => item.name));
  Array.from(subjectNameSelect.options).forEach((option) => {
    if (!option.value) return;
    option.disabled = selectedSet.has(option.value);
  });
};

// ============================================================================
// BACKEND IO
// ============================================================================
// Send one subject to the backend.
const syncSubjectToBackend = (subjectRecord) => {
  fetch(`${API_BASE}/subjects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subjectRecord),
  }).catch((error) => {
    console.error("Failed to save subject in backend:", error);
  });
};

// Remove a subject from the backend.
const deleteSubjectInBackend = (subjectName) => {
  fetch(`${API_BASE}/subjects`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subject_name: subjectName }),
  }).catch((error) => {
    console.error("Failed to delete subject in backend:", error);
  });
};

// Clear all subjects from the backend.
const resetSubjectsInBackend = () => {
  fetch(`${API_BASE}/subjects`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  }).catch((error) => {
    console.error("Failed to reset subjects in backend:", error);
  });
};

// Read all currently selected slot codes from the grid.
const getSelectedConstraintSlots = () =>
  Array.from(selectableCells)
    .filter((cell) => cell.classList.contains("selected"))
    .map((cell) => cell.textContent.trim())
    .filter(Boolean);

// Send selected constraints to backend.
const syncConstraintsToBackend = (selectedSlots) =>
  fetch(`${API_BASE}/constraints`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ slots: selectedSlots }),
  });

// Auto-sync constraints after selection changes (debounced).
let constraintsSyncTimer = null;
const scheduleConstraintsSync = () => {
  const selected = getSelectedConstraintSlots();
  if (constraintsSyncTimer) {
    clearTimeout(constraintsSyncTimer);
  }
  constraintsSyncTimer = setTimeout(() => {
    syncConstraintsToBackend(selected).catch((error) => {
      console.error("Failed to auto-save constraints:", error);
    });
  }, 200);
};


// ============================================================================
// HISTORY — save a successful generate result to localStorage
// ============================================================================
const HISTORY_KEY = "ffcs_history";
const MAX_HISTORY_ENTRIES = 30;

const saveToHistory = (data, constraints) => {
  const combos = Array.isArray(data?.combos) ? data.combos : [];
  if (!combos.length) return; // don't record failed/empty generates

  const now = new Date();
  const label =
    now.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const entry = {
    id: Date.now(),
    label,
    timestamp: Date.now(),
    constraints: constraints.slice(),
    subjects: savedSubjects.map((s) => ({ name: s.name, typeLabel: s.typeLabel || s.type })),
    comboCount: combos.length,
    combos,
  };

  let history = [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    history = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }

  history.unshift(entry); // newest first
  if (history.length > MAX_HISTORY_ENTRIES) {
    history = history.slice(0, MAX_HISTORY_ENTRIES);
  }

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    console.log(`[history] Saved entry "${label}" (${combos.length} combos)`);
  } catch (e) {
    console.error("[history] Failed to save:", e);
  }
};


// ============================================================================
// GENERATED COMBOS RENDERING
// ============================================================================
// Render the backend-generated combos to the page.
const renderGeneratedPayload = (payload) => {
  if (!generatedCombosContainer) return;
  generatedCombosContainer.innerHTML = "";

  const combos = Array.isArray(payload?.combos) ? payload.combos : [];
  if (combos.length) {
    combos.forEach((combo, index) => {
      const card = document.createElement("div");
      card.className = "generated-card";

      const title = document.createElement("p");
      title.className = "generated-title";
      title.textContent = combo.title || `Option ${index + 1}`;
      card.appendChild(title);

      const entries = Array.isArray(combo.entries) ? combo.entries : [];
      if (!entries.length) {
        const emptyLine = document.createElement("p");
        emptyLine.className = "generated-line";
        emptyLine.textContent = "No entries.";
        card.appendChild(emptyLine);
      } else {
        entries.forEach((entry) => {
          const item = document.createElement("div");
          item.className = "generated-item";

          const subjectRow = document.createElement("div");
          subjectRow.className = "generated-row";
          subjectRow.innerHTML = `<strong>Subject</strong><span>${entry.subject || "-"}</span>`;
          item.appendChild(subjectRow);

          const facultyRow = document.createElement("div");
          facultyRow.className = "generated-row";
          facultyRow.innerHTML = `<strong>Faculty Name</strong><span>${entry.faculty || "-"}</span>`;
          item.appendChild(facultyRow);

          if (entry.theory) {
            const theorySlot = document.createElement("div");
            theorySlot.className = "generated-row";
            theorySlot.innerHTML = `<strong>Slot</strong><span>${entry.theory.slot || "-"}</span>`;
            item.appendChild(theorySlot);

            const theoryRoom = document.createElement("div");
            theoryRoom.className = "generated-row";
            theoryRoom.innerHTML = `<strong>Room No.</strong><span>${entry.theory.room || "-"}</span>`;
            item.appendChild(theoryRoom);

            const theoryFaculty = document.createElement("div");
            theoryFaculty.className = "generated-row";
            theoryFaculty.innerHTML = `<strong>Faculty (Theory)</strong><span>${entry.theory.faculty || "-"}</span>`;
            item.appendChild(theoryFaculty);
          }

          if (entry.lab) {
            const labSlot = document.createElement("div");
            labSlot.className = "generated-row";
            labSlot.innerHTML = `<strong>Lab Slot</strong><span>${entry.lab.slot || "-"}</span>`;
            item.appendChild(labSlot);

            const labRoom = document.createElement("div");
            labRoom.className = "generated-row";
            labRoom.innerHTML = `<strong>Lab Room No.</strong><span>${entry.lab.room || "-"}</span>`;
            item.appendChild(labRoom);

            const labFaculty = document.createElement("div");
            labFaculty.className = "generated-row";
            labFaculty.innerHTML = `<strong>Faculty (Lab)</strong><span>${entry.lab.faculty || "-"}</span>`;
            item.appendChild(labFaculty);
          }

          card.appendChild(item);
        });
      }

      generatedCombosContainer.appendChild(card);
    });
    return;
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const card = document.createElement("div");
  card.className = "generated-card";

  if (messages.length) {
    messages.forEach((message) => {
      const line = document.createElement("p");
      line.className = "generated-line";
      line.textContent = message;
      card.appendChild(line);
    });
  } else {
    card.textContent = "No options generated.";
  }

  generatedCombosContainer.appendChild(card);
};

// Reset the generated output area to a default message.
const resetGeneratedState = () => {
  if (!generatedCombosContainer) return;
  generatedCombosContainer.innerHTML = "";
  const card = document.createElement("div");
  card.className = "generated-card";
  card.textContent = "Click Generate to see timetable options.";
  generatedCombosContainer.appendChild(card);
};

// ============================================================================
// EVENT LISTENERS
// ============================================================================
// Save subject button behavior.
if (saveSubjectButton) {
  saveSubjectButton.addEventListener("click", () => {
    const name = subjectNameSelect ? subjectNameSelect.value.trim() : "";
    const type = subjectTypeSelect ? subjectTypeSelect.value : "";
    const typeLabel =
      subjectTypeSelect && subjectTypeSelect.selectedOptions.length
        ? subjectTypeSelect.selectedOptions[0].textContent
        : "";
    const pickedTheoryFaculty = facultyTheoryList
      ? Array.from(facultyTheoryList.querySelectorAll("input[type='checkbox']:checked")).map(
          (cb) => cb.value
        )
      : [];
    const pickedLabFaculty = facultyLabList
      ? Array.from(facultyLabList.querySelectorAll("input[type='checkbox']:checked")).map(
          (cb) => cb.value
        )
      : [];

    if (!name || !type) {
      return;
    }

    if (!pickedTheoryFaculty.length) {
      return;
    }

    if (type !== "theory" && !pickedLabFaculty.length) {
      return;
    }

    if (savedSubjects.length >= MAX_SUBJECTS) {
      alert("You can save at most 10 subjects.");
      return;
    }

    const backendSubject = {
      subject_name: name,
      subject_type: SUBJECT_TYPE_CODE[type],
      theory_faculties: pickedTheoryFaculty,
      lab_faculties: type === "theory" ? [] : pickedLabFaculty,
    };

    savedSubjects.push({
      name,
      type,
      typeLabel,
      theoryFaculty: pickedTheoryFaculty,
      labFaculty: type === "theory" ? [] : pickedLabFaculty,
    });
    renderSavedSubjects();
    disableSelectedSubjectOptions();

    if (subjectNameSelect) subjectNameSelect.value = "";
    if (subjectTypeSelect) subjectTypeSelect.value = "";
    if (subjectDomainSelect) subjectDomainSelect.value = "";
    if (theorySelectAll) theorySelectAll.checked = false;
    if (labSelectAll) labSelectAll.checked = false;
    if (facultyTheoryList) {
      Array.from(facultyTheoryList.querySelectorAll("input[type='checkbox']")).forEach(
        (cb) => (cb.checked = false)
      );
    }
    if (facultyLabList) {
      Array.from(facultyLabList.querySelectorAll("input[type='checkbox']")).forEach(
        (cb) => (cb.checked = false)
      );
    }
    updateLabFacultyState();
    resetGeneratedState();
    syncSubjectToBackend(backendSubject);
  });
}

// Handle deleting a single saved subject.
if (savedSubjectsContainer) {
  savedSubjectsContainer.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const deleteButton = target.closest(".delete-subject-btn");
    if (!deleteButton) return;

    const indexValue = deleteButton.getAttribute("data-index");
    const index = indexValue ? Number(indexValue) : -1;

    if (index < 0 || index >= savedSubjects.length) return;

    const subjectName = savedSubjects[index].name;
    savedSubjects.splice(index, 1);
    renderSavedSubjects();
    disableSelectedSubjectOptions();
    resetGeneratedState();
    deleteSubjectInBackend(subjectName);
  });
}

// Reset all saved subjects (front-end + backend).
if (resetSubjectsButton) {
  resetSubjectsButton.addEventListener("click", () => {
    savedSubjects.length = 0;
    renderSavedSubjects();
    disableSelectedSubjectOptions();
    resetGeneratedState();
    resetSubjectsInBackend();
  });
}

// Click handling for every slot cell.
selectableCells.forEach((cell) => {
  cell.addEventListener("click", () => {
    hideSlotChoiceMenu();
    if (cell.classList.contains("disabled")) return;

    const slotCode = getSlotCode(cell);
    if (SLOT_BUNDLE_OPTIONS[slotCode]) {
      showSlotChoiceMenu(slotCode, cell);
      return;
    }

    cell.classList.toggle("selected");
    updateDisabledStates();
    scheduleConstraintsSync();
  });
});

// Handle clicks inside the bundle popup.
if (slotChoiceMenu) {
  slotChoiceMenu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const choiceButton = target.closest(".slot-choice-btn");
    if (!choiceButton) return;

    const choiceIndexText = choiceButton.getAttribute("data-choice-index");
    if (pendingSlotChoiceCode && choiceIndexText === "clear") {
      clearBundleSelection(pendingSlotChoiceCode);
    } else {
      const choiceIndex = choiceIndexText ? Number(choiceIndexText) : NaN;
      if (pendingSlotChoiceCode && Number.isInteger(choiceIndex)) {
        applyBundleSelectionChoice(pendingSlotChoiceCode, choiceIndex);
      }
    }
    hideSlotChoiceMenu();
  });
}

// Cancel button for the bundle popup.
if (slotChoiceCancel) {
  slotChoiceCancel.addEventListener("click", () => {
    hideSlotChoiceMenu();
  });
}

// Click anywhere else closes the bundle popup.
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!slotChoiceMenu || slotChoiceMenu.classList.contains("hidden")) return;
  if (slotChoiceMenu.contains(target)) return;
  if (target.closest(".slot")) return;
  hideSlotChoiceMenu();
});

// Reset only the timetable selections.
if (resetButton) {
  resetButton.addEventListener("click", () => {
    selectableCells.forEach((cell) => {
      cell.classList.remove("selected");
    });
    updateDisabledStates();
    resetGeneratedState();
    // Also clear backend constraints so file resets immediately.
    syncConstraintsToBackend([]).catch((error) => {
      console.error("Failed to reset constraints:", error);
    });
  });
}

// Confirm button: send current selections to backend.
if (confirmButton) {
  confirmButton.addEventListener("click", () => {
    const selected = getSelectedConstraintSlots();

    const output = `[${selected.join(", ")}]`;
    console.log(output);

    syncConstraintsToBackend(selected).catch((error) => {
      console.error("Failed to send constraints:", error);
    });
  });
}

// Generate button: sync constraints, run backend, show results.
if (generateButton) {
  generateButton.addEventListener("click", () => {
    if (!generatedCombosContainer) return;

    const selected = getSelectedConstraintSlots();
    if (!selected.length) {
      renderGeneratedPayload({
        messages: ["Select timetable slots first."],
      });
      return;
    }

    generatedCombosContainer.innerHTML = "";
    const loadingCard = document.createElement("div");
    loadingCard.className = "generated-card";
    loadingCard.textContent = "Generating options...";
    generatedCombosContainer.appendChild(loadingCard);

    syncConstraintsToBackend(selected)
      .then((response) =>
        response.json().then((data) => ({
          ok: response.ok,
          data,
        }))
      )
      .then(({ ok, data }) => {
        if (!ok) {
          throw new Error(data?.error || "Failed to save constraints before generate.");
        }
        return fetch(`${API_BASE}/generate`);
      })
      .then((response) =>
        response.json().then((data) => ({
          ok: response.ok,
          data,
        }))
      )
      .then(({ ok, data }) => {
        if (!ok || !data?.ok) {
          throw new Error(data?.error || "Failed to generate options.");
        }
        renderGeneratedPayload(data);
        saveToHistory(data, selected); // ← save successful result to history
      })
      .catch((error) => {
        renderGeneratedPayload({
          messages: [`Generate failed: ${error.message}`],
        });
      });
  });
}


// ============================================================================
// INITIAL LOAD
// ============================================================================
// Load saved subjects from backend so you don't need to refresh manually.
const loadSubjectsFromBackend = () =>
  fetch(`${API_BASE}/subjects`)
    .then((response) =>
      response.json().then((data) => ({
        ok: response.ok,
        data,
      }))
    )
    .then(({ ok, data }) => {
      if (!ok || !data) return;
      const subjects = Array.isArray(data.subjects) ? data.subjects : [];
      savedSubjects.length = 0;
      subjects.forEach((item) => {
        if (!item || !item.subject_name) return;
        const typeKey =
          item.subject_type === 1
            ? "theory"
            : item.subject_type === 2
              ? "theory_lab"
              : "integrated";
        const typeLabel =
          typeKey === "theory"
            ? "Theory Only"
            : typeKey === "theory_lab"
              ? "Theory + Lab"
              : "Embedded Theory + Lab";
        savedSubjects.push({
          name: item.subject_name,
          type: typeKey,
          typeLabel,
          faculty: "",
          preferredSlot: "",
        });
      });
      renderSavedSubjects();
      disableSelectedSubjectOptions();
    })
    .catch((error) => {
      console.error("Failed to load subjects from backend:", error);
    });

// Load saved constraints so slot selections persist on reload.
const loadConstraintsFromBackend = () =>
  fetch(`${API_BASE}/constraints`)
    .then((response) =>
      response.json().then((data) => ({
        ok: response.ok,
        data,
      }))
    )
    .then(({ ok, data }) => {
      if (!ok || !data) return;
      const constraints = Array.isArray(data.constraints) ? data.constraints : [];
      // Apply selections to the grid.
      constraints.forEach((code) => selectCode(code));
      updateDisabledStates();
    })
    .catch((error) => {
      console.error("Failed to load constraints from backend:", error);
    });

// Initial render on page load.
renderSavedSubjects();
resetGeneratedState();
loadSubjectsFromBackend();
loadConstraintsFromBackend();
