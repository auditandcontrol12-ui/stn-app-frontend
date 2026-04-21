const output = document.getElementById("output");

function log(msg, obj = null) {
  if (!output) return;
  output.textContent = obj ? `${msg}\n\n${JSON.stringify(obj, null, 2)}` : msg;
}

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function getChecked(id) {
  return !!document.getElementById(id)?.checked;
}

async function createWarehouse() {
  const payload = {
    BusinessArea: getValue("businessArea"),
    WarehouseCode: getValue("warehouseCode"),
    WarehouseName: getValue("warehouseName"),
    IsActive: getChecked("isActive")
  };

  if (!payload.BusinessArea) {
    alert("Business Area is required.");
    return;
  }

  if (!payload.WarehouseCode) {
    alert("Warehouse Code is required.");
    return;
  }

  if (!payload.WarehouseName) {
    alert("Warehouse Name is required.");
    return;
  }

  try {
    showPageLoader?.("Creating warehouse...");
    log("Creating warehouse", payload);

    const res = await fetch("/api/createWarehouse", {
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

    log("Create warehouse response", data);

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to create warehouse.");
    }

    alert("Warehouse created successfully.");
    window.location.href = "/manage-warehouse.html";
  } catch (err) {
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

document.getElementById("createWarehouseBtn")?.addEventListener("click", createWarehouse);
document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});