import { useEffect } from 'react';
import {
  ArrowUp, ChevronsUp, ArrowDown, ChevronsDown, Trash2, Copy,
  Lock, LockOpen, Clipboard, Group, Ungroup, MessageSquare,
  Sparkles, EyeOff
} from 'lucide-react';

export default function CtxMenu({ x, y, tag, locked, canPaste, onAction, onClose }) {
  const items = [
    { op: 'agent', icon: Sparkles, label: 'Add to Agent', hot: true },
    { sep: true },
    { op: 'forward', icon: ArrowUp, label: 'Bring forward' },
    { op: 'front', icon: ChevronsUp, label: 'Bring to front' },
    { op: 'backward', icon: ArrowDown, label: 'Send backward' },
    { op: 'back', icon: ChevronsDown, label: 'Send to back' },
    { sep: true },
    { op: 'delete', icon: Trash2, label: 'Delete', danger: true },
    { op: 'hide', icon: EyeOff, label: 'Hide' },
    { op: 'duplicate', icon: Copy, label: 'Duplicate' },
    { op: locked ? 'unlock' : 'lock', icon: locked ? LockOpen : Lock, label: locked ? 'Unlock' : 'Lock', hot: !locked },
    { sep: true },
    { op: 'copy', icon: Copy, label: 'Copy' },
    { op: 'paste', icon: Clipboard, label: 'Paste inside', disabled: !canPaste },
    { sep: true },
    { op: 'group', icon: Group, label: 'Group' },
    { op: 'ungroup', icon: Ungroup, label: 'Ungroup' },
    { sep: true },
    { op: 'comment', icon: MessageSquare, label: 'Add comment' }
  ];

  // Escape closes; clamp into the viewport so small windows can't push the
  // menu permanently offscreen (negative coordinates are unreachable).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 224));
  const top = Math.max(8, Math.min(y, window.innerHeight - 430));

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 w-52 cui-card p-1.5"
        style={{ left, top }}
        role="menu"
        aria-label={'Actions for <' + tag + '>'}
      >
        <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider cui-faint truncate">
          &lt;{tag}&gt;
        </div>
        {items.map((it, i) =>
          it.sep ? (
            <div key={'s' + i} className="h-px bg-[rgba(0,0,0,0.06)] my-1" />
          ) : (
            <button
              key={it.op}
              disabled={it.disabled}
              role="menuitem"
              autoFocus={i === 0}
              onClick={() => {
                onAction(it.op);
                onClose();
              }}
              className={`w-full flex items-center gap-2.5 text-[12px] rounded-lg px-2.5 py-[7px] transition-colors ${
                it.hot
                  ? 'cui-btn'
                  : it.danger
                    ? 'cui-sub hover:bg-red-500/15 hover:text-red-600'
                    : 'cui-sub hover:bg-[#f0f0f3] hover:text-black'
              } disabled:opacity-35`}
            >
              <it.icon size={14} className="shrink-0 opacity-80" />
              {it.label}
            </button>
          )
        )}
      </div>
    </>
  );
}
