function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadReconcileResult() {
  const raw = localStorage.getItem("stnReconcileResult");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatQty(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
}

function renderPreview() {
  const data = loadReconcileResult();
  const body = document.getElementById("reconcileLinesContainer");

  if (!data) {
    alert("No reconcile result found.");
    return;
  }

  const filters = data.filters || {};
  const meta = data.meta || {};
  const rows = Array.isArray(data.rows) ? data.rows : [];

  setText("rcArea", filters.area || "");
  setText("rcWarehouse", `${filters.warehouse || ""} - ${filters.warehouseName || ""}`);
  setText("rcStartDate", formatDate(filters.startDate));
  setText("rcEndDate", formatDate(filters.endDate));
  setText("rcType", meta.reconcileType || "");
  setText("rcRowCount", meta.rowCount || 0);

  setText("rcPrintWarehouse", filters.warehouse || "");
  setText("rcPrintArea", filters.area || "");

  document.title = `Reconcile - ${filters.warehouse || "Warehouse"} - ${formatDate(filters.startDate)} to ${formatDate(filters.endDate)}`;

  if (body) {
    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;">No reconciliation rows found.</td>
        </tr>
      `;
    } else {
      body.innerHTML = "";

      rows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(row.ItemCode || "")}</td>
          <td>${escapeHtml(row.ItemName || "")}</td>
          <td>${escapeHtml(row.UOM || "")}</td>
          <td>${escapeHtml(row.BatchNumber || "")}</td>
          <td>${formatQty(row.InQty)}</td>
          <td>${formatQty(row.OutQty)}</td>
          <td>${formatQty(row.NetQty)}</td>
        `;
        body.appendChild(tr);
      });
    }
  }
}

document.getElementById("backReconcileBtn")?.addEventListener("click", () => {
  window.location.href = "/reconcile-stock.html";
});

document.getElementById("printReconcileBtn")?.addEventListener("click", () => {
  window.print();
});

showPageLoader?.("Loading reconcile preview...");
try {
  renderPreview();
} finally {
  hidePageLoader?.();
}