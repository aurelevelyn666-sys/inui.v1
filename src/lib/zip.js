// Minimal ZIP writer (store-only, no compression) — zero dependencies.
// Enough for text project files; the browser already serves the runnable
// site.html from buildSrcDoc, which we include as index.html.
//
// Format: local file headers + data, central directory, EOCD record.
// CRC32 computed with a small table (built once).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date || new Date();
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const day =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, day };
}

// ZIP entry names use forward slashes and no leading slash. Normalizes
// separators, collapses dots, and contains `..` at the root so a hostile
// file key can never escape the archive folder on extract (Zip-Slip).
function entryName(path) {
  const s = String(path || 'file.txt')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/[\x00-\x1f\x7f]/g, '');
  const parts = [];
  for (const seg of s.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/') || 'file.txt';
}

function u16(n) {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

// Archive guardrails: a runaway project (or hostile file map) must not OOM
// the tab or emit a corrupt archive (u16/u32 length fields wrap past 64KB).
const MAX_ZIP_FILES = 200;
const MAX_ZIP_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_NAME_BYTES = 512;

// files: { "/App.jsx": "code", ... } or [{ path, code }]
// Returns { blob, fileCount } — fileCount is what was actually written.
export function buildZip(files, { rootFolder = 'inui-site' } = {}) {
  const entries = [];
  const src = Array.isArray(files)
    ? files.map((f) => ({ path: f.path, code: f.code ?? f.content ?? '' }))
    : Object.entries(files || {}).map(([path, code]) => ({ path, code }));

  const folder = rootFolder
    ? String(rootFolder).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.\./g, '').slice(0, 40) + '/'
    : '';
  const now = new Date();
  const { time, day } = dosDateTime(now);

  const chunks = [];
  const central = [];
  let offset = 0;
  let dataBytes = 0;

  const enc = new TextEncoder();

  for (const { path, code } of src) {
    if (typeof code !== 'string') continue;
    if (central.length >= MAX_ZIP_FILES) break;
    const name = folder + entryName(path);
    const nameBytes = enc.encode(name);
    if (!name || nameBytes.length > MAX_ZIP_NAME_BYTES) continue;
    const data = enc.encode(code);
    if (dataBytes + data.length > MAX_ZIP_TOTAL_BYTES) break;
    dataBytes += data.length;
    const crc = crc32(data);

    // Local file header
    chunks.push(
      new Uint8Array([
        ...u32(0x04034b50),
        ...u16(20), // version needed
        ...u16(0x0800), // flags: UTF-8 names
        ...u16(0), // method: store
        ...u16(time),
        ...u16(day),
        ...u32(crc),
        ...u32(data.length), // compressed
        ...u32(data.length), // uncompressed
        ...u16(nameBytes.length),
        ...u16(0) // extra len
      ]),
      nameBytes,
      data
    );

    central.push({
      nameBytes,
      crc,
      size: data.length,
      offset
    });

    offset += 30 + nameBytes.length + data.length;
  }

  const centralStart = offset;
  for (const e of central) {
    chunks.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20), // version made by
        ...u16(20), // version needed
        ...u16(0x0800), // flags
        ...u16(0), // method
        ...u16(time),
        ...u16(day),
        ...u32(e.crc),
        ...u32(e.size),
        ...u32(e.size),
        ...u16(e.nameBytes.length),
        ...u16(0), // extra
        ...u16(0), // comment
        ...u16(0), // disk
        ...u16(0), // internal attrs
        ...u32(0), // external attrs
        ...u32(e.offset)
      ]),
      e.nameBytes
    );
    offset += 46 + e.nameBytes.length;
  }
  const centralSize = offset - centralStart;

  // End of central directory
  chunks.push(
    new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0), // disk
      ...u16(0), // cd disk
      ...u16(central.length),
      ...u16(central.length),
      ...u32(centralSize),
      ...u32(centralStart),
      ...u16(0) // comment len
    ])
  );

  return { blob: new Blob(chunks, { type: 'application/zip' }), fileCount: central.length };
}

// Convenience: build the ZIP blob for the current project (files + runnable
// index.html built by buildSrcDoc). fileCount is what was actually written.
// If the preview no longer builds, the files still export — with `error` set
// so the caller can warn that index.html is missing/stale instead of claiming
// a complete export.
export function exportProjectZip({ files, overrides, entry, buildSrcDoc, rootFolder }) {
  const run = buildSrcDoc({ files, overrides, editable: false, entry });
  const payload = { ...files };
  let error = null;
  if (run.srcDoc) payload['/index.html'] = run.srcDoc;
  else error = String(run.error || 'preview build failed');
  if (run.entry && !files[run.entry]) payload[run.entry] = files[run.entry] || '';
  const name = (run.entry || '/App.jsx').replace(/^\//, '').replace(/\.jsx?$/, '');
  const folder = (rootFolder || 'inui-' + name.toLowerCase()).slice(0, 40);
  const { blob, fileCount } = buildZip(payload, { rootFolder: folder });
  return { blob, fileCount, error };
}

// Trigger a browser download for a Blob. Appended to the DOM for Firefox
// (a detached anchor click is a silent no-op there).
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Open a blob in a new tab. Returns true unless the popup was blocked — then
// falls back to an anchor click and reports via onBlocked.
export function openBlobTab(blob, onBlocked) {
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  let w = null;
  try {
    w = window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    w = null;
  }
  if (!w) {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* noop */
    }
    if (onBlocked) onBlocked();
  }
  return !!w;
}
