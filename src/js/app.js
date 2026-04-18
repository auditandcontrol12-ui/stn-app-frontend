// document.getElementById("loginBtn")?.addEventListener("click", () => {
//   window.location.href = "/.auth/login/aad";
// });

// document.getElementById("dashboardBtn")?.addEventListener("click", () => {
//   window.location.href = "/dashboard.html";
// });

// document.getElementById("apiTestBtn")?.addEventListener("click", async () => {
//   const output = document.getElementById("output");
//   if (output) output.textContent = "Calling API...";

//   try {
//     const res = await fetch("/api/getMe", {
//       credentials: "include"
//     });
//     const text = await res.text();

//     try {
//       const data = JSON.parse(text);
//       if (output) output.textContent = JSON.stringify(data, null, 2);
//     } catch {
//       if (output) output.textContent = `Non-JSON response:\n${text}`;
//     }
//   } catch (err) {
//     if (output) output.textContent = `Error: ${err.message}`;
//   }
// });

window.showPageLoader = function (text = "Loading...") {
  const loader = document.getElementById("pageLoader");
  const loaderText = document.getElementById("pageLoaderText");
  if (!loader) return;
  if (loaderText) loaderText.textContent = text;
  loader.classList.add("show");
};

window.hidePageLoader = function () {
  const loader = document.getElementById("pageLoader");
  if (!loader) return;
  loader.classList.remove("show");
};