import { useMemo, useState } from 'react';
import { Plus, Search, Settings, PanelLeftClose, PanelLeftOpen, LogOut, ChevronDown, Star, MoreHorizontal, FileText } from 'lucide-react';
import { TEMPLATES } from '../lib/templates.js';

function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
}

function groupLabel(ts) {
  const now = new Date();
  if (dayKey(ts) === dayKey(now.getTime())) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (dayKey(ts) === dayKey(y.getTime())) return 'Yesterday';
  if (now.getTime() - ts < 7 * 864e5) return 'Previous 7 Days';
  return 'Older';
}

function timeLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (dayKey(ts) === dayKey(now.getTime())) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];

// One shared sidebar for home + chat: "Chat" header, New Chat, Saved
// templates, collapsible history groups, account footer.
export default function ConvoSidebar(props) {
  const {
    convos, activeId, search, setSearch, onNew, onSelect, onDelete, canDelete,
    keyOn, modelId, onOpenSettings, onSignOut, onHome, onSelectTemplate,
    className, mini, onToggleMini
  } = props;
  const [collapsed, setCollapsed] = useState({});

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    const list = [...(convos || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!q) return list;
    return list.filter((c) => {
      if ((c.title || '').toLowerCase().includes(q)) return true;
      return (c.messages || []).some((m) => String(m.content || '').toLowerCase().includes(q));
    });
  }, [convos, search]);

  const groups = useMemo(() => {
    const out = [];
    ORDER.forEach((g) => {
      const items = filtered.filter((c) => groupLabel(c.updatedAt || 0) === g);
      if (items.length) out.push([g, items]);
    });
    return out;
  }, [filtered]);

  const toggleGroup = (g) => setCollapsed((c) => ({ ...c, [g]: !c[g] }));

  if (mini) {
    return (
      <div className={`w-14 shrink-0 border-r border-black/[0.06] bg-white flex flex-col items-center py-3 gap-1.5 min-h-0 ${className || ''}`}>
        <button onClick={onToggleMini} title="Expand sidebar" className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-black/5">
          <PanelLeftOpen size={16} />
        </button>
        <button onClick={onNew} title="New chat" className="w-9 h-9 rounded-lg bg-zinc-900 text-white flex items-center justify-center hover:bg-black">
          <Plus size={16} />
        </button>
        <div className="flex-1 overflow-y-auto w-full flex flex-col items-center gap-1 py-1 min-h-0">
          {filtered.slice(0, 30).map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              title={c.title || 'New chat'}
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-medium ${c.id === activeId ? 'bg-black/10 text-zinc-900' : 'text-zinc-400 hover:text-zinc-900 hover:bg-black/5'}`}
            >
              {(c.title || 'N')[0].toUpperCase()}
            </button>
          ))}
        </div>
        <span className="relative w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-xs text-zinc-600 shrink-0">
          U
          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${keyOn ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
        </span>
      </div>
    );
  }

  return (
    <div className={`w-[248px] shrink-0 border-r border-black/[0.06] bg-white flex flex-col min-h-0 ${className || ''}`}>
      {/* header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-2 shrink-0">
        {onHome ? (
          <button onClick={onHome} className="text-[15px] font-semibold text-zinc-900">Chat</button>
        ) : (
          <span className="text-[15px] font-semibold text-zinc-900">Chat</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {onToggleMini && (
            <button onClick={onToggleMini} title="Minimize sidebar" className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-black/5">
              <PanelLeftClose size={14} />
            </button>
          )}
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-24 focus:w-36 transition-all bg-transparent outline-none text-xs pl-7 pr-1.5 py-1.5 rounded-lg border border-transparent focus:border-black/10 placeholder:text-zinc-400"
            />
          </div>
        </div>
      </div>

      {/* new chat */}
      <div className="px-3 pb-2 shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 text-[13px] font-medium bg-[#101014] text-white rounded-xl py-2.5 hover:bg-black transition-colors"
        >
          <Plus size={14} /> New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
        {/* saved templates */}
        <div className="flex items-center gap-1.5 px-2 pt-2 pb-1.5 text-[12px] font-medium text-zinc-400">
          <Star size={12} /> Saved
        </div>
        {(TEMPLATES || []).slice(0, 3).map((t, i) => (
          <button
            key={t.title}
            onClick={() => onSelectTemplate && onSelectTemplate(t)}
            className="w-full group flex items-center gap-2.5 rounded-lg pl-2 pr-1 py-2 hover:bg-black/[0.04] text-left"
          >
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ background: (t.color || '#3b66eb') + '1a' }}
            >
              <FileText size={12} style={{ color: t.color || '#3b66eb' }} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] text-zinc-700 truncate">{t.title}</span>
            </span>
            <MoreHorizontal size={13} className="opacity-0 group-hover:opacity-40 text-zinc-500 shrink-0" />
          </button>
        ))}

        {/* history */}
        {groups.length === 0 && (
          <p className="text-xs text-zinc-400 text-center mt-8 px-4">
            {search ? 'No matches.' : 'No conversations yet.'}
          </p>
        )}
        {groups.map(([g, items]) => (
          <div key={g} className="mb-1">
            <button
              onClick={() => toggleGroup(g)}
              className="w-full flex items-center gap-1 px-2.5 pt-3 pb-1 text-[12px] font-medium text-zinc-400 hover:text-zinc-600"
            >
              {g}
              <ChevronDown size={11} className={`ml-auto transition-transform ${collapsed[g] ? '-rotate-90' : ''}`} />
            </button>
            {!collapsed[g] && items.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                aria-label={'Open ' + (c.title || 'New chat')}
                className={`group flex items-center gap-2 rounded-lg pl-2.5 pr-1.5 py-2 cursor-pointer ${
                  c.id === activeId ? 'bg-black/[0.05]' : 'hover:bg-black/[0.03]'
                }`}
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(c.id);
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-zinc-700 truncate">{c.title || 'New chat'}</div>
                </div>
                <span className="text-[10px] text-zinc-400 shrink-0 tabular-nums">{timeLabel(c.updatedAt || Date.now())}</span>
                {canDelete !== false && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c.id);
                    }}
                    title="Delete conversation"
                    aria-label={'Delete ' + (c.title || 'New chat')}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 text-zinc-400 hover:text-red-500 shrink-0 p-0.5"
                  >
                    <span className="text-[11px] leading-none">···</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* footer */}
      <div className="p-3 border-t border-black/[0.06] shrink-0">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-1.5 text-[13px] font-medium border border-black/[0.08] rounded-xl py-2.5 text-zinc-700 hover:border-black/20 transition-colors"
        >
          {keyOn ? 'Configuration' : 'Add API key'}
        </button>
        <div className="mt-2.5 flex items-center gap-2.5 px-1">
          <span className="relative w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs text-zinc-600 shrink-0 font-semibold">
            S
            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${keyOn ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-zinc-800 truncate">{keyOn ? 'Connected' : 'No API key'}</div>
            <div className="text-[10px] text-zinc-400 truncate">{modelId}</div>
          </div>
          <button onClick={onOpenSettings} title="Settings" className="text-zinc-400 hover:text-zinc-900 shrink-0 p-1">
            <Settings size={14} />
          </button>
          {onSignOut && (
            <button onClick={onSignOut} title="Sign out" className="text-zinc-400 hover:text-red-500 shrink-0 p-1">
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
