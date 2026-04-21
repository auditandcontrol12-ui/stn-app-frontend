const output = document.getElementById("output");

function log(msg, obj = null) {
  if (!output) return;
  output.textContent = obj ? `${msg}\n\n${JSON.stringify(obj, null, 2)}` : msg;
}

async function loadWarehouses() {
  try {
    showPageLoader?.("Loading warehouses...");

    const res = await fetch("/api/getWarehousesForAdmin", {
      credentials: "include"
    });

    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response:\n${text}`);
    }

    log("Warehouses loaded", data);

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to load warehouses.");
    }

    const body = document.getElementById("warehouseTableBody");
    if (!body) return;

    body.innerHTML = "";

    (data.warehouses || []).forEach((w) => {
      const tr = document.createElement("tr");
      tr.dataset.warehouseId = w.WarehouseId;

      tr.innerHTML = `
        <td>${w.BusinessArea || ""}</td>
        <td>${w.WarehouseCode || ""}</td>
        <td><input type="text" class="warehouse-name" value="${w.WarehouseName || ""}" /></td>
        <td><input type="checkbox" class="warehouse-active" ${w.IsActive ? "checked" : ""} /></td>
        <td class="col-actions">
          <button type="button" class="success mini-btn save-row-btn">Save</button>
        </td>
      `;

      tr.querySelector(".save-row-btn")?.addEventListener("click", () => saveWarehouseRow(tr));
      body.appendChild(tr);
    });
  } catch (err) {
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

async function saveWarehouseRow(row) {
  const payload = {
    WarehouseId: Number(row.dataset.warehouseId),
    WarehouseName: row.querySelector(".warehouse-name")?.value?.trim() || "",
    IsActive: !!row.querySelector(".warehouse-active")?.checked
  };

  if (!payload.WarehouseId) {
    alert("WarehouseId missing.");
    return;
  }

  if (!payload.WarehouseName) {
    alert("Warehouse Name is required.");
    return;
  }

  try {
    showPageLoader?.("Saving warehouse...");

    const res = await fetch("/api/updateWarehouse", {
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

    log("Update warehouse response", data);

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to update warehouse.");
    }

    alert("Warehouse updated successfully.");
  } catch (err) {
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

loadWarehouses();