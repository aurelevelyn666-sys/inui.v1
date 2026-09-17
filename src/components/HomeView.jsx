import { useEffect, useId, useRef, useState } from 'react';
import { Image as ImageIcon, Check, Settings, Share, Plus, Paperclip, Mic, ArrowUp, Zap, FileText, MessageSquare, Layers } from 'lucide-react';
import { filesToAttachments, ACCEPT } from '../lib/attach.js';
import { TEMPLATES } from '../lib/templates.js';

const PALETTES = [
  { name: 'Mono', colors: ['#18181b', '#52525b', '#e4e4e7'] },
  { name: 'Ocean', colors: ['#0c4a6e', '#0284c7', '#bae6fd'] },
  { name: 'Forest', colors: ['#14532d', '#16a34a', '#bbf7d0'] },
  { name: 'Sunset', colors: ['#7c2d12', '#ea580c', '#fed7aa'] },
  { name: 'Grape', colors: ['#581c87', '#9333ea', '#e9d5ff'] }
];

export default function HomeView(props) {
  const { onSubmit, onOpenSettings, hasKey, modelId } = props;
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachWarn, setAttachWarn] = useState(null);
  const [palette, setPalette] = useState(null);
  const [palOpen, setPalOpen] = useState(false);
  const warnTimer = useRef(null);
  const attachId = useId();
  const recRef = useRef(null);
  const [micOn, setMicOn] = useState(false);

  // Unmount: stop dictation and drop pending warning timers.
  useEffect(
    () => () => {
      clearTimeout(warnTimer.current);
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
      recRef.current = null;
    },
    []
  );

  const toggleVoice = () => {
    if (micOn) {
      try {
        recRef.current?.stop();
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
      recRef.current = rec;
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = false;
      rec.onresult = (e) => {
        const text = [...e.results].map((r) => r[0]?.transcript || '').join(' ').trim();
        if (text) setValue((v) => (v ? v + ' ' : '') + text);
      };
      rec.onend = () => setMicOn(false);
      rec.onerror = () => setMicOn(false);
      rec.start();
      setMicOn(true);
    } catch {
      setMicOn(false);
    }
  };

  const go = (text) => {
    let t = (text || '').trim();
    if (!t && !attachments.length) return;
    if (palette) t += (t ? '\n' : '') + 'Use this exact color palette: ' + palette.colors.join(', ') + '.';
    onSubmit(t, attachments);
    setValue('');
    setAttachments([]);
  };

  const addFiles = async (fileList) => {
    const { added, skipped } = await filesToAttachments(fileList, attachments.length);
    if (added.length) setAttachments((a) => [...a, ...added].slice(0, 4));
    if (skipped.length) {
      setAttachWarn(skipped.map((s) => s.name + ': ' + s.reason).join(' · '));
      clearTimeout(warnTimer.current);
      warnTimer.current = setTimeout(() => setAttachWarn(null), 6000);
    }
  };

  const iconTile = (color, Icon) => (
    <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '1a' }}>
      <Icon size={13} style={{ color }} />
    </span>
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#fafafa] min-h-0">
      {/* top bar */}
      <div className="h-14 shrink-0 flex items-center gap-2 px-5">
        <span className="text-[14px] font-medium text-zinc-800">Inui</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onOpenSettings}
            className="h-8 flex items-center gap-1.5 text-[12px] text-zinc-700 bg-white border border-black/[0.08] rounded-full px-3.5 hover:border-black/20"
          >
            Configuration <Settings size={12} />
          </button>
          <button
            onClick={() => {
              try {
                const url = location.href;
                if (navigator.share) navigator.share({ title: 'Inui', url });
                else {
                  navigator.clipboard.writeText(url);
                  setAttachWarn('Link copied to clipboard');
                  clearTimeout(warnTimer.current);
                  warnTimer.current = setTimeout(() => setAttachWarn(null), 2500);
                }
              } catch {
                /* ignore */
              }
            }}
            className="h-8 flex items-center gap-1.5 text-[12px] text-zinc-700 bg-white border border-black/[0.08] rounded-full px-3.5 hover:border-black/20"
          >
            Share <Share size={12} />
          </button>
          <button
            onClick={() => {
              // Home has no active thread yet — New Chat resets the composer.
              setValue('');
              setAttachments([]);
              setPalette(null);
              try {
                recRef.current?.stop();
              } catch {
                /* noop */
              }
              setMicOn(false);
            }}
            className="h-8 flex items-center gap-1.5 text-[12px] font-medium bg-[#101014] text-white rounded-full px-3.5 hover:bg-black"
            title="Start a new chat"
          >
            New Chat <Plus size={12} />
          </button>
        </div>
      </div>

      {/* scroll body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-[720px] mx-auto px-6 pt-12 pb-6">
          {/* greeting orb */}
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-full shadow-[0_6px_22px_rgba(59,102,235,0.5)]" style={{ background: 'linear-gradient(135deg,#6f9bff 0%,#3b66eb 100%)' }} />
          </div>
          <h1 className="text-center text-[30px] leading-tight font-semibold text-zinc-900">Hi, there</h1>
          <p className="text-center text-[13px] text-zinc-500 mt-1.5">Tell us what you need, and we'll handle the rest.</p>

          {/* three cards */}
          <div className="mt-8 grid sm:grid-cols-3 gap-2.5">
            {/* card 1: featured template (dark) */}
            <button
              onClick={() => go(TEMPLATES[0].prompt)}
              className="text-left rounded-2xl p-4 bg-[#17181c] text-white hover:bg-black transition-colors flex flex-col min-h-[150px]"
            >
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-semibold">SL</span>
                <span className="text-[11px] text-zinc-300">Starter</span>
                <span className="ml-auto text-[10px] bg-[#3b66eb] rounded-md px-1.5 py-0.5 font-medium">Popular</span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-zinc-200">{TEMPLATES[0].desc}</p>
              <span className="mt-auto w-full self-stretch pt-3 text-[11px] text-zinc-400">{TEMPLATES[0].title}</span>
            </button>

            {/* card 2: task list */}
            <button
              onClick={() => go(TEMPLATES[1].prompt)}
              className="text-left rounded-2xl p-4 bg-white border border-black/[0.07] hover:border-black/15 transition-colors flex flex-col min-h-[150px]"
            >
              <div className="space-y-2 mb-3">
                {['Multi-file React apps', 'Live canvas editing', 'One-click ZIP export'].map((t) => (
                  <div key={t} className="flex items-center gap-2 text-[12px] text-zinc-600">
                    <span className="w-4 h-4 rounded-md bg-zinc-100 flex items-center justify-center shrink-0">
                      <FileText size={9} className="text-zinc-500" />
                    </span>
                    {t}
                  </div>
                ))}
              </div>
              <div className="mt-auto w-full self-stretch flex items-center justify-between text-[11px] border-t border-black/[0.05] pt-2.5">
                <span className="text-zinc-400">Features</span>
                <span className="text-[#3b66eb] font-medium">Try it</span>
              </div>
            </button>

            {/* card 3: suggested prompt */}
            <button
              onClick={() => go(TEMPLATES[3].prompt)}
              className="text-left rounded-2xl p-4 bg-white border border-black/[0.07] hover:border-black/15 transition-colors flex flex-col min-h-[150px]"
            >
              <p className="text-[12.5px] leading-relaxed text-zinc-700">{TEMPLATES[3].prompt}</p>
              <span className="mt-auto w-full self-stretch pt-3 text-[11px] text-zinc-400 border-t border-black/[0.05]">Suggested prompt</span>
            </button>
          </div>

          {/* chips */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {TEMPLATES.slice(2, 6).map((t, i) => {
              const icons = [Zap, MessageSquare, Layers, ImageIcon];
              const Icon = icons[i % icons.length];
              return (
                <button
                  key={t.title}
                  onClick={() => go(t.prompt)}
                  className="h-9 flex items-center gap-2 text-[12px] text-zinc-700 bg-white border border-black/[0.07] rounded-full px-3 hover:border-black/20 transition-colors"
                >
                  {iconTile(t.color, Icon)}
                  {t.title}
                </button>
              );
            })}
          </div>

          {/* composer */}
          <div className="mt-8 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.04)] p-3.5">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {attachments.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 bg-zinc-100 border border-black/10 rounded-lg pl-1 pr-1.5 py-1 max-w-[220px]">
                    {a.kind === 'image' ? (
                      <img src={a.dataUrl} alt={a.name} className="w-8 h-8 rounded-md object-cover shrink-0" />
                    ) : (
                      <span className="text-[11px] text-zinc-500 ml-1">file</span>
                    )}
                    <span className="text-[11px] text-zinc-700 truncate">{a.name}</span>
                    <button onClick={() => setAttachments((arr) => arr.filter((x) => x.id !== a.id))} className="text-zinc-400 hover:text-black shrink-0 text-sm leading-none">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachWarn && <div className="text-[11px] text-amber-700 px-1 pb-1.5">{attachWarn}</div>}
            <textarea
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = Math.min(160, el.scrollHeight) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent && e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  go(value);
                }
              }}
              onPaste={(e) => {
                const files = e.clipboardData?.files;
                if (files && files.length) {
                  e.preventDefault();
                  addFiles(files);
                }
              }}
              placeholder="Ask me anything..."
              rows={2}
              className="w-full bg-transparent outline-none text-[14px] placeholder:text-zinc-400 resize-none max-h-40 overflow-y-auto"
            />
            <div className="flex items-center gap-1.5 mt-2">
              {/* palette picker */}
              <div className="relative">
                <button
                  onClick={() => setPalOpen((o) => !o)}
                  title="Color palette"
                  className="h-8 px-2.5 rounded-full border border-black/[0.08] flex items-center gap-1.5 text-[11px] text-zinc-600 hover:border-black/20"
                >
                  <span className="flex -space-x-1">
                    {(palette ? palette.colors : ['#7c3aed', '#ec4899', '#f59e0b', '#e5e7eb']).map((c, i) => (
                      <span key={i} className="w-3.5 h-3.5 rounded-full border border-white" style={{ background: c }} />
                    ))}
                  </span>
                  <span>Select Source</span>
                </button>
                {palOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPalOpen(false)} />
                    <div className="absolute bottom-10 left-0 z-50 w-56 bg-white border border-black/10 rounded-xl p-1.5 shadow-xl">
                      <button
                        onClick={() => {
                          setPalette(null);
                          setPalOpen(false);
                        }}
                        className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-black/5 text-zinc-500"
                      >
                        No palette (model decides)
                      </button>
                      {PALETTES.map((p) => (
                        <button
                          key={p.name}
                          onClick={() => {
                            setPalette(p);
                            setPalOpen(false);
                          }}
                          className="w-full flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg hover:bg-black/5"
                        >
                          <span className="flex -space-x-1">
                            {p.colors.map((c, i) => (
                              <span key={i} className="w-4 h-4 rounded-full border-2 border-white" style={{ background: c }} />
                            ))}
                          </span>
                          <span className="text-zinc-700">{p.name}</span>
                          {palette?.name === p.name && <Check size={13} className="ml-auto text-zinc-900" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="ml-auto flex items-center gap-1.5">
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
                <label
                  htmlFor={attachId}
                  title="Attach image or file"
                  className="h-8 flex items-center gap-1.5 text-[11px] text-zinc-600 border border-black/[0.08] rounded-full px-3 hover:border-black/20 cursor-pointer"
                >
                  <Paperclip size={12} /> Attach
                </label>
                <button
                  onClick={toggleVoice}
                  title="Voice input"
                  className={`h-8 flex items-center gap-1.5 text-[11px] rounded-full px-3 border transition-colors ${
                    micOn ? 'bg-red-50 border-red-300 text-red-600' : 'text-zinc-600 border-black/[0.08] hover:border-black/20'
                  }`}
                >
                  <Mic size={12} /> Voice
                </button>
                <button
                  onClick={() => go(value)}
                  className={`h-8 flex items-center gap-1.5 text-[12px] font-medium rounded-full px-4 transition-colors ${
                    value.trim() || attachments.length ? 'bg-[#101014] text-white hover:bg-black' : 'bg-zinc-100 text-zinc-400'
                  }`}
                >
                  <ArrowUp size={13} /> Send
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-zinc-400 mt-4">
            Inui may display inaccurate info, so please double check the response.{' '}
            <span className="underline">Your Privacy</span> & <span className="underline">Inui</span>
          </p>

          {!hasKey && (
            <p className="text-center text-xs text-amber-700 mt-3">
              Add your Base URL + API key + Model ID in Configuration to start generating.
            </p>
          )}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
