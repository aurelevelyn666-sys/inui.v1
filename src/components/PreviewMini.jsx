import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, ArrowUpRight, X, FolderDown, Monitor, Tablet, Smartphone, AlertTriangle } from 'lucide-react';
import { buildSrcDoc } from '../lib/files';
import { exportProjectZip, downloadBlob, openBlobTab } from '../lib/zip.js';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', w: 0, icon: Monitor },
  { id: 'tablet', label: 'Tablet', w: 768, icon: Tablet },
  { id: 'phone', label: 'Phone', w: 390, icon: Smartphone }
];

export default function PreviewMini({ files, overrides, entry, hasBuild, onOpenCanvas, onClose, onToast }) {
  const iframeRef = useRef(null);
  const viewportRef = useRef(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [paneW, setPaneW] = useState(480);
  const [viewH, setViewH] = useState(800);
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState('desktop');
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

  const exportZip = () => {
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

  // Pointer Events cover mouse + touch; width commits ride rAF so a fast
  // drag can't queue a render per pixel.
  const startDrag = (e) => {
    e.preventDefault();
    const sx = typeof e.clientX === 'number' ? e.clientX : 0;
    const sw = paneW;
    const apply = (clientX) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setPaneW(Math.min(1400, Math.max(320, sw + (sx - clientX))));
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

  return (
    <div className="shrink-0 border-l border-black/10 hidden lg:flex flex-col min-h-0 bg-white relative" style={{ width: paneW }}>
      <div
        onPointerDown={startDrag}
        onDoubleClick={() => setPaneW(480)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPaneW((w) => Math.min(1400, w + 20));
          else if (e.key === 'ArrowRight') setPaneW((w) => Math.max(320, w - 20));
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
        <span className="font-medium text-zinc-600">Preview</span>
        {entry && <span className="text-[10px] text-zinc-400 truncate ml-1 max-w-[110px]" title={entry}>{entry.replace(/^\/+/, '')}</span>}
        <div className="ml-auto flex items-center gap-0.5">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDevice(d.id)}
              title={d.label + (d.w ? ' · ' + d.w + 'px' : ' · fills pane')}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                device === d.id ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-700 hover:bg-black/5'
              }`}
            >
              <d.icon size={13} />
            </button>
          ))}
          <span className="w-px h-4 bg-black/10 mx-1" />
          <button onClick={() => setRefreshKey((k) => k + 1)} title="Reload" className="p-1.5 text-zinc-400 hover:text-zinc-700">
            <RefreshCw size={12} />
          </button>
          <button onClick={openTab} title="Open in new tab" className="p-1.5 text-zinc-400 hover:text-zinc-700">
            <ExternalLink size={12} />
          </button>
          <button onClick={exportZip} title="Export project as ZIP (all files + runnable index.html)" className="p-1.5 text-zinc-400 hover:text-zinc-700">
            <FolderDown size={13} />
          </button>
          <button onClick={onOpenCanvas} title="Open canvas" className="p-1.5 text-zinc-400 hover:text-zinc-700">
            <ArrowUpRight size={13} />
          </button>
          {onClose && (
            <button onClick={onClose} title="Close preview" className="p-1.5 text-zinc-400 hover:text-zinc-700">
              <X size={13} />
            </button>
          )}
        </div>
        {/* streaming / reload loading bar */}
        {loading && doc && (
          <div className="absolute left-0 -bottom-px w-full h-[2px] overflow-hidden">
            <div className="h-full w-1/3 rounded-full" style={{ background: 'linear-gradient(90deg,transparent,#3b66eb,transparent)', animation: 'inui-slide 1.1s ease-in-out infinite' }} />
          </div>
        )}
      </div>

      {/* viewport — fixed height, the frame scrolls internally like a browser */}
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
    </div>
  );
}
