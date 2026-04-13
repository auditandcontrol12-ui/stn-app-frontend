function setText(id, value) {
  document.getElementById(id).textContent = value ?? "";
}

let currentUser = null;
let selectedArea = localStorage.getItem("selectedArea") || "";

function refreshSelectedArea() {
  setText("selectedArea", selectedArea || "None");
}

function clearSelectedArea() {
  selectedArea = "";
  localStorage.removeItem("selectedArea");
  refreshSelectedArea();
}

function saveSelectedArea(area) {
  selectedArea = area;
  localStorage.setItem("selectedArea", area);
  refreshSelectedArea();
}

function canUseSelectedArea() {
  if (!currentUser) {
    alert("Load user access first.");
    return false;
  }

  if (!currentUser.IsActive) {
    alert("This user is inactive.");
    return false;
  }

  if (!selectedArea) {
    alert("Select Business Area first.");
    return false;
  }

  if (
    selectedArea === "Manufacturing" &&
    !currentUser.IsAllowedManufacturing
  ) {
    alert("This user is not allowed for Manufacturing.");
    return false;
  }

  if (
    selectedArea === "Distribution" &&
    !currentUser.IsAllowedDistribution
  ) {
    alert("This user is not allowed for Distribution.");
    return false;
  }

  return true;
}

document.getElementById("loadUserBtn").addEventListener("click", async () => {
  const email = document.getElementById("emailInput").value.trim();
  const output = document.getElementById("output");

  clearSelectedArea();
  currentUser = null;

  setText("userName", "");
  setText("userEmail", "");
  setText("userRole", "");
  setText("holdingName", "");
  setText("allowManu", "");
  setText("allowDist", "");
  setText("isActive", "");

  if (!email) {
    output.textContent = "Please enter an email.";
    return;
  }

  try {
    output.textContent = "Loading user access...";

    const res = await fetch(`/api/getUserAccess?email=${encodeURIComponent(email)}`);
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
      return;
    }

    const row = data.data;
    currentUser = row;

    setText("userName", row.UserName);
    setText("userEmail", row.UserEmail);
    setText("userRole", row.UserRole);
    setText("holdingName", row.HoldingName);
    setText("allowManu", row.IsAllowedManufacturing ? "Yes" : "No");
    setText("allowDist", row.IsAllowedDistribution ? "Yes" : "No");
    setText("isActive", row.IsActive ? "Yes" : "No");
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  }
});

document.getElementById("selectManuBtn").addEventListener("click", () => {
  if (!currentUser) {
    alert("Load user access first.");
    return;
  }

  if (!currentUser.IsActive) {
    alert("This user is inactive.");
    return;
  }

  if (!currentUser.IsAllowedManufacturing) {
    alert("This user is not allowed for Manufacturing.");
    return;
  }

  saveSelectedArea("Manufacturing");
});

document.getElementById("selectDistBtn").addEventListener("click", () => {
  if (!currentUser) {
    alert("Load user access first.");
    return;
  }

  if (!currentUser.IsActive) {
    alert("This user is inactive.");
    return;
  }

  if (!currentUser.IsAllowedDistribution) {
    alert("This user is not allowed for Distribution.");
    return;
  }

  saveSelectedArea("Distribution");
});

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
  alert(`Check STN for ${selectedArea} will be built next.`);
});

document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "/";
});

refreshSelectedArea();