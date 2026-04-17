const output = document.getElementById("stockCountOutput");
const linesContainer = document.getElementById("stockCountLinesContainer");

let items = [];
let warehouses = [];
let lineCounter = 0;

function log(msg, obj = null) {
  if (!output) return;
  output.textContent = obj ? `${msg}\n\n${JSON.stringify(obj, null, 2)}` : msg;
}

function loadSelectedArea() {
  return localStorage.getItem("selectedArea") || "";
}

function buildWarehouseOptions() {
  const selectEl = document.getElementById("scWarehouse");
  if (!selectEl) return;

  selectEl.innerHTML = `<option value="">-- Select Warehouse --</option>`;

  warehouses.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w.WhsCode;
    opt.textContent = `${w.WhsCode} - ${w.WhsName}`;
    selectEl.appendChild(opt);
  });
}

function createItemOptions(selectEl) {
  if (!selectEl) return;

  selectEl.innerHTML = `<option value="">-- Select Item --</option>`;

  items.forEach((i) => {
    const opt = document.createElement("option");
    opt.value = i.ItemCode;
    opt.textContent = `${i.ItemCode} - ${i.ItemName}`;
    opt.dataset.itemName = i.ItemName;
    opt.dataset.uom = i.UOM;
    selectEl.appendChild(opt);
  });
}

function refreshLineNumbers() {
  const rows = [...document.querySelectorAll("#stockCountLinesContainer > tr")];
  rows.forEach((row, index) => {
    row.dataset.lineNo = index + 1;
    const lineCell = row.querySelector(".line-no");
    if (lineCell) lineCell.textContent = index + 1;
  });
}

async function loadBatchOptions(batchSelect, warehouseCode, itemCode) {
  if (!batchSelect) return;

  batchSelect.innerHTML = `<option value="">Loading batches...</option>`;

  const area = loadSelectedArea();

  try {
    const res = await fetch(`/api/getStockCountLookups?area=${encodeURIComponent(area)}&warehouse=${encodeURIComponent(warehouseCode)}&itemCode=${encodeURIComponent(itemCode)}`, {
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      batchSelect.innerHTML = `<option value="">No batches</option>`;
      return;
    }

    batchSelect.innerHTML = `<option value="">-- Select Batch --</option>`;

    (data.batches || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.BatchNumber || "";
      opt.textContent = `${b.BatchNumber || "(No Batch)"} | System Qty: ${b.SystemQty}`;
      batchSelect.appendChild(opt);
    });
  } catch {
    batchSelect.innerHTML = `<option value="">No batches</option>`;
  }
}

function addLineRow(lineData = null) {
  if (!linesContainer) return;

  const existingRows = [...document.querySelectorAll("#stockCountLinesContainer > tr")];
  if (existingRows.length >= 10) {
    alert("Maximum 10 lines allowed.");
    return;
  }

  lineCounter += 1;

  const row = document.createElement("tr");
  row.dataset.lineNo = lineCounter;

  row.innerHTML = `
    <td class="col-line line-no">${lineCounter}</td>
    <td><select class="sc-item"></select></td>
    <td><input class="sc-item-name" type="text" readonly /></td>
    <td><input class="sc-uom" type="text" readonly /></td>
    <td><select class="sc-batch"><option value="">-- Select Batch --</option></select></td>
    <td class="col-actions"><button type="button" class="danger mini-btn remove-line-btn">Remove</button></td>
  `;

  linesContainer.appendChild(row);

  const itemSelect = row.querySelector(".sc-item");
  const itemName = row.querySelector(".sc-item-name");
  const uom = row.querySelector(".sc-uom");
  const batchSelect = row.querySelector(".sc-batch");

  createItemOptions(itemSelect);

  itemSelect.addEventListener("change", async () => {
    const selected = itemSelect.options[itemSelect.selectedIndex];
    itemName.value = selected?.dataset?.itemName || "";
    uom.value = selected?.dataset?.uom || "";

    const warehouseCode = document.getElementById("scWarehouse")?.value || "";
    const itemCode = itemSelect.value || "";

    if (warehouseCode && itemCode) {
      await loadBatchOptions(batchSelect, warehouseCode, itemCode);
    } else {
      batchSelect.innerHTML = `<option value="">-- Select Batch --</option>`;
    }
  });

  row.querySelector(".remove-line-btn")?.addEventListener("click", () => {
    row.remove();
    refreshLineNumbers();
  });

  if (lineData) {
    itemSelect.value = lineData.itemCode || "";
    itemSelect.dispatchEvent(new Event("change"));
    batchSelect.value = lineData.batchNumber || "";
  }
}

function collectFormData() {
  const area = loadSelectedArea();

  const lines = [...document.querySelectorAll("#stockCountLinesContainer > tr")].map((row, index) => ({
    lineNu: index + 1,
    itemCode: row.querySelector(".sc-item")?.value || "",
    itemName: row.querySelector(".sc-item-name")?.value || "",
    uom: row.querySelector(".sc-uom")?.value || "",
    batchNumber: row.querySelector(".sc-batch")?.value || ""
  }));

  return {
    area,
    warehouseCode: document.getElementById("scWarehouse")?.value || "",
    remarks: document.getElementById("scRemarks")?.value?.trim() || "",
    lines
  };
}

function validateForm(data) {
  if (!data.area) return "Business Area not selected.";
  if (!data.warehouseCode) return "Warehouse is required.";
  if (!data.lines.length) return "At least one line is required.";
  if (data.lines.length > 10) return "Maximum 10 lines allowed.";

  for (const line of data.lines) {
    if (!line.itemCode) return `Line ${line.lineNu}: item is required.`;
    if (!line.batchNumber && line.batchNumber !== "") return `Line ${line.lineNu}: batch is required.`;
  }

  return "";
}

async function loadLookups() {
  const area = loadSelectedArea();
  const areaEl = document.getElementById("scBusinessArea");

  if (areaEl) areaEl.textContent = area || "-";

  if (!area) {
    log("Select Business Area from dashboard first.");
    return;
  }

  try {
    log(`Loading stock count lookups for ${area}...`);

    const res = await fetch(`/api/getStockCountLookups?area=${encodeURIComponent(area)}`, {
      credentials: "include"
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      log(`Non-JSON response:\n${text}`);
      return;
    }

    if (!res.ok || !data.success) {
      log("Lookup API returned failure.", data);
      return;
    }

    items = data.items || [];
    warehouses = data.warehouses || [];

    buildWarehouseOptions();
    addLineRow();

    log("Lookups loaded successfully.", {
      itemCount: items.length,
      warehouseCount: warehouses.length,
      area
    });
  } catch (err) {
    log(`Error while loading lookups: ${err.message}`);
  }
}

document.getElementById("scWarehouse")?.addEventListener("change", () => {
  const rows = [...document.querySelectorAll("#stockCountLinesContainer > tr")];
  rows.forEach((row) => {
    const itemSelect = row.querySelector(".sc-item");
    const batchSelect = row.querySelector(".sc-batch");
    if (itemSelect?.value) {
      loadBatchOptions(batchSelect, document.getElementById("scWarehouse")?.value || "", itemSelect.value);
    } else {
      batchSelect.innerHTML = `<option value="">-- Select Batch --</option>`;
    }
  });
});

document.getElementById("addCountLineBtn")?.addEventListener("click", () => {
  addLineRow();
  refreshLineNumbers();
});

document.getElementById("startStockCountBtn")?.addEventListener("click", async () => {
  const data = collectFormData();
  const error = validateForm(data);

  if (error) {
    alert(error);
    return;
  }

  try {
    log("Starting stock count...");

    const res = await fetch("/api/startStockCount", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const text = await res.text();

    let responseData;
    try {
      responseData = JSON.parse(text);
    } catch {
      log(`Non-JSON response:\n${text}`);
      return;
    }

    log("Start stock count response", responseData);

    if (!res.ok || !responseData.success) {
      alert(responseData.message || "Failed to start stock count.");
      return;
    }

    window.location.href = `/stock-count-sheet.html?stockCountId=${encodeURIComponent(responseData.stockCountId)}`;
  } catch (err) {
    log(`Error: ${err.message}`);
  }
});

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadLookups();