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

function formatPrintDate(value) {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit"
    });
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function buildPrintRows(lines, rowsPerPage) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const chunks = chunkArray(safeLines, rowsPerPage);
  if (!chunks.length) chunks.push([]);

  return chunks.map((pageLines) => {
    let rowsHtml = "";

    pageLines.forEach((line) => {
      rowsHtml += `
        <tr>
          <td>${escapeHtml(line.itemCode || "")}</td>
          <td>${escapeHtml(line.itemName || "")}</td>
          <td>${escapeHtml(line.uom || "")}</td>
          <td class="num">${escapeHtml(line.qty || "")}</td>
          <td>${escapeHtml(line.batchNumber || "")}</td>
          <td>${escapeHtml(line.lineRemarks || "")}</td>
        </tr>
      `;
    });

    const blanks = Math.max(rowsPerPage - pageLines.length, 0);
    for (let i = 0; i < blanks; i += 1) {
      rowsHtml += `
        <tr>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td class="num">&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      `;
    }

    return rowsHtml;
  });
}

function renderDraftPrintPages(draft) {
  const root = document.getElementById("draftPrintPages");
  if (!root) return;

  const warehouseFromText = warehouseDisplay(draft.warehouseFrom, draft.warehouseFromCustom);
  const warehouseToText = warehouseDisplay(draft.warehouseTo, draft.warehouseToCustom);
  const printDate = formatPrintDate(draft.stnDate);
  const remarks = draft.remarks || "-";
  const pages = buildPrintRows(draft.lines || [], 22);

  root.innerHTML = pages.map((rowsHtml, pageIndex) => `
    <div class="stn-print-sheet">
      <div class="stn-print-header">
        <div class="stn-print-header-left">
          <img src="/assets/PrintLogo.png" alt="Print Logo" class="print-logo" />
        </div>

        <div class="stn-print-header-center">
          <div class="stn-print-title-row">
            <div class="stn-print-title-en">Stock Transfer Note</div>
            <div class="stn-print-title-ar">نقل بضاعة</div>
          </div>
          <div class="stn-print-subtitle">Draft Copy</div>
        </div>

        <div class="stn-print-header-right">
          <div class="stn-print-meta-line">
            <span>STO NUMBER</span>
            <span>${escapeHtml(draft.stnNumber || "-")}</span>
          </div>
          <div class="stn-print-meta-line">
            <span>رقم التحويل</span>
            <span>${escapeHtml(draft.stnNumber || "-")}</span>
          </div>
          <div class="stn-print-meta-line">
            <span>Date / التاريخ</span>
            <span>${escapeHtml(printDate)}</span>
          </div>
          <div class="stn-print-meta-line">
            <span>Status</span>
            <span>${escapeHtml(draft.status || "Draft")}</span>
          </div>
          <div class="stn-print-meta-line">
            <span>Page</span>
            <span>${pageIndex + 1} / ${pages.length}</span>
          </div>
        </div>
      </div>

      <div class="stn-print-route">
        <div class="stn-print-route-box">
          <div class="stn-route-label">From / من</div>
          <div class="stn-route-value">${escapeHtml(warehouseFromText)}</div>
        </div>
        <div class="stn-print-route-box">
          <div class="stn-route-label">To / إلى</div>
          <div class="stn-route-value">${escapeHtml(warehouseToText)}</div>
        </div>
      </div>

      <table class="stn-print-table">
        <thead>
          <tr>
            <th class="w-code"><div>Code / الرمز</div></th>
            <th class="w-desc"><div>Product Description / وصف المنتج</div></th>
            <th class="w-uom"><div>UOM</div></th>
            <th class="w-qty"><div>Quantity EA</div></th>
            <th class="w-batch">
              <div>Batch Number</div>
              <div class="ar">رقم التشغيل</div>
            </th>
            <th class="w-remarks">
              <div>Remarks</div>
              <div class="ar">ملاحظات</div>
            </th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="stn-print-footer">
        <div class="stn-print-comments">
          <div class="stn-comments-label">Comments / ملاحظة:</div>
          <div class="stn-comments-value">${escapeHtml(remarks)}</div>
        </div>

        <div class="stn-print-signatures">
          <div class="stn-sign-block">
            <div class="stn-sign-title">Issued by / اعداد</div>
            <div class="stn-sign-line"></div>
            <div class="stn-sign-name">${escapeHtml(draft.createdBy || "")}</div>
            <div class="stn-sign-note">Signature / التوقيع</div>
          </div>

          <div class="stn-sign-block">
            <div class="stn-sign-title">QC Officer</div>
            <div class="stn-sign-line"></div>
            <div class="stn-sign-name">&nbsp;</div>
            <div class="stn-sign-note">Signature / التوقيع</div>
          </div>

          <div class="stn-sign-block">
            <div class="stn-sign-title">Received By / المستلم</div>
            <div class="stn-sign-line"></div>
            <div class="stn-sign-name">&nbsp;</div>
            <div class="stn-sign-note">Signature / التوقيع</div>
          </div>
        </div>
      </div>
    </div>
  `).join("");
}

function renderPreview() {
  const draft = loadDraft();
  const output = document.getElementById("previewOutput");
  const linesBody = document.getElementById("previewLinesContainer");

  showPageLoader?.("Preparing preview...");

  if (!draft) {
    if (output) output.textContent = "No draft data found.";
    hidePageLoader?.();
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

  if (draft.stnNumber) {
    document.title = `Draft - ${draft.stnNumber}`;
  } else {
    document.title = "Draft - STN Preview";
  }

  togglePreviewActions(draft);

  if (linesBody) {
    linesBody.innerHTML = "";
    (draft.lines || []).forEach((line, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="col-line">${index + 1}</td>
        <td>${escapeHtml(line.itemCode || "")}</td>
        <td>${escapeHtml(line.itemName || "")}</td>
        <td>${escapeHtml(line.uom || "")}</td>
        <td>${escapeHtml(line.batchNumber || "")}</td>
        <td>${escapeHtml(line.qty || "")}</td>
        <td>${escapeHtml(line.lineRemarks || "")}</td>
      `;
      linesBody.appendChild(tr);
    });
  }

  renderDraftPrintPages(draft);

  if (output) output.textContent = JSON.stringify(draft, null, 2);
  hidePageLoader?.();
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

  showPageLoader?.(status === "Draft" ? "Saving draft..." : "Submitting STN...");

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
    hidePageLoader?.();
    return null;
  }

  if (output) output.textContent = JSON.stringify(data, null, 2);

  if (!res.ok || !data.success) {
    alert(data.message || `${status} failed.`);
    hidePageLoader?.();
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
  hidePageLoader?.();
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
  document.title = `Draft - ${draft.stnNumber || "STN"}`;
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