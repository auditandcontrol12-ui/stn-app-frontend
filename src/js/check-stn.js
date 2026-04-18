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
          <td>${escapeHtml(line.ItemCode || "")}</td>
          <td>${escapeHtml(line.ItemName || "")}</td>
          <td>${escapeHtml(line.UOM || "")}</td>
          <td class="num">${escapeHtml(line.Qty || "")}</td>
          <td>${escapeHtml(line.BatchNumber || "")}</td>
          <td>${escapeHtml(line.LineRemarks || "")}</td>
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

function renderCheckPrintPages(header, lines) {
  const root = document.getElementById("checkPrintPages");
  if (!root) return;

  const warehouseFromText = warehouseDisplay(header.WarehouseFrom, header.WarehouseFromCustom);
  const warehouseToText = warehouseDisplay(header.WarehouseTo, header.WarehouseToCustom);
  const printDate = formatPrintDate(header.STNDate || header.SubmittedDateTime || header.CreatedDateTime);
  const remarks = header.Remarks || "-";
  const pages = buildPrintRows(lines || [], 22);

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
          <div class="stn-print-subtitle">Official Internal Document</div>
        </div>

        <div class="stn-print-header-right">
          <div class="stn-print-meta-line">
            <span>STO NUMBER</span>
            <span>${escapeHtml(header.STNNumber || "-")}</span>
          </div>
          <div class="stn-print-meta-line">
            <span>رقم التحويل</span>
            <span>${escapeHtml(header.STNNumber || "-")}</span>
          </div>
          <div class="stn-print-meta-line">
            <span>Date / التاريخ</span>
            <span>${escapeHtml(printDate)}</span>
          </div>
          <div class="stn-print-meta-line">
            <span>Status</span>
            <span>${escapeHtml(header.Status || "")}</span>
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
            <div class="stn-sign-name">${escapeHtml(header.CreatedBy || "")}</div>
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

let lastFoundSTN = null;

function hideSearchActions() {
  const resultWrap = document.getElementById("searchResultWrap");
  const printBtn = document.getElementById("searchPrintBtn");
  const editBtn = document.getElementById("editSTNBtn");
  const deleteBtn = document.getElementById("deleteSTNBtn");
  const checkPrintPages = document.getElementById("checkPrintPages");

  if (resultWrap) resultWrap.style.display = "none";
  if (printBtn) printBtn.style.display = "none";
  if (editBtn) editBtn.style.display = "none";
  if (deleteBtn) deleteBtn.style.display = "none";
  if (checkPrintPages) checkPrintPages.innerHTML = "";
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
    showPageLoader?.("Searching STN...");

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
      hidePageLoader?.();
      hideSearchActions();
      return;
    }

    if (output) output.textContent = JSON.stringify(data, null, 2);

    if (!res.ok || !data.success) {
      setSearchBanner(data.message || "No data found.", "status-unsaved");
      hidePageLoader?.();
      hideSearchActions();
      return;
    }

    const h = data.header;
    const lines = data.lines || [];

    lastFoundSTN = { header: h, lines };

    const warehouseFromText = warehouseDisplay(h.WarehouseFrom, h.WarehouseFromCustom);
    const warehouseToText = warehouseDisplay(h.WarehouseTo, h.WarehouseToCustom);
    const submittedAtText = formatDateTime(h.SubmittedDateTime);

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

    if (linesBody) {
      linesBody.innerHTML = "";

      lines.forEach((line, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="col-line">${index + 1}</td>
          <td>${escapeHtml(line.ItemCode || "")}</td>
          <td>${escapeHtml(line.ItemName || "")}</td>
          <td>${escapeHtml(line.UOM || "")}</td>
          <td>${escapeHtml(line.BatchNumber || "")}</td>
          <td>${escapeHtml(line.Qty || "")}</td>
          <td>${escapeHtml(line.LineRemarks || "")}</td>
        `;
        linesBody.appendChild(tr);
      });
    }

    renderCheckPrintPages(h, lines);

    const currentUser = getCurrentUser();
    const isManager = !!currentUser?.IsManager;
    const allowEdit = canEditDraft(h, currentUser);

    if (resultWrap) resultWrap.style.display = "block";
    if (printBtn) printBtn.style.display = "inline-block";
    if (editBtn) editBtn.style.display = allowEdit ? "inline-block" : "none";
    if (deleteBtn) deleteBtn.style.display = isManager ? "inline-block" : "none";

    setSearchBanner(`STN found successfully. Status: ${h.Status}`, "status-submitted");
    hidePageLoader?.();
  } catch (err) {
    if (output) output.textContent = `Error: ${err.message}`;
    setSearchBanner(`Error: ${err.message}`, "status-unsaved");
    hidePageLoader?.();
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
  if (!lastFoundSTN) return;
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
    showPageLoader?.("Deleting STN...");

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
      hidePageLoader?.();
      alert("Unexpected response received.");
      return;
    }

    if (output) output.textContent = JSON.stringify(data, null, 2);

    if (!res.ok || !data.success) {
      hidePageLoader?.();
      alert(data.message || "Delete failed.");
      return;
    }

    lastFoundSTN = null;
    hideSearchActions();
    setSearchBanner("STN deleted successfully.", "status-submitted");
    hidePageLoader?.();
    alert("STN deleted successfully.");
  } catch (err) {
    if (output) output.textContent = `Error: ${err.message}`;
    hidePageLoader?.();
    alert(err.message);
  }
});

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});