const output = document.getElementById("output");

let userList = [];
let currentDetail = null;

function log(msg, obj = null) {
  if (!output) return;
  output.textContent = obj ? `${msg}\n\n${JSON.stringify(obj, null, 2)}` : msg;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function getChecked(id) {
  return !!document.getElementById(id)?.checked;
}

async function loadUsers() {
  try {
    showPageLoader?.("Loading users...");

    const res = await fetch("/api/getUsersForAdmin", {
      credentials: "include"
    });

    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response:\n${text}`);
    }

    log("Users loaded", data);

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to load users.");
    }

    userList = data.users || [];
    const select = document.getElementById("userSelect");
    if (!select) return;

    select.innerHTML = `<option value="">-- Select User --</option>`;

    userList.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = String(u.UserID);
      opt.textContent = `${u.UserName} (${u.UserEmail})`;
      select.appendChild(opt);
    });
  } catch (err) {
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

function getAreaAccessState() {
  return {
    Manufacturing: getChecked("muIsAllowedManufacturing"),
    Distribution: getChecked("muIsAllowedDistribution")
  };
}

function applyWarehouseRowState() {
  const body = document.getElementById("warehouseAccessBody");
  if (!body) return;

  const isSuperUser = getChecked("muIsSuperUser");
  const areaState = getAreaAccessState();
  const rows = [...body.querySelectorAll("tr")];

  rows.forEach((row) => {
    const area = row.dataset.businessArea || "";
    const allowInboundEl = row.querySelector(".allow-inbound");
    const allowOutboundEl = row.querySelector(".allow-outbound");

    if (!allowInboundEl || !allowOutboundEl) return;

    const isAreaAllowed = !!areaState[area];
    const shouldDisable = isSuperUser || !isAreaAllowed;

    if (!isAreaAllowed) {
      allowInboundEl.checked = false;
      allowOutboundEl.checked = false;
    }

    allowInboundEl.disabled = shouldDisable;
    allowOutboundEl.disabled = shouldDisable;

    row.style.opacity = shouldDisable ? "0.55" : "1";
  });
}

function renderWarehouseAccess(detail) {
  const body = document.getElementById("warehouseAccessBody");
  if (!body) return;

  body.innerHTML = "";

  const warehouses = detail?.warehouses || [];
  const accessMap = new Map();

  (detail?.accessRows || []).forEach((row) => {
    accessMap.set(`${row.BusinessArea}||${row.WarehouseCode}`, row);
  });

  warehouses.forEach((w) => {
    const key = `${w.BusinessArea}||${w.WarehouseCode}`;
    const access = accessMap.get(key);

    const tr = document.createElement("tr");
    tr.dataset.businessArea = w.BusinessArea;
    tr.dataset.warehouseCode = w.WarehouseCode;

    tr.innerHTML = `
      <td>${w.BusinessArea || ""}</td>
      <td>${w.WarehouseCode || ""}</td>
      <td>${w.WarehouseName || ""}</td>
      <td><input type="checkbox" class="allow-inbound" ${access?.AllowInboundTo ? "checked" : ""} /></td>
      <td><input type="checkbox" class="allow-outbound" ${access?.AllowOutboundFrom ? "checked" : ""} /></td>
    `;

    body.appendChild(tr);
  });

  applyWarehouseRowState();
}

async function loadUserDetail(userId) {
  if (!userId) return;

  try {
    showPageLoader?.("Loading user detail...");

    const res = await fetch(`/api/getUserAdminDetail?userId=${encodeURIComponent(userId)}`, {
      credentials: "include"
    });

    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response:\n${text}`);
    }

    log("User detail loaded", data);

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to load user detail.");
    }

    currentDetail = data;

    const user = data.user;
    setValue("muUserEmail", user.UserEmail);
    setValue("muUserName", user.UserName);
    setValue("muHoldingName", user.HoldingName);
    setValue("muUserRole", user.UserRole);
    setChecked("muIsAllowedManufacturing", user.IsAllowedManufacturing);
    setChecked("muIsAllowedDistribution", user.IsAllowedDistribution);
    setChecked("muIsManager", user.IsManager);
    setChecked("muIsSuperUser", user.IsSuperUser);
    setChecked("muIsActive", user.IsActive);

    renderWarehouseAccess(data);
  } catch (err) {
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

function collectWarehouseAccessRows() {
  const rows = [...document.querySelectorAll("#warehouseAccessBody tr")];

  return rows.map((row) => ({
    BusinessArea: row.dataset.businessArea,
    WarehouseCode: row.dataset.warehouseCode,
    AllowInboundTo: !!row.querySelector(".allow-inbound")?.checked,
    AllowOutboundFrom: !!row.querySelector(".allow-outbound")?.checked
  }));
}

async function saveUserAccess() {
  const userId = document.getElementById("userSelect")?.value || "";
  if (!userId) {
    alert("Select a user first.");
    return;
  }

  const payload = {
    UserID: Number(userId),
    UserName: getValue("muUserName"),
    HoldingName: getValue("muHoldingName"),
    UserRole: getValue("muUserRole"),
    IsAllowedManufacturing: getChecked("muIsAllowedManufacturing"),
    IsAllowedDistribution: getChecked("muIsAllowedDistribution"),
    IsManager: getChecked("muIsManager"),
    IsSuperUser: getChecked("muIsSuperUser"),
    IsActive: getChecked("muIsActive"),
    WarehouseAccessRows: collectWarehouseAccessRows()
  };

  try {
    showPageLoader?.("Saving user access...");
    log("Saving user access", payload);

    const res = await fetch("/api/saveUserAccess", {
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
      throw new Error(`Non-JSON response:\n${text}`);
    }

    log("Save user access response", data);

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to save user access.");
    }

    alert("User access saved successfully.");
    await loadUserDetail(userId);
  } catch (err) {
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

document.getElementById("userSelect")?.addEventListener("change", (e) => {
  loadUserDetail(e.target.value);
});

document.getElementById("muIsSuperUser")?.addEventListener("change", () => {
  applyWarehouseRowState();
});

document.getElementById("muIsAllowedManufacturing")?.addEventListener("change", () => {
  applyWarehouseRowState();
});

document.getElementById("muIsAllowedDistribution")?.addEventListener("change", () => {
  applyWarehouseRowState();
});

document.getElementById("saveUserAccessBtn")?.addEventListener("click", saveUserAccess);
document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadUsers();