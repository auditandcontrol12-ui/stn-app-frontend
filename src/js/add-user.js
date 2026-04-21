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

function validateForm() {
  const email = getValue("userEmail");
  const name = getValue("userName");

  if (!email) return "User Email is required.";
  if (!name) return "User Name is required.";
  if (!email.includes("@")) return "Valid email is required.";

  return "";
}

async function createUser() {
  const error = validateForm();
  if (error) {
    alert(error);
    return;
  }

  const payload = {
    UserEmail: getValue("userEmail"),
    UserName: getValue("userName"),
    HoldingName: getValue("holdingName"),
    UserRole: getValue("userRole"),
    IsAllowedManufacturing: getChecked("isAllowedManufacturing"),
    IsAllowedDistribution: getChecked("isAllowedDistribution"),
    IsManager: getChecked("isManager"),
    IsSuperUser: getChecked("isSuperUser"),
    IsActive: getChecked("isActive")
  };

  try {
    showPageLoader?.("Creating user...");
    log("Creating user...", payload);

    const res = await fetch("/api/createUser", {
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

    log("Create user response", data);

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to create user.");
    }

    alert("User created successfully.");
    window.location.href = "/manage-user.html";
  } catch (err) {
    alert(err.message);
  } finally {
    hidePageLoader?.();
  }
}

document.getElementById("createUserBtn")?.addEventListener("click", createUser);
document.getElementById("backDashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});