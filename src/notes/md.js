// Minimal Markdown → HTML renderer. Zero dependencies, no eval.
// Supports: headings, bold/italic/strikethrough, inline code, fenced code blocks,
// blockquotes, unordered/ordered/task lists, horizontal rules, links, paragraphs.
// Front matter (---...---) is stripped before rendering.

function escape(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(s) {
  return escape(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function listItem(text) {
  const task = text.match(/^\[([x ])\] (.*)/i);
  if (task) {
    const checked = task[1].toLowerCase() === "x";
    return `<li class="task-item"><input type="checkbox"${checked ? " checked" : ""} disabled> ${inline(task[2])}</li>`;
  }
  return `<li>${inline(text)}</li>`;
}

export function renderMarkdown(raw) {
  let src = raw ?? "";

  // Strip front matter
  if (src.startsWith("---")) {
    const end = src.indexOf("\n---", 3);
    if (end !== -1) src = src.slice(end + 4).replace(/^\n/, "");
  }

  const lines = src.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = escape(line.slice(3).trim());
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(escape(lines[i]));
        i++;
      }
      out.push(`<pre><code${lang ? ` class="lang-${lang}"` : ""}>${code.join("\n")}</code></pre>`);
      i++;
      continue;
    }

    // ATX heading
    const hm = line.match(/^(#{1,6}) +(.*)/);
    if (hm) {
      out.push(`<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const bq = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        bq.push(inline(lines[i].slice(2)));
        i++;
      }
      out.push(`<blockquote><p>${bq.join("<br>")}</p></blockquote>`);
      continue;
    }

    // Unordered list (includes task lists)
    if (/^[-*+] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        items.push(listItem(lines[i].slice(2)));
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(listItem(lines[i].replace(/^\d+\. /, "")));
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Blank line
    if (line.trim() === "") { i++; continue; }

    // Paragraph: accumulate until blank line or block-level element
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6} /.test(lines[i]) &&
      !/^[-*+] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      !lines[i].startsWith("> ") &&
      !lines[i].startsWith("```") &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      para.push(inline(lines[i]));
      i++;
    }
    if (para.length) out.push(`<p>${para.join("<br>")}</p>`);
  }

  return out.join("");
}
