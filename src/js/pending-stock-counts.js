function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function setOutput(value) {
  const el = document.getElementById("output");
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function saveAreaForStockCount(area) {
  if (area) {
    localStorage.setItem("selectedArea", area);
  }
}

function renderRows(items) {
  const tbody = document.getElementById("pendingBody");
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;">No pending stock counts found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.CountNumber || "")}</td>
      <td>${escapeHtml(item.BusinessArea || "")}</td>
      <td>${escapeHtml(item.WarehouseCode || "")} - ${escapeHtml(item.WarehouseName || "")}</td>
      <td>${escapeHtml(item.Status || "")}</td>
      <td>${escapeHtml(item.AssignedBy || "")}</td>
      <td>${escapeHtml(formatDateTime(item.AssignedDateTime))}</td>
      <td>${escapeHtml(formatDateTime(item.StartedDateTime))}</td>
      <td class="col-actions">
        <button
          class="success mini-btn open-btn"
          data-id="${item.StockCountId}"
          data-area="${escapeHtml(item.BusinessArea || "")}"
        >
          Open
        </button>
      </td>
    </tr>
  `).join("");

  [...document.querySelectorAll(".open-btn")].forEach((btn) => {
    btn.addEventListener("click", async () => {
      const stockCountId = Number(btn.dataset.id);
      const area = btn.dataset.area || "";

      if (!stockCountId) return;

      try {
        showPageLoader?.("Opening stock count...");
        saveAreaForStockCount(area);

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
}

async function loadPending() {
  try {
    showPageLoader?.("Loading pending stock counts...");
    setOutput("Loading pending stock counts...");

    const res = await fetch("/api/getPendingStockCounts", {
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
      throw new Error(data.message || "Failed to load pending stock counts.");
    }

    renderRows(Array.isArray(data.items) ? data.items : []);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadPending();