import { useEffect, useState } from 'react';
import { Trash2, Sparkles, AlignLeft, AlignCenter, AlignRight, AlignJustify, Link2, Unlink } from 'lucide-react';

const px = (v) => {
  v = String(v ?? '').trim();
  if (!v) return '';
  return /^\d+(\.\d+)?$/.test(v) ? v + 'px' : v;
};

const FONTS = [
  { v: 'ui-sans-serif, system-ui, sans-serif', label: 'System' },
  { v: 'Georgia, "Times New Roman", serif', label: 'Serif' },
  { v: 'ui-monospace, monospace', label: 'Mono' },
  { v: 'ui-rounded, system-ui, sans-serif', label: 'Rounded' }
];

const WEIGHTS = [
  { v: '400', label: 'Regular' },
  { v: '500', label: 'Medium' },
  { v: '600', label: 'Semibold' },
  { v: '700', label: 'Bold' },
  { v: '900', label: 'Black' }
];

const short = (s, n = 26) => {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
};

// Controlled field that always displays the live value. Committing empty
// clears the property (calls onCommit('') so the parent removes it).
function CField({ display, onCommit, type = 'text' }) {
  const [v, setV] = useState(null);
  const shown = v === null ? (display ?? '') : v;
  const commit = () => {
    if (v !== null) onCommit(String(v).trim());
    setV(null);
  };
  return (
    <input
      type={type}
      value={shown ?? ''}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setV(null);
      }}
      className="inu-input tabular-nums"
    />
  );
}

function Seg({ options, onPick, active }) {
  return (
    <div className="inu-seg">
      {options.map((o) => (
        <button
          key={o.v}
          title={o.label}
          onClick={() => onPick(o.v)}
          className={active === o.v ? '!bg-black/10 !text-zinc-900' : ''}
        >
          {o.icon ? <o.icon size={13} /> : o.label}
        </button>
      ))}
    </div>
  );
}

// Select that shows the element's REAL current value, plus options to change it.
function CurSelect({ current, options, onPick, fmt }) {
  const cur = current === undefined || current === null ? '' : String(current);
  const norm = cur === 'none' && options.some((o) => o.v === '') ? '' : cur;
  const inList = options.some((o) => o.v === norm);
  return (
    <select
      className="inu-input"
      value={inList ? norm : cur ? '__cur' : ''}
      onChange={(e) => {
        // Picking "—" clears the property (parent drops empty values).
        if (e.target.value !== '__cur') onPick(e.target.value);
      }}
    >
      {cur && !inList && <option value="__cur">{fmt ? fmt(cur) : short(cur)}</option>}
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.v} value={o.v}>{o.label}</option>
      ))}
    </select>
  );
}

const SHADOWS = {
  none: 'none',
  Soft: '0 1px 2px rgba(0,0,0,.25)',
  Medium: '0 8px 24px rgba(0,0,0,.35)',
  Strong: '0 20px 60px rgba(0,0,0,.5)'
};

function DesignEditor({ selection, onApplyStyle, onApplyText }) {
  const sel = selection.selector;
  const c = selection.computed || {};
  const set = (css) => onApplyStyle(sel, css);
  const [text, setText] = useState(selection.text || '');
  const [pos, setPos] = useState({ x: selection.x || 0, y: selection.y || 0, rot: selection.rot || 0 });
  const [linked, setLinked] = useState(false);
  const [size, setSize] = useState({ w: '', h: '' });
  const [opacity, setOpacity] = useState(c.opacity !== undefined && c.opacity !== '' ? Math.round(parseFloat(c.opacity) * 100) : 100);
  const [toggles, setToggles] = useState({
    b: parseInt(c.fontWeight) >= 700 || c.fontWeight === 'bold',
    i: c.fontStyle === 'italic',
    u: (c.textDeco || '').indexOf('underline') >= 0,
    s: (c.textDeco || '').indexOf('line-through') >= 0
  });
  const ratio = selection.h ? (selection.w || 1) / selection.h : 1;

  // Resync when the parent feeds a new selection object — e.g. fresh geometry
  // adopted after a canvas drag/nudge with the same selector. Without this the
  // panel shows stale X/Y/opacity and the next edit overwrites fresh values.
  useEffect(() => {
    const cc = selection.computed || {};
    setText(selection.text || '');
    setPos({ x: selection.x || 0, y: selection.y || 0, rot: selection.rot || 0 });
    setOpacity(cc.opacity !== undefined && cc.opacity !== '' ? Math.round(parseFloat(cc.opacity) * 100) : 100);
    setToggles({
      b: parseInt(cc.fontWeight) >= 700 || cc.fontWeight === 'bold',
      i: cc.fontStyle === 'italic',
      u: (cc.textDeco || '').indexOf('underline') >= 0,
      s: (cc.textDeco || '').indexOf('line-through') >= 0
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const move = (patch) => {
    const next = { ...pos, ...patch };
    setPos(next);
    set({ transform: `translate(${next.x}px, ${next.y}px) rotate(${next.rot}deg)` });
  };

  const toggleStyle = (key) => {
    const next = { ...toggles, [key]: !toggles[key] };
    setToggles(next);
    if (key === 'b') set({ fontWeight: next.b ? '700' : '400' });
    if (key === 'i') set({ fontStyle: next.i ? 'italic' : 'normal' });
    // Underline and strike-through compose instead of clobbering each other.
    if (key === 'u' || key === 's') {
      const deco = [next.u ? 'underline' : '', next.s ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
      set({ textDecoration: deco });
    }
  };

  const crumbs = sel
    .replace(/^body > /, '')
    .split(' > ')
    .map((s) => s.replace(/:nth-of-type\(1\)/g, ''))
    .slice(-3);

  return (
    <div className="rounded-xl p-3 mb-2 bg-[#ffffff] border border-black/10">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] bg-black/5 text-zinc-900 rounded px-1.5 py-0.5 font-mono">{selection.tag}</span>
        <span className="text-[11px] text-zinc-500 truncate">{crumbs.join(' › ')}</span>
      </div>
      {selection.className && (
        <div className="text-[10px] text-zinc-600 truncate mb-1 font-mono">.{selection.className.split(' ').slice(0, 4).join('.')}</div>
      )}

      {/* Layout */}
      <div className="inu-sect">Layout</div>
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <div>
          <span className="inu-label">Position X</span>
          <CField display={String(Math.round(pos.x))} type="number" onCommit={(v) => move({ x: parseFloat(v) || 0 })} />
        </div>
        <div>
          <span className="inu-label">Position Y</span>
          <CField display={String(Math.round(pos.y))} type="number" onCommit={(v) => move({ y: parseFloat(v) || 0 })} />
        </div>
        <div>
          <span className="inu-label">Width</span>
          <CField
            display={size.w || c.width || (selection.w ? selection.w + 'px' : '')}
            onCommit={(v) => {
              const w = parseFloat(v);
              if (!w) return;
              setSize((s) => ({ ...s, w: String(w), h: linked ? String(Math.round(w / ratio)) : s.h }));
              if (linked) set({ width: w + 'px', height: Math.round(w / ratio) + 'px' });
              else set({ width: w + 'px' });
            }}
          />
        </div>
        <div>
          <span className="inu-label">Height</span>
          <div className="flex gap-1.5">
            <CField
              display={size.h || c.height || (selection.h ? selection.h + 'px' : '')}
              onCommit={(v) => {
                const h = parseFloat(v);
                if (!h) return;
                setSize((s) => ({ ...s, h: String(h), w: linked ? String(Math.round(h * ratio)) : s.w }));
                if (linked) set({ height: h + 'px', width: Math.round(h * ratio) + 'px' });
                else set({ height: h + 'px' });
              }}
            />
            <button
              onClick={() => setLinked((l) => !l)}
              title="Lock aspect ratio"
              className={`w-9 shrink-0 rounded-lg border flex items-center justify-center ${linked ? 'border-black text-zinc-900' : 'border-black/10 text-zinc-500 hover:text-black'}`}
            >
              {linked ? <Link2 size={13} /> : <Unlink size={13} />}
            </button>
          </div>
        </div>
      </div>
      <div className="mb-1.5">
        <span className="inu-label">Display</span>
        <CurSelect current={c.display} onPick={(v) => set({ display: v })} options={[
          { v: 'block', label: 'Block' },
          { v: 'flex', label: 'Flex' },
          { v: 'grid', label: 'Grid' },
          { v: 'inline-block', label: 'Inline block' },
          { v: 'inline', label: 'Inline' }
        ]} />
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <div>
          <span className="inu-label">Direction</span>
          <CurSelect current={c.flexDirection} onPick={(v) => set({ display: 'flex', flexDirection: v })} options={[
            { v: 'row', label: '→ Row' },
            { v: 'column', label: '↓ Column' }
          ]} />
        </div>
        <div>
          <span className="inu-label">Gap</span>
          <CField display={c.gap && c.gap !== 'normal' ? c.gap : ''} onCommit={(v) => set({ gap: px(v) })} />
        </div>
        <div>
          <span className="inu-label">Align</span>
          <CurSelect current={c.alignItems} onPick={(v) => set({ alignItems: v })} options={[
            { v: 'flex-start', label: 'Start' },
            { v: 'center', label: 'Center' },
            { v: 'flex-end', label: 'End' },
            { v: 'stretch', label: 'Stretch' }
          ]} />
        </div>
        <div>
          <span className="inu-label">Justify</span>
          <CurSelect current={c.justifyContent} onPick={(v) => set({ justifyContent: v })} options={[
            { v: 'flex-start', label: 'Start' },
            { v: 'center', label: 'Center' },
            { v: 'flex-end', label: 'End' },
            { v: 'space-between', label: 'Between' }
          ]} />
        </div>
        <div><span className="inu-label">Padding</span><CField display={c.padding || ''} onCommit={(v) => set({ padding: px(v) })} /></div>
        <div><span className="inu-label">Margin</span><CField display={c.margin || ''} onCommit={(v) => set({ margin: px(v) })} /></div>
      </div>
      <div className="flex items-center gap-2">
        <span className="inu-label" style={{ margin: 0 }}>Rotate</span>
        <input
          type="range" min={-180} max={180} value={pos.rot}
          onChange={(e) => move({ rot: Number(e.target.value) })}
          className="inu-range flex-1"
        />
        <span className="text-[12px] text-zinc-600 tabular-nums w-10 text-right">{Math.round(pos.rot)}°</span>
      </div>

      {/* Text */}
      <div className="inu-sect">Text</div>
      <div className="flex gap-1.5 mb-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} className="inu-input" placeholder="element text…" />
        <button
          onClick={() => text !== selection.text && onApplyText(sel, text)}
          className="text-[12px] bg-black/5 text-zinc-900 rounded-lg px-2.5 hover:bg-black/10 shrink-0"
        >
          Set
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <div>
          <span className="inu-label">Font</span>
          <CurSelect current={c.fontFamily} onPick={(v) => set({ fontFamily: v })} fmt={(v) => short(v, 18)} options={FONTS} />
        </div>
        <div>
          <span className="inu-label">Weight</span>
          <CurSelect current={c.fontWeight} onPick={(v) => set({ fontWeight: v })} options={WEIGHTS} />
        </div>
        <div><span className="inu-label">Size</span><CField display={c.fontSize || '16px'} onCommit={(v) => set({ fontSize: px(v) })} /></div>
        <div><span className="inu-label">Spacing</span><CField display={c.letterSpacing && c.letterSpacing !== 'normal' ? c.letterSpacing : '0px'} onCommit={(v) => set({ letterSpacing: px(v) })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <div>
          <span className="inu-label">Color</span>
          <div className="flex gap-1.5">
            <CField display={c.color || '#ffffff'} onCommit={(v) => set({ color: v })} />
            {/^#[0-9a-f]{6}$/i.test(c.color || '') && (
              <input
                type="color" defaultValue={c.color} title="Pick color"
                onChange={(e) => set({ color: e.target.value })}
                className="w-9 h-9 shrink-0 rounded-lg bg-transparent cursor-pointer border border-black/10 p-0.5"
              />
            )}
          </div>
        </div>
        <div>
          <span className="inu-label">Align</span>
          <Seg
            active={c.textAlign === 'start' ? 'left' : c.textAlign}
            options={[
              { v: 'left', icon: AlignLeft, label: 'Left' },
              { v: 'center', icon: AlignCenter, label: 'Center' },
              { v: 'right', icon: AlignRight, label: 'Right' },
              { v: 'justify', icon: AlignJustify, label: 'Justify' }
            ]}
            onPick={(v) => set({ textAlign: v })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <span className="inu-label">Line height</span>
          <CField display={c.lineHeight && c.lineHeight !== 'normal' ? c.lineHeight : ''} onCommit={(v) => set({ lineHeight: v })} />
        </div>
        <div>
          <span className="inu-label">Transform</span>
          <CurSelect current={c.textTransform === 'none' ? '' : c.textTransform} onPick={(v) => set({ textTransform: v })} options={[
            { v: 'uppercase', label: 'UPPER' },
            { v: 'lowercase', label: 'lower' },
            { v: 'capitalize', label: 'Capitalize' }
          ]} />
        </div>
      </div>
      <span className="inu-label" style={{ marginTop: 8 }}>Style</span>
      <div className="inu-seg">
        {[
          { k: 'b', label: 'B', cls: 'font-bold' },
          { k: 'i', label: 'I', cls: 'italic' },
          { k: 'u', label: 'U', cls: 'underline' },
          { k: 's', label: 'S', cls: 'line-through' }
        ].map((b) => (
          <button key={b.k} onClick={() => toggleStyle(b.k)} className={`${b.cls} ${toggles[b.k] ? '!bg-black !text-white' : ''}`}>
            {b.label}
          </button>
        ))}
      </div>

      {/* Effects */}
      <div className="inu-sect">Effects</div>
      <div className="grid grid-cols-2 gap-1.5 items-end">
        <div>
          <span className="inu-label">Background</span>
          <div className="flex gap-1.5">
            <CField display={c.background || 'transparent'} onCommit={(v) => set({ background: v })} />
            <button
              onClick={() => set({ background: 'transparent' })}
              title="Transparent"
              className="w-9 h-9 shrink-0 rounded-lg border border-black/10"
              style={{ background: 'repeating-conic-gradient(#666 0 25%, #fff 0 50%) 0 0 / 12px 12px' }}
            />
          </div>
        </div>
        <div>
          <span className="inu-label">Opacity · {opacity}%</span>
          <input
            type="range" min={5} max={100} value={opacity}
            onChange={(e) => {
              setOpacity(Number(e.target.value));
              set({ opacity: String(Number(e.target.value) / 100) });
            }}
            className="inu-range"
          />
        </div>
        <div><span className="inu-label">Radius</span><CField display={c.radius && c.radius !== '0px' ? c.radius : ''} onCommit={(v) => set({ borderRadius: px(v) })} /></div>
        <div>
          <span className="inu-label">Shadow</span>
          <Seg
            options={[{ v: 'none', label: 'None' }, { v: 'Soft', label: 'Soft' }, { v: 'Medium', label: 'Med' }, { v: 'Strong', label: 'Strong' }]}
            onPick={(v) => set({ boxShadow: SHADOWS[v] })}
          />
        </div>
      </div>
      {c.boxShadow ? (
        <div className="text-[10px] text-zinc-500 truncate mt-1.5 font-mono" title={c.boxShadow}>shadow: {short(c.boxShadow, 44)}</div>
      ) : null}
      <p className="text-[11px] text-zinc-500 mt-2">Edits apply instantly and persist as canvas overrides.</p>
    </div>
  );
}

export default function Inspector(props) {
  const { selection, overrides, onApplyStyle, onApplyText, onRemoveOverride, onClearOverrides, onFoldIntoCode, folding } = props;
  const styleEntries = Object.entries(overrides.styles || {});
  const textEntries = Object.entries(overrides.texts || {});
  const total = styleEntries.length + textEntries.length;

  return (
    <div className="h-full overflow-y-auto p-3 min-h-0">
      {selection ? (
        <DesignEditor key={selection.selector} selection={selection} onApplyStyle={onApplyStyle} onApplyText={onApplyText} />
      ) : (
        <div className="rounded-xl p-3 mb-3 text-[13px] text-zinc-500 bg-[#ffffff] border border-black/10 leading-relaxed">
          Click any element — drag it anywhere, double-click to edit text. Arrows nudge · Del hides · Esc clears · right-click for more.
        </div>
      )}

      <h3 className="inu-sect" style={{ marginTop: 4 }}>
        Canvas edits {total > 0 && <span className="text-zinc-700">· {total}</span>}
      </h3>
      {total === 0 && <p className="text-[12px] text-zinc-500 mb-3">Nothing yet.</p>}
      <div className="space-y-1.5 mb-3">
        {styleEntries.map(([sel, css]) => (
          <div key={'s' + sel} className="text-[11px] bg-[#ffffff] border border-black/10 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
            <span className="flex-1 truncate text-zinc-500 font-mono">{sel.replace(/^body > /, '').slice(-42)}</span>
            <span className="text-zinc-600">{Object.keys(css).length} props</span>
            <button onClick={() => onRemoveOverride('styles', sel)} className="text-zinc-600 hover:text-red-600"><Trash2 size={11} /></button>
          </div>
        ))}
        {textEntries.map(([sel, t]) => (
          <div key={'t' + sel} className="text-[11px] bg-[#ffffff] border border-black/10 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
            <span className="flex-1 truncate text-zinc-500">“{String(t).slice(0, 40)}”</span>
            <button onClick={() => onRemoveOverride('texts', sel)} className="text-zinc-600 hover:text-red-600"><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
      {total > 0 && (
        <>
          <button
            onClick={onFoldIntoCode}
            disabled={folding}
            className="inu-btn-blue w-full text-[13px] rounded-full py-2 flex items-center justify-center gap-1.5 mb-2"
          >
            <Sparkles size={12} /> {folding ? 'Asking agent…' : 'Fold edits into code'}
          </button>
          <button onClick={onClearOverrides} className="w-full text-[12px] text-zinc-500 hover:text-red-600 py-1">
            Clear all canvas edits
          </button>
        </>
      )}
    </div>
  );
}
