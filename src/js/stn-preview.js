function setText(id, value) {
  document.getElementById(id).textContent = value ?? "";
}

function warehouseDisplay(code, custom) {
  if (code === "__OTHER__") {
    return custom || "Other";
  }
  return code || "";
}

function loadDraft() {
  const raw = localStorage.getItem("stnDraftData");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderPreview() {
  const draft = loadDraft();
  const output = document.getElementById("previewOutput");
  const linesBody = document.getElementById("previewLinesContainer");

  if (!draft) {
    output.textContent = "No draft data found.";
    return;
  }

  setText("pvStnType", draft.stnType);
  setText("pvBusinessArea", draft.businessArea);
  setText("pvStnDate", draft.stnDate);
  setText("pvStatus", draft.status || "Draft");
  setText("pvWarehouseFrom", warehouseDisplay(draft.warehouseFrom, draft.warehouseFromCustom));
  setText("pvWarehouseTo", warehouseDisplay(draft.warehouseTo, draft.warehouseToCustom));
  setText("pvCreatedBy", draft.createdBy);
  setText("pvCreatedByEmail", draft.createdByEmail);
  setText("pvRemarks", draft.remarks || "-");

  linesBody.innerHTML = "";

  (draft.lines || []).forEach((line, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-line">${index + 1}</td>
      <td>${line.itemCode || ""}</td>
      <td>${line.itemName || ""}</td>
      <td>${line.uom || ""}</td>
      <td>${line.batchNumber || ""}</td>
      <td>${line.qty || ""}</td>
      <td>${line.lineRemarks || ""}</td>
    `;
    linesBody.appendChild(tr);
  });

  output.textContent = JSON.stringify(draft, null, 2);
}

document.getElementById("backEntryBtn").addEventListener("click", () => {
  const draft = loadDraft();
  if (!draft) {
    window.location.href = "/dashboard.html";
    return;
  }

  window.location.href = `/stn-entry.html?type=${encodeURIComponent(draft.stnType)}&area=${encodeURIComponent(draft.businessArea)}`;
});

document.getElementById("submitPreviewBtn").addEventListener("click", async () => {
  const draft = loadDraft();
  const output = document.getElementById("previewOutput");

  if (!draft) {
    alert("No draft found.");
    return;
  }

  try {
    output.textContent = "Submitting STN...";

    const res = await fetch("/api/submitSTN", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(draft)
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
      alert(data.message || "Submit failed.");
      return;
    }

    localStorage.setItem("stnLastSubmitted", JSON.stringify(data));
    localStorage.removeItem("stnDraftData");

    window.location.href = `/stn-success.html?stnId=${encodeURIComponent(data.stnId)}`;
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  }
});

renderPreview();