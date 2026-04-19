const params = new URLSearchParams(window.location.search);
const stockCountId = params.get("stockCountId") || "";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function formatDateTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatQty(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadStockCountResult() {
  const body = document.getElementById("stockCountResultLines");

  if (!stockCountId) {
    alert("stockCountId missing.");
    return;
  }

  try {
    showPageLoader?.("Loading stock count result...");

    const res = await fetch(`/api/getStockCount?stockCountId=${encodeURIComponent(stockCountId)}`, {
      credentials: "include"
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      alert("Invalid response received from server.");
      return;
    }

    if (!res.ok || !data.success) {
      alert(data.message || "Failed to load stock count result.");
      return;
    }

    const h = data.header || {};
    const lines = Array.isArray(data.lines) ? data.lines : [];

    if (h.BusinessArea) {
      localStorage.setItem("selectedArea", h.BusinessArea);
    }

    document.title = h.CountNumber || "Stock Count";

    setText("scrCountNumber", h.CountNumber);
    setText("scrWarehouse", `${h.WarehouseCode || ""} - ${h.WarehouseName || ""}`);
    setText("scrArea", h.BusinessArea || "");
    setText("scrSubmittedAt", formatDateTime(h.SubmittedDateTime));

    setText("scrPrintCountNumber", h.CountNumber);
    setText("scrPrintStatus", h.Status);
    setText("scrPreparedBy", h.CreatedBy || "");

    if (body) {
      if (!lines.length) {
        body.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center;">No stock count result lines found.</td>
          </tr>
        `;
      } else {
        body.innerHTML = "";

        lines.forEach((line, index) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td class="col-line">${index + 1}</td>
            <td>${escapeHtml(line.ItemCode || "")}</td>
            <td>${escapeHtml(line.ItemName || "")}</td>
            <td>${escapeHtml(line.UOM || "")}</td>
            <td>${escapeHtml(line.BatchNumber || "")}</td>
            <td>${formatQty(line.SystemQtyAtStart)}</td>
            <td>${formatQty(line.CountedQty)}</td>
            <td>${formatQty(line.VarianceQty)}</td>
          `;
          body.appendChild(tr);
        });
      }
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    hidePageLoader?.();
  }
}

document.getElementById("printStockCountBtn")?.addEventListener("click", () => {
  window.print();
});

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadStockCountResult();