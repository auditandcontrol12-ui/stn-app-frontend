document.getElementById("loginBtn")?.addEventListener("click", () => {
  window.location.href = "/.auth/login/aad";
});

document.getElementById("dashboardBtn")?.addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

document.getElementById("apiTestBtn")?.addEventListener("click", async () => {
  const output = document.getElementById("output");
  if (output) output.textContent = "Calling API...";

  try {
    const res = await fetch("/api/getMe", {
      credentials: "include"
    });
    const text = await res.text();

    try {
      const data = JSON.parse(text);
      if (output) output.textContent = JSON.stringify(data, null, 2);
    } catch {
      if (output) output.textContent = `Non-JSON response:\n${text}`;
    }
  } catch (err) {
    if (output) output.textContent = `Error: ${err.message}`;
  }
});