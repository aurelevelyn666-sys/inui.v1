import { useState } from 'react';
import {
  Pin, PinOff, Loader2, Wand2, Languages,
  ClipboardCheck, History, ChevronDown, Home, Settings, CheckCircle2, XCircle, Circle
} from 'lucide-react';

const LANGS = ['Spanish', 'French', 'German', 'Indonesian', 'Japanese', 'Arabic'];

const SELECTION_SKILLS = [
  { id: 'rewrite', label: 'Rewrite copy', prompt: 'Rewrite this element\u2019s copy to be clearer and more compelling. Keep roughly the same length.' },
  { id: 'shorter', label: 'Make shorter', prompt: 'Make this element\u2019s text much shorter and punchier.' },
  { id: 'bolder', label: 'Bolder CTA', prompt: 'Make this element bolder and higher-contrast so it grabs attention: stronger weight, vivid color, slightly larger.' },
  { id: 'glass', label: 'Glass style', prompt: 'Restyle this element with a glassmorphism look: translucent background with blur, subtle border, soft shadow.' },
  { id: 'space', label: 'Airier spacing', prompt: 'Give this element airier spacing: more generous padding and breathing room.' }
];

const PAGE_SKILLS = [
  { id: 'section', label: '＋ New section', prompt: 'Add a new well-designed section to this page that fits the existing style. Create new component file(s) under /components/ and wire them into the entry.' },
  { id: 'responsive', label: 'Responsive pass', prompt: 'Review all files and improve responsive behavior for tablet and phone widths. Keep the desktop design intact.' }
];

export default function AgentPanel(props) {
  const {
    pinned, selection, onPin, onUnpin,
    onSendAgent, agentBusy, steps,
    versions, onRestoreVersion,
    audit, onRunAudit, auditing, onFixAudit, fixingAudit,
    currentPage, modelId, onOpenSettings,
    threadNode
  } = props;
  const [lang, setLang] = useState('Indonesian');
  const [showHistory, setShowHistory] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showAudit, setShowAudit] = useState(true);

  const target = pinned || selection;
  const send = (instruction, scope) => {
    const t = String(instruction || '').trim();
    if (!t || agentBusy) return;
    onSendAgent({ instruction: t, scope });
  };
  const sendSelection = (text) => send('SELECTION PATCH: ' + text + ' (apply to the pinned/selected element only)', 'selection');

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 px-3 pt-2.5 pb-2 space-y-2 max-h-[46%] overflow-y-auto border-b cui-line">
        {/* viewed pill */}
        <div className="flex items-center gap-1.5 text-[11px] border cui-line rounded-lg px-2.5 py-1.5 cui-sub cui-panel">
          <Home size={11} className="cui-faint" />
          <span className="truncate">Viewed {currentPage === '/App.jsx' ? 'Home' : currentPage}</span>
        </div>

        {/* pinned context */}
        <div className="border cui-line rounded-xl p-2.5 cui-panel">
          {pinned ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] cui-ink mb-1">
                <Pin size={11} /> Scoped to selection
                <button onClick={onUnpin} className="ml-auto cui-sub hover:text-black flex items-center gap-1">
                  <PinOff size={11} /> Unpin
                </button>
              </div>
              <div className="text-[11px] cui-sub">
                <span className="font-mono text-[10px] bg-[#f0f0f3] cui-ink rounded px-1 py-0.5 mr-1.5">{pinned.tag}</span>
                {(pinned.text || '').slice(0, 80) || <span className="cui-faint">no text</span>}
              </div>
            </div>
          ) : selection ? (
            <button onClick={onPin} className="w-full text-left">
              <div className="flex items-center gap-1.5 text-[11px] cui-sub mb-1">
                <Pin size={11} /> Pin selection as context?
              </div>
              <div className="text-[11px] cui-sub">
                <span className="font-mono text-[10px] bg-[#f0f0f3] cui-sub rounded px-1 py-0.5 mr-1.5">{selection.tag}</span>
                {(selection.text || '').slice(0, 80)}
              </div>
            </button>
          ) : (
            <p className="text-[11px] cui-sub">Select an element on the canvas, then pin it to scope the agent to just that part.</p>
          )}
        </div>

        {/* skills */}
        <div>
          <button onClick={() => setShowSkills((v) => !v)} className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-wider cui-sub mb-1.5">
            <Wand2 size={10} /> Skills
            <ChevronDown size={10} className={`ml-auto transition-transform ${showSkills ? 'rotate-180' : ''}`} />
          </button>
          {showSkills && (
            <div className="mb-1">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SELECTION_SKILLS.map((s) => (
                  <button
                    key={s.id}
                    disabled={!target || agentBusy}
                    onClick={() => sendSelection(s.prompt)}
                    className="text-[11px] border cui-line rounded-full px-2.5 py-1 cui-sub hover:border-[#d4d4d8] hover:text-black disabled:opacity-35"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 mb-2">
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="cui-panel border cui-line rounded-full px-2 py-1 text-[11px] cui-sub outline-none"
                >
                  {LANGS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <button
                  disabled={!target || agentBusy}
                  onClick={() => sendSelection('translate this element\u2019s text to ' + lang + '. Return ONLY the translated text in the patch, keep tone and length similar.')}
                  className="text-[11px] border cui-line rounded-full px-2.5 py-1 cui-sub hover:border-[#d4d4d8] hover:text-black disabled:opacity-35 flex items-center gap-1"
                >
                  <Languages size={11} /> Translate
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PAGE_SKILLS.map((s) => (
                  <button
                    key={s.id}
                    disabled={agentBusy}
                    onClick={() => send(s.prompt, 'page')}
                    className="text-[11px] border cui-line rounded-full px-2.5 py-1 cui-sub hover:border-[#d4d4d8] hover:text-black disabled:opacity-50"
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  onClick={onRunAudit}
                  disabled={auditing}
                  className="text-[11px] border cui-line rounded-full px-2.5 py-1 cui-sub hover:border-[#d4d4d8] hover:text-black disabled:opacity-50 flex items-center gap-1"
                >
                  {auditing ? <Loader2 size={10} className="animate-spin" /> : <ClipboardCheck size={11} />} Audit page
                </button>
              </div>
            </div>
          )}
        </div>

        {/* audit results */}
        {audit && (
          <div>
            <button onClick={() => setShowAudit((v) => !v)} className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-wider cui-sub mb-1.5">
              <ClipboardCheck size={10} /> Audit
              <ChevronDown size={10} className={`ml-auto transition-transform ${showAudit ? 'rotate-180' : ''}`} />
            </button>
            {showAudit && (
              <div className="border cui-line rounded-xl p-2.5 mb-1 cui-panel">
                <div className="text-[11px] font-medium mb-1.5">
                  {(audit.issues || []).length === 0 ? <span className="text-emerald-600">clean — no issues found</span> : <span className="text-amber-700">{(audit.issues || []).length} issue(s)</span>}
                </div>
                {(audit.issues || []).slice(0, 8).map((it, i) => (
                  <div key={i} className="text-[10px] cui-sub py-0.5 truncate">
                    <span className="cui-sub uppercase mr-1">{it.type}</span>
                    {it.file} — {String(it.detail || '').slice(0, 90)}
                  </div>
                ))}
                {(audit.issues || []).length > 0 && (
                  <button
                    onClick={onFixAudit}
                    disabled={fixingAudit}
                    className="cui-btn mt-2 w-full text-[11px] rounded-full py-1.5 flex items-center justify-center gap-1"
                  >
                    <Wand2 size={11} /> Fix all with AI
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* versions */}
        <div>
          <button onClick={() => setShowHistory((v) => !v)} className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-wider cui-sub mb-1.5">
            <History size={10} /> History · rollback
            <ChevronDown size={10} className={`ml-auto transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </button>
          {showHistory && (
            <div className="space-y-1.5 mb-1">
              {versions.length === 0 && <p className="text-[11px] cui-sub">Every agent change snapshots here. Nothing yet.</p>}
              {versions.map((v) => (
                <div key={v.id} className="flex items-center gap-1.5 text-[11px] cui-panel border cui-line rounded-lg px-2 py-1.5">
                  <span className="flex-1 truncate cui-sub">{v.label}</span>
                  <button onClick={() => onRestoreVersion(v.id)} className="cui-ink hover:text-black shrink-0">Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* live activity feed — one row per agent step with measured timings */}
      {(steps || []).length > 0 && (
        <div className="shrink-0 px-3 py-2 border-t cui-line max-h-36 overflow-y-auto">
          {(steps || []).slice(-8).map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-[11px] py-0.5">
              {s.state === 'running' ? (
                <Loader2 size={10} className="animate-spin cui-faint shrink-0" />
              ) : s.state === 'error' ? (
                <XCircle size={10} className="text-red-500 shrink-0" />
              ) : s.state === 'done' ? (
                <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
              ) : (
                <Circle size={10} className="cui-faint shrink-0" />
              )}
              <span className="cui-sub truncate flex-1">
                {s.label}
                {s.detail ? <span className="cui-faint"> — {s.detail}</span> : null}
              </span>
              {s.secs !== null && s.secs !== undefined && (
                <span className="text-[10px] cui-faint tabular-nums shrink-0">{s.secs}s</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* shared conversation */}
      <div className="flex-1 min-h-0 flex flex-col">
        {threadNode}
      </div>

      <div className="shrink-0 px-3 py-2 border-t cui-line flex items-center gap-1.5 text-[11px] cui-sub">
        <span className="truncate">{modelId}</span>
        <button onClick={onOpenSettings} title="Change model" className="ml-auto p-1 hover:text-black"><Settings size={12} /></button>
      </div>
    </div>
  );
}
