// ============================================================================
// FFCS MASTER — history.js
// ============================================================================

const HISTORY_KEY = "ffcs_history";

// ── State ──
let historyEntries = [];
let selectedEntryId = null;
let compareSet = new Set(); // holds up to 2 entry IDs

// ── DOM refs ──
const historyList   = document.getElementById("historyList");
const histMain      = document.getElementById("histMain");
const compareBar    = document.getElementById("compareBar");
const compareBtn    = document.getElementById("compareBtn");
const cancelCmpBtn  = document.getElementById("cancelCompareBtn");
const clearAllBtn   = document.getElementById("clearAllBtn");
const compareCountEl = document.getElementById("compareCount");

// ============================================================================
// STORAGE
// ============================================================================
const loadHistory = () => {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        historyEntries = Array.isArray(parsed) ? parsed : [];
    } catch {
        historyEntries = [];
    }
};

const saveHistory = () => {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
    } catch (e) {
        console.error("Failed to persist history:", e);
    }
};

// ============================================================================
// HELPERS
// ============================================================================
const formatTimestamp = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-IN", {
        month: "short",
        day:   "numeric",
        year:  "numeric",
    }) + " · " + d.toLocaleTimeString("en-IN", {
        hour:   "2-digit",
        minute: "2-digit",
    });
};

// Build an HTML block of slot tags, truncating after `limit`.
const slotTagsHtml = (constraints, limit = 99) => {
    const slots = constraints || [];
    const visible = slots.slice(0, limit);
    const extra   = slots.length - visible.length;
    return visible.map(s => `<span class="hist-slot-tag">${s}</span>`).join("")
        + (extra > 0 ? `<span class="hist-slot-tag">+${extra}</span>` : "");
};

// Diff two constraint arrays — returns { added, removed } relative to entry2 vs entry1.
const diffConstraints = (arr1, arr2) => {
    const set1 = new Set(arr1 || []);
    const set2 = new Set(arr2 || []);
    return {
        added:   [...set2].filter(s => !set1.has(s)),
        removed: [...set1].filter(s => !set2.has(s)),
    };
};

// ============================================================================
// COMBO RENDERER — mirrors renderGeneratedPayload in script.js
// ============================================================================
const renderCombos = (combos, container) => {
    container.innerHTML = "";

    if (!combos || !combos.length) {
        const empty = document.createElement("div");
        empty.className = "generated-card generated-card--empty";
        empty.textContent = "No combos recorded for this session.";
        container.appendChild(empty);
        return;
    }

    combos.forEach((combo, index) => {
        const card = document.createElement("div");
        card.className = "generated-card";

        const title = document.createElement("p");
        title.className = "generated-title";
        title.textContent = combo.title || `Option ${index + 1}`;
        card.appendChild(title);

        const entries = Array.isArray(combo.entries) ? combo.entries : [];
        if (!entries.length) {
            const empty = document.createElement("p");
            empty.className = "generated-line";
            empty.textContent = "No entries.";
            card.appendChild(empty);
        } else {
            entries.forEach((entry) => {
                const item = document.createElement("div");
                item.className = "generated-item";

                const makeRow = (label, value) => {
                    const row = document.createElement("div");
                    row.className = "generated-row";
                    row.innerHTML = `<strong>${label}</strong><span>${value || "—"}</span>`;
                    return row;
                };

                item.appendChild(makeRow("Subject", entry.subject));
                item.appendChild(makeRow("Faculty Name", entry.faculty));

                if (entry.theory) {
                    item.appendChild(makeRow("Slot",              entry.theory.slot));
                    item.appendChild(makeRow("Room No.",          entry.theory.room));
                    item.appendChild(makeRow("Faculty (Theory)",  entry.theory.faculty));
                }
                if (entry.lab) {
                    item.appendChild(makeRow("Lab Slot",         entry.lab.slot));
                    item.appendChild(makeRow("Lab Room No.",      entry.lab.room));
                    item.appendChild(makeRow("Faculty (Lab)",     entry.lab.faculty));
                }

                card.appendChild(item);
            });
        }

        container.appendChild(card);
    });
};

// ============================================================================
// SIDEBAR RENDER
// ============================================================================
const renderSidebar = () => {
    if (!historyList) return;
    historyList.innerHTML = "";

    if (!historyEntries.length) {
        historyList.innerHTML = `
            <div class="hist-no-history">
                <p class="hist-no-history-title">No history yet</p>
                <p class="hist-no-history-sub">Generate a timetable on the main app and it will show up here.</p>
            </div>`;
        return;
    }

    historyEntries.forEach((entry) => {
        const isActive   = entry.id === selectedEntryId;
        const isChecked  = compareSet.has(entry.id);
        const subjectStr = (entry.subjects || []).map(s => s.name).join(", ") || "—";
        const comboCount = entry.comboCount ?? entry.combos?.length ?? 0;

        const card = document.createElement("div");
        card.className = "hist-entry-card" + (isActive ? " active" : "");
        card.setAttribute("data-id", String(entry.id));

        card.innerHTML = `
            <div class="hist-entry-top">
                <div class="hist-entry-left">
                    <input
                        type="checkbox"
                        class="hist-entry-checkbox"
                        data-id="${entry.id}"
                        ${isChecked ? "checked" : ""}
                        title="Select for comparison"
                    >
                    <span class="hist-entry-label">${entry.label || formatTimestamp(entry.timestamp)}</span>
                </div>
                <div class="hist-entry-right">
                    <span class="hist-entry-combo-count">${comboCount} combos</span>
                    <button class="hist-entry-delete" data-id="${entry.id}" title="Delete entry">✕</button>
                </div>
            </div>
            <div class="hist-entry-slots">${slotTagsHtml(entry.constraints, 7)}</div>
            <div class="hist-entry-subjects">${subjectStr}</div>
        `;

        historyList.appendChild(card);
    });

    updateCompareBar();
};

const updateCompareBar = () => {
    if (!compareBar || !compareBtn || !compareCountEl) return;
    const count = compareSet.size;

    if (count > 0) {
        compareBar.classList.remove("hidden");
        compareCountEl.textContent = `${count} selected`;
        if (count === 2) {
            compareBtn.disabled = false;
            compareBtn.textContent = "Compare 2";
        } else {
            compareBtn.disabled = true;
            compareBtn.textContent = `Need ${2 - count} more`;
        }
    } else {
        compareBar.classList.add("hidden");
    }
};

// ============================================================================
// MAIN PANEL: SINGLE ENTRY VIEW
// ============================================================================
const renderSingleEntry = (entry) => {
    if (!histMain) return;
    histMain.innerHTML = "";

    const view = document.createElement("div");
    view.className = "hist-view";

    // ── Meta header ──
    const header = document.createElement("div");
    header.className = "hist-view-header";
    header.innerHTML = `
        <div class="hist-view-label">${entry.label || formatTimestamp(entry.timestamp)}</div>
        <div class="hist-view-meta">
            <div class="hist-meta-group">
                <span class="hist-meta-label">Date &amp; Time</span>
                <span class="hist-meta-value">${formatTimestamp(entry.timestamp)}</span>
            </div>
            <div class="hist-meta-group">
                <span class="hist-meta-label">Slots Selected</span>
                <div class="hist-meta-tags">${slotTagsHtml(entry.constraints)}</div>
            </div>
            <div class="hist-meta-group">
                <span class="hist-meta-label">Subjects</span>
                <span class="hist-meta-value">${
                    (entry.subjects || []).map(s => `${s.name} <em style="opacity:.6;font-size:11px;">(${s.typeLabel})</em>`).join(", ") || "—"
                }</span>
            </div>
            <div class="hist-meta-group">
                <span class="hist-meta-label">Combos Found</span>
                <span class="hist-meta-value">${entry.comboCount ?? entry.combos?.length ?? 0}</span>
            </div>
        </div>
    `;
    view.appendChild(header);

    // ── Combos section ──
    const combosTitle = document.createElement("p");
    combosTitle.className = "hist-combos-section-title";
    combosTitle.textContent = `Generated Options (${entry.combos?.length || 0})`;
    view.appendChild(combosTitle);

    const grid = document.createElement("div");
    grid.className = "hist-combos-grid generated-list";
    renderCombos(entry.combos, grid);
    view.appendChild(grid);

    histMain.appendChild(view);
};

// ============================================================================
// MAIN PANEL: COMPARE VIEW
// ============================================================================
const renderCompareView = () => {
    if (!histMain || compareSet.size !== 2) return;

    const [id1, id2] = Array.from(compareSet);
    const entry1 = historyEntries.find(e => e.id === id1);
    const entry2 = historyEntries.find(e => e.id === id2);
    if (!entry1 || !entry2) return;

    histMain.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "hist-compare-view";

    // Header bar
    const headerBar = document.createElement("div");
    headerBar.className = "hist-compare-header-bar";
    headerBar.innerHTML = `
        <span class="hist-compare-header-title">Comparing 2 Sessions</span>
        <button class="hist-compare-exit" id="exitCompareBtn">Exit Compare</button>
    `;
    wrapper.appendChild(headerBar);

    // Two-column body
    const cols = document.createElement("div");
    cols.className = "hist-compare-cols";

    [entry1, entry2].forEach((entry, colIdx) => {
        const otherEntry = colIdx === 0 ? entry2 : entry1;
        const { added, removed } = diffConstraints(otherEntry.constraints, entry.constraints);

        const col = document.createElement("div");
        col.className = "hist-compare-col";

        // Build diff badges for slot tags
        const diffSlotHtml = (entry.constraints || []).map(s => {
            const isNew = added.includes(s);
            return `<span class="hist-slot-tag">${s}</span>${isNew ? '<span class="hist-diff-badge hist-diff-badge--added">new</span>' : ""}`;
        }).join(" ");

        const removedHtml = removed.length
            ? `<div class="hist-meta-group" style="margin-top:6px;">
                   <span class="hist-meta-label" style="color:var(--red);">Not in this session</span>
                   <div class="hist-meta-tags">${removed.map(s => `<span class="hist-slot-tag" style="opacity:.5;">${s}</span>`).join("")}</div>
               </div>`
            : "";

        const colHeader = document.createElement("div");
        colHeader.className = "hist-compare-col-header";
        colHeader.innerHTML = `
            <div class="hist-compare-col-label">${entry.label || formatTimestamp(entry.timestamp)}</div>
            <div class="hist-meta-group" style="margin-bottom: 10px;">
                <span class="hist-meta-label">Slots</span>
                <div class="hist-meta-tags" style="margin-top: 5px;">${diffSlotHtml}</div>
            </div>
            ${removedHtml}
            <div class="hist-meta-group" style="margin-top:8px;">
                <span class="hist-meta-label">Subjects</span>
                <span class="hist-meta-value">${(entry.subjects || []).map(s => s.name).join(", ") || "—"}</span>
            </div>
            <p class="hist-compare-col-count">${entry.comboCount ?? entry.combos?.length ?? 0} combos found</p>
        `;
        col.appendChild(colHeader);

        const grid = document.createElement("div");
        grid.className = "hist-combos-grid generated-list";
        renderCombos(entry.combos, grid);
        col.appendChild(grid);

        cols.appendChild(col);
    });

    wrapper.appendChild(cols);
    histMain.appendChild(wrapper);

    document.getElementById("exitCompareBtn")?.addEventListener("click", () => {
        compareSet.clear();
        updateCompareBar();
        renderSidebar();
        renderMainDefault();
    });
};

// ============================================================================
// MAIN PANEL: DEFAULT / EMPTY
// ============================================================================
const renderMainDefault = () => {
    if (!histMain) return;

    if (selectedEntryId) {
        const entry = historyEntries.find(e => e.id === selectedEntryId);
        if (entry) { renderSingleEntry(entry); return; }
        selectedEntryId = null;
    }

    histMain.innerHTML = `
        <div class="hist-empty">
            <p class="hist-empty-title">No session selected</p>
            <p class="hist-empty-sub">Pick a session from the sidebar to view its generated timetable options, or select two to compare them side by side.</p>
        </div>
    `;
};

// ============================================================================
// EVENT DELEGATION — sidebar list
// ============================================================================
historyList?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    // Delete button
    const deleteBtn = target.closest(".hist-entry-delete");
    if (deleteBtn) {
        event.stopPropagation();
        const id = Number(deleteBtn.getAttribute("data-id"));
        deleteEntry(id);
        return;
    }

    // Checkbox — toggle compare selection
    if (target.classList.contains("hist-entry-checkbox")) {
        event.stopPropagation();
        const id = Number(target.getAttribute("data-id"));
        if (target.checked) {
            if (compareSet.size >= 2) {
                // Already have 2 — deselect oldest, add new
                const oldest = compareSet.values().next().value;
                compareSet.delete(oldest);
            }
            compareSet.add(id);
        } else {
            compareSet.delete(id);
        }
        renderSidebar();   // re-render checkboxes and bar
        return;
    }

    // Card body click — open single view (only if not mid-compare)
    const card = target.closest(".hist-entry-card");
    if (card && !compareSet.size) {
        const id = Number(card.getAttribute("data-id"));
        selectedEntryId = id;
        renderSidebar();
        const entry = historyEntries.find(e => e.id === id);
        if (entry) renderSingleEntry(entry);
    }
});

// Compare button
compareBtn?.addEventListener("click", () => {
    if (compareSet.size !== 2) return;
    renderCompareView();
});

// Cancel compare
cancelCmpBtn?.addEventListener("click", () => {
    compareSet.clear();
    updateCompareBar();
    renderSidebar();
});

// Clear all
clearAllBtn?.addEventListener("click", () => {
    if (!historyEntries.length) return;
    if (!confirm("Clear all session history? This cannot be undone.")) return;
    historyEntries = [];
    saveHistory();
    selectedEntryId = null;
    compareSet.clear();
    renderSidebar();
    renderMainDefault();
});

// ============================================================================
// DELETE ONE ENTRY
// ============================================================================
const deleteEntry = (id) => {
    historyEntries = historyEntries.filter(e => e.id !== id);
    saveHistory();
    compareSet.delete(id);
    if (selectedEntryId === id) {
        selectedEntryId = null;
    }
    renderSidebar();
    renderMainDefault();
};

// ============================================================================
// INIT
// ============================================================================
loadHistory();
renderSidebar();
renderMainDefault();
