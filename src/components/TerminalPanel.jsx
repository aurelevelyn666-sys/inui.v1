import { useEffect, useRef } from 'react';
import { Terminal, Loader2, CheckCircle, AlertCircle, Wrench } from 'lucide-react';

function LogEntry({ entry }) {
  const icon =
    entry.type === 'error' ? <AlertCircle size={11} className="text-red-500 shrink-0" /> :
    entry.type === 'success' ? <CheckCircle size={11} className="text-emerald-500 shrink-0" /> :
    entry.type === 'tool' ? <Wrench size={11} className="text-amber-500 shrink-0" /> :
    <span className="w-[11px] h-[11px] rounded-full border border-zinc-300 shrink-0" />;

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 text-[12px]">
      {icon}
      <span className="text-zinc-400 shrink-0 tabular-nums">{entry.time}</span>
      <span className={`flex-1 whitespace-pre-wrap ${entry.type === 'error' ? 'text-red-600' : entry.type === 'success' ? 'text-zinc-600' : 'text-zinc-500'}`}>
        {entry.message}
      </span>
    </div>
  );
}

export default function TerminalPanel({ logs, streaming, phase }) {
  const scrollRef = useRef(null);
  const wasAtBottom = useRef(true);

  // Follow user intent: track whether THEY parked at the bottom on scroll.
  // New logs auto-scroll only then — reading history up top never yanks.
  const trackBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    trackBottom();
  }, [logs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !wasAtBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs, streaming]);

  const phaseLabel =
    phase === 'contacting' ? 'Connecting to model…' :
    phase === 'building' ? 'Rebuilding preview…' :
    phase === 'verifying' ? 'Verifying build…' :
    phase === 'repairing' ? 'Auto-fixing errors…' :
    phase === 'streaming' ? 'Generating…' : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-black/10">
        <Terminal size={12} className="text-zinc-400" />
        <span className="text-[11px] text-zinc-500 font-medium flex-1">Activity</span>
        {streaming && (
          <span className="flex items-center gap-1 text-[10px] text-zinc-400">
            <Loader2 size={10} className="animate-spin" />
            {phaseLabel || 'working…'}
          </span>
        )}
      </div>
      <div ref={scrollRef} onScroll={trackBottom} className="flex-1 overflow-y-auto min-h-0">
        {(!logs || logs.length === 0) && !streaming && (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
            <Terminal size={24} className="mb-2 opacity-40" />
            <p className="text-[12px]">Activity will appear here</p>
          </div>
        )}
        {logs && logs.map((entry, i) => (
          <LogEntry key={entry.id || i} entry={entry} />
        ))}
        {streaming && phaseLabel && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
            <Loader2 size={11} className="animate-spin text-zinc-400" />
            <span className="text-zinc-500">{phaseLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
