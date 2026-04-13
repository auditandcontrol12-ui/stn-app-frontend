function setText(id, value) {
  document.getElementById(id).textContent = value ?? "";
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
}

function clearSelectedArea() {
  selectedArea = "";
  localStorage.removeItem("selectedArea");
  refreshSelectedArea();
}

function saveCurrentUser() {
  if (currentUser) {
    localStorage.setItem("stnCurrentUser", JSON.stringify(currentUser));
  } else {
    localStorage.removeItem("stnCurrentUser");
  }
}

function renderBusinessAreaButtons() {
  const container = document.getElementById("businessAreaButtons");
  container.innerHTML = "";

  if (!currentUser) return;

  if (currentUser.IsAllowedManufacturing) {
    const btn = document.createElement("button");
    btn.textContent = "Manufacturing";
    btn.addEventListener("click", () => saveSelectedArea("Manufacturing"));
    container.appendChild(btn);
  }

  if (currentUser.IsAllowedDistribution) {
    const btn = document.createElement("button");
    btn.textContent = "Distribution";
    btn.addEventListener("click", () => saveSelectedArea("Distribution"));
    container.appendChild(btn);
  }
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
    output.textContent = "Loading user access...";

    const res = await fetch("/api/getUserAccess");
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      output.textContent = `Non-JSON response:\n${text}`;
      return;
    }

    output.textContent = JSON.stringify(data, null, 2);

    if (!data.success) {
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
    refreshSelectedArea();
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  }
}

document.getElementById("postInboundBtn").addEventListener("click", () => {
  if (!canUseSelectedArea()) return;
  window.location.href = `/stn-entry.html?type=IN&area=${encodeURIComponent(selectedArea)}`;
});

document.getElementById("postOutboundBtn").addEventListener("click", () => {
  if (!canUseSelectedArea()) return;
  window.location.href = `/stn-entry.html?type=OB&area=${encodeURIComponent(selectedArea)}`;
});

document.getElementById("checkSTNBtn").addEventListener("click", () => {
  if (!canUseSelectedArea()) return;
  alert(`Check STN for ${selectedArea} will be built later.`);
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "/logout";
});

refreshSelectedArea();
loadUserAccess();