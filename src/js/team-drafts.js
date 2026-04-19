function setOutput(text) {
  const el = document.getElementById("teamDraftsOutput");
  if (el) el.textContent = text;
}

function formatDateTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function showLoading(message) {
  showPageLoader?.(message || "Loading team drafts...");
}

function hideLoading() {
  hidePageLoader?.();
}

async function deleteDraft(stnId, stnNumber) {
  const ok = window.confirm(`Delete draft ${stnNumber || stnId}?`);
  if (!ok) return;

  try {
    showLoading("Deleting draft...");
    setOutput("Deleting draft...");

    const res = await fetch("/api/deleteSTN", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ stnId })
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      setOutput(`Non-JSON response:\n${text}`);
      return;
    }

    setOutput(JSON.stringify(data, null, 2));

    if (!res.ok || !data.success) {
      alert(data.message || "Delete failed.");
      return;
    }

    alert("Draft deleted successfully.");
    await loadTeamDrafts();
  } catch (err) {
    setOutput(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    hideLoading();
  }
}

function renderTeamDrafts(rows) {
  const body = document.getElementById("teamDraftsContainer");
  if (!body) return;

  body.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="10" style="text-align:center;">No team drafts found.</td>`;
    body.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const lastActivity = row.UpdatedDateTime || row.CreatedDateTime || "";
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.CreatedBy || ""}</td>
      <td>${row.CreatedByEmail || ""}</td>
      <td>${row.STNSeqNo || ""}</td>
      <td>${row.STNNumber || ""}</td>
      <td>${row.STNType || ""}</td>
      <td>${row.BusinessArea || ""}</td>
      <td>${row.STNDate ? String(row.STNDate).slice(0, 10) : ""}</td>
      <td>${row.LineCount || 0}</td>
      <td>${formatDateTime(lastActivity)}</td>
      <td class="col-actions">
        <div class="action-row">
          <button type="button" class="mini-btn open-btn success">Open</button>
          <button type="button" class="mini-btn danger delete-btn">Delete</button>
        </div>
      </td>
    `;

    tr.querySelector(".open-btn")?.addEventListener("click", () => {
      localStorage.setItem("selectedArea", row.BusinessArea || "");
      window.location.href = `/stn-entry.html?type=${encodeURIComponent(row.STNType || "")}&area=${encodeURIComponent(row.BusinessArea || "")}&stnId=${encodeURIComponent(row.STNId)}`;
    });

    tr.querySelector(".delete-btn")?.addEventListener("click", () => {
      deleteDraft(row.STNId, row.STNNumber);
    });

    body.appendChild(tr);
  });
}

async function loadTeamDrafts() {
  const area = document.getElementById("teamDraftArea")?.value || "";

  try {
    showLoading("Loading team drafts...");
    setOutput("Loading team drafts...");

    const res = await fetch(`/api/getTeamDrafts${area ? `?area=${encodeURIComponent(area)}` : ""}`, {
      credentials: "include"
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      setOutput(`Non-JSON response:\n${text}`);
      renderTeamDrafts([]);
      return;
    }

    setOutput(JSON.stringify(data, null, 2));

    if (!res.ok || !data.success) {
      alert(data.message || "Failed to load team drafts.");
      renderTeamDrafts([]);
      return;
    }

    renderTeamDrafts(data.drafts || []);
  } catch (err) {
    setOutput(`Error: ${err.message}`);
    renderTeamDrafts([]);
    alert(err.message);
  } finally {
    hideLoading();
  }
}

document.getElementById("refreshTeamDraftsBtn")?.addEventListener("click", loadTeamDrafts);
document.getElementById("teamDraftArea")?.addEventListener("change", loadTeamDrafts);
document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadTeamDrafts();