import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, FileText, Plus, Minus } from 'lucide-react';

function computeDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const diff = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length) {
      if (oldLines[i] === newLines[j]) {
        diff.push({ type: 'same', text: oldLines[i], oldLine: i + 1, newLine: j + 1 });
        i++; j++;
      } else {
        // Look ahead for a match
        let foundInNew = -1, foundInOld = -1;
        for (let k = j + 1; k < Math.min(j + 8, newLines.length); k++) {
          if (newLines[k] === oldLines[i]) { foundInNew = k; break; }
        }
        for (let k = i + 1; k < Math.min(i + 8, oldLines.length); k++) {
          if (oldLines[k] === newLines[j]) { foundInOld = k; break; }
        }
        if (foundInNew >= 0 && (foundInOld < 0 || foundInNew - j <= foundInOld - i)) {
          while (j < foundInNew) {
            diff.push({ type: 'add', text: newLines[j], newLine: j + 1 });
            j++;
          }
        } else if (foundInOld >= 0) {
          while (i < foundInOld) {
            diff.push({ type: 'del', text: oldLines[i], oldLine: i + 1 });
            i++;
          }
        } else {
          diff.push({ type: 'del', text: oldLines[i], oldLine: i + 1 });
          diff.push({ type: 'add', text: newLines[j], newLine: j + 1 });
          i++; j++;
        }
      }
    } else if (i < oldLines.length) {
      diff.push({ type: 'del', text: oldLines[i], oldLine: i + 1 });
      i++;
    } else {
      diff.push({ type: 'add', text: newLines[j], newLine: j + 1 });
      j++;
    }
  }
  return diff;
}

function FileDiff({ path, oldContent, newContent }) {
  const [open, setOpen] = useState(true);
  const diff = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);
  const adds = diff.filter((d) => d.type === 'add').length;
  const dels = diff.filter((d) => d.type === 'del').length;
  const isNew = !oldContent;

  return (
    <div className="border border-black/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 hover:bg-zinc-100 text-left"
      >
        {open ? <ChevronDown size={12} className="shrink-0 text-zinc-400" /> : <ChevronRight size={12} className="shrink-0 text-zinc-400" />}
        <FileText size={12} className="shrink-0 text-zinc-400" />
        <span className="text-[12px] text-zinc-700 truncate flex-1 font-medium">{path}</span>
        {isNew && <span className="text-[10px] text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">new</span>}
        {adds > 0 && <span className="text-[10px] text-emerald-600">+{adds}</span>}
        {dels > 0 && <span className="text-[10px] text-red-500">-{dels}</span>}
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto font-mono text-[11px] leading-[1.6]">
          {diff.map((d, i) => (
            <div
              key={i}
              className={`flex ${d.type === 'add' ? 'bg-emerald-50' : d.type === 'del' ? 'bg-red-50' : ''}`}
            >
              <span className="w-10 text-right pr-2 text-zinc-400 shrink-0 select-none">
                {d.type === 'add' ? '' : d.oldLine || ''}
              </span>
              <span className="w-10 text-right pr-2 text-zinc-400 shrink-0 select-none">
                {d.type === 'del' ? '' : d.newLine || ''}
              </span>
              <span className={`w-5 text-center shrink-0 select-none ${d.type === 'add' ? 'text-emerald-500' : d.type === 'del' ? 'text-red-500' : 'text-zinc-300'}`}>
                {d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' '}
              </span>
              <span className="flex-1 pr-3 whitespace-pre overflow-hidden text-zinc-700">{d.text || ' '}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DiffView({ changes }) {
  if (!changes || changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
        <FileText size={24} className="mb-2 opacity-40" />
        <p className="text-[12px]">No changes yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-black/10">
        <span className="text-[11px] text-zinc-500 font-medium flex-1">Changes</span>
        <span className="text-[10px] text-zinc-400">{changes.length} file{changes.length > 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {changes.map((c) => (
          <FileDiff key={c.path} path={c.path} oldContent={c.oldContent} newContent={c.newContent} />
        ))}
      </div>
    </div>
  );
}
