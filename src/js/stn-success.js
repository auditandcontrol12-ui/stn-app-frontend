const params = new URLSearchParams(window.location.search);
const stnId = params.get("stnId") || "";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function warehouseDisplay(code, custom) {
  if (code === "__OTHER__") return custom || "Other";
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

function getTxnTypeDisplay(value) {
  const map = {
    IN: "IN-BOUND",
    OB: "OUT-BOUND"
  };
  return map[value] || value || "";
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

function renderSubmittedPrintPages(header, lines) {
  const root = document.getElementById("printPages");
  if (!root) return;

  const warehouseFromText = warehouseDisplay(header.WarehouseFrom, header.WarehouseFromCustom);
  const warehouseToText = warehouseDisplay(header.WarehouseTo, header.WarehouseToCustom);
  const printDate = formatPrintDate(header.STNDate || header.SubmittedDateTime);
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

let currentHeader = null;

async function loadSubmittedSTN() {
  const output = document.getElementById("successOutput");
  const linesBody = document.getElementById("successLinesContainer");

  showPageLoader?.("Loading submitted STN...");

  if (!stnId) {
    if (output) output.textContent = "stnId missing.";
    hidePageLoader?.();
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
      if (output) output.textContent = `Non-JSON response:\n${text}`;
      hidePageLoader?.();
      return;
    }

    if (output) output.textContent = JSON.stringify(data, null, 2);

    if (!data.success) {
      hidePageLoader?.();
      return;
    }

    const h = data.header;
    const lines = data.lines || [];
    currentHeader = h;

    const warehouseFromText = warehouseDisplay(h.WarehouseFrom, h.WarehouseFromCustom);
    const warehouseToText = warehouseDisplay(h.WarehouseTo, h.WarehouseToCustom);
    const submittedAtText = formatDateTime(h.SubmittedDateTime);

    document.title = h.STNNumber || "STN";

    setText("scStnNumber", h.STNNumber);
    setText("scStnSeqNo", h.STNSeqNo);
    setText("scStnType", getTxnTypeDisplay(h.STNType));
    setText("scStatus", h.Status);
    setText("scWarehouseFrom", warehouseFromText);
    setText("scWarehouseTo", warehouseToText);
    setText("scCreatedBy", h.CreatedBy);
    setText("scSubmittedAt", submittedAtText);

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

    renderSubmittedPrintPages(h, lines);
    hidePageLoader?.();
  } catch (err) {
    if (output) output.textContent = `Error: ${err.message}`;
    hidePageLoader?.();
  }
}

document.getElementById("printBtn")?.addEventListener("click", () => {
  window.print();
});

document.getElementById("newEntryBtn")?.addEventListener("click", () => {
  const selectedArea = localStorage.getItem("selectedArea") || currentHeader?.BusinessArea || "";
  const nextType = currentHeader?.STNType || "IN";

  if (!selectedArea) {
    window.location.href = "/dashboard.html";
    return;
  }

  localStorage.removeItem("stnDraftData");
  window.location.href = `/stn-entry.html?type=${encodeURIComponent(nextType)}&area=${encodeURIComponent(selectedArea)}`;
});

document.getElementById("goDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadSubmittedSTN();