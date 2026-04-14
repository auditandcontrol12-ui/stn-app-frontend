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

let lastFoundSTN = null;

async function searchSTN() {
  const seqNo = document.getElementById("searchSeqNo").value.trim();
  const output = document.getElementById("checkOutput");
  const linesBody = document.getElementById("checkLinesContainer");
  const resultWrap = document.getElementById("searchResultWrap");
  const printBtn = document.getElementById("searchPrintBtn");
  const editBtn = document.getElementById("editSTNBtn");
  const deleteBtn = document.getElementById("deleteSTNBtn");

  if (!seqNo) {
    setSearchBanner("Please enter STN number.", "status-unsaved");
    resultWrap.style.display = "none";
    printBtn.style.display = "none";
    editBtn.style.display = "none";
    deleteBtn.style.display = "none";
    return;
  }

  try {
    setSearchBanner("Searching STN...", "status-draft");
    output.textContent = "Searching...";
    lastFoundSTN = null;

    const res = await fetch(`/api/getSTNBySeq?seqNo=${encodeURIComponent(seqNo)}`, {
      credentials: "include"
    });
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      output.textContent = `Non-JSON response:\n${text}`;
      setSearchBanner("Unexpected response received.", "status-unsaved");
      resultWrap.style.display = "none";
      printBtn.style.display = "none";
      editBtn.style.display = "none";
      deleteBtn.style.display = "none";
      return;
    }

    output.textContent = JSON.stringify(data, null, 2);

    if (!res.ok || !data.success) {
      setSearchBanner("No data found.", "status-unsaved");
      resultWrap.style.display = "none";
      printBtn.style.display = "none";
      editBtn.style.display = "none";
      deleteBtn.style.display = "none";
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
    setText("ckSubmittedAt", submittedAtText);
    setText("ckRemarks", h.Remarks || "-");

    setText("checkPrintTitle", printTitle);
    setText("checkPrintStnNumber", h.STNNumber);
    setText("checkPrintStatus", h.Status);
    setText("checkPreparedBy", h.CreatedBy);

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

    const currentUser = getCurrentUser();
    const isManager = !!currentUser?.IsManager;

    resultWrap.style.display = "block";
    printBtn.style.display = "inline-block";
    editBtn.style.display = isManager ? "inline-block" : "none";
    deleteBtn.style.display = isManager ? "inline-block" : "none";

    setSearchBanner(`STN found successfully. Area: ${h.BusinessArea}`, "status-submitted");
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
    setSearchBanner(`Error: ${err.message}`, "status-unsaved");
    document.getElementById("searchResultWrap").style.display = "none";
    document.getElementById("searchPrintBtn").style.display = "none";
    document.getElementById("editSTNBtn").style.display = "none";
    document.getElementById("deleteSTNBtn").style.display = "none";
  }
}

document.getElementById("searchBtn").addEventListener("click", searchSTN);

document.getElementById("searchSeqNo").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchSTN();
  }
});

document.getElementById("searchPrintBtn").addEventListener("click", () => {
  window.print();
});

document.getElementById("editSTNBtn").addEventListener("click", () => {
  if (!lastFoundSTN) return;

  const h = lastFoundSTN.header;
  const lines = lastFoundSTN.lines || [];

  const editDraft = {
    stnId: h.STNId,
    stnNumber: h.STNNumber,
    stnSeqNo: h.STNSeqNo,
    stnType: h.STNType,
    businessArea: h.BusinessArea,
    stnDate: h.STNDate ? String(h.STNDate).slice(0, 10) : "",
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

  localStorage.setItem("stnDraftData", JSON.stringify(editDraft));
  localStorage.setItem("selectedArea", h.BusinessArea);

  window.location.href = `/stn-entry.html?type=${encodeURIComponent(h.STNType)}&area=${encodeURIComponent(h.BusinessArea)}`;
});

document.getElementById("deleteSTNBtn").addEventListener("click", async () => {
  if (!lastFoundSTN) return;

  const ok = window.confirm(`Are you sure you want to delete ${lastFoundSTN.header.STNNumber}?`);
  if (!ok) return;

  const output = document.getElementById("checkOutput");

  try {
    output.textContent = "Deleting STN...";

    const res = await fetch("/api/deleteSTN", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ stnId: lastFoundSTN.header.STNId })
    });

    const data = await res.json();

    output.textContent = JSON.stringify(data, null, 2);

    if (!res.ok || !data.success) {
      alert(data.message || "Delete failed.");
      return;
    }

    lastFoundSTN = null;
    document.getElementById("searchResultWrap").style.display = "none";
    document.getElementById("searchPrintBtn").style.display = "none";
    document.getElementById("editSTNBtn").style.display = "none";
    document.getElementById("deleteSTNBtn").style.display = "none";
    setSearchBanner("STN deleted successfully.", "status-submitted");
    alert("STN deleted successfully.");
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
    alert(err.message);
  }
});

document.getElementById("backDashboardBtn").addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});