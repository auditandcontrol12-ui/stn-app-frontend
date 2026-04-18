const params = new URLSearchParams(window.location.search);
const txnType = params.get("type") || "";
const businessArea = params.get("area") || "";
const stnIdFromUrl = params.get("stnId") || "";
const pageMode = params.get("mode") || "";

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

function clearStnDraftState() {
  localStorage.removeItem("stnDraftData");
  localStorage.removeItem("stnLastSubmitted");
  localStorage.removeItem("stnPreviewData");
  localStorage.removeItem("stnCurrentEditId");
  sessionStorage.removeItem("stnDraftData");
  sessionStorage.removeItem("stnPreviewData");
  sessionStorage.removeItem("stnCurrentEditId");
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
  if (pageMode === "new") {
    return null;
  }

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

function getTxnTypeDisplay(value) {
  const map = {
    IN: "IN-BOUND",
    OB: "OUT-BOUND"
  };
  return map[value] || value || "";
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

  if (txnTypeEl) txnTypeEl.textContent = getTxnTypeDisplay(txnType);
  if (businessAreaEl) businessAreaEl.textContent = businessArea;
  if (stnDateTextEl) stnDateTextEl.textContent = existingDraft?.stnDate || todayString();
  if (createdByEl) createdByEl.textContent = user?.UserName || "";
  if (createdByEmailEl) createdByEmailEl.textContent = user?.UserEmail || "";

  setEntryStatus(existingDraft?.status || (stnIdFromUrl ? "Draft" : "Unsaved"));
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

function buildItemDatalist() {
  let list = document.getElementById("itemCodeList");

  if (!list) {
    list = document.createElement("datalist");
    list.id = "itemCodeList";
    document.body.appendChild(list);
  }

  list.innerHTML = "";

  items.forEach((i) => {
    const opt = document.createElement("option");
    opt.value = i.ItemCode || "";
    opt.label = `${i.ItemName || ""} | ${i.UOM || ""}`;
    list.appendChild(opt);
  });
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

function sanitizeQtyInput(input) {
  if (!input) return;
  input.value = input.value.replace(/[^\d]/g, "");
}

function findItem(term) {
  const q = String(term || "").trim().toLowerCase();
  if (!q) return null;

  return items.find((i) =>
    String(i.ItemCode || "").toLowerCase() === q ||
    String(i.ItemName || "").toLowerCase() === q
  ) || null;
}

function applySelectedItemToRow(row, item) {
  if (!row) return;

  const itemSearch = row.querySelector(".line-item-search");
  const itemCode = row.querySelector(".line-item");
  const itemName = row.querySelector(".line-item-name");
  const uom = row.querySelector(".line-uom");

  if (!item) {
    if (itemCode) itemCode.value = "";
    if (itemName) itemName.value = "";
    if (uom) uom.value = "";
    return;
  }

  if (itemCode) itemCode.value = item.ItemCode || "";
  if (itemSearch) itemSearch.value = item.ItemCode || "";
  if (itemName) itemName.value = item.ItemName || "";
  if (uom) uom.value = item.UOM || "";
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
    <td>
      <input class="line-item-search" type="text" list="itemCodeList" placeholder="Type item code" autocomplete="off" />
      <input class="line-item" type="hidden" />
    </td>
    <td><input class="line-item-name" type="text" readonly /></td>
    <td><input class="line-uom" type="text" readonly /></td>
    <td><input class="line-batch" type="text" /></td>
    <td><input class="line-qty" type="number" step="1" min="1" inputmode="numeric" /></td>
    <td><input class="line-remarks" type="text" /></td>
    <td class="col-actions"><button type="button" class="danger mini-btn remove-line-btn">Remove</button></td>
  `;

  linesContainer.appendChild(row);

  const itemSearch = row.querySelector(".line-item-search");
  const qtyInput = row.querySelector(".line-qty");
  const batchInput = row.querySelector(".line-batch");
  const remarksInput = row.querySelector(".line-remarks");

  function resolveItemSelection() {
    const item = findItem(itemSearch.value);
    applySelectedItemToRow(row, item);
    markDraftAsUnsavedIfNeeded();
  }

  itemSearch.addEventListener("change", resolveItemSelection);
  itemSearch.addEventListener("blur", resolveItemSelection);

  row.querySelector(".remove-line-btn").addEventListener("click", () => {
    row.remove();
    refreshLineNumbers();
    markDraftAsUnsavedIfNeeded();
  });

  qtyInput.addEventListener("input", () => {
    sanitizeQtyInput(qtyInput);
    markDraftAsUnsavedIfNeeded();
  });

  batchInput.addEventListener("input", markDraftAsUnsavedIfNeeded);
  remarksInput.addEventListener("input", markDraftAsUnsavedIfNeeded);

  if (lineData) {
    const item = items.find((i) => i.ItemCode === (lineData.itemCode || ""));
    applySelectedItemToRow(row, item);
    batchInput.value = lineData.batchNumber || "";
    qtyInput.value = lineData.qty || "";
    sanitizeQtyInput(qtyInput);
    remarksInput.value = lineData.lineRemarks || "";
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
    stnDate: savedDraft?.stnDate || todayString(),
    warehouseFrom: document.getElementById("warehouseFrom")?.value || "",
    warehouseTo: document.getElementById("warehouseTo")?.value || "",
    warehouseFromCustom: document.getElementById("warehouseFromCustom")?.value?.trim() || "",
    warehouseToCustom: document.getElementById("warehouseToCustom")?.value?.trim() || "",
    remarks: document.getElementById("remarks")?.value?.trim() || "",
    createdBy: user?.UserName || "",
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
    if (!line.batchNumber) return `Line ${line.lineNu}: Batch Number is required.`;
    if (!line.qty) return `Line ${line.lineNu}: Qty is required.`;
    if (!Number.isInteger(Number(line.qty)) || Number(line.qty) <= 0) {
      return `Line ${line.lineNu}: Qty must be a whole number greater than 0.`;
    }
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
    draft.lines.forEach((line) => addLineRow(line));
  } else {
    addLineRow();
  }

  refreshLineNumbers();
  setEntryStatus(draft.status || "Unsaved");
  return true;
}

function resetForNewEntry() {
  clearStnDraftState();

  const warehouseFrom = document.getElementById("warehouseFrom");
  const warehouseTo = document.getElementById("warehouseTo");
  const warehouseFromCustom = document.getElementById("warehouseFromCustom");
  const warehouseToCustom = document.getElementById("warehouseToCustom");
  const remarks = document.getElementById("remarks");

  if (warehouseFrom) warehouseFrom.value = "";
  if (warehouseTo) warehouseTo.value = "";

  toggleCustomWarehouse("warehouseFrom", "warehouseFromCustom");
  toggleCustomWarehouse("warehouseTo", "warehouseToCustom");

  if (warehouseFromCustom) warehouseFromCustom.value = "";
  if (warehouseToCustom) warehouseToCustom.value = "";
  if (remarks) remarks.value = "";

  if (linesContainer) {
    linesContainer.innerHTML = "";
  }

  lineCounter = 0;
  addLineRow();
  refreshLineNumbers();
  setEntryStatus("Unsaved");
}

function loadLookups() {
  return (async () => {
    try {
      if (!businessArea) {
        log("Business area missing in URL.");
        return;
      }

      log(`Loading lookups for ${businessArea}...`);

      const res = await fetch(`/api/getLookups?area=${encodeURIComponent(businessArea)}`, {
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

      if (!data.success) {
        log("Lookup API returned failure.", data);
        return;
      }

      items = data.items || [];
      warehouses = data.warehouses || [];

      buildItemDatalist();
      buildWarehouseOptions(document.getElementById("warehouseFrom"));
      buildWarehouseOptions(document.getElementById("warehouseTo"));

      let draftToRestore = null;
      let restored = false;

      if (pageMode === "new") {
        resetForNewEntry();
        log("Lookups loaded successfully.", {
          success: true,
          itemCount: items.length,
          warehouseCount: warehouses.length,
          area: businessArea,
          restoredDraft: false,
          mode: pageMode
        });
        return;
      }

      if (stnIdFromUrl) {
        try {
          draftToRestore = await loadDraftFromDb(stnIdFromUrl);
          localStorage.setItem("stnDraftData", JSON.stringify(draftToRestore));
        } catch (err) {
          log(`Failed to load STN from database: ${err.message}`);
        }
      }

      if (!draftToRestore) {
        draftToRestore = loadSavedDraft();
      }

      if (draftToRestore) {
        restored = restoreDraftToForm(draftToRestore);
      }

      if (!restored) {
        addLineRow();
      }

      log("Lookups loaded successfully.", {
        success: true,
        itemCount: items.length,
        warehouseCount: warehouses.length,
        area: businessArea,
        restoredDraft: restored,
        stnIdFromUrl: stnIdFromUrl || null,
        mode: pageMode || "default"
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

async function loadDraftFromDb(stnId) {
  const res = await fetch(`/api/getSTN?stnId=${encodeURIComponent(stnId)}`, {
    credentials: "include"
  });

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response:\n${text}`);
  }

  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to load STN from database.");
  }

  const h = data.header;
  const lines = data.lines || [];

  return {
    stnId: h.STNId,
    stnNumber: h.STNNumber,
    stnSeqNo: h.STNSeqNo,
    stnType: h.STNType,
    businessArea: h.BusinessArea,
    stnDate: h.STNDate ? String(h.STNDate).slice(0, 10) : todayString(),
    warehouseFrom: h.WarehouseFrom || "",
    warehouseTo: h.WarehouseTo || "",
    warehouseFromCustom: h.WarehouseFromCustom || "",
    warehouseToCustom: h.WarehouseToCustom || "",
    remarks: h.Remarks || "",
    createdBy: h.CreatedBy || "",
    createdByEmail: h.CreatedByEmail || "",
    status: h.Status || "Draft",
    lines: lines.map((line) => ({
      lineNu: line.LineNu,
      itemCode: line.ItemCode || "",
      itemName: line.ItemName || "",
      uom: line.UOM || "",
      batchNumber: line.BatchNumber || "",
      qty: line.Qty || "",
      lineRemarks: line.LineRemarks || ""
    }))
  };
}

function init() {
  try {
    if (pageMode === "new") {
      clearStnDraftState();
    }

    fillHeaderInfo();
    bindEvents();
    loadLookups();
  } catch (err) {
    log(`Page init failed: ${err.message}`);
    console.error(err);
  }
}

init();