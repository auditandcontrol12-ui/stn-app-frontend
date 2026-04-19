function qs(id) {
  return document.getElementById(id);
}

function getCurrentUser() {
  const raw = localStorage.getItem("stnCurrentUser");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getSelectedArea() {
  return localStorage.getItem("selectedArea") || "";
}

let currentUser = getCurrentUser();
let selectedArea = getSelectedArea();
let lookups = null;
let lineNo = 0;

function setOutput(value) {
  const el = qs("output");
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

function getPageArea() {
  return (
    qs("businessArea")?.value?.trim() ||
    selectedArea ||
    localStorage.getItem("selectedArea") ||
    ""
  );
}

function renderWarehouseOptions() {
  const select = qs("warehouseCode");
  if (!select || !lookups) return;

  const warehouses = Array.isArray(lookups.warehouses) ? lookups.warehouses : [];
  select.innerHTML =
    `<option value="">Select warehouse</option>` +
    warehouses.map((w) => `
      <option value="${escapeHtml(w.WhsCode || "")}">
        ${escapeHtml((w.WhsCode || "") + " - " + (w.WhsName || ""))}
      </option>
    `).join("");
}

function renderSupervisorOptions(users) {
  const select = qs("assignedToUserEmail");
  if (!select) return;

  select.innerHTML =
    `<option value="">Select supervisor</option>` +
    users.map((u) => `
      <option value="${escapeHtml(u.UserEmail || "")}">
        ${escapeHtml((u.UserName || "") + " - " + (u.UserEmail || ""))}
      </option>
    `).join("");
}

function buildItemOptions() {
  if (!lookups) return "";
  const items = Array.isArray(lookups.items) ? lookups.items : [];

  return `<option value="">Select item</option>` + items.map((item) => {
    const itemCode = item.ItemCode || "";
    const itemName = item.ItemName || "";
    const uom = item.UOM || "";

    return `
      <option
        value="${escapeHtml(itemCode)}"
        data-itemname="${escapeHtml(itemName)}"
        data-uom="${escapeHtml(uom)}"
      >
        ${escapeHtml(itemCode)} - ${escapeHtml(itemName)}
      </option>
    `;
  }).join("");
}

function addLineRow(line = {}) {
  lineNo += 1;
  const tbody = qs("linesBody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.dataset.lineNo = String(lineNo);

  tr.innerHTML = `
    <td class="col-line">${lineNo}</td>
    <td>
      <select class="line-item-code">
        ${buildItemOptions()}
      </select>
    </td>
    <td>
      <input class="line-item-name" type="text" readonly value="${escapeHtml(line.itemName || "")}" />
    </td>
    <td>
      <input class="line-uom" type="text" readonly value="${escapeHtml(line.uom || "")}" />
    </td>
    <td>
      <input class="line-batch-number" type="text" value="${escapeHtml(line.batchNumber || "")}" />
    </td>
    <td class="col-actions">
      <button type="button" class="danger mini-btn remove-line-btn">Remove</button>
    </td>
  `;

  tbody.appendChild(tr);

  const itemSelect = tr.querySelector(".line-item-code");
  const itemNameInput = tr.querySelector(".line-item-name");
  const uomInput = tr.querySelector(".line-uom");
  const removeBtn = tr.querySelector(".remove-line-btn");

  if (itemSelect && line.itemCode) {
    itemSelect.value = line.itemCode;
    const selected = itemSelect.options[itemSelect.selectedIndex];
    itemNameInput.value = selected?.dataset?.itemname || line.itemName || "";
    uomInput.value = selected?.dataset?.uom || line.uom || "";
  }

  itemSelect?.addEventListener("change", () => {
    const selected = itemSelect.options[itemSelect.selectedIndex];
    itemNameInput.value = selected?.dataset?.itemname || "";
    uomInput.value = selected?.dataset?.uom || "";
  });

  removeBtn?.addEventListener("click", () => {
    tr.remove();
    refreshLineNumbers();
  });
}

function refreshLineNumbers() {
  const rows = [...document.querySelectorAll("#linesBody tr")];
  rows.forEach((tr, index) => {
    tr.dataset.lineNo = String(index + 1);
    const firstCell = tr.querySelector(".col-line");
    if (firstCell) firstCell.textContent = String(index + 1);
  });
  lineNo = rows.length;
}

function collectLines() {
  const rows = [...document.querySelectorAll("#linesBody tr")];
  return rows.map((tr) => {
    const itemCode = tr.querySelector(".line-item-code")?.value?.trim() || "";
    const itemName = tr.querySelector(".line-item-name")?.value?.trim() || "";
    const uom = tr.querySelector(".line-uom")?.value?.trim() || "";
    const batchNumber = tr.querySelector(".line-batch-number")?.value?.trim() || "";

    return {
      itemCode,
      itemName,
      uom,
      batchNumber
    };
  });
}

function validateAssignment(area, warehouseCode, assignedToUserEmail, lines) {
  if (!area) return "Select Business Area first.";
  if (!warehouseCode) return "Warehouse is required.";
  if (!assignedToUserEmail) return "Supervisor is required.";
  if (!lines.length) return "At least one line is required.";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNoText = i + 1;

    if (!line.itemCode) return `Line ${lineNoText}: Item Code is required.`;
    if (!line.batchNumber) return `Line ${lineNoText}: Batch Number is required.`;
  }

  return "";
}

async function loadPageData() {
  const area = getPageArea();

  if (!area) {
    throw new Error("Select Business Area first.");
  }

  const lookupRes = await fetch(`/api/getLookups?area=${encodeURIComponent(area)}`, {
    credentials: "include"
  });

  const lookupText = await lookupRes.text();
  let lookupData;
  try {
    lookupData = JSON.parse(lookupText);
  } catch {
    throw new Error(`Non-JSON lookup response: ${lookupText}`);
  }

  if (!lookupRes.ok || !lookupData.success) {
    throw new Error(lookupData.message || "Failed to load lookups.");
  }

  lookups = lookupData;
  renderWarehouseOptions();

  const assigneeRes = await fetch("/api/getLookups?mode=assignableUsers", {
    credentials: "include"
  });

  const assigneeText = await assigneeRes.text();
  let assigneeData;
  try {
    assigneeData = JSON.parse(assigneeText);
  } catch {
    throw new Error(`Non-JSON assignable users response: ${assigneeText}`);
  }

  if (!assigneeRes.ok || !assigneeData.success) {
    throw new Error(assigneeData.message || "Failed to load assignable users.");
  }

  renderSupervisorOptions(Array.isArray(assigneeData.users) ? assigneeData.users : []);
}

async function initPage() {
  try {
    showPageLoader?.("Loading assignment screen...");

    if (!currentUser?.IsManager) {
      alert("Only managers can access this page.");
      window.location.href = "/dashboard.html";
      return;
    }

    selectedArea = getSelectedArea();

    if (!selectedArea) {
      alert("Select Business Area first.");
      window.location.href = "/dashboard.html";
      return;
    }

    qs("businessArea").value = selectedArea;
    await loadPageData();
    addLineRow();

    setOutput("Ready.");
  } catch (err) {
    setOutput(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

document.getElementById("addLineBtn")?.addEventListener("click", () => {
  addLineRow();
});

document.getElementById("assignBtn")?.addEventListener("click", async () => {
  try {
    const area = getPageArea();
    const warehouseCode = qs("warehouseCode")?.value?.trim() || "";
    const assignedToUserEmail = qs("assignedToUserEmail")?.value?.trim() || "";
    const remarks = qs("remarks")?.value?.trim() || "";
    const lines = collectLines();

    const validationMessage = validateAssignment(area, warehouseCode, assignedToUserEmail, lines);
    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    showPageLoader?.("Assigning stock count...");
    setOutput(`Assigning stock count...\nArea: ${area}`);

    const payload = {
      area,
      warehouseCode,
      assignedToUserEmail,
      remarks,
      lines
    };

    const res = await fetch("/api/assignStockCount", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response: ${text}`);
    }

    setOutput(JSON.stringify({ payload, response: data }, null, 2));

    if (!res.ok || !data.success) {
      alert(data.message || "Assign failed.");
      return;
    }

    alert(`Assigned successfully. Count No: ${data.countNumber}`);
    window.location.href = "/assigned-stock-counts.html";
  } catch (err) {
    setOutput(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
});

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

initPage();