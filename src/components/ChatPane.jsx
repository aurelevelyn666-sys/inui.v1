import { useEffect, useId, useRef, useState } from 'react';
import { Send, Loader2, Plus, Trash2, Wrench, Play, X, Plug, Check, Square, Hammer, Image as ImageIcon, Download, Copy, Maximize2, Paperclip, FileText, Mic, Sparkles, ChevronDown, RotateCcw, Circle, ArrowUp } from 'lucide-react';
import { filesToAttachments, ACCEPT } from '../lib/attach.js';
import { suggestFollowUps } from '../lib/followups.js';

function MiniMd({ text }) {
  // Chat never shows code: strip all fenced blocks AND any unfenced file-JSON
  // dump (models sometimes emit {"path":...} or {"/App.jsx":...} raw), render prose only.
  const noFences = proseOnly(text);
  return (
    <div className="space-y-2">
      <div className="whitespace-pre-wrap">{noFences}</div>
    </div>
  );
}

// Summaries must come before the files block — anything from the first
// file-JSON marker onward is machine payload, never chat prose. Cutting here
// (instead of regex-removing) also hides code with literal \n sequences.
function proseOnly(text) {
  let s = String(text || '').replace(/```[\s\S]*?```/g, '');
  const cut = s.search(/\{\s*"path"\s*:|\[\s*\{\s*"path"\s*:|\{\s*"\/[^"]*\.(jsx?|css)"\s*:|"\/[^"]*\.(jsx?|css)"\s*:/);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// Summary-only live text while streaming (code arrives later in the files block).
function streamingSummary(text) {
  return proseOnly(String(text || '').split('```')[0]).slice(0, 1200);
}

function groupFiles(paths) {
  const groups = {};
  paths.slice().sort().forEach((p) => {
    const segs = p.replace(/^\//, '').split('/');
    const g = segs.length > 2 ? '/' + segs[0] + '/' + segs[1] : segs.length === 2 ? '/' + segs[0] : '/';
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  });
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
}

// Code-free display: if a reply is only code (model ignored format),
// show a summary line instead of a wall of source.
function displayContent(m) {
  if (m.role !== 'assistant' || m.error) return m.content;
  const prose = proseOnly(m.content);
  // No-files replies may contain raw dumped JSON — never render it raw.
  if (m.noFiles) return (prose || 'The model replied without usable files.').slice(0, 400);
  if (prose) return prose.length > 1500 ? prose.slice(0, 1500) + '…' : prose;
  if (m.files?.length) return 'Done — updated ' + m.files.length + ' file' + (m.files.length > 1 ? 's' : '') + '. Preview refreshed.';
  return 'Working… (reply contained only code blocks — see Files tab)';
}

// Only warn when the model actually tried to emit files (fences, JSON-ish,
// component syntax). Plain chit-chat without files is normal — not an error.
function triedFiles(m) {
  const src = String(m.raw || m.content || '');
  return /```|"\s*path"\s*:|export\s+default|import\s+.+\s+from|{\s*"\/[A-Za-z]/.test(src);
}

// Codex-style agent status bar
function StatusCard({ phase }) {
  const phaseLabel =
    phase === 'contacting' ? 'Connecting to model…' :
    phase === 'building' ? 'Rebuilding preview…' :
    phase === 'verifying' ? 'Verifying build…' :
    phase === 'repairing' ? 'Auto-fixing errors…' :
    phase === 'streaming' ? 'Generating…' : 'Working…';
  return (
    <div className="inline-flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 text-xs text-zinc-600 bg-white rounded-full border border-black/[0.07] shadow-[0_1px_8px_rgba(0,0,0,0.05)]">
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg,#6f9bff 0%,#3b66eb 100%)' }}
      >
        <Loader2 size={11} className="animate-spin text-white" />
      </span>
      <span>{phaseLabel}</span>
    </div>
  );
}

function ImageCards({ images, onOpen }) {
  if (!images?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5 mt-2">
      {images.map((u) => (
        <button key={u} onClick={() => onOpen(u)} className="rounded-lg overflow-hidden border border-black/10 hover:border-black/20 group relative text-left">
          <img src={u} alt="generated" loading="lazy" className="w-full h-28 object-cover" />
          <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 flex items-center gap-1">
            <Maximize2 size={9} /> open
          </span>
        </button>
      ))}
    </div>
  );
}

function CopyBtn({ text, label }) {
  const [ok, setOk] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      onClick={async () => {
        clearTimeout(timer.current);
        try {
          await navigator.clipboard.writeText(String(text ?? ''));
          setOk(true);
          setFailed(false);
        } catch {
          // Denied permission / insecure context: say so instead of "Copied".
          setOk(false);
          setFailed(true);
        }
        timer.current = setTimeout(() => {
          setOk(false);
          setFailed(false);
        }, 1500);
      }}
      title={failed ? 'Copy failed — clipboard unavailable' : label || 'Copy'}
      className="p-1 rounded-md text-zinc-600 hover:text-zinc-700 hover:bg-black/5 flex items-center gap-1"
    >
      {ok ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
      {label && <span className="text-[11px]">{ok ? 'Copied' : failed ? 'Copy failed' : label}</span>}
    </button>
  );
}

// Manus-style next actions under the latest build: contextual follow-ups so
// the user never wonders what to ask for. One click sends the prompt.
function FollowUps({ files, lastUserPrompt, onSend }) {
  const items = suggestFollowUps(files || {}, lastUserPrompt);
  if (!items.length || !onSend) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {items.map((s) => (
        <button
          key={s.id}
          onClick={() => onSend(s.prompt)}
          className="group/fu flex items-center gap-2 text-left text-[12px] text-zinc-600 border border-black/10 rounded-xl px-3 py-2 hover:border-black/25 hover:text-black transition-colors bg-white"
        >
          <Sparkles size={12} className="text-zinc-400 group-hover/fu:text-black shrink-0" />
          <span className="flex-1">{s.label}</span>
          <span className="text-zinc-300 group-hover/fu:text-zinc-500 text-sm leading-none">→</span>
        </button>
      ))}
    </div>
  );
}

function ToolBody({ m }) {  const [open, setOpen] = useState(false);
  const isErr = /^ERROR/.test(String(m.content || ''));
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2 w-full">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700">
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        <Wrench size={11} className="shrink-0" />
        <span className="font-mono truncate flex-1 text-left">{m.tool}</span>
        <span className={isErr ? 'text-red-600' : 'text-emerald-600'}>{isErr ? 'failed' : 'done'}</span>
      </button>
      {open && (
        <pre className="mt-1.5 text-[11px] leading-relaxed text-zinc-500 whitespace-pre-wrap max-h-56 overflow-y-auto">{String(m.content).slice(0, 4000)}</pre>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  'A dark landing page for a coffee brand with hero, pricing and footer',
  'A personal portfolio with hero, projects grid and contact section',
  'A SaaS analytics dashboard with sidebar, stat cards and a div chart'
];

export default function ChatPane(props) {
  const {
    messages, streaming, streamingText, liveStats, phase, onStop, onSend, activeTab, setActiveTab,
    files, activeFile, setActiveFile, onSaveFile, onAddFile, onDeleteFile,
    mcpServers, mcpInput, setMcpInput, onAddMcp, onConnectMcp, onRemoveMcp,
    onToggleTool, onAddDemo, pendingTools, onRunTool, onSkipTool, modelId, onAdoptAsFile, onCopyRaw, onContinuePrompt,
    hideTabs, composerMode, setComposerMode, tabs, onMessageAction, pageScroll, convoKey, onRegenerate
  } = props;
  const [draft, setDraft] = useState('');
  const [codeDraft, setCodeDraft] = useState(null);
  // Snapshot the file content the draft started from — if the agent rewrites
  // the file underneath, the banner below warns instead of silent clobbering.
  const [draftBase, setDraftBase] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const bottomRef = useRef(null);
  const attachId = useId();
  const inputRef = useRef(null);

  // Fresh composer each conversation; focus it on desktop.
  useEffect(() => {
    setDraft('');
    setAttachments([]);
    setLightbox(null);
    setToolsOpen(false);
    try {
      micRef.current?.stop();
    } catch {
      /* noop */
    }
    setMicOn(false);
    if (pageScroll && window.matchMedia?.('(pointer:fine)').matches) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [convoKey, pageScroll]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const micRef = useRef(null);

  // Unmount: never leave the mic open, dictation handlers live, or warning
  // timers firing into an unmounted tree.
  useEffect(
    () => () => {
      clearTimeout(warnTimer.current);
      try {
        micRef.current?.stop();
      } catch {
        /* noop */
      }
      micRef.current = null;
    },
    []
  );

  const connectedTools = (mcpServers || []).flatMap((s) =>
    s.status === 'connected' ? s.tools.map((t) => ({ ...t, serverUrl: s.url })) : []
  );

  const toggleMic = () => {
    if (micOn) {
      try {
        micRef.current?.stop();
      } catch {
        /* noop */
      }
      setMicOn(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setAttachWarn('Voice input not supported in this browser — try Chrome or Edge.');
      clearTimeout(warnTimer.current);
      warnTimer.current = setTimeout(() => setAttachWarn(null), 4000);
      return;
    }
    try {
      const rec = new SR();
      micRef.current = rec;
      rec.lang = navigator.language || 'en-US'; // respect the browser locale
      rec.interimResults = false;
      rec.onresult = (e) => {
        const text = [...e.results].map((r) => r[0]?.transcript || '').join(' ').trim();
        if (text) setDraft((d) => (d ? d + ' ' : '') + text);
      };
      rec.onend = () => setMicOn(false);
      rec.onerror = () => setMicOn(false);
      rec.start();
      setMicOn(true);
    } catch {
      setMicOn(false);
    }
  };

  useEffect(() => {
    setCodeDraft(null);
    setDraftBase(null);
  }, [activeFile]);

  const send = () => {
    const t = draft.trim();
    if ((!t && !attachments.length) || streaming) return;
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    const atts = attachments;
    setAttachments([]);
    onSend(t, undefined, atts);
  };

  const [attachWarn, setAttachWarn] = useState(null);
  const warnTimer = useRef(null);
  const flagSkipped = (skipped) => {
    if (!skipped || !skipped.length) return;
    setAttachWarn(skipped.map((s) => s.name + ': ' + s.reason).join(' · '));
    clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => setAttachWarn(null), 6000);
  };

  const addFiles = async (fileList) => {
    const { added, skipped } = await filesToAttachments(fileList, attachments.length);
    if (added.length) setAttachments((a) => [...a, ...added].slice(0, 4));
    flagSkipped(skipped);
  };

  const onPaste = (e) => {
    const files = e.clipboardData?.files;
    if (files && files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };
  const visibleTabs = Array.isArray(tabs) && tabs.length ? tabs : ['chat', 'files', 'mcp'];
  const curTab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0];

  // In page-scroll mode keep the view pinned to the bottom while generating.
  useEffect(() => {
    if (!pageScroll) return;
    const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 400;
    if (nearBottom) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streamingText, pageScroll]);

  return (
    <div className={`flex flex-col min-h-0 ${pageScroll ? 'min-h-screen' : 'h-full'}`}>
      {/* tabs */}
      {!hideTabs && (
      <div className="flex items-center gap-1 px-3 pt-2.5 pb-2 border-b border-black/10 text-xs">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-1.5 rounded-full capitalize ${curTab === t ? 'bg-black/5 text-zinc-900' : 'text-zinc-500 hover:text-zinc-600'}`}
          >
            {t}
            {t === 'mcp' && (mcpServers || []).some((s) => s.status === 'connected') && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 align-middle" />
            )}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-zinc-600 truncate max-w-[120px]">{modelId}</span>
      </div>
      )}

      {curTab === 'chat' && (
        <>
          <div className={pageScroll ? 'flex-1 px-3 py-3 space-y-3' : 'flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0'}>
            {messages.length === 0 && !streaming && (
              <div className="text-center pt-10 pb-6 px-4">
                <div className="text-[26px] font-semibold mb-2 text-zinc-900">What should we build?</div>
                <p className="text-[13px] text-zinc-500 mb-5">Describe your project — I'll generate the code, then you can preview and edit on the canvas.</p>
                <div className="flex flex-col items-center gap-1.5 max-w-md mx-auto">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => onSend(s)}
                      className="w-full text-xs text-zinc-500 border border-black/10 rounded-full px-4 py-2 hover:text-zinc-900 hover:border-black/20 transition-colors truncate"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1 && !streaming;
              const showRegen = isLast && m.role === 'assistant' && !m.error && onRegenerate;
              if (m.tool) {
                return (
                  <div key={i} className="group">
                    <ToolBody m={m} />
                    <div className="flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <CopyBtn text={m.content} />
                    </div>
                  </div>
                );
              }
              return (
              <div key={i} className={`group text-[13px] leading-[1.7] ${
                m.role === 'user' ? 'rounded-2xl px-4 py-2.5 bg-[#f1f3f7] ml-auto w-fit max-w-[85%]' : m.error ? 'rounded-2xl px-3.5 py-3 bg-red-50 border border-red-200' : 'px-1 py-1.5'
              }`}>
                <MiniMd text={displayContent(m)} />
                {m.attachments?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.attachments.map((a, ai) => a.kind === 'image' ? (
                      <button key={a.id || ai} onClick={() => setLightbox(a.dataUrl)} className="rounded-lg overflow-hidden border border-black/10 hover:border-black/20">
                        <img src={a.dataUrl} alt={a.name} className="h-20 object-cover" />
                      </button>
                    ) : (
                      <span key={a.id || ai} className="flex items-center gap-1 text-[10px] bg-white border border-black/10 rounded px-1.5 py-1 text-zinc-600">
                        <FileText size={10} /> {a.name}
                      </span>
                    ))}
                  </div>
                )}
                {m.actions?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.actions.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => onMessageAction && onMessageAction(i, a.id)}
                        className={a.id === 'main'
                          ? 'inu-btn-blue text-[12px] rounded-full px-3 py-1'
                          : 'text-[12px] border border-black/10 rounded-full px-3 py-1 text-zinc-600 hover:border-black/20'}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
                {m.genStats && (
                  <div className="text-[10px] text-zinc-600 mt-1.5" title="Approximate model usage for this reply">
                    {m.genStats.tokens.toLocaleString()} tokens · {m.genStats.secs}s
                    {m.genStats.secs > 0 ? ' · ' + Math.round(m.genStats.tokens / m.genStats.secs) + ' tok/s' : ''}
                  </div>
                )}
                <ImageCards images={m.images} onOpen={setLightbox} />
                {onAdoptAsFile && m.role === 'assistant' && !m.error && !m.noFiles && !m.plan && (!m.files || m.files.length === 0) && triedFiles(m) && (
                  <button
                    onClick={() => onAdoptAsFile(m.content)}
                    className="mt-2 text-[11px] text-zinc-900 border border-black/15 rounded-full px-3 py-1 hover:bg-black/5"
                  >
                    Model ignored file format? Click to use this reply as a file →
                  </button>
                )}
                {m.noFiles && triedFiles(m) && (
                  <div className="mt-2 border border-amber-200 bg-amber-50 rounded-lg p-2.5">
                    <div className="text-[11px] text-amber-800 font-medium mb-1">No files detected in this reply</div>
                    <p className="text-[11px] text-zinc-500 mb-2">The model answered without usable files. Try auto-save, copy the raw reply for debugging, or ask it to continue.</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => onAdoptAsFile && onAdoptAsFile(m.raw || m.content)} className="text-[11px] bg-amber-400/90 text-black rounded-full px-3 py-1 font-medium">
                        Try auto-save
                      </button>
                      <button onClick={() => onCopyRaw && onCopyRaw(m.raw || m.content)} className="text-[11px] border border-black/10 rounded-full px-3 py-1 text-zinc-600 hover:border-black/20">
                        Copy raw reply
                      </button>
                      <button onClick={() => onContinuePrompt && onContinuePrompt()} className="text-[11px] border border-black/10 rounded-full px-3 py-1 text-zinc-600 hover:border-black/20">
                        Continue
                      </button>
                    </div>
                  </div>
                )}
                {isLast && m.role === 'assistant' && !m.error && (m.files || []).length > 0 && !streaming && (
                  <FollowUps
                    files={files}
                    lastUserPrompt={[...messages].reverse().find((x) => x.role === 'user')?.content}
                    onSend={onSend}
                  />
                )}
                <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <CopyBtn text={m.role === 'user' ? m.content : displayContent(m)} />
                  {showRegen && (
                    <button onClick={onRegenerate} title="Regenerate response" className="p-1 rounded-md text-zinc-600 hover:text-zinc-700 hover:bg-black/5 flex items-center gap-1">
                      <RotateCcw size={11} /> <span className="text-[11px]">Regenerate</span>
                    </button>
                  )}
                </div>
              </div>
              );
            })}
            {pendingTools.map((p) => (
              <div key={p.id} className="text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-amber-700 mb-1"><Wrench size={11} /> agent wants to call <b>{p.tool}</b></div>
                <pre className="text-[10px] text-zinc-500 whitespace-pre-wrap mb-2">{JSON.stringify(p.args).slice(0, 300)}</pre>
                <div className="flex gap-1.5">
                  <button onClick={() => onRunTool(p.id)} className="text-[11px] bg-amber-400 text-black rounded-full px-3 py-1 font-medium flex items-center gap-1"><Play size={10} /> Run</button>
                  <button onClick={() => onSkipTool(p.id)} className="text-[11px] border border-black/10 rounded-full px-3 py-1 text-zinc-500 flex items-center gap-1"><X size={10} /> Skip</button>
                </div>
              </div>
            ))}
            {streamingText && (
              <div className="text-[13px] leading-[1.7] px-1 py-1.5">
                <MiniMd text={streamingSummary(streamingText).slice(0, 1200) || 'generating…'} />
                <span className="stream-caret" aria-hidden="true" />
              </div>
            )}
            {(streaming || phase === 'building') && (
              <StatusCard phase={phase} />
            )}
          </div>
          <div ref={bottomRef} />
          <div className={pageScroll ? 'sticky bottom-0 z-10 bg-[#fafafa]/95 backdrop-blur-md p-3 border-t border-black/[0.06]' : 'p-3 border-t border-black/[0.06]'}>
            <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.04)] px-3.5 pt-3 pb-2.5 focus-within:border-black/20 transition-colors">
              <input
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                id={attachId}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              {setComposerMode && (
                <div className="flex gap-1.5 mb-2.5">
                  {[
                    { id: 'build', icon: Hammer, label: 'Build' },
                    { id: 'image', icon: ImageIcon, label: 'Image' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setComposerMode(m.id)}
                      className={`flex items-center gap-1 text-[11px] rounded-full px-3 py-1 border transition-colors ${
                        composerMode === m.id
                          ? 'bg-[#101014] text-white border-[#101014] font-medium'
                          : 'text-zinc-500 border-black/[0.08] hover:text-zinc-700 hover:border-black/20'
                      }`}
                    >
                      <m.icon size={11} /> {m.label}
                    </button>
                  ))}
                </div>
              )}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                {attachments.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 bg-black/5 border border-black/10 rounded-lg pl-1 pr-1.5 py-1 max-w-[220px]">
                    {a.kind === 'image' ? (
                      <img src={a.dataUrl} alt={a.name} className="w-8 h-8 rounded-md object-cover shrink-0" />
                    ) : (
                      <FileText size={14} className="text-zinc-500 shrink-0 ml-1" />
                    )}
                    <span className="text-[11px] text-zinc-600 truncate">{a.name}</span>
                    <button onClick={() => setAttachments((arr) => arr.filter((x) => x.id !== a.id))} className="text-zinc-500 hover:text-black shrink-0">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachWarn && (
              <div className="text-[11px] text-amber-800 px-1 pb-1.5">Couldn’t attach — {attachWarn}</div>
            )}
            <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  // Auto-grow to content, capped so the composer never eats the pane.
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(160, el.scrollHeight) + 'px';
                }}
                onKeyDown={(e) => {
                  // Never send mid-IME-composition (CJK Enter confirms a character).
                  if (e.nativeEvent && e.nativeEvent.isComposing) return;
                  if ((e.key === 'Enter' && !e.shiftKey) || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
                    e.preventDefault();
                    send();
                  }
                }}
                onPaste={onPaste}
                placeholder={composerMode === 'image' ? 'Describe the image…' : 'Ask me anything...'}
                rows={1}
                className="w-full bg-transparent outline-none text-[14px] placeholder:text-zinc-400 resize-none max-h-40 overflow-y-auto"
              />
              <div className="flex items-center gap-1.5 mt-2">
                <label
                  htmlFor={attachId}
                  title="Attach image or text file (or paste an image)"
                  className="h-8 flex items-center gap-1.5 text-[11px] text-zinc-600 border border-black/[0.08] rounded-full px-3 hover:border-black/20 cursor-pointer"
                >
                  <Paperclip size={12} /> Attach
                </label>
                <div className="relative">
                  <button
                    onClick={() => setToolsOpen((o) => !o)}
                    title="MCP tools"
                    className={`h-8 rounded-full border px-3 flex items-center gap-1.5 text-[11px] transition-colors ${toolsOpen ? 'border-black/20 text-zinc-900' : 'border-black/[0.08] text-zinc-500 hover:text-zinc-700 hover:border-black/20'}`}
                  >
                    <Sparkles size={12} /> Tools
                    <ChevronDown size={11} className={`transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {toolsOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} />
                      <div className="absolute bottom-9 left-0 z-50 w-64 bg-[#ffffff] border border-black/10 rounded-xl p-2 shadow-2xl max-h-64 overflow-y-auto">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 py-1">MCP tools · auto-used by agent</div>
                        {connectedTools.length === 0 && (
                          <p className="text-[11px] text-zinc-500 px-2 py-1.5">No tools connected. Add MCP servers or demo tools.</p>
                        )}
                        {connectedTools.map((t) => (
                          <label key={t.serverUrl + t.name} className="flex items-center gap-2 text-[11px] text-zinc-600 px-2 py-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={t.enabled !== false}
                              onChange={() => onToggleTool(t.serverUrl, t.name)}
                              className="accent-black shrink-0"
                            />
                            <span className="truncate">{t.name}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={toggleMic}
                    title={micOn ? 'Stop listening' : 'Voice input'}
                    className={`h-8 flex items-center gap-1.5 text-[11px] rounded-full px-3 border transition-colors ${
                      micOn ? 'bg-red-50 border-red-300 text-red-600' : 'text-zinc-600 border-black/[0.08] hover:border-black/20'
                    }`}
                  >
                    <Mic size={12} /> Voice
                  </button>
                  <button onClick={send} disabled={streaming} title="Send" className="w-8 h-8 rounded-full bg-[#101014] text-white flex items-center justify-center hover:bg-black disabled:opacity-40 shrink-0">
                    <ArrowUp size={14} />
                  </button>
                </div>
              </div>
            </div>
            {streaming && (
              <div className="flex justify-end mt-2 px-1">
                <button
                  onClick={onStop}
                  className="text-[10px] flex items-center gap-1 border border-black/10 rounded-full px-2.5 py-1 text-zinc-600 hover:border-red-500 hover:text-red-600"
                >
                  <Square size={9} /> Stop
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {curTab === 'files' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-black/10">
            <button onClick={onAddFile} className="text-[11px] flex items-center gap-1 text-zinc-500 hover:text-zinc-900 border border-black/10 rounded-full px-2.5 py-1">
              <Plus size={11} /> file
            </button>
            {activeFile && !['/App.jsx', '/index.css'].includes(activeFile) && (
              <button onClick={() => onDeleteFile(activeFile)} className="text-[11px] flex items-center gap-1 text-zinc-500 hover:text-red-600">
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="py-1">
              <div className="px-4 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
                {Object.keys(files).length} files
              </div>
              {groupFiles(Object.keys(files)).map(([g, paths]) => (
                <div key={g}>
                  {g !== '/' && (
                    <div className="px-4 pt-2 pb-0.5 text-[10px] font-medium text-zinc-500">{g}</div>
                  )}
                  {paths.map((p) => (
                    <button
                      key={p}
                      onClick={() => setActiveFile(p)}
                      className={`w-full text-left text-xs px-4 py-1.5 truncate ${p === activeFile ? 'bg-black/5 text-zinc-900' : 'text-zinc-500 hover:text-zinc-600'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {activeFile && (
              <textarea
                value={codeDraft ?? files[activeFile] ?? ''}
                onChange={(e) => {
                  setCodeDraft(e.target.value);
                  setDraftBase((b) => (b && b.file === activeFile ? b : { file: activeFile, content: files[activeFile] }));
                }}
                spellCheck={false}
                className="w-full h-72 bg-zinc-100 border-t border-black/10 text-[11px] font-mono p-3 outline-none resize-y text-zinc-800"
              />
            )}
          </div>
          {activeFile && codeDraft !== null && codeDraft !== files[activeFile] && (
            <div className="p-2.5 border-t border-black/10">
              {draftBase && draftBase.file === activeFile && files[activeFile] !== undefined && files[activeFile] !== draftBase.content && codeDraft !== files[activeFile] && (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
                  The agent updated this file while you were editing.
                  <button onClick={() => { setCodeDraft(null); setDraftBase(null); }} className="underline ml-1">Load latest</button> or save to overwrite it.
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { onSaveFile(activeFile, codeDraft); setCodeDraft(null); setDraftBase(null); }} className="text-xs bg-zinc-900 text-white rounded-full px-4 py-1.5 font-medium hover:bg-black">Save file</button>
                <button onClick={() => { setCodeDraft(null); setDraftBase(null); }} className="text-xs text-zinc-500 px-2">discard</button>
              </div>
            </div>
          )}
        </div>
      )}

      {curTab === 'mcp' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
          <div className="flex gap-1.5">
            <input
              value={mcpInput}
              onChange={(e) => setMcpInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAddMcp()}
              placeholder="https://mcp.example.com/sse"
              className="flex-1 bg-[#ffffff] border border-black/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-black/20"
            />
            <button onClick={onAddMcp} className="text-xs bg-black/5 rounded-lg px-2.5 hover:bg-black/10"><Plus size={12} /></button>
          </div>
          <button onClick={onAddDemo} className="text-[11px] text-zinc-900 border border-black/15 rounded-full px-3 py-1 hover:bg-black/5 flex items-center gap-1">
            <Plug size={11} /> Add local demo tools
          </button>
          {(mcpServers || []).map((s) => (
            <div key={s.url} className="border border-black/10 rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 text-xs mb-1">
                <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'connected' ? 'bg-emerald-400' : s.status === 'connecting' ? 'bg-amber-400' : 'bg-red-400'}`} />
                <span className="truncate flex-1 text-zinc-600">{s.url}</span>
                {s.status !== 'connected' ? (
                  <button onClick={() => onConnectMcp(s.url)} className="text-[10px] bg-black/5 rounded-full px-2 py-0.5 hover:bg-black/10">connect</button>
                ) : (
                  <span className="text-[10px] text-zinc-600">{s.tools.length} tools</span>
                )}
                {!s.url.startsWith('local://') && (
                  <button onClick={() => onRemoveMcp(s.url)} className="text-zinc-600 hover:text-red-600"><X size={12} /></button>
                )}
              </div>
              {s.error && <p className="text-[10px] text-red-600 mb-1 break-words">{s.error.slice(0, 160)}</p>}
              {s.status === 'connected' && s.tools.map((t) => (
                <label key={t.name} className="flex items-center gap-1.5 text-[11px] text-zinc-500 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={t.enabled !== false} onChange={() => onToggleTool(s.url, t.name)} className="accent-black" />
                  <span className="truncate">{t.name}</span>
                  {t.enabled !== false && <Check size={10} className="text-emerald-500 shrink-0" />}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-6" onClick={() => setLightbox(null)}>
          {/^(data:image\/|blob:|https?:\/\/)/i.test(String(lightbox)) ? (
            <img src={lightbox} alt="generated" className="max-w-full max-h-[78vh] rounded-xl border border-white/20" onClick={(e) => e.stopPropagation()} />
          ) : (
            <p className="text-xs text-zinc-300 max-w-md text-center" onClick={(e) => e.stopPropagation()}>Blocked unsafe image URL.</p>
          )}
          <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
            {/^(data:image\/|blob:|https?:\/\/)/i.test(String(lightbox)) && (
              <a href={lightbox} download target="_blank" rel="noreferrer" className="text-xs bg-white text-black rounded-full px-4 py-1.5 font-medium flex items-center gap-1.5 hover:bg-zinc-200">
                <Download size={12} /> Download
              </a>
            )}
            <button onClick={() => onCopyRaw && onCopyRaw(lightbox)} className="text-xs border border-white/20 rounded-full px-4 py-1.5 text-zinc-200 hover:border-white/40 flex items-center gap-1.5">
              <Copy size={12} /> Copy URL
            </button>
            <button onClick={() => setLightbox(null)} className="text-xs text-zinc-400 hover:text-white px-2">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
