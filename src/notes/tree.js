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

  if (node.nonMd) {
    btn.classList.add("nt-file-other");
    btn.textContent = node.name;
  } else {
    btn.textContent = node.name.replace(/\.md$/, "");
    if (node.path === _selectedPath) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      setSelected(node.path);
      _onSelect?.(node.path);
    });
  }

  return btn;
}

function countMd(nodes) {
  let n = 0;
  for (const node of nodes) {
    if (node.kind === "file" && !node.nonMd) n++;
    else if (node.kind === "directory") n += countMd(node.children);
  }
  return n;
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

  const nameSpan = document.createElement("span");
  nameSpan.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis";
  nameSpan.textContent = node.name;

  const countSpan = document.createElement("span");
  countSpan.className = "nt-hint";
  countSpan.textContent = `(${countMd(node.children)})`;

  header.append(caret, nameSpan, countSpan);

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

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(text, query) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return escHtml(text);
  return (
    escHtml(text.slice(0, i)) +
    `<mark class="nt-highlight">${escHtml(text.slice(i, i + query.length))}</mark>` +
    escHtml(text.slice(i + query.length))
  );
}

function getSnippet(content, query, idx) {
  const W = 70;
  const start = Math.max(0, idx - W);
  const end = Math.min(content.length, idx + query.length + W);
  let s = content.slice(start, end).replace(/\n+/g, " ");
  if (start > 0) s = "…" + s;
  if (end < content.length) s += "…";
  return s;
}

export function renderSearchResults(results, query, container, onSelect) {
  container.innerHTML = "";

  if (!results.length) {
    const msg = document.createElement("div");
    msg.className = "nt-section-label";
    msg.style.padding = "16px 12px";
    msg.textContent = "No results";
    container.appendChild(msg);
    return;
  }

  for (const { path, name, contentIdx, content } of results) {
    const btn = document.createElement("button");
    btn.className = "nt-item nt-file nt-search-result";
    btn.dataset.path = path;
    if (path === _selectedPath) btn.classList.add("selected");

    const nameEl = document.createElement("div");
    nameEl.className = "nt-sr-name";
    nameEl.innerHTML = highlight(name, query);
    btn.appendChild(nameEl);

    if (contentIdx !== -1) {
      const snippetEl = document.createElement("div");
      snippetEl.className = "nt-sr-snippet";
      snippetEl.innerHTML = highlight(getSnippet(content, query, contentIdx), query);
      btn.appendChild(snippetEl);
    }

    btn.addEventListener("click", () => {
      setSelected(path);
      onSelect?.(path);
    });
    container.appendChild(btn);
  }
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
