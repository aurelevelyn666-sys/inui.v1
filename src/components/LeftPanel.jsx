import { useEffect, useRef, useState } from 'react';
import { Search, Plus, Home, RefreshCw, ChevronDown, ChevronRight, Copy, Check, Lock, LockOpen, Eye, EyeOff, AlignLeft, AlignCenter, AlignRight, MessageSquare, X } from 'lucide-react';

function pageLabel(p) {
  if (p === '/App.jsx') return 'Home';
  const m = p.match(/^\/pages\/(.+)\.jsx$/);
  if (m) return '/' + m[1];
  return p;
}

function PagesPanel({ entries, entry, setEntry, onAddPage }) {
  const [q, setQ] = useState('');
  const match = (p) => p.toLowerCase().includes(q.toLowerCase());
  const pages = entries.filter((p) => p === '/App.jsx' || p.startsWith('/pages/') || match(p) && !p.startsWith('/components/'));
  const pageList = entries.filter((p) => (p === '/App.jsx' || p.startsWith('/pages/')) && match(p));
  const components = entries.filter((p) => p.startsWith('/components/') && match(p));
  void pages;
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 py-2">
        <div className="cui-input flex items-center gap-1.5 !py-1.5">
          <Search size={12} className="cui-faint shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent outline-none text-xs placeholder:text-zinc-400"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 min-h-0">
        <div className="flex items-center px-2 pt-1 pb-1">
          <span className="text-[11px] font-medium cui-sub">Pages</span>
          <button onClick={onAddPage} title="New page" className="ml-auto cui-sub hover:text-black"><Plus size={13} /></button>
        </div>
        {pageList.map((p) => (
          <button
            key={p}
            onClick={() => setEntry(p)}
            className={`w-full flex items-center gap-2 text-left text-xs px-2.5 py-1.5 rounded-lg truncate ${
              p === entry ? 'bg-[#ececef] cui-ink font-medium' : 'cui-sub hover:text-black hover:bg-[#f0f0f3]'
            }`}
          >
            {p === '/App.jsx' ? <Home size={12} className="shrink-0" /> : <span className="w-3 text-center cui-faint shrink-0">›</span>}
            <span className="truncate">{pageLabel(p)}</span>
          </button>
        ))}
        {components.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1 text-[11px] font-medium cui-sub">Components</div>
            {components.map((p) => (
              <button
                key={p}
                onClick={() => setEntry(p)}
                className={`w-full flex items-center gap-2 text-left text-xs px-2.5 py-1.5 rounded-lg truncate ${
                  p === entry ? 'bg-[#ececef] cui-ink font-medium' : 'cui-sub hover:text-black hover:bg-[#f0f0f3]'
                }`}
              >
                <span className="w-3 text-center cui-faint shrink-0">◇</span>
                <span className="truncate font-mono text-[11px]">{p.replace('/components/', '')}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function LayerNode({ node, depth, onSelect, selectedSel, lockedMap, hiddenMap, onToggleLock, onToggleHide }) {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = node.kids && node.kids.length > 0;
  const isLocked = lockedMap?.[node.selector];
  const isHidden = hiddenMap?.[node.selector];
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={'Select layer ' + (node.text || node.tag)}
        className={`flex items-center gap-1 rounded-lg pr-1 py-1 cursor-pointer group ${
          selectedSel === node.selector ? 'bg-[#ececef]' : 'hover:bg-[#f0f0f3]'
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelect(node.selector)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.selector);
          }
        }}
      >
        {hasKids ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="cui-sub hover:text-black shrink-0"
          >
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : (
          <span className="w-[11px] shrink-0" />
        )}
        <span className="text-[10px] font-mono bg-[#ececef] cui-sub rounded px-1 py-px shrink-0">{node.tag}</span>
        <span className={`text-[12px] truncate flex-1 ${isHidden ? 'line-through cui-faint' : 'cui-sub'}`}>{node.text || node.tag}</span>
        <button
          title={isHidden ? 'Show' : 'Hide'}
          aria-label={isHidden ? 'Show layer' : 'Hide layer'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHide(node.selector);
          }}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 cui-sub hover:text-black shrink-0"
        >
          {isHidden ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
        <button
          title={isLocked ? 'Unlock' : 'Lock'}
          aria-label={isLocked ? 'Unlock layer' : 'Lock layer'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock(node.selector);
          }}
          className={`shrink-0 ${isLocked ? 'cui-ink' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 cui-sub hover:text-black'}`}
        >
          {isLocked ? <Lock size={11} /> : <LockOpen size={11} />}
        </button>
      </div>
      {hasKids && open && node.kids.map((k, i) => (
        <LayerNode key={k.selector + i} node={k} depth={depth + 1} onSelect={onSelect} selectedSel={selectedSel} lockedMap={lockedMap} hiddenMap={hiddenMap} onToggleLock={onToggleLock} onToggleHide={onToggleHide} />
      ))}
    </div>
  );
}

function LayersPanel({ tree, onSelect, onRefresh, selectedSel, lockedMap, hiddenMap, onToggleLock, onToggleHide, selection, onAlign, comments, onSelectComment, onDeleteComment }) {
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center px-3 py-2">
        <span className="text-[12px] font-medium cui-ink">Layers</span>
        <button onClick={onRefresh} title="Refresh layers" className="ml-auto cui-iconbtn"><RefreshCw size={12} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
        {!tree || tree.length === 0 ? (
          <div className="mx-1 mt-1 cui-card !shadow-none p-3 text-center">
            <p className="text-[12px] cui-sub">No layers yet</p>
            <p className="text-[11px] cui-faint mt-0.5">Generate a page first, then refresh.</p>
          </div>
        ) : (
          tree.map((n, i) => (
            <LayerNode key={n.selector + i} node={n} depth={0} onSelect={onSelect} selectedSel={selectedSel} lockedMap={lockedMap} hiddenMap={hiddenMap} onToggleLock={onToggleLock} onToggleHide={onToggleHide} />
          ))
        )}
      </div>
      {selection && (
        <div className="shrink-0 border-t cui-line px-3 py-2">
          <div className="cui-label mb-1.5">Align selection</div>
          <div className="flex gap-1">
            {[
              { id: 'left', icon: AlignLeft },
              { id: 'center', icon: AlignCenter },
              { id: 'right', icon: AlignRight }
            ].map((a) => (
              <button
                key={a.id}
                onClick={() => onAlign(a.id)}
                title={'Align ' + a.id}
                className="flex-1 h-8 rounded-lg cui-inset cui-sub hover:text-black flex items-center justify-center"
              >
                <a.icon size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
      {comments?.length > 0 && (
        <div className="shrink-0 border-t cui-line px-3 py-2 max-h-32 overflow-y-auto">
          <div className="cui-label mb-1.5">Comments · {comments.length}</div>
          {comments.map((c) => (
            <div key={c.id} className="flex items-center gap-1.5 text-[12px] cui-sub py-0.5">
              <MessageSquare size={11} className="shrink-0 cui-ink" />
              <button onClick={() => onSelectComment(c.selector)} className="flex-1 truncate text-left hover:text-black">{c.text}</button>
              <button onClick={() => onDeleteComment(c.id)} className="cui-faint hover:text-red-600 shrink-0"><X size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Copyable({ value, children }) {
  const [ok, setOk] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      onClick={async () => {
        clearTimeout(timer.current);
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setFailed(false);
        } catch {
          setOk(false);
          setFailed(true);
        }
        timer.current = setTimeout(() => {
          setOk(false);
          setFailed(false);
        }, 1200);
      }}
      className="flex items-center gap-1.5 hover:opacity-80"
      title={failed ? 'Copy failed — clipboard unavailable' : 'Copy'}
    >
      {children}
      {ok ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} className="cui-faint" />}
    </button>
  );
}

function AssetsPanel({ assets }) {
  return (
    <div className="h-full overflow-y-auto p-3 min-h-0">
      <div className="text-[11px] font-medium cui-sub mb-2">Images · {assets.images.length}</div>
      {assets.images.length === 0 && <p className="text-[11px] cui-faint mb-3">No image URLs found in project files.</p>}
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {assets.images.map((u) => (
          <Copyable key={u} value={u}>
            <img src={u} alt="" loading="lazy" className="w-full h-14 object-cover rounded-lg border cui-line" />
          </Copyable>
        ))}
      </div>
      <div className="text-[11px] font-medium cui-sub mb-2">Colors · {assets.colors.length}</div>
      {assets.colors.length === 0 && <p className="text-[11px] cui-faint mb-3">No hex colors found yet.</p>}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {assets.colors.map((c) => (
          <Copyable key={c} value={c}>
            <span className="flex items-center gap-1 border cui-line rounded-full pl-1 pr-2 py-0.5 cui-panel">
              <span className="w-4 h-4 rounded-full border cui-line" style={{ background: c }} />
              <span className="text-[10px] font-mono cui-sub">{c}</span>
            </span>
          </Copyable>
        ))}
      </div>
      <div className="text-[11px] font-medium cui-sub mb-2">Fonts · {assets.fonts.length}</div>
      {assets.fonts.map((f, i) => (
        <div key={i} className="text-[11px] cui-sub truncate mb-1">{f}</div>
      ))}
    </div>
  );
}

export default function LeftPanel(props) {
  const { tab, setTab, entries, entry, setEntry, onAddPage, layers, onSelectLayer, onRefreshLayers, selectedSel, assets, codeNode,
    lockedMap, hiddenMap, onToggleLock, onToggleHide, selection, onAlign, comments, onSelectComment, onDeleteComment } = props;
  const tabs = [
    { id: 'pages', label: 'Pages' },
    { id: 'layers', label: 'Layers' },
    { id: 'assets', label: 'Assets' },
    { id: 'code', label: 'Code' }
  ];
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mx-3 mt-2.5 mb-2 cui-seg text-xs shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? 'cui-seg-on flex-1 py-1.5 text-xs' : 'flex-1 py-1.5 text-xs cui-sub hover:text-black'}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'pages' && <PagesPanel entries={entries} entry={entry} setEntry={setEntry} onAddPage={onAddPage} />}
        {tab === 'layers' && (
          <LayersPanel
            tree={layers} onSelect={onSelectLayer} onRefresh={onRefreshLayers} selectedSel={selectedSel}
            lockedMap={lockedMap} hiddenMap={hiddenMap} onToggleLock={onToggleLock} onToggleHide={onToggleHide}
            selection={selection} onAlign={onAlign}
            comments={comments} onSelectComment={onSelectComment} onDeleteComment={onDeleteComment}
          />
        )}
        {tab === 'assets' && <AssetsPanel assets={assets} />}
        {tab === 'code' && codeNode}
      </div>
    </div>
  );
}
