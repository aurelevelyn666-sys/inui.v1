import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, Download, FileText, RotateCcw } from 'lucide-react';
import FileTree from './FileTree.jsx';
import { highlightCode } from '../lib/highlight.js';
import { downloadBlob } from '../lib/zip.js';

const CLS = {
  x: 'text-zinc-800',
  k: 'text-purple-700 font-medium',
  s: 'text-emerald-700',
  c: 'text-zinc-400 italic',
  n: 'text-amber-700',
  t: 'text-blue-700',
  a: 'text-sky-700',
  p: 'text-zinc-400'
};

// Tokens arrive as arbitrary runs — re-slice them into display lines so each
// row gets a line number (multi-line strings/comments keep their class).
function toLines(tokens) {
  const lines = [[]];
  tokens.forEach(({ t, c }) => {
    String(t)
      .split('\n')
      .forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1].push({ t: part, c });
      });
  });
  return lines;
}

// Read-only code viewer for the preview column's Code tab: full file tree on
// the left, highlighted source on the right. Editing stays in the thread's
// Files tab and on the canvas — this view never writes.
export default function CodeView({ files, activeFile, onSelectFile, onAddFile, onDeleteFile, onRegenerateFile }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const code = (activeFile && files[activeFile]) || '';
  const lines = useMemo(() => toLines(highlightCode(code, activeFile || '')), [code, activeFile]);
  const fileCount = Object.keys(files || {}).length;

  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    downloadBlob(new Blob([code], { type: 'text/plain' }), String(activeFile || 'file.txt').replace(/^\/+/, ''));
  };

  return (
    <div className="flex-1 min-h-0 flex min-w-0">
      <div className="w-52 shrink-0 border-r border-black/10 overflow-y-auto py-2 min-h-0">
        <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-zinc-400">
          {fileCount} file{fileCount === 1 ? '' : 's'}
        </div>
        <FileTree
          files={files}
          activeFile={activeFile}
          onSelectFile={onSelectFile}
          onAddFile={onAddFile}
          onDeleteFile={onDeleteFile}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white">
        <div className="h-9 shrink-0 border-b border-black/10 flex items-center gap-1.5 px-3 text-xs">
          <FileText size={12} className="text-zinc-400 shrink-0" />
          <span className="font-mono text-[11px] text-zinc-600 truncate" title={activeFile || ''}>
            {String(activeFile || '').replace(/^\/+/, '')}
          </span>
          <div className="ml-auto flex items-center gap-0.5 shrink-0">
            {onRegenerateFile && activeFile && (
              <button
                onClick={() => onRegenerateFile(activeFile)}
                title="Regenerate only this file"
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-black/5 flex items-center gap-1"
              >
                <RotateCcw size={12} />
                <span className="text-[11px]">Regenerate</span>
              </button>
            )}
            <button
              onClick={copy}
              title={copied ? 'Copied' : 'Copy file'}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-black/5 flex items-center gap-1"
            >
              {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              <span className="text-[11px]">{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={download}
              title="Download file"
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-black/5 flex items-center gap-1"
            >
              <Download size={12} />
              <span className="text-[11px]">Download</span>
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto min-h-0 p-3 text-[12px] leading-[1.7] font-mono">
          {lines.map((ln, i) => (
            <div key={i} className="flex">
              <span className="w-8 shrink-0 text-right pr-3 text-zinc-300 select-none">{i + 1}</span>
              <code className="whitespace-pre">
                {ln.length ? (
                  ln.map((tk, j) => (
                    <span key={j} className={CLS[tk.c] || CLS.x}>
                      {tk.t}
                    </span>
                  ))
                ) : (
                  ' '
                )}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
