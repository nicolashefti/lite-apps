export function injectHomeLink(headerEl) {
  const a = document.createElement("a");
  a.href = "index.html";
  a.className = "home-btn";
  a.title = "Home";
  a.textContent = "🧠";
  headerEl.prepend(a);
}
