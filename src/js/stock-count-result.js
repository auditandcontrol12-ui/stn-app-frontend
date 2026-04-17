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

async function loadStockCountResult() {
  const output = document.getElementById("stockCountResultOutput");
  const body = document.getElementById("stockCountResultLines");

  if (!stockCountId) {
    if (output) output.textContent = "stockCountId missing.";
    return;
  }

  try {
    const res = await fetch(`/api/getStockCount?stockCountId=${encodeURIComponent(stockCountId)}`, {
      credentials: "include"
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (output) output.textContent = `Non-JSON response:\n${text}`;
      return;
    }

    if (output) output.textContent = JSON.stringify(data, null, 2);

    if (!res.ok || !data.success) {
      return;
    }

    const h = data.header;
    const lines = data.lines || [];

    document.title = h.CountNumber || "Stock Count";

    setText("scrCountNumber", h.CountNumber);
    setText("scrWarehouse", `${h.WarehouseCode || ""} - ${h.WarehouseName || ""}`);
    setText("scrArea", h.BusinessArea || "");
    setText("scrSubmittedAt", formatDateTime(h.SubmittedDateTime));

    setText("scrPrintCountNumber", h.CountNumber);
    setText("scrPrintStatus", h.Status);
    setText("scrPreparedBy", h.CreatedBy || "");

    if (body) {
      body.innerHTML = "";

      lines.forEach((line, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="col-line">${index + 1}</td>
          <td>${line.ItemCode || ""}</td>
          <td>${line.ItemName || ""}</td>
          <td>${line.UOM || ""}</td>
          <td>${line.BatchNumber || ""}</td>
          <td>${formatQty(line.SystemQtyAtStart)}</td>
          <td>${formatQty(line.CountedQty)}</td>
          <td>${formatQty(line.VarianceQty)}</td>
        `;
        body.appendChild(tr);
      });
    }
  } catch (err) {
    if (output) output.textContent = `Error: ${err.message}`;
  }
}

document.getElementById("printStockCountBtn")?.addEventListener("click", () => {
  window.print();
});

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadStockCountResult();