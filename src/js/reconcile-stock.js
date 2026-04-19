function setOutput(text) {
  const el = document.getElementById("reconcileOutput");
  if (el) el.textContent = text;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function loadSelectedArea() {
  return localStorage.getItem("selectedArea") || "";
}

function buildWarehouseOptions(selectEl, warehouses) {
  if (!selectEl) return;

  selectEl.innerHTML = `<option value="">-- Select Warehouse --</option>`;

  warehouses.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w.WhsCode;
    opt.textContent = `${w.WhsCode} - ${w.WhsName}`;
    selectEl.appendChild(opt);
  });
}

async function loadLookups() {
  const area = loadSelectedArea();
  const warehouseEl = document.getElementById("reconcileWarehouse");
  const areaEl = document.getElementById("reconcileBusinessArea");

  if (areaEl) areaEl.textContent = area || "-";

  if (!area) {
    alert("Select Business Area from dashboard first.");
    return;
  }

  try {
    showPageLoader?.("Loading warehouse lookups...");
    setOutput(`Loading warehouse lookups for ${area}...`);

    const res = await fetch(`/api/getLookups?area=${encodeURIComponent(area)}`, {
      credentials: "include"
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      setOutput(`Non-JSON response:\n${text}`);
      alert("Invalid response received from server.");
      return;
    }

    setOutput(JSON.stringify(data, null, 2));

    if (!res.ok || !data.success) {
      alert(data.message || "Failed to load lookups.");
      return;
    }

    buildWarehouseOptions(warehouseEl, data.warehouses || []);

    const startEl = document.getElementById("reconcileStartDate");
    const endEl = document.getElementById("reconcileEndDate");

    if (startEl && !startEl.value) startEl.value = todayString();
    if (endEl && !endEl.value) endEl.value = todayString();
  } catch (err) {
    setOutput(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

document.getElementById("generateReconcileBtn")?.addEventListener("click", async () => {
  const area = loadSelectedArea();
  const startDate = document.getElementById("reconcileStartDate")?.value || "";
  const endDate = document.getElementById("reconcileEndDate")?.value || "";
  const warehouse = document.getElementById("reconcileWarehouse")?.value || "";

  if (!area) {
    alert("Select Business Area from dashboard first.");
    return;
  }

  if (!startDate || !endDate) {
    alert("Start date and end date are required.");
    return;
  }

  if (startDate > endDate) {
    alert("Start date cannot be later than end date.");
    return;
  }

  if (!warehouse) {
    alert("Warehouse is required.");
    return;
  }

  try {
    showPageLoader?.("Generating reconcile preview...");
    setOutput("Generating reconcile preview...");

    const res = await fetch("/api/selfReconcileStock", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        area,
        startDate,
        endDate,
        warehouse
      })
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      setOutput(`Non-JSON response:\n${text}`);
      alert("Invalid response received from server.");
      return;
    }

    setOutput(JSON.stringify(data, null, 2));

    if (!res.ok || !data.success) {
      alert(data.message || "Failed to generate reconcile preview.");
      return;
    }

    localStorage.setItem("stnReconcileResult", JSON.stringify(data));
    window.location.href = "/reconcile-preview.html";
  } catch (err) {
    setOutput(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
});

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadLookups();