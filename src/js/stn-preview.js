function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function warehouseDisplay(code, custom) {
  if (code === "__OTHER__") return custom || "Other";
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

function saveDraftLocal(draft) {
  localStorage.setItem("stnDraftData", JSON.stringify(draft));
}

function togglePreviewActions(draft) {
  const printBtn = document.getElementById("printDraftBtn");
  const submitBtn = document.getElementById("submitPreviewBtn");

  const hasRealDraft = !!draft?.stnId && draft?.status === "Draft";

  if (printBtn) printBtn.style.display = hasRealDraft ? "inline-block" : "none";
  if (submitBtn) submitBtn.style.display = hasRealDraft ? "inline-block" : "none";
}

function setPreviewStatus(status, hasRealDraft) {
  const statusText = document.getElementById("pvStatus");
  const banner = document.getElementById("previewStatusBanner");

  if (!statusText || !banner) return;

  if (status === "Draft" && hasRealDraft) {
    statusText.textContent = "Draft";
    banner.className = "status-banner status-draft";
    banner.textContent = "Draft saved successfully. STN number created. You can now print draft or submit later.";
    return;
  }

  if (status === "Submitted") {
    statusText.textContent = "Submitted";
    banner.className = "status-banner status-submitted";
    banner.textContent = "Successfully submitted. This STN has been stored in the database.";
    return;
  }

  statusText.textContent = "Unsaved";
  banner.className = "status-banner status-unsaved";
  banner.textContent = "Not yet saved. Save as Draft first to generate the STN number.";
}

function renderPreview() {
  const draft = loadDraft();
  const output = document.getElementById("previewOutput");
  const linesBody = document.getElementById("previewLinesContainer");

  if (!draft) {
    if (output) output.textContent = "No draft data found.";
    return;
  }

  const hasRealDraft = !!draft.stnId && draft.status === "Draft";

  setText("pvStnNumber", draft.stnNumber || "-");
  setText("pvStnSeqNo", draft.stnSeqNo || "-");
  setText("pvStnType", draft.stnType);
  setText("pvBusinessArea", draft.businessArea);
  setText("pvStnDate", draft.stnDate);
  setPreviewStatus(draft.status || "Unsaved", hasRealDraft);
  setText("pvWarehouseFrom", warehouseDisplay(draft.warehouseFrom, draft.warehouseFromCustom));
  setText("pvWarehouseTo", warehouseDisplay(draft.warehouseTo, draft.warehouseToCustom));
  setText("pvCreatedBy", draft.createdBy);
  setText("pvCreatedByEmail", draft.createdByEmail);
  setText("pvRemarks", draft.remarks || "-");

  togglePreviewActions(draft);

  if (linesBody) {
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
  }

  if (output) output.textContent = JSON.stringify(draft, null, 2);
}

async function postDraftWithStatus(status) {
  const draft = loadDraft();
  const output = document.getElementById("previewOutput");

  if (!draft) {
    alert("No draft found.");
    return null;
  }

  const payload = {
    ...draft,
    status
  };

  if (output) {
    output.textContent = status === "Draft" ? "Saving draft..." : "Submitting STN...";
  }

  const res = await fetch("/api/submitSTN", {
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
    if (output) output.textContent = `Non-JSON response:\n${text}`;
    return null;
  }

  if (output) output.textContent = JSON.stringify(data, null, 2);

  if (!res.ok || !data.success) {
    alert(data.message || `${status} failed.`);
    return null;
  }

  const updatedDraft = {
    ...draft,
    stnId: data.stnId,
    stnNumber: data.stnNumber,
    stnSeqNo: data.stnSeqNo,
    status
  };

  saveDraftLocal(updatedDraft);
  return { api: data, draft: updatedDraft };
}

document.getElementById("backEntryBtn")?.addEventListener("click", () => {
  const draft = loadDraft();
  if (!draft) {
    window.location.href = "/dashboard.html";
    return;
  }

  window.location.href = `/stn-entry.html?type=${encodeURIComponent(draft.stnType)}&area=${encodeURIComponent(draft.businessArea)}${draft.stnId ? `&stnId=${encodeURIComponent(draft.stnId)}` : ""}`;
});

document.getElementById("saveDraftBtn")?.addEventListener("click", async () => {
  const result = await postDraftWithStatus("Draft");
  if (!result) return;

  renderPreview();
  alert(`Draft saved successfully. STN No: ${result.api.stnSeqNo}`);
});

document.getElementById("printDraftBtn")?.addEventListener("click", () => {
  const draft = loadDraft();
  if (!draft?.stnId || draft?.status !== "Draft") {
    alert("Save as Draft first.");
    return;
  }
  window.print();
});

document.getElementById("submitPreviewBtn")?.addEventListener("click", async () => {
  const draft = loadDraft();

  if (!draft?.stnId || draft?.status !== "Draft") {
    alert("Save as Draft first before submit.");
    return;
  }

  const ok = window.confirm("Are you sure you want to submit this STN?");
  if (!ok) return;

  const result = await postDraftWithStatus("Submitted");
  if (!result) return;

  localStorage.setItem("stnLastSubmitted", JSON.stringify(result.api));
  localStorage.removeItem("stnDraftData");

  window.location.href = `/stn-success.html?stnId=${encodeURIComponent(result.api.stnId)}`;
});

renderPreview();