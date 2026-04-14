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

async function searchSTN() {
  const seqNo = document.getElementById("searchSeqNo").value.trim();
  const output = document.getElementById("checkOutput");
  const linesBody = document.getElementById("checkLinesContainer");
  const resultWrap = document.getElementById("searchResultWrap");
  const printBtn = document.getElementById("searchPrintBtn");

  if (!seqNo) {
    setSearchBanner("Please enter STN number.", "status-unsaved");
    resultWrap.style.display = "none";
    printBtn.style.display = "none";
    return;
  }

  try {
    setSearchBanner("Searching STN...", "status-draft");
    output.textContent = "Searching...";

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
      return;
    }

    output.textContent = JSON.stringify(data, null, 2);

    if (!res.ok || !data.success) {
      setSearchBanner("No data found.", "status-unsaved");
      resultWrap.style.display = "none";
      printBtn.style.display = "none";
      return;
    }

    const h = data.header;
    const lines = data.lines || [];

    const warehouseFromText = warehouseDisplay(h.WarehouseFrom, h.WarehouseFromCustom);
    const warehouseToText = warehouseDisplay(h.WarehouseTo, h.WarehouseToCustom);
    const submittedAtText = formatDateTime(h.SubmittedDateTime);
    const printTitle = getPrintableType(h.STNType);

    document.title = h.STNNumber || "STN";

    setText("ckStnNumber", h.STNNumber);
    setText("ckStnId", h.STNId);
    setText("ckStnType", h.STNType);
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

    resultWrap.style.display = "block";
    printBtn.style.display = "inline-block";
    setSearchBanner(`STN found successfully. Area: ${h.BusinessArea}`, "status-submitted");
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
    setSearchBanner(`Error: ${err.message}`, "status-unsaved");
    document.getElementById("searchResultWrap").style.display = "none";
    document.getElementById("searchPrintBtn").style.display = "none";
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

document.getElementById("backDashboardBtn").addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});