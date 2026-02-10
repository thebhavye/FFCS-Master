const historyList = document.getElementById("historyList");
const backHome = document.getElementById("backHome");
const clearHistory = document.getElementById("clearHistory");

const renderHistory = (memories) => {
  if (!historyList) return;
  historyList.innerHTML = "";

  if (!memories.length) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "saved-card";
    emptyCard.textContent = "No history saved yet.";
    historyList.appendChild(emptyCard);
    return;
  }

  memories.forEach((memory) => {
    const card = document.createElement("div");
    card.className = "saved-card";

    const content = memory.content || "Generated timetable";
    const metadata = memory.metadata || {};
    const constraints = Array.isArray(metadata.constraints)
      ? metadata.constraints.join(", ")
      : "-";
    const subjects = Array.isArray(metadata.subjects)
      ? metadata.subjects.join(", ")
      : "-";
    const comboCount =
      typeof metadata.combo_count === "number" ? metadata.combo_count : "-";
    const sampleCombos = Array.isArray(metadata.sample_combos)
      ? metadata.sample_combos
      : [];
    const createdAt = memory.created_at || "";

    card.innerHTML = `
      <div class="saved-card-content">
        <strong>Summary</strong><span>${content}</span>
        <strong>Subjects</strong><span>${subjects}</span>
        <strong>Constraints</strong><span>${constraints}</span>
        <strong>Combo Count</strong><span>${comboCount}</span>
        <strong>Created</strong><span>${createdAt}</span>
      </div>
    `;

    if (sampleCombos.length) {
      const comboWrap = document.createElement("div");
      comboWrap.className = "generated-list";
      sampleCombos.forEach((combo, idx) => {
        const comboCard = document.createElement("div");
        comboCard.className = "generated-card";
        const title = document.createElement("p");
        title.className = "generated-title";
        title.textContent = combo.title || `Sample ${idx + 1}`;
        comboCard.appendChild(title);
        const entries = Array.isArray(combo.entries) ? combo.entries : [];
        if (!entries.length) {
          const line = document.createElement("p");
          line.className = "generated-line";
          line.textContent = "No entries.";
          comboCard.appendChild(line);
        } else {
          entries.forEach((entry) => {
            const line = document.createElement("p");
            line.className = "generated-line";
            line.textContent = entry.subject ? entry.subject : JSON.stringify(entry);
            comboCard.appendChild(line);
          });
        }
        comboWrap.appendChild(comboCard);
      });
      card.appendChild(comboWrap);
    }

    historyList.appendChild(card);
  });
};

const API_BASE = `http://${window.location.hostname}:5000`;

const fetchJson = (url, options) =>
  fetch(url, options).then(async (response) => {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return { ok: response.ok, data };
    }
    const text = await response.text();
    return { ok: response.ok, data: null, text };
  });

const loadHistory = () => {
  fetchJson(`${API_BASE}/history?source=local`)
    .then(({ ok, data, text }) => {
      if (!ok || !data?.ok) {
        throw new Error(data?.error || text || "Failed to load history.");
      }
      const memories = Array.isArray(data.data?.memories) ? data.data.memories : [];
      renderHistory(memories);
    })
    .catch((error) => {
      if (!historyList) return;
      historyList.innerHTML = "";
      const card = document.createElement("div");
      card.className = "saved-card";
      card.textContent = `Error: ${error.message}`;
      historyList.appendChild(card);
    });
};

if (backHome) {
  backHome.addEventListener("click", () => {
    window.location.href = "index.html";
  });
}

if (clearHistory) {
  clearHistory.addEventListener("click", () => {
    fetchJson(`${API_BASE}/history/clear`, { method: "POST" })
      .then(({ ok, data, text }) => {
        if (!ok || !data?.ok) {
          throw new Error(data?.error || text || "Failed to clear history.");
        }
        loadHistory();
      })
      .catch((error) => {
        if (!historyList) return;
        historyList.innerHTML = "";
        const card = document.createElement("div");
        card.className = "saved-card";
        card.textContent = `Error: ${error.message}`;
        historyList.appendChild(card);
      });
  });
}

loadHistory();
