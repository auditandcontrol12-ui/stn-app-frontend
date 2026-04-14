const params = new URLSearchParams(window.location.search);
const txnType = params.get("type") || "";
const businessArea = params.get("area") || "";

const output = document.getElementById("output");
const linesContainer = document.getElementById("linesContainer");

let items = [];
let warehouses = [];
let lineCounter = 0;

function log(msg, obj = null) {
  if (!output) return;
  if (obj) {
    output.textContent = `${msg}\n\n${JSON.stringify(obj, null, 2)}`;
  } else {
    output.textContent = msg;
  }
}

function todayString() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function loadCurrentUser() {
  const raw = localStorage.getItem("stnCurrentUser");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadSavedDraft() {
  const raw = localStorage.getItem("stnDraftData");
  if (!raw) return null;

  try {
    const draft = JSON.parse(raw);

    if (
      draft &&
      draft.stnType === txnType &&
      draft.businessArea === businessArea
    ) {
      return draft;
    }

    return null;
  } catch {
    return null;
  }
}

function setEntryStatus(status) {
  const statusText = document.getElementById("entryStatusText");
  const banner = document.getElementById("entryStatusBanner");

  if (!statusText || !banner) return;

  if (status === "Draft") {
    statusText.textContent = "Draft";
    banner.className = "status-banner status-draft";
    banner.textContent = "Saved as Draft. You can still make changes and resave before final submission.";
    return;
  }

  if (status === "Submitted") {
    statusText.textContent = "Submitted";
    banner.className = "status-banner status-submitted";
    banner.textContent = "Successfully submitted. This STN has already been stored in the database.";
    return;
  }

  statusText.textContent = "Unsaved";
  banner.className = "status-banner status-unsaved";
  banner.textContent = "Not yet saved. Current changes are only in this session and are not stored in the database.";
}

function fillHeaderInfo() {
  const user = loadCurrentUser();
  const existingDraft = loadSavedDraft();

  const txnTypeEl = document.getElementById("txnType");
  const businessAreaEl = document.getElementById("businessArea");
  const stnDateTextEl = document.getElementById("stnDateText");
  const createdByEl = document.getElementById("createdBy");
  const createdByEmailEl = document.getElementById("createdByEmail");

  if (txnTypeEl) txnTypeEl.textContent = txnType;
  if (businessAreaEl) businessAreaEl.textContent = businessArea;
  if (stnDateTextEl) stnDateTextEl.textContent = todayString();
  if (createdByEl) createdByEl.textContent = user?.HoldingName || user?.UserName || "";
  if (createdByEmailEl) createdByEmailEl.textContent = user?.UserEmail || "";

  setEntryStatus(existingDraft?.status || "Unsaved");
}

function buildWarehouseOptions(selectEl) {
  if (!selectEl) return;

  selectEl.innerHTML = "";

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "-- Select Warehouse --";
  selectEl.appendChild(defaultOpt);

  warehouses.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w.WhsCode;
    opt.textContent = `${w.WhsCode} - ${w.WhsName}`;
    selectEl.appendChild(opt);
  });

  const otherOpt = document.createElement("option");
  otherOpt.value = "__OTHER__";
  otherOpt.textContent = "Other";
  selectEl.appendChild(otherOpt);
}

function toggleCustomWarehouse(selectId, inputId) {
  const selectEl = document.getElementById(selectId);
  const inputEl = document.getElementById(inputId);

  if (!selectEl || !inputEl) return;

  if (selectEl.value === "__OTHER__") {
    inputEl.style.display = "block";
  } else {
    inputEl.style.display = "none";
    inputEl.value = "";
  }
}

function createItemOptions(selectEl) {
  if (!selectEl) return;

  selectEl.innerHTML = "";

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "-- Select Item --";
  selectEl.appendChild(defaultOpt);

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
  const rows = [...document.querySelectorAll("#linesContainer > tr")];
  rows.forEach((row, index) => {
    row.dataset.lineNo = index + 1;
    const lineCell = row.querySelector(".line-no");
    if (lineCell) {
      lineCell.textContent = index + 1;
    }
  });
}

function addLineRow(lineData = null) {
  if (!linesContainer) {
    log("linesContainer not found.");
    return;
  }

  lineCounter += 1;

  const row = document.createElement("tr");
  row.dataset.lineNo = lineCounter;

  row.innerHTML = `
    <td class="col-line line-no">${lineCounter}</td>
    <td><select class="line-item"></select></td>
    <td><input class="line-item-name" type="text" readonly /></td>
    <td><input class="line-uom" type="text" readonly /></td>
    <td><input class="line-batch" type="text" /></td>
    <td><input class="line-qty" type="number" step="0.000001" /></td>
    <td><input class="line-remarks" type="text" /></td>
    <td class="col-actions"><button type="button" class="danger mini-btn remove-line-btn">Remove</button></td>
  `;

  linesContainer.appendChild(row);

  const itemSelect = row.querySelector(".line-item");
  const itemName = row.querySelector(".line-item-name");
  const uom = row.querySelector(".line-uom");

  createItemOptions(itemSelect);

  itemSelect.addEventListener("change", () => {
    const selected = itemSelect.options[itemSelect.selectedIndex];
    itemName.value = selected?.dataset?.itemName || "";
    uom.value = selected?.dataset?.uom || "";
  });

  row.querySelector(".remove-line-btn").addEventListener("click", () => {
    row.remove();
    refreshLineNumbers();
    markDraftAsUnsavedIfNeeded();
  });

  row.querySelector(".line-batch").addEventListener("input", markDraftAsUnsavedIfNeeded);
  row.querySelector(".line-qty").addEventListener("input", markDraftAsUnsavedIfNeeded);
  row.querySelector(".line-remarks").addEventListener("input", markDraftAsUnsavedIfNeeded);
  itemSelect.addEventListener("change", markDraftAsUnsavedIfNeeded);

  if (lineData) {
    itemSelect.value = lineData.itemCode || "";
    itemSelect.dispatchEvent(new Event("change"));
    row.querySelector(".line-batch").value = lineData.batchNumber || "";
    row.querySelector(".line-qty").value = lineData.qty || "";
    row.querySelector(".line-remarks").value = lineData.lineRemarks || "";
  }
}

function collectFormData() {
  const user = loadCurrentUser();
  const savedDraft = loadSavedDraft();

  const lines = [...document.querySelectorAll("#linesContainer > tr")].map((row, index) => ({
    lineNu: index + 1,
    itemCode: row.querySelector(".line-item")?.value || "",
    itemName: row.querySelector(".line-item-name")?.value || "",
    uom: row.querySelector(".line-uom")?.value || "",
    batchNumber: row.querySelector(".line-batch")?.value?.trim() || "",
    qty: row.querySelector(".line-qty")?.value || "",
    lineRemarks: row.querySelector(".line-remarks")?.value?.trim() || ""
  }));

  return {
    stnId: savedDraft?.stnId || null,
    stnNumber: savedDraft?.stnNumber || "",
    stnSeqNo: savedDraft?.stnSeqNo || null,
    stnType: txnType,
    businessArea,
    stnDate: todayString(),
    warehouseFrom: document.getElementById("warehouseFrom")?.value || "",
    warehouseTo: document.getElementById("warehouseTo")?.value || "",
    warehouseFromCustom: document.getElementById("warehouseFromCustom")?.value?.trim() || "",
    warehouseToCustom: document.getElementById("warehouseToCustom")?.value?.trim() || "",
    remarks: document.getElementById("remarks")?.value?.trim() || "",
    createdBy: user?.HoldingName || user?.UserName || "",
    createdByEmail: user?.UserEmail || "",
    status: savedDraft?.status === "Draft" ? "Draft" : "Unsaved",
    lines
  };
}

function validateForm(data) {
  if (!data.stnType) return "STN Type missing.";
  if (!data.businessArea) return "Business Area missing.";
  if (!data.createdByEmail) return "User not loaded from dashboard.";
  if (!data.warehouseFrom) return "Warehouse From is required.";
  if (!data.warehouseTo) return "Warehouse To is required.";

  if (data.warehouseFrom === "__OTHER__" && !data.warehouseFromCustom) {
    return "Custom Warehouse From is required.";
  }

  if (data.warehouseTo === "__OTHER__" && !data.warehouseToCustom) {
    return "Custom Warehouse To is required.";
  }

  if (!data.lines.length) return "At least one line is required.";

  for (const line of data.lines) {
    if (!line.itemCode) return `Line ${line.lineNu}: Item is required.`;
    if (!line.qty || Number(line.qty) <= 0) return `Line ${line.lineNu}: Qty must be greater than 0.`;
  }

  return "";
}

function restoreDraftToForm(draft) {
  if (!draft) return false;

  const warehouseFrom = document.getElementById("warehouseFrom");
  const warehouseTo = document.getElementById("warehouseTo");
  const warehouseFromCustom = document.getElementById("warehouseFromCustom");
  const warehouseToCustom = document.getElementById("warehouseToCustom");
  const remarks = document.getElementById("remarks");

  if (warehouseFrom) warehouseFrom.value = draft.warehouseFrom || "";
  if (warehouseTo) warehouseTo.value = draft.warehouseTo || "";

  toggleCustomWarehouse("warehouseFrom", "warehouseFromCustom");
  toggleCustomWarehouse("warehouseTo", "warehouseToCustom");

  if (warehouseFromCustom) warehouseFromCustom.value = draft.warehouseFromCustom || "";
  if (warehouseToCustom) warehouseToCustom.value = draft.warehouseToCustom || "";
  if (remarks) remarks.value = draft.remarks || "";

  linesContainer.innerHTML = "";
  lineCounter = 0;

  if (draft.lines && draft.lines.length) {
    draft.lines.forEach(line => addLineRow(line));
  } else {
    addLineRow();
  }

  refreshLineNumbers();
  setEntryStatus(draft.status || "Unsaved");
  return true;
}

function loadLookups() {
  return (async () => {
    try {
      if (!businessArea) {
        log("Business area missing in URL.");
        return;
      }

      log(`Loading lookups for ${businessArea}...`);

      const res = await fetch(`/api/getLookups?area=${encodeURIComponent(businessArea)}`);
      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        log(`Non-JSON response:\n${text}`);
        return;
      }

      if (!data.success) {
        log("Lookup API returned failure.", data);
        return;
      }

      items = data.items || [];
      warehouses = data.warehouses || [];

      buildWarehouseOptions(document.getElementById("warehouseFrom"));
      buildWarehouseOptions(document.getElementById("warehouseTo"));

      const restored = restoreDraftToForm(loadSavedDraft());

      if (!restored) {
        addLineRow();
      }

      log("Lookups loaded successfully.", {
        success: true,
        itemCount: items.length,
        warehouseCount: warehouses.length,
        area: businessArea,
        restoredDraft: restored
      });
    } catch (err) {
      log(`Error while loading lookups: ${err.message}`);
    }
  })();
}

function markDraftAsUnsavedIfNeeded() {
  const savedDraft = loadSavedDraft();
  if (savedDraft?.status === "Draft") {
    setEntryStatus("Unsaved");
  }
}

function bindEvents() {
  const warehouseFrom = document.getElementById("warehouseFrom");
  const warehouseTo = document.getElementById("warehouseTo");
  const warehouseFromCustom = document.getElementById("warehouseFromCustom");
  const warehouseToCustom = document.getElementById("warehouseToCustom");
  const remarks = document.getElementById("remarks");
  const addLineBtn = document.getElementById("addLineBtn");
  const previewBtn = document.getElementById("previewBtn");
  const backDashboardBtn = document.getElementById("backDashboardBtn");

  if (warehouseFrom) {
    warehouseFrom.addEventListener("change", () => {
      toggleCustomWarehouse("warehouseFrom", "warehouseFromCustom");
      markDraftAsUnsavedIfNeeded();
    });
  }

  if (warehouseTo) {
    warehouseTo.addEventListener("change", () => {
      toggleCustomWarehouse("warehouseTo", "warehouseToCustom");
      markDraftAsUnsavedIfNeeded();
    });
  }

  if (warehouseFromCustom) warehouseFromCustom.addEventListener("input", markDraftAsUnsavedIfNeeded);
  if (warehouseToCustom) warehouseToCustom.addEventListener("input", markDraftAsUnsavedIfNeeded);
  if (remarks) remarks.addEventListener("input", markDraftAsUnsavedIfNeeded);

  if (addLineBtn) {
    addLineBtn.addEventListener("click", () => {
      addLineRow();
      refreshLineNumbers();
      markDraftAsUnsavedIfNeeded();
    });
  }

  if (previewBtn) {
    previewBtn.addEventListener("click", () => {
      const data = collectFormData();
      const error = validateForm(data);

      if (error) {
        alert(error);
        return;
      }

      data.status = loadSavedDraft()?.status === "Draft" ? "Draft" : "Unsaved";
      localStorage.setItem("stnDraftData", JSON.stringify(data));
      window.location.href = "/stn-preview.html";
    });
  }

  if (backDashboardBtn) {
    backDashboardBtn.addEventListener("click", () => {
      window.location.href = "/dashboard.html";
    });
  }
}

function init() {
  try {
    fillHeaderInfo();
    bindEvents();
    loadLookups();
  } catch (err) {
    log(`Page init failed: ${err.message}`);
    console.error(err);
  }
}

init();