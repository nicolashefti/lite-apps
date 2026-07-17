// Sidebar tree rendering. Module-level state is safe — single page, single tree.

let _onSelect = null;
let _selectedPath = null;

export function init(onSelect) {
  _onSelect = onSelect;
}

export function renderTree(nodes, container, depth = 0) {
  container.innerHTML = "";
  for (const node of nodes) {
    container.appendChild(
      node.kind === "directory" ? buildDir(node, depth) : buildFile(node, depth)
    );
  }
}

export function setSelected(path) {
  _selectedPath = path;
  document.querySelectorAll(".nt-item.selected").forEach((el) =>
    el.classList.remove("selected")
  );
  const el = document.querySelector(`.nt-item[data-path="${CSS.escape(path)}"]`);
  if (el) el.classList.add("selected");
}

function buildFile(node, depth) {
  const btn = document.createElement("button");
  btn.className = "nt-item nt-file";
  btn.dataset.path = node.path;
  btn.style.paddingLeft = `${12 + depth * 16}px`;
  btn.textContent = node.name.replace(/\.md$/, "");
  if (node.path === _selectedPath) btn.classList.add("selected");
  btn.addEventListener("click", () => {
    setSelected(node.path);
    _onSelect?.(node.path);
  });
  return btn;
}

function buildDir(node, depth) {
  const wrap = document.createElement("div");

  const header = document.createElement("button");
  header.className = "nt-item nt-dir";
  header.style.paddingLeft = `${12 + depth * 16}px`;

  const caret = document.createElement("span");
  caret.className = "caret";
  caret.textContent = "›";
  caret.style.cssText = "display:inline-block;margin-right:5px;font-size:13px";

  header.append(caret, node.name);

  const childWrap = document.createElement("div");
  let expanded = false;
  childWrap.classList.add("hidden");
  renderTree(node.children, childWrap, depth + 1);

  header.addEventListener("click", () => {
    expanded = !expanded;
    caret.classList.toggle("expanded", expanded);
    childWrap.classList.toggle("hidden", !expanded);
  });

  wrap.append(header, childWrap);
  return wrap;
}

export function renderRecent(paths, container, onSelect) {
  container.innerHTML = "";
  if (!paths.length) return;

  const label = document.createElement("div");
  label.className = "nt-section-label";
  label.textContent = "Recent";
  container.appendChild(label);

  for (const path of paths) {
    const parts = path.split("/");
    const name = parts.pop().replace(/\.md$/, "");
    const parentFolder = parts.length ? parts[parts.length - 1] : null;

    const btn = document.createElement("button");
    btn.className = "nt-item nt-file";
    btn.dataset.path = path;
    btn.style.paddingLeft = "12px";

    const nameSpan = document.createElement("span");
    nameSpan.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis";
    nameSpan.textContent = name;
    btn.appendChild(nameSpan);

    if (parentFolder) {
      const hint = document.createElement("span");
      hint.className = "nt-hint";
      hint.textContent = parentFolder;
      btn.appendChild(hint);
    }

    if (path === _selectedPath) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      setSelected(path);
      onSelect?.(path);
    });
    container.appendChild(btn);
  }

  const divider = document.createElement("div");
  divider.className = "nt-section-divider";
  container.appendChild(divider);
}
