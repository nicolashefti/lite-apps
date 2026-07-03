// Minimal modal helpers: an overlay host plus the conflict dialog (spec §6).

export function showModal(node, { dismissible = true } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.appendChild(node);
  const close = () => overlay.remove();
  if (dismissible) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }
  document.getElementById("modal-root").appendChild(overlay);
  return close;
}

export function conflictModal() {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "modal";
    box.innerHTML = `
      <h2>The file was modified elsewhere</h2>
      <p>Your task file changed on disk — most likely another device synced in.
         What should happen?</p>
      <div class="modal-actions column">
        <button data-choice="reload">Reload file <small>discard my unsaved changes</small></button>
        <button data-choice="overwrite">Overwrite <small>keep my version</small></button>
        <button data-choice="copy">Save mine as a copy <small>leave the file to the other device</small></button>
      </div>`;
    const close = showModal(box, { dismissible: false });
    for (const btn of box.querySelectorAll("button[data-choice]")) {
      btn.addEventListener("click", () => {
        close();
        resolve(btn.dataset.choice);
      });
    }
  });
}

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
