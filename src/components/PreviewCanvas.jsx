import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, RefreshCw, ExternalLink, Download, AlertTriangle, X, Plus, FolderDown, MousePointerClick
} from 'lucide-react';
import { buildSrcDoc } from '../lib/files';
import { openBlobTab } from '../lib/zip.js';
import CtxMenu from './CtxMenu.jsx';

const HINT_KEY = 'inui.canvasHint.v1';

const WIDTHS = [
  { id: 'desktop', label: 'Desktop', width: 1200 },
  { id: 'wide', label: 'Wide', width: 1440 },
  { id: 'full', label: 'Full', width: '100%' }
];

const ZOOMS = [0.35, 0.5, 0.75, 1];

export default function PreviewCanvas(props) {
  const {
    files, bakedOverrides, liveApply, canvasMode, setCanvasMode,
    entry, onAddPage,
    selection, onSelect, onDeselect, onPatch, onRuntimeError, runtimeErrors, onClearErrors,
    layersRequest, onLayers, selectLayerSignal,
    lockedKeys, cmdSignal, canPaste, onLockedChanged, onCopied, onChanged, onLockedTap, onCmdRequest, onDownloadHtml, onExportZip
  } = props;
  const iframeRef = useRef(null);
  const scrollRef = useRef(null);
  const [availW, setAvailW] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [widthId, setWidthId] = useState('full');
  const [spaceDown, setSpaceDown] = useState(false);
  // Fixed viewport: the frame is sized from the STAGE (parent), never from
  // the page content. Sizing from content feedback-loops with viewport
  // units — a min-h-screen hero makes content(H) = H + rest, so the frame
  // grows forever ("memanjang sendiri"). Stable viewport => stable 100vh.
  const [stageH, setStageH] = useState(800);
  const [menu, setMenu] = useState(null);
  // First-run coachmark: canvas editing is undiscoverable otherwise. Shows
  // until dismissed or the first selection (which proves the lesson landed),
  // then never again (persisted).
  const [hintSeen, setHintSeen] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === 'seen';
    } catch {
      return true;
    }
  });
  const dismissHint = () => {
    setHintSeen(true);
    try {
      localStorage.setItem(HINT_KEY, 'seen');
    } catch {
      /* noop */
    }
  };
  useEffect(() => {
    if (selection) dismissHint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);
  // Frame handshake: every srcDoc gets a fresh unguessable nonce, passed via
  // `inui:init` and echoed back on every frame message. Anything without the
  // current nonce (forged commands from page code, or a stale document from
  // a previous build) is dropped by the handler below.
  const newNonce = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const [frameNonce, setFrameNonce] = useState(newNonce);
  const nonceRef = useRef(frameNonce);
  nonceRef.current = frameNonce;
  const cb = useRef({});
  cb.current = { onSelect, onDeselect, onPatch, onRuntimeError, onLayers, onLockedChanged, onCopied, onChanged, onLockedTap, onCmdRequest };
  const modeRef = useRef(canvasMode);
  modeRef.current = canvasMode;
  const overRef = useRef(bakedOverrides);
  overRef.current = bakedOverrides;
  const lockedRef = useRef(lockedKeys || []);
  lockedRef.current = lockedKeys || [];
  const spaceRef = useRef(false);
  const panning = useRef(null);

  const width = WIDTHS.find((w) => w.id === widthId) || WIDTHS[0];

  // Stage size drives the frame (see note on stageH): observe the scroll
  // container (stable size) — observing the zoomed content would loop.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setAvailW(el.clientWidth);
      setStageH(Math.max(200, el.clientHeight - 20));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const fitZoom = width.width === '100%' || !availW ? 1 : Math.max(0.2, Math.min(1, (availW - 52) / width.width));
  const effZoom = Math.min(zoom, fitZoom);

  const built = useMemo(
    () => buildSrcDoc({ files, overrides: bakedOverrides, editable: true, entry }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, bakedOverrides, entry, refreshKey]
  );

  const post = (msg) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(msg, '*');
    } catch {
      /* not ready */
    }
  };
  const sendInit = () =>
    post({
      type: 'inui:init',
      nonce: nonceRef.current,
      mode: modeRef.current,
      locked: lockedRef.current,
      texts: Object.entries(overRef.current.texts || {}).map(([selector, text]) => ({ selector, text }))
    });

  // A new document needs a new handshake token.
  useEffect(() => {
    setFrameNonce(newNonce());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built.srcDoc]);

  const stepZoom = (dir) =>
    setZoom((z) => {
      const i = ZOOMS.indexOf(z);
      const n = Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir));
      return ZOOMS[n];
    });

  const cycleWidth = () =>
    setWidthId((id) => {
      const i = WIDTHS.findIndex((w) => w.id === id);
      return WIDTHS[(i + 1) % WIDTHS.length].id;
    });

  // messages from the canvas — `inui:ready` bootstraps the handshake; every
  // other message must echo the current nonce AND match its shape, otherwise
  // it is forged page code or a stale document and is dropped.
  useEffect(() => {
    const h = (e) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const d = e.data || {};
      if (d.type === 'inui:ready') {
        sendInit();
        return;
      }
      if (!d.nonce || d.nonce !== nonceRef.current) return;
      if (d.type === 'inui:select') {
        if (!d.selection || typeof d.selection.selector !== 'string') return;
        setMenu(null);
        cb.current.onSelect(d.selection);
      }
      else if (d.type === 'inui:deselect') { setMenu(null); cb.current.onDeselect(); }
      else if (d.type === 'inui:patch') {
        if (!d.patch || typeof d.patch.selector !== 'string') return;
        cb.current.onPatch(d.patch, d.selection);
      }
      else if (d.type === 'inui:error') cb.current.onRuntimeError(d.message);
      else if (d.type === 'inui:layers') {
        if (!Array.isArray(d.tree)) return;
        cb.current.onLayers(d.tree);
      }
      else if (d.type === 'inui:context') {
        if (typeof d.selector !== 'string') return;
        const fr = iframeRef.current;
        if (fr) {
          const rect = fr.getBoundingClientRect();
          const zf = rect.width / (fr.offsetWidth || rect.width || 1);
          setMenu({ x: rect.left + d.x * zf, y: rect.top + d.y * zf, selector: d.selector, tag: d.tag, locked: d.locked });
        }
      }
      else if (d.type === 'inui:copied') cb.current.onCopied(d);
      else if (d.type === 'inui:changed') { setMenu(null); cb.current.onChanged(); }
      else if (d.type === 'inui:lockedChanged') {
        if (!Array.isArray(d.locked)) return;
        cb.current.onLockedChanged(d.locked);
      }
      else if (d.type === 'inui:lockedTap') cb.current.onLockedTap(d.selector);
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    post({ type: 'inui:setMode', mode: canvasMode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasMode]);

  useEffect(() => {
    if (liveApply) post({ type: 'inui:apply', selector: liveApply.selector, css: liveApply.css, text: liveApply.text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveApply]);

  useEffect(() => {
    if (layersRequest > 0) post({ type: 'inui:getLayers' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layersRequest]);

  useEffect(() => {
    if (selectLayerSignal) post({ type: 'inui:selectAt', selector: selectLayerSignal.selector });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectLayerSignal]);

  useEffect(() => {
    post({ type: 'inui:locked', locked: lockedKeys || [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedKeys]);

  useEffect(() => {
    if (cmdSignal) {
      setMenu(null);
      post({ type: 'inui:cmd', op: cmdSignal.op, selector: cmdSignal.selector, html: cmdSignal.html });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmdSignal]);

  // Shortcuts: V select · I interact(test) · Ctrl+=/-/0 zoom · Space pan · Esc clear
  useEffect(() => {
    const typing = () => {
      const a = document.activeElement;
      return a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable);
    };
    const dn = (e) => {
      if (e.code === 'Space' && !typing()) {
        spaceRef.current = true;
        setSpaceDown(true);
        e.preventDefault();
        return;
      }
      if (typing()) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        stepZoom(1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        stepZoom(-1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        setZoom(1);
        return;
      }
      if (e.key === 'Escape') {
        post({ type: 'inui:clear' });
        setMenu(null);
        setCanvasModeRef.current('select');
        cb.current.onDeselect();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'v') setCanvasModeRef.current('select');
      else if (k === 'i') setCanvasModeRef.current('interact');
    };
    const up = (e) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setSpaceDown(false);
      }
    };
    const move = (e) => {
      const p = panning.current;
      if (!p || !scrollRef.current) return;
      scrollRef.current.scrollLeft = p.sl - (e.clientX - p.x);
      scrollRef.current.scrollTop = p.st - (e.clientY - p.y);
    };
    const end = () => {
      panning.current = null;
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCanvasModeRef = useRef(setCanvasMode);
  setCanvasModeRef.current = setCanvasMode;

  const onCanvasMouseDown = (e) => {
    if (!spaceRef.current || !scrollRef.current) return;
    panning.current = { x: e.clientX, y: e.clientY, sl: scrollRef.current.scrollLeft, st: scrollRef.current.scrollTop };
  };

  const openInTab = () => {
    const res = buildSrcDoc({ files, overrides: bakedOverrides, editable: false, entry });
    if (res.srcDoc) {
      openBlobTab(new Blob([res.srcDoc], { type: 'text/html' }));
    }
  };

  const zi = Math.max(0, ZOOMS.indexOf(zoom));

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 relative">
      {/* toolbar */}
      <div className="flex items-center gap-1 px-3 h-11 border-b cui-line text-xs shrink-0">
        <button onClick={() => setRefreshKey((k) => k + 1)} title="Reload preview" className="cui-iconbtn">
          <RefreshCw size={13} />
        </button>
        <button onClick={openInTab} title="Open in new tab" className="cui-iconbtn">
          <ExternalLink size={13} />
        </button>
        <button onClick={onDownloadHtml} title="Download standalone HTML" className="cui-iconbtn">
          <Download size={13} />
        </button>
        {onExportZip && (
          <button onClick={onExportZip} title="Export project as ZIP (all files + runnable index.html)" className="cui-iconbtn">
            <FolderDown size={13} />
          </button>
        )}
        {selection && (
          <div className="ml-auto flex items-center gap-1.5 cui-panel border cui-line rounded-full pl-2.5 pr-1 py-0.5 max-w-[280px]">
            <span className="text-[10px] font-mono bg-black text-white rounded px-1.5 py-px shrink-0">{selection.tag}</span>
            <span className="text-[11px] cui-sub truncate" title={selection.selector}>{(selection.text || 'no text').slice(0, 30)}</span>
            <button
              onClick={() => {
                post({ type: 'inui:clear' });
                onDeselect();
              }}
              title="Clear selection (Esc)"
              className="w-5 h-5 rounded-full cui-sub hover:text-black hover:bg-[#f0f0f3] flex items-center justify-center shrink-0"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>

      {/* canvas — the frame is a fixed viewport (sized from the stage) and
          scrolls internally like a browser; the bar on top switches width */}
      <div className="mx-6 mt-5 mb-2 shrink-0 flex items-center gap-1.5 cui-panel border cui-line rounded-xl pl-2.5 pr-1 py-1 text-[11px]">
        <button onClick={cycleWidth} title="Cycle breakpoint width" className="flex items-center gap-1.5 hover:opacity-80">
          <Play size={9} className="cui-sub" />
          <span className="font-medium cui-sub">{width.id === 'full' ? 'Fluid' : width.label}</span>
          <span className="cui-sub tabular-nums">{typeof width.width === 'number' ? width.width : ''}</span>
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={() => stepZoom(-1)} title="Zoom out (Ctrl+-)" className="px-1.5 cui-sub hover:text-black">−</button>
          <span className="cui-sub tabular-nums text-[11px] w-10 text-center" title={effZoom < zoom ? 'Zoom (auto-fit capped) — Ctrl+0 resets' : 'Zoom (Ctrl+0 resets)'}>{Math.round(effZoom * 100)}%</span>
          <button onClick={() => stepZoom(1)} title="Zoom in (Ctrl+=)" className="px-1.5 cui-sub hover:text-black">+</button>
        </div>
        <button onClick={onAddPage} title="New page" className="cui-iconbtn" style={{ width: 24, height: 24 }}>
          <Plus size={13} />
        </button>
      </div>
      <div
        ref={scrollRef}
        onMouseDown={onCanvasMouseDown}
        className="flex-1 overflow-auto min-h-0 cui-stage-dots"
        style={{ cursor: spaceDown ? 'grab' : undefined }}
        onScroll={() => setMenu(null)}
      >
        {built.error ? (
          <div className="m-auto mt-16 max-w-lg bg-red-50 border border-red-200 rounded-xl p-5 text-xs">
            <div className="flex items-center gap-1.5 text-red-600 font-medium mb-2"><AlertTriangle size={14} /> Preview build failed</div>
            <pre className="whitespace-pre-wrap text-red-600/90">{built.error.slice(0, 1200)}</pre>
          </div>
        ) : (
          <div className="pb-5 min-w-max mx-auto min-h-full" style={{ maxWidth: width.width === '100%' ? '100%' : width.width + 48 }}>
            <div style={{ zoom: effZoom }} className="origin-top px-6">
              <iframe
                ref={iframeRef}
                title="live-preview"
                sandbox="allow-scripts"
                srcDoc={built.srcDoc}
                onLoad={sendInit}
                className="cui-panel rounded-xl border cui-line block mx-auto"
                style={{ width: width.width, maxWidth: '100%', height: stageH }}
              />
            </div>
          </div>
        )}
      </div>

      {menu && (
        <CtxMenu
          x={menu.x}
          y={menu.y}
          tag={menu.tag}
          locked={menu.locked}
          canPaste={canPaste}
          onAction={(op) => cb.current.onCmdRequest && cb.current.onCmdRequest(op, menu.selector, { tag: menu.tag })}
          onClose={() => setMenu(null)}
        />
      )}

      {!hintSeen && !selection && !built.error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 cui-btn text-[12px] pl-3 pr-1.5 py-1.5 shadow-2xl max-w-[92%]">
          <MousePointerClick size={13} className="shrink-0" />
          <span className="truncate">Click any element to select it — drag to move, double-click text to edit, right-click for more</span>
          <button
            onClick={dismissHint}
            title="Dismiss"
            aria-label="Dismiss canvas hint"
            className="w-6 h-6 rounded-full hover:bg-white/15 flex items-center justify-center shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* runtime errors */}
      {runtimeErrors.length > 0 && (
        <div className="shrink-0 border-t border-red-200 bg-red-950/30 px-3 py-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-red-600 mb-1">
            <AlertTriangle size={12} /> {runtimeErrors.length} runtime error{runtimeErrors.length > 1 ? 's' : ''} in preview
            <button onClick={onClearErrors} className="ml-auto text-zinc-500 hover:text-zinc-700"><X size={12} /></button>
          </div>
          {runtimeErrors.slice(-2).map((e) => (
            <div key={e.id} className="text-red-600/80 truncate">{e.message.slice(0, 200)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
