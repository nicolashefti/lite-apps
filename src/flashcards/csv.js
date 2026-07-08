// RFC 4180 CSV parser. Returns [{front, back}] pairs.
// Skips header row if first row looks like column labels.
// Ignores columns beyond the first two.
// Delimiter auto-detected from the first line: whichever of ',' or ';' appears more wins.

export function parseCSV(text) {
  const nl = text.search(/[\r\n]/);
  const firstLine = nl === -1 ? text : text.slice(0, nl);
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const rows = tokenise(text.trimEnd(), delim);
  if (rows.length === 0) return [];

  // Detect optional header row by checking first cell content
  const first = rows[0];
  if (first.length >= 2) {
    const a = first[0].trim().toLowerCase();
    const HEADER_WORDS = new Set(['front', 'back', 'question', 'answer', 'term', 'definition', 'a', 'b']);
    if (HEADER_WORDS.has(a)) rows.shift();
  }

  return rows
    .filter(r => r.length >= 2 && (r[0].trim() || r[1].trim()))
    .map(r => ({ front: r[0].trim(), back: r[1].trim() }));
}

// Splits text into rows of fields, handling quoted fields and "" escaping.
function tokenise(text, delim = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === delim) {
        row.push(field); field = '';
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(field); rows.push(row); row = []; field = ''; i += 2; continue;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += ch;
      }
    }
    i++;
  }

  if (row.length || field) { row.push(field); rows.push(row); }

  // Drop rows that are just a single empty string (trailing newline)
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}
