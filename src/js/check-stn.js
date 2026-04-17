function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function warehouseDisplay(code, custom) {
  if (code === "__OTHER__") {
    return custom || "Other";
  }
  return code || "";
}

function formatDateTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function getPrintableType(stnType) {
  if (!stnType) return "Stock Transfer Note";
  const map = {
    IN: "Stock Transfer Note - Inbound",
    OB: "Stock Transfer Note - Outbound"
  };
  return map[stnType] || `Stock Transfer Note - ${stnType}`;
}

function setSearchBanner(message, type) {
  const banner = document.getElementById("searchStatusBanner");
  if (!banner) return;
  banner.className = `status-banner ${type}`;
  banner.textContent = message;
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

function canEditDraft(header, currentUser) {
  if (!header || !currentUser) return false;
  if (header.Status !== "Draft") return false;

  const isManager = !!currentUser.IsManager;
  const isCreator =
    (currentUser.UserEmail || "").toLowerCase() ===
    (header.CreatedByEmail || "").toLowerCase();

  return isManager || isCreator;
}

let lastFoundSTN = null;

function hideSearchActions() {
  document.getElementById("searchResultWrap")?.style && (document.getElementById("searchResultWrap").style.display = "none");
  document.getElementById("searchPrintBtn")?.style && (document.getElementById("searchPrintBtn").style.display = "none");
  document.getElementById("editSTNBtn")?.style && (document.getElementById("editSTNBtn").style.display = "none");
  document.getElementById("deleteSTNBtn")?.style && (document.getElementById("deleteSTNBtn").style.display = "none");
}

async function searchSTN() {
  const searchValue = document.getElementById("searchSeqNo")?.value.trim() || "";
  const output = document.getElementById("checkOutput");
  const linesBody = document.getElementById("checkLinesContainer");
  const resultWrap = document.getElementById("searchResultWrap");
  const printBtn = document.getElementById("searchPrintBtn");
  const editBtn = document.getElementById("editSTNBtn");
  const deleteBtn = document.getElementById("deleteSTNBtn");

  if (!searchValue) {
    setSearchBanner("Please enter STN sequence or STN number.", "status-unsaved");
    hideSearchActions();
    return;
  }

  try {
    setSearchBanner("Searching STN...", "status-draft");
    if (output) output.textContent = "Searching...";
    lastFoundSTN = null;

    const res = await fetch(`/api/getSTNBySeq?search=${encodeURIComponent(searchValue)}`, {
      credentials: "include"
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (output) output.textContent = `Non-JSON response:\n${text}`;
      setSearchBanner("Unexpected response received.", "status-unsaved");
      hideSearchActions();
      return;
    }

    if (output) output.textContent = JSON.stringify(data, null, 2);

    if (!res.ok || !data.success) {
      setSearchBanner(data.message || "No data found.", "status-unsaved");
      hideSearchActions();
      return;
    }

    const h = data.header;
    const lines = data.lines || [];

    lastFoundSTN = { header: h, lines };

    const warehouseFromText = warehouseDisplay(h.WarehouseFrom, h.WarehouseFromCustom);
    const warehouseToText = warehouseDisplay(h.WarehouseTo, h.WarehouseToCustom);
    const submittedAtText = formatDateTime(h.SubmittedDateTime);
    const printTitle = getPrintableType(h.STNType);

    document.title = h.STNNumber || "STN";

    setText("ckStnNumber", h.STNNumber);
    setText("ckStnId", h.STNId);
    setText("ckStnType", h.STNType);
    setText("ckBusinessArea", h.BusinessArea);
    setText("ckStatus", h.Status);
    setText("ckWarehouseFrom", warehouseFromText);
    setText("ckWarehouseTo", warehouseToText);
    setText("ckCreatedBy", h.CreatedBy);
    setText("ckSubmittedAt", submittedAtText || "-");
    setText("ckRemarks", h.Remarks || "-");

    setText("checkPrintTitle", printTitle);
    setText("checkPrintStnNumber", h.STNNumber);
    setText("checkPrintStatus", h.Status);
    setText("checkPreparedBy", h.CreatedBy);

    if (linesBody) {
      linesBody.innerHTML = "";

      lines.forEach((line, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="col-line">${index + 1}</td>
          <td>${line.ItemCode || ""}</td>
          <td>${line.ItemName || ""}</td>
          <td>${line.UOM || ""}</td>
          <td>${line.BatchNumber || ""}</td>
          <td>${line.Qty || ""}</td>
          <td>${line.LineRemarks || ""}</td>
        `;
        linesBody.appendChild(tr);
      });
    }

    const currentUser = getCurrentUser();
    const isManager = !!currentUser?.IsManager;
    const allowEdit = canEditDraft(h, currentUser);

    if (resultWrap) resultWrap.style.display = "block";
    if (printBtn) printBtn.style.display = "inline-block";
    if (editBtn) editBtn.style.display = allowEdit ? "inline-block" : "none";
    if (deleteBtn) deleteBtn.style.display = isManager ? "inline-block" : "none";

    setSearchBanner(`STN found successfully. Status: ${h.Status}`, "status-submitted");
  } catch (err) {
    if (output) output.textContent = `Error: ${err.message}`;
    setSearchBanner(`Error: ${err.message}`, "status-unsaved");
    hideSearchActions();
  }
}

document.getElementById("searchBtn")?.addEventListener("click", searchSTN);

document.getElementById("searchSeqNo")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchSTN();
  }
});

document.getElementById("searchPrintBtn")?.addEventListener("click", () => {
  window.print();
});

document.getElementById("editSTNBtn")?.addEventListener("click", () => {
  if (!lastFoundSTN) return;

  const currentUser = getCurrentUser();
  if (!canEditDraft(lastFoundSTN.header, currentUser)) {
    alert("Only the draft creator or a manager can edit this draft.");
    return;
  }

  const h = lastFoundSTN.header;
  localStorage.setItem("selectedArea", h.BusinessArea);

  window.location.href = `/stn-entry.html?type=${encodeURIComponent(h.STNType)}&area=${encodeURIComponent(h.BusinessArea)}&stnId=${encodeURIComponent(h.STNId)}`;
});

document.getElementById("deleteSTNBtn")?.addEventListener("click", async () => {
  if (!lastFoundSTN) return;

  const ok = window.confirm(`Are you sure you want to delete ${lastFoundSTN.header.STNNumber}?`);
  if (!ok) return;

  const output = document.getElementById("checkOutput");

  try {
    if (output) output.textContent = "Deleting STN...";

    const res = await fetch("/api/deleteSTN", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ stnId: lastFoundSTN.header.STNId })
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (output) output.textContent = `Non-JSON response:\n${text}`;
      alert("Unexpected response received.");
      return;
    }

    if (output) output.textContent = JSON.stringify(data, null, 2);

    if (!res.ok || !data.success) {
      alert(data.message || "Delete failed.");
      return;
    }

    lastFoundSTN = null;
    hideSearchActions();
    setSearchBanner("STN deleted successfully.", "status-submitted");
    alert("STN deleted successfully.");
  } catch (err) {
    if (output) output.textContent = `Error: ${err.message}`;
    alert(err.message);
  }
});

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});