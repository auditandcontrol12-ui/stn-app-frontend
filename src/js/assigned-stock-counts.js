let currentStatusFilter = "";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function setOutput(value) {
  const el = document.getElementById("output");
  if (el) el.textContent = value;
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCounts(counts) {
  setText("countAssigned", counts?.assigned ?? 0);
  setText("countInProgress", counts?.inProgress ?? 0);
  setText("countSubmitted", counts?.submitted ?? 0);
  setText("countDeleted", counts?.deleted ?? 0);
  setText("countTotal", counts?.total ?? 0);
}

function buildActionButtons(item) {
  const stockCountId = Number(item.StockCountId);
  const area = item.BusinessArea || "";
  const status = item.Status || "";
  let html = "";

  if (status === "Assigned" || status === "In Progress") {
    html += `
      <button
        class="success mini-btn open-btn"
        data-id="${stockCountId}"
        data-area="${escapeHtml(area)}"
      >
        Open
      </button>
    `;
  }

  if (status === "Submitted") {
    html += `
      <button
        class="secondary mini-btn view-result-btn"
        data-id="${stockCountId}"
        data-area="${escapeHtml(area)}"
      >
        View Result
      </button>
    `;
  }

  if (status !== "Deleted") {
    html += `
      <button
        class="danger mini-btn delete-btn"
        data-id="${stockCountId}"
        data-no="${escapeHtml(item.CountNumber || "")}"
      >
        Delete
      </button>
    `;
  }

  return html || "-";
}

function renderRows(items) {
  const tbody = document.getElementById("assignedBody");
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;">No stock counts found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.CountNumber || "")}</td>
      <td>${escapeHtml(item.BusinessArea || "")}</td>
      <td>${escapeHtml(item.WarehouseCode || "")} - ${escapeHtml(item.WarehouseName || "")}</td>
      <td>${escapeHtml(item.AssignedToUserName || "")}</td>
      <td>${escapeHtml(item.Status || "")}</td>
      <td>${escapeHtml(formatDateTime(item.AssignedDateTime))}</td>
      <td>${escapeHtml(formatDateTime(item.StartedDateTime))}</td>
      <td>${escapeHtml(formatDateTime(item.SubmittedDateTime))}</td>
      <td class="col-actions">${buildActionButtons(item)}</td>
    </tr>
  `).join("");

  [...document.querySelectorAll(".open-btn")].forEach((btn) => {
    btn.addEventListener("click", async () => {
      const stockCountId = Number(btn.dataset.id);
      const area = btn.dataset.area || "";

      if (!stockCountId) return;

      try {
        showPageLoader?.("Opening stock count...");

        if (area) {
          localStorage.setItem("selectedArea", area);
        }

        const res = await fetch("/api/startStockCount", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ stockCountId })
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Non-JSON response: ${text}`);
        }

        if (!res.ok || !data.success) {
          alert(data.message || "Failed to open stock count.");
          return;
        }

        window.location.href = `/stock-count-sheet.html?stockCountId=${encodeURIComponent(stockCountId)}`;
      } catch (err) {
        alert(err.message);
      } finally {
        hidePageLoader?.();
      }
    });
  });

  [...document.querySelectorAll(".view-result-btn")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const stockCountId = Number(btn.dataset.id);
      const area = btn.dataset.area || "";

      if (!stockCountId) return;

      if (area) {
        localStorage.setItem("selectedArea", area);
      }

      window.location.href = `/stock-count-result.html?stockCountId=${encodeURIComponent(stockCountId)}`;
    });
  });

  [...document.querySelectorAll(".delete-btn")].forEach((btn) => {
    btn.addEventListener("click", async () => {
      const stockCountId = Number(btn.dataset.id);
      const countNo = btn.dataset.no || "";

      if (!stockCountId) return;

      const ok = window.confirm(`Delete ${countNo}?`);
      if (!ok) return;

      try {
        showPageLoader?.("Deleting stock count...");

        const res = await fetch("/api/deleteStockCount", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ stockCountId })
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Non-JSON response: ${text}`);
        }

        if (!res.ok || !data.success) {
          alert(data.message || "Delete failed.");
          return;
        }

        await loadAssignedStockCounts(currentStatusFilter);
      } catch (err) {
        alert(err.message);
      } finally {
        hidePageLoader?.();
      }
    });
  });
}

function highlightFilter(status) {
  [...document.querySelectorAll(".status-filter-btn")].forEach((btn) => {
    if ((btn.dataset.status || "") === status) {
      btn.classList.add("success");
    } else {
      btn.classList.remove("success");
    }
  });
}

async function loadAssignedStockCounts(status = "") {
  try {
    currentStatusFilter = status;
    highlightFilter(status);

    showPageLoader?.("Loading assigned stock counts...");
    setOutput("Loading assigned stock counts...");

    const url = status
      ? `/api/getAssignedStockCounts?status=${encodeURIComponent(status)}`
      : "/api/getAssignedStockCounts";

    const res = await fetch(url, {
      credentials: "include"
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response: ${text}`);
    }

    setOutput(JSON.stringify(data, null, 2));

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to load assigned stock counts.");
    }

    renderCounts(data.counts || {});
    renderRows(Array.isArray(data.items) ? data.items : []);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

[...document.querySelectorAll(".status-filter-btn")].forEach((btn) => {
  btn.addEventListener("click", () => {
    loadAssignedStockCounts(btn.dataset.status || "");
  });
});

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadAssignedStockCounts("");