const params = new URLSearchParams(window.location.search);
const stnId = params.get("stnId") || "";

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

async function loadSubmittedSTN() {
  const output = document.getElementById("successOutput");
  const linesBody = document.getElementById("successLinesContainer");

  if (!stnId) {
    output.textContent = "stnId missing.";
    return;
  }

  try {
    const res = await fetch(`/api/getSTN?stnId=${encodeURIComponent(stnId)}`, {
      credentials: "include"
    });
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      output.textContent = `Non-JSON response:\n${text}`;
      return;
    }

    output.textContent = JSON.stringify(data, null, 2);

    if (!data.success) {
      return;
    }

    const h = data.header;
    const lines = data.lines || [];

    const warehouseFromText = warehouseDisplay(h.WarehouseFrom, h.WarehouseFromCustom);
    const warehouseToText = warehouseDisplay(h.WarehouseTo, h.WarehouseToCustom);
    const submittedAtText = formatDateTime(h.SubmittedDateTime);
    const printTitle = getPrintableType(h.STNType);

    document.title = h.STNNumber || "STN";

    setText("scStnNumber", h.STNNumber);
    setText("scStnId", h.STNId);
    setText("scStnType", h.STNType);
    setText("scStatus", h.Status);
    setText("scWarehouseFrom", warehouseFromText);
    setText("scWarehouseTo", warehouseToText);
    setText("scCreatedBy", h.CreatedBy);
    setText("scSubmittedAt", submittedAtText);

    setText("printTitle", printTitle);
    setText("printStnNumber", h.STNNumber);
    setText("printStatus", h.Status);
    setText("printPreparedBy", h.CreatedBy);

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
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  }
}

document.getElementById("printBtn").addEventListener("click", () => {
  window.print();
});

document.getElementById("newEntryBtn").addEventListener("click", () => {
  let selectedArea = localStorage.getItem("selectedArea") || "";

  if (!selectedArea) {
    window.location.href = "/dashboard.html";
    return;
  }

  window.location.href = `/stn-entry.html?type=IN&area=${encodeURIComponent(selectedArea)}`;
});

document.getElementById("goDashboardBtn").addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadSubmittedSTN();