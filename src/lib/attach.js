// Shared attachment handling: images (resized) + text files.
// Returns { added: [...], skipped: [{ name, reason }] } — never throws.

export const MAX_ATTS = 4;
export const MAX_TEXT_BYTES = 100000;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const ACCEPT =
  'image/*,.txt,.md,.markdown,.json,.js,.jsx,.ts,.tsx,.css,.html,.csv,.xml,.yml,.yaml';

const nid = () => 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);

export function resizeImage(file, ms = 15000) {
  return new Promise((resolve) => {
    let done = false;
    let url = null;
    let timer = null;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* noop */
        }
      }
      resolve(v);
    };
    // A corrupt file may never fire load/error — never hang the composer.
    timer = setTimeout(() => finish(null), ms);
    try {
      const img = new Image();
      url = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          finish(c.toDataURL('image/jpeg', 0.82));
        } catch {
          finish(null);
        }
      };
      img.onerror = () => finish(null);
      img.src = url;
    } catch {
      finish(null);
    }
  });
}

function isTextFile(f) {
  return (
    /text|json|javascript|xml|csv|yaml|markdown/.test(f.type || '') ||
    /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|html|csv|xml|yml|yaml)$/i.test(f.name || '')
  );
}

export async function filesToAttachments(fileList, existingCount = 0) {
  const added = [];
  const skipped = [];
  const incoming = [...(fileList || [])];
  for (const f of incoming) {
    if (existingCount + added.length >= MAX_ATTS) {
      skipped.push({ name: f.name, reason: 'max 4 files per message' });
      continue;
    }
    if ((f.type || '').startsWith('image/')) {
      if (f.size > MAX_IMAGE_BYTES) {
        skipped.push({ name: f.name || 'image', reason: 'image over 15MB' });
        continue;
      }
      const dataUrl = await resizeImage(f);
      if (dataUrl) added.push({ id: nid(), kind: 'image', name: f.name || 'image', dataUrl });
      else skipped.push({ name: f.name || 'image', reason: 'could not read image' });
    } else if (isTextFile(f)) {
      if (f.size > MAX_TEXT_BYTES) {
        skipped.push({ name: f.name, reason: 'text file over 100KB' });
        continue;
      }
      try {
        // Slice before decoding so a lying size never forces a huge read.
        const text = await f.slice(0, MAX_TEXT_BYTES + 1).text();
        const clipped = String(text).slice(0, 15000);
        added.push({
          id: nid(),
          kind: 'text',
          name: f.name,
          text: clipped + (text.length > 15000 ? '\n…[truncated to 15000 chars]' : '')
        });
      } catch {
        skipped.push({ name: f.name, reason: 'could not read file' });
      }
    } else {
      skipped.push({ name: f.name || 'file', reason: 'only images + text files supported' });
    }
  }
  return { added, skipped };
}
