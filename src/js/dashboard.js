function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

let currentUser = null;
let selectedArea = localStorage.getItem("selectedArea") || "";

function refreshSelectedArea() {
  setText("selectedArea", selectedArea || "None");
}

function saveSelectedArea(area) {
  selectedArea = area;
  localStorage.setItem("selectedArea", area);
  refreshSelectedArea();
  renderBusinessAreaButtons();
}

function clearSelectedArea() {
  selectedArea = "";
  localStorage.removeItem("selectedArea");
  refreshSelectedArea();
  renderBusinessAreaButtons();
}

function saveCurrentUser() {
  if (currentUser) {
    localStorage.setItem("stnCurrentUser", JSON.stringify(currentUser));
  } else {
    localStorage.removeItem("stnCurrentUser");
  }
}

function makeAreaButton(label, isAllowed) {
  const btn = document.createElement("button");
  btn.textContent = label;

  if (selectedArea === label) {
    btn.classList.add("success");
  }

  btn.disabled = !isAllowed;

  btn.addEventListener("click", () => {
    if (!isAllowed) return;
    saveSelectedArea(label);
  });

  return btn;
}

function renderBusinessAreaButtons() {
  const container = document.getElementById("businessAreaButtons");
  if (!container) return;

  container.innerHTML = "";

  if (!currentUser) return;

  container.appendChild(
    makeAreaButton("Manufacturing", !!currentUser.IsAllowedManufacturing)
  );

  container.appendChild(
    makeAreaButton("Distribution", !!currentUser.IsAllowedDistribution)
  );
}

function renderManagerActions() {
  const teamDraftsBtn = document.getElementById("teamDraftsBtn");
  if (!teamDraftsBtn) return;

  teamDraftsBtn.style.display = currentUser?.IsManager ? "inline-block" : "none";
}

function canUseSelectedArea() {
  if (!currentUser) {
    alert("User is not loaded.");
    return false;
  }

  if (!selectedArea) {
    alert("Select Business Area first.");
    return false;
  }

  if (selectedArea === "Manufacturing" && !currentUser.IsAllowedManufacturing) {
    alert("This user is not allowed for Manufacturing.");
    return false;
  }

  if (selectedArea === "Distribution" && !currentUser.IsAllowedDistribution) {
    alert("This user is not allowed for Distribution.");
    return false;
  }

  return true;
}

async function loadUserAccess() {
  const output = document.getElementById("output");

  try {
    if (output) output.textContent = "Loading user access...";

    const res = await fetch("/api/getUserAccess", {
      credentials: "include"
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (output) output.textContent = `Non-JSON response:\n${text}`;
      return;
    }

    if (output) output.textContent = JSON.stringify(data, null, 2);

    if (!data.success || !data.data) {
      localStorage.removeItem("stnCurrentUser");
      localStorage.removeItem("selectedArea");
      window.location.href = "/no-access.html";
      return;
    }

    currentUser = data.data;
    saveCurrentUser();

    setText("userName", currentUser.UserName);
    setText("userEmail", currentUser.UserEmail);
    setText("userRole", currentUser.UserRole);
    setText("holdingName", currentUser.HoldingName);

    if (
      selectedArea === "Manufacturing" &&
      !currentUser.IsAllowedManufacturing
    ) {
      clearSelectedArea();
    }

    if (
      selectedArea === "Distribution" &&
      !currentUser.IsAllowedDistribution
    ) {
      clearSelectedArea();
    }

    renderBusinessAreaButtons();
    renderManagerActions();
    refreshSelectedArea();
  } catch (err) {
    if (output) output.textContent = `Error: ${err.message}`;
  }
}

document.getElementById("postInboundBtn")?.addEventListener("click", () => {
  if (!canUseSelectedArea()) return;
  window.location.href = `/stn-entry.html?type=IN&area=${encodeURIComponent(selectedArea)}`;
});

document.getElementById("postOutboundBtn")?.addEventListener("click", () => {
  if (!canUseSelectedArea()) return;
  window.location.href = `/stn-entry.html?type=OB&area=${encodeURIComponent(selectedArea)}`;
});

document.getElementById("checkSTNBtn")?.addEventListener("click", () => {
  window.location.href = "/check-stn.html";
});

document.getElementById("myDraftsBtn")?.addEventListener("click", () => {
  window.location.href = "/my-drafts.html";
});

document.getElementById("teamDraftsBtn")?.addEventListener("click", () => {
  window.location.href = "/team-drafts.html";
});

document.getElementById("reconcileStockBtn")?.addEventListener("click", () => {
  if (!canUseSelectedArea()) return;
  window.location.href = "/reconcile-stock.html";
});

document.getElementById("startStockCountBtn")?.addEventListener("click", () => {
  if (!canUseSelectedArea()) return;
  window.location.href = "/start-stock-count.html";
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store"
    });
  } catch {}

  localStorage.removeItem("stnCurrentUser");
  localStorage.removeItem("selectedArea");
  localStorage.removeItem("stnDraftData");
  localStorage.removeItem("stnLastSubmitted");
  sessionStorage.removeItem("login_email");

  window.location.replace("/?logged_out=1");
});

refreshSelectedArea();
loadUserAccess();