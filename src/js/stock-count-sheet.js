const params = new URLSearchParams(window.location.search);
const stockCountId = params.get("stockCountId") || "";

let currentHeader = null;
let currentLines = [];

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function setOutput(text) {
  const el = document.getElementById("stockCountSheetOutput");
  if (el) el.textContent = text;
}

function renderSheet() {
  setText("schCountNumber", currentHeader?.CountNumber || "");
  setText("schWarehouse", `${currentHeader?.WarehouseCode || ""} - ${currentHeader?.WarehouseName || ""}`);
  setText("schArea", currentHeader?.BusinessArea || "");
  setText("schStatus", currentHeader?.Status || "");

  const body = document.getElementById("stockCountSheetLines");
  if (!body) return;

  body.innerHTML = "";

  currentLines.forEach((line, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-line">${index + 1}</td>
      <td>${line.ItemCode || ""}</td>
      <td>${line.ItemName || ""}</td>
      <td>${line.UOM || ""}</td>
      <td>${line.BatchNumber || ""}</td>
      <td><input type="number" step="0.000001" class="counted-qty" data-lineid="${line.StockCountLineId}" value="${line.CountedQty ?? ""}" /></td>
    `;
    body.appendChild(tr);
  });
}

async function loadStockCount() {
  if (!stockCountId) {
    setOutput("stockCountId missing.");
    return;
  }

  try {
    setOutput("Loading stock count...");

    const res = await fetch(`/api/getStockCount?stockCountId=${encodeURIComponent(stockCountId)}`, {
      credentials: "include"
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      setOutput(`Non-JSON response:\n${text}`);
      return;
    }

    setOutput(JSON.stringify(data, null, 2));

    if (!res.ok || !data.success) {
      alert(data.message || "Failed to load stock count.");
      return;
    }

    currentHeader = data.header;
    currentLines = data.lines || [];

    renderSheet();
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
}

document.getElementById("submitStockCountBtn")?.addEventListener("click", async () => {
  const inputs = [...document.querySelectorAll(".counted-qty")];

  const lines = inputs.map((input) => ({
    stockCountLineId: Number(input.dataset.lineid),
    countedQty: input.value
  }));

  for (const [index, line] of lines.entries()) {
    if (line.countedQty === "" || line.countedQty === null || line.countedQty === undefined) {
      alert(`Line ${index + 1}: counted qty is required.`);
      return;
    }
    if (Number(line.countedQty) < 0) {
      alert(`Line ${index + 1}: counted qty cannot be negative.`);
      return;
    }
  }

  try {
    setOutput("Submitting stock count...");

    const res = await fetch("/api/submitStockCount", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        stockCountId: Number(stockCountId),
        lines
      })
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      setOutput(`Non-JSON response:\n${text}`);
      return;
    }

    setOutput(JSON.stringify(data, null, 2));

    if (!res.ok || !data.success) {
      alert(data.message || "Failed to submit stock count.");
      return;
    }

    window.location.href = `/stock-count-result.html?stockCountId=${encodeURIComponent(stockCountId)}`;
  } catch (err) {
    setOutput(`Error: ${err.message}`);
  }
});

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadStockCount();