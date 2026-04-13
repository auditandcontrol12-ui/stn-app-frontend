document.getElementById("loginBtn").addEventListener("click", () => {
  window.location.href = "/.auth/login/aad";
});

document.getElementById("dashboardBtn").addEventListener("click", () => {
  window.location.href = "/dashboard.html";
});

document.getElementById("apiTestBtn").addEventListener("click", async () => {
  const output = document.getElementById("output");

  try {
    output.textContent = "Calling API...";

    const res = await fetch("/api/getMe");
    const text = await res.text();

    try {
      const data = JSON.parse(text);
      output.textContent = JSON.stringify(data, null, 2);
    } catch {
      output.textContent = `Non-JSON response:\n${text}`;
    }
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  }
});