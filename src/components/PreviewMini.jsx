import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw, ExternalLink, X, FolderDown, Monitor, Tablet, Smartphone,
  AlertTriangle, ChevronDown, Download, Pencil, Home, Upload
} from 'lucide-react';
import { buildSrcDoc } from '../lib/files';
import { exportProjectZip, downloadBlob, openBlobTab } from '../lib/zip.js';
import CodeView from './CodeView.jsx';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', w: 0, icon: Monitor },
  { id: 'tablet', label: 'Tablet', w: 768, icon: Tablet },
  { id: 'phone', label: 'Phone', w: 390, icon: Smartphone }
];

export default function PreviewMini({
  files, overrides, entry, entries, onEntryChange, hasBuild,
  onOpenCanvas, onClose, onToast, onDownloadHtml,
  paneW, onPaneWidth, activeFile, onSelectFile, onAddFile, onDeleteFile
}) {
  const iframeRef = useRef(null);
  const viewportRef = useRef(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewH, setViewH] = useState(800);
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState('desktop');
  const [mode, setMode] = useState('preview'); // preview | code
  const [entryOpen, setEntryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const dragRef = useRef(null);
  const rafRef = useRef(0);

  // Unmount mid-drag: drop listeners and pending frames, never dangle.
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      const d = dragRef.current;
      if (d) {
        window.removeEventListener('pointermove', d.move);
        window.removeEventListener('pointerup', d.end);
        window.removeEventListener('pointercancel', d.end);
        dragRef.current = null;
      }
    },
    []
  );

  // Debounce rebuilds while files stream in — the iframe reloads on a settled
  // snapshot instead of every chunk, so it stops flickering mid-generation.
  const [committed, setCommitted] = useState(null);
  useEffect(() => {
    if (!hasBuild) { setCommitted(null); return; }
    const t = setTimeout(() => setCommitted({ files, overrides, entry }), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, overrides, entry, hasBuild, refreshKey]);

  const doc = useMemo(() => {
    if (!committed) return null;
    try {
      return buildSrcDoc({ files: committed.files, overrides: committed.overrides, editable: false, entry: committed.entry });
    } catch {
      return null;
    }
  }, [committed]);

  const dev = DEVICES.find((d) => d.id === device) || DEVICES[0];
  const zoom = dev.w ? Math.min(1, (paneW - 40) / dev.w) : 1;

  useEffect(() => {
    setLoading(true);
  }, [doc, device]);

  // Loading clears when the frame finishes loading; fall back to a timer so
  // the bar can never stick.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(t);
  }, [loading, doc]);

  // Fixed viewport: the frame is sized from the PANE (parent), never from the
  // page content. Sizing from content feedback-loops with viewport units —
  // a min-h-screen hero makes content(H) = H + rest, so the frame grows
  // forever. With a stable viewport, 100vh is stable and below-fold content
  // stays reachable via the frame's own scroll.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const openTab = () => {
    if (!doc || !doc.srcDoc) return;
    openBlobTab(new Blob([doc.srcDoc], { type: 'text/html' }), () =>
      onToast ? onToast('Popup blocked — allow popups to open previews') : undefined
    );
  };

  const doExportZip = () => {
    setPublishOpen(false);
    try {
      const { blob, fileCount, error } = exportProjectZip({ files, overrides, entry, buildSrcDoc });
      downloadBlob(blob, 'inui-site.zip');
      if (onToast) {
        onToast(
          error
            ? 'Exported ' + fileCount + ' file(s), but index.html is missing: ' + String(error).slice(0, 80)
            : 'Exported ' + fileCount + ' file(s) as inui-site.zip'
        );
      }
    } catch (e) {
      if (onToast) onToast('Export failed: ' + String((e && e.message) || e).slice(0, 80));
    }
  };

  const doDownloadHtml = () => {
    setPublishOpen(false);
    if (onDownloadHtml) onDownloadHtml();
  };

  const doOpenTab = () => {
    setPublishOpen(false);
    openTab();
  };

  // Pointer Events cover mouse + touch; width commits ride rAF so a fast
  // drag can't queue a render per pixel. Width is owned by the parent (it
  // clamps against the thread minimum and auto-minimizes the sidebar).
  const startDrag = (e) => {
    e.preventDefault();
    const sx = typeof e.clientX === 'number' ? e.clientX : 0;
    const sw = paneW;
    const apply = (clientX) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onPaneWidth(Math.min(1400, Math.max(320, sw + (sx - clientX))));
      });
    };
    const move = (ev) => apply(typeof ev.clientX === 'number' ? ev.clientX : sx);
    const end = () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (dragRef.current && dragRef.current.end === end) dragRef.current = null;
    };
    dragRef.current = { move, end };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const entryShort = String(entry || '').replace(/^\/+/, '') || 'App.jsx';

  return (
    <div className="shrink-0 border-l border-black/10 hidden lg:flex flex-col min-h-0 bg-white relative" style={{ width: paneW }}>
      <div
        onPointerDown={startDrag}
        onDoubleClick={() => onPaneWidth(480)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onPaneWidth((w) => Math.min(1400, w + 20));
          else if (e.key === 'ArrowRight') onPaneWidth((w) => Math.max(320, w - 20));
          else return;
          e.preventDefault();
        }}
        title="Drag to resize (double-click to reset, arrow keys nudge)"
        role="separator"
        aria-orientation="vertical"
        aria-label="Preview pane width"
        aria-valuenow={Math.round(paneW)}
        aria-valuemin={320}
        aria-valuemax={1400}
        tabIndex={0}
        style={{ touchAction: 'none' }}
        className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize z-10 flex items-center justify-center group outline-none focus-visible:bg-black/5"
      >
        <span className="w-1 h-10 rounded-full bg-black/10 group-hover:bg-black/25 transition-colors" />
      </div>

      {/* header */}
      <div className="h-10 shrink-0 border-b border-black/10 flex items-center gap-1 px-3 text-xs relative">
        <div className="flex items-center bg-black/5 rounded-full p-0.5 shrink-0">
          {['preview', 'code'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-full capitalize text-[11px] transition-colors ${
                mode === m ? 'bg-white text-zinc-900 font-medium shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === 'preview' && (
          <div className="relative shrink-0">
            <button
              onClick={() => setEntryOpen((o) => !o)}
              title="Switch page"
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 border border-black/10 rounded-full pl-2 pr-1.5 py-1 max-w-[150px]"
            >
              <Home size={11} className="shrink-0" />
              <span className="truncate">{entryShort}</span>
              <ChevronDown size={10} className="shrink-0" />
            </button>
            {entryOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setEntryOpen(false)} />
                <div className="absolute top-8 left-0 z-50 w-52 bg-white border border-black/10 rounded-xl p-1.5 shadow-2xl max-h-64 overflow-y-auto">
                  {(entries || []).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setEntryOpen(false);
                        if (onEntryChange) onEntryChange(p);
                      }}
                      className={`w-full text-left text-[11px] font-mono rounded-lg px-2 py-1.5 truncate ${
                        p === entry ? 'bg-black/5 text-zinc-900' : 'text-zinc-500 hover:bg-black/5 hover:text-zinc-800'
                      }`}
                    >
                      {String(p).replace(/^\/+/, '')}
                    </button>
                  ))}
                  {!(entries || []).length && (
                    <div className="text-[11px] text-zinc-400 px-2 py-1.5">No pages yet.</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          {mode === 'preview' && (
            <>
              {DEVICES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDevice(d.id)}
                  title={d.label + (d.w ? ' · ' + d.w + 'px' : ' · fills pane')}
                  className={`w-7 h-7 rounded-lg hidden xl:flex items-center justify-center transition-colors ${
                    device === d.id ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-700 hover:bg-black/5'
                  }`}
                >
                  <d.icon size={13} />
                </button>
              ))}
              <button onClick={() => setRefreshKey((k) => k + 1)} title="Reload" className="p-1.5 text-zinc-400 hover:text-zinc-700">
                <RefreshCw size={12} />
              </button>
            </>
          )}
          <button
            onClick={onOpenCanvas}
            title="Edit on canvas"
            className="h-7 flex items-center gap-1 text-[11px] text-zinc-600 border border-black/[0.08] rounded-full px-2.5 hover:border-black/20 hover:text-black"
          >
            <Pencil size={11} /> Edit
          </button>
          <div className="relative">
            <button
              onClick={() => setPublishOpen((o) => !o)}
              title="Publish / export"
              className="h-7 flex items-center gap-1 text-[11px] font-medium bg-zinc-900 text-white rounded-full px-2.5 hover:bg-black"
            >
              <Upload size={11} /> Publish
            </button>
            {publishOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPublishOpen(false)} />
                <div className="absolute top-8 right-0 z-50 w-56 bg-white border border-black/10 rounded-xl p-1.5 shadow-2xl">
                  <button
                    onClick={doDownloadHtml}
                    className="w-full flex items-center gap-2 text-left text-[12px] text-zinc-700 rounded-lg px-2.5 py-2 hover:bg-black/5"
                  >
                    <Download size={13} className="text-zinc-400" />
                    <span>Download site.html<span className="block text-[10px] text-zinc-400 font-normal">Single runnable file</span></span>
                  </button>
                  <button
                    onClick={doExportZip}
                    className="w-full flex items-center gap-2 text-left text-[12px] text-zinc-700 rounded-lg px-2.5 py-2 hover:bg-black/5"
                  >
                    <FolderDown size={13} className="text-zinc-400" />
                    <span>Export project ZIP<span className="block text-[10px] text-zinc-400 font-normal">All files + runnable index.html</span></span>
                  </button>
                  <div className="h-px bg-black/5 my-1" />
                  <button
                    onClick={doOpenTab}
                    className="w-full flex items-center gap-2 text-left text-[12px] text-zinc-700 rounded-lg px-2.5 py-2 hover:bg-black/5"
                  >
                    <ExternalLink size={13} className="text-zinc-400" />
                    <span>Open in new tab</span>
                  </button>
                </div>
              </>
            )}
          </div>
          {onClose && (
            <button onClick={onClose} title="Close preview" className="p-1.5 text-zinc-400 hover:text-zinc-700">
              <X size={13} />
            </button>
          )}
        </div>
        {/* streaming / reload loading bar */}
        {loading && doc && mode === 'preview' && (
          <div className="absolute left-0 -bottom-px w-full h-[2px] overflow-hidden">
            <div className="h-full w-1/3 rounded-full" style={{ background: 'linear-gradient(90deg,transparent,#3b66eb,transparent)', animation: 'inui-slide 1.1s ease-in-out infinite' }} />
          </div>
        )}
      </div>

      {mode === 'code' ? (
        <CodeView
          files={files}
          activeFile={activeFile}
          onSelectFile={onSelectFile}
          onAddFile={onAddFile}
          onDeleteFile={onDeleteFile}
        />
      ) : (
        /* viewport — fixed height, the frame scrolls internally like a browser */
        <div ref={viewportRef} className={`flex-1 min-h-0 overflow-auto ${dev.w ? 'bg-zinc-100 flex justify-center py-4 px-4' : 'bg-white'}`}>
          {!doc ? (
            <div className="m-auto flex flex-col items-center gap-3 text-center px-8">
              <div className="w-10 h-10 rounded-full opacity-80" style={{ background: 'linear-gradient(135deg,#6f9bff 0%,#3b66eb 100%)', animation: 'inui-pulse 2s ease-in-out infinite' }} />
              <div className="text-xs text-zinc-500">{hasBuild ? 'Preparing preview…' : 'Describe a site and the live preview appears here.'}</div>
            </div>
          ) : doc.error ? (
            <div className="m-auto max-w-sm bg-red-50 border border-red-200 rounded-xl p-4 text-xs">
              <div className="flex items-center gap-1.5 text-red-600 font-medium mb-1.5"><AlertTriangle size={13} /> Preview failed to build</div>
              <pre className="whitespace-pre-wrap text-red-600/90">{String(doc.error).slice(0, 800)}</pre>
            </div>
          ) : (
            <div
              className={dev.w ? 'shrink-0' : 'w-full min-h-full'}
              style={dev.w ? { width: dev.w * zoom, minWidth: dev.w * zoom } : undefined}
            >
              <div style={dev.w ? { zoom, width: dev.w } : undefined}>
                <iframe
                  ref={iframeRef}
                  title="live-preview"
                  sandbox="allow-scripts"
                  srcDoc={doc.srcDoc}
                  onLoad={() => setLoading(false)}
                  className={`w-full border-0 block bg-white ${dev.w ? 'rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)]' : ''}`}
                  style={{ height: Math.max(200, viewH - (dev.w ? 32 : 0)) }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
