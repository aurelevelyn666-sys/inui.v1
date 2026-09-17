import { useEffect, useRef, useState } from 'react';
import { MessagesSquare, PanelsTopLeft, Zap, Blocks, CalendarDays, Users, Settings, Sun, Moon } from 'lucide-react';

// Slim icon rail on the far left. One active item, a settings
// popover at the bottom, and the account avatar under it.
const RAIL_ITEMS = [
  { id: 'chat', icon: MessagesSquare, label: 'Chat' },
  { id: 'builds', icon: Zap, label: 'Builds' },
  { id: 'templates', icon: Blocks, label: 'Templates' },
  { id: 'calendar', icon: CalendarDays, label: 'Calendar' },
  { id: 'team', icon: Users, label: 'Team' }
];

export default function IconRail({ active, onNavigate, dark, onToggleDark, onOpenSettings, accountLabel, canvasReady }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const popRef = useRef(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const close = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [settingsOpen]);

  return (
    <div className="w-[64px] shrink-0 border-r border-black/[0.06] bg-white flex flex-col items-center py-4 gap-1.5 relative z-40">
      {/* logo orb */}
      <div className="w-9 h-9 rounded-full mb-3 shadow-[0_2px_10px_rgba(59,102,235,0.45)]" style={{ background: 'linear-gradient(135deg,#6f9bff 0%,#3b66eb 100%)' }} />

      {RAIL_ITEMS.map((it) => {
        const on = active === it.id;
        return (
          <button
            key={it.id}
            title={it.label}
            aria-label={it.label}
            aria-current={on ? 'page' : undefined}
            onClick={() => onNavigate(it.id)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              on ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04]'
            }`}
          >
            <it.icon size={17} strokeWidth={on ? 2.2 : 1.8} />
          </button>
        );
      })}

      <div className="flex-1" />

      {/* canvas utility (opens the editor for the current build) */}
      <button
        title={canvasReady ? 'Canvas — edit current build' : 'Canvas — generate a site first'}
        aria-label="Canvas"
        aria-current={active === 'canvas' ? 'page' : undefined}
        onClick={() => onNavigate('canvas')}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          active === 'canvas' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04]'
        }`}
      >
        <PanelsTopLeft size={17} strokeWidth={active === 'canvas' ? 2.2 : 1.8} />
        {canvasReady && active !== 'canvas' && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
      </button>

      {/* settings popover */}
      <div className="relative" ref={popRef}>
        {settingsOpen && (
          <div className="absolute bottom-12 left-2 w-44 bg-white border border-black/[0.08] rounded-xl p-1 shadow-xl">
            <button
              onClick={() => {
                setSettingsOpen(false);
                onOpenSettings();
              }}
              className="w-full flex items-center gap-2 text-left text-[13px] text-zinc-700 rounded-lg px-2.5 py-2 hover:bg-black/[0.04]"
            >
              <Settings size={14} /> Configuration
            </button>
            <button
              onClick={onToggleDark}
              className="w-full flex items-center gap-2 text-left text-[13px] text-zinc-700 rounded-lg px-2.5 py-2 hover:bg-black/[0.04]"
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        )}
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          title="Settings"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04]"
        >
          <Settings size={17} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex-1" />
    </div>
  );
}
