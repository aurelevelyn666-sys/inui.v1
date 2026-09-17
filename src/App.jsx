import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings, Home, ChevronDown, GitBranch, X, Menu, Eye, PanelLeft, Loader2, FileText, Terminal as TerminalIcon, GitCommit } from 'lucide-react';
import HomeView from './components/HomeView.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import ChatPane from './components/ChatPane.jsx';
import PreviewCanvas from './components/PreviewCanvas.jsx';
import Inspector from './components/Inspector.jsx';
import AgentPanel from './components/AgentPanel.jsx';
import LeftPanel from './components/LeftPanel.jsx';
import ConvoSidebar from './components/ConvoSidebar.jsx';
import IconRail from './components/IconRail.jsx';
import BuildsView from './components/BuildsView.jsx';
import TemplatesView from './components/TemplatesView.jsx';
import { TEMPLATES } from './lib/templates.js';
import PreviewMini from './components/PreviewMini.jsx';
import FileTree from './components/FileTree.jsx';
import DiffView from './components/DiffView.jsx';
import TerminalPanel from './components/TerminalPanel.jsx';
import { loadSettings, saveSettings, buildSystemPrompt, buildPatchSystemPrompt, buildImagePrompt, sendChatCompletionRetry, messageToContent } from './lib/llm.js';
import { STARTER_FILES, normalizePath, pickEntry, parseAssistantOutput, recoverFileFromText, parsePatchFromText, auditFiles, extractJsonFiles, splitComponentsFromText, extractImages, verifyProject, buildSrcDoc } from './lib/files.js';
import { connectMcpServer, callMcpTool, DEMO_TOOLS, WEB_SEARCH_TOOL } from './lib/mcp.js';
import { getActiveSkills } from './lib/builtin-skills.js';
import { exportProjectZip, downloadBlob } from './lib/zip.js';

let idc = 1;
const nid = () => 'n' + Date.now().toString(36) + (idc++);

const isLocal = (url) => /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\.|:\d{4,5}/.test(String(url || ''));

const CONVO_KEY = 'inui.convos.v1';
function readConvos() {
  try {
    const a = JSON.parse(localStorage.getItem(CONVO_KEY) || '[]');
    if (!Array.isArray(a)) return [];
    // Drop empty husks (abandoned "New chat" entries) — they are noise in history.
    // Also drop hollow ones: no user message and starter files (e.g. a send
    // blocked for a missing API key leaves only an error note behind).
    return a.filter(
      (c) =>
        ((c.messages?.length || 0) > 0 || Object.keys(c.files || {}).length > 2) &&
        ((c.messages || []).some((m) => m.role === 'user') || Object.keys(c.files || {}).length > 2)
    );
  } catch {
    return [];
  }
}
// Stored copies drop raw dumps + image bytes (too big for localStorage).
function stripMsgs(msgs) {
  return (msgs || []).map((m) => {
    const c = { ...m };
    delete c.raw;
    if (c.attachments) {
      c.attachments = c.attachments.map((a) => (a.kind === 'image' ? { ...a, dataUrl: undefined } : a));
    }
    return c;
  });
}
function titleFor(msgs) {
  const u = (msgs || []).find((m) => m.role === 'user');
  const t = String(u?.content || '').trim();
  return t ? t.slice(0, 38) : 'New chat';
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState('home');

  // Real dark mode: persist flag, reflect on <html> for the CSS theme layer.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', !!settings.darkMode);
  }, [settings.darkMode]);
  const toggleDark = () => updateSettings({ darkMode: !settingsRef.current.darkMode });
  // Read stored history once — every initializer below derives from it instead
  // of re-parsing localStorage (waste + risk of mid-mount inconsistency).
  const [initial] = useState(() => {
    const list = readConvos();
    return { list, first: list[0] };
  });
  const [messages, setMessages] = useState(() => initial.first?.messages || []);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [files, setFiles] = useState(() => {
    const f = initial.first?.files;
    return f && Object.keys(f).length ? f : STARTER_FILES;
  });
  const [activeFile, setActiveFile] = useState('/App.jsx');
  const [entryOverride, setEntryOverride] = useState(null);
  const [overrides, setOverrides] = useState(() => initial.first?.overrides || { styles: {}, texts: {} });
  const [baked, setBaked] = useState(overrides);
  const [liveApply, setLiveApply] = useState(null);
  const [selection, setSelection] = useState(null);
  const [canvasMode, setCanvasMode] = useState('select');
  const [paneTab, setPaneTab] = useState('chat');
  const [composerMode, setComposerMode] = useState('build');
  const [hasBuild, setHasBuild] = useState(() => Object.keys(initial.first?.files || {}).length > 2);
  // Only auto-open the preview on the false->true transition (a fresh build),
  // never when the user already dismissed it.
  const prevBuild = useRef(hasBuild);
  const [mcpServers, setMcpServers] = useState([
    // Built-in read-only tools (web search). Always on, runs without approval.
    { url: 'local://builtin', status: 'connected', tools: [{ ...WEB_SEARCH_TOOL, enabled: true }], error: null }
  ]);
  const [mcpInput, setMcpInput] = useState('');
  // conversations (persisted sidebar)
  const [convos, setConvos] = useState(initial.list);
  const [activeConvoId, setActiveConvoId] = useState(() => initial.first?.id || null);
  const [convoSearch, setConvoSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [sideMini, setSideMini] = useState(false);
  const convosRef = useRef([]);
  convosRef.current = convos;
  const activeConvoIdRef = useRef(null);
  activeConvoIdRef.current = activeConvoId;
  const quotaWarned = useRef(false);

  const persistConvos = (list) => {
    const write = (l) => localStorage.setItem(CONVO_KEY, JSON.stringify(l));
    try {
      write(list);
      quotaWarned.current = false;
      return;
    } catch {
      /* fall through to progressive lightening */
    }
    // Quota hit: shed weight in stages so a reload still recovers work
    // instead of silently going memory-only forever.
    const slimMessages = (l) =>
      l.map((c) => ({
        ...c,
        messages: (c.messages || []).map((m) => ({
          ...m,
          raw: undefined,
          content: String(m.content || '').slice(0, 4000)
        }))
      }));
    const stages = [
      (l) => l.slice(0, 10),
      slimMessages,
      (l) => l.slice(0, 5)
    ];
    let light = list;
    for (const fn of stages) {
      try {
        light = fn(light);
        write(light);
        quotaWarned.current = false;
        showToast('History trimmed to fit storage — oldest chats dropped');
        return;
      } catch {
        /* try the next stage */
      }
    }
    if (!quotaWarned.current) {
      quotaWarned.current = true;
      showToast('History too large — this session stays in memory only');
    }
  };
  // Fold live state into the stored list (creates the entry if needed).
  const buildList = () => {
    let list = convosRef.current.slice();
    let id = activeConvoIdRef.current;
    // Transient-only sessions (e.g. a send blocked for a missing API key)
    // are guidance, not history — never create an entry for them.
    const memorable = stripMsgs(messagesRef.current).filter((m) => !m.transient);
    if (!memorable.length && Object.keys(filesRef.current).length <= 2) {
      return list.slice(0, 20);
    }
    if (!id) {
      id = nid();
      setActiveConvoId(id);
    }
    // Clone: never persist live object references (later mutation would
    // corrupt history), and cap the list AFTER insert, not before.
    const entry = {
      id,
      title: titleFor(messagesRef.current),
      updatedAt: Date.now(),
      messages: memorable,
      files: { ...filesRef.current },
      overrides: JSON.parse(JSON.stringify(overridesRef.current || { styles: {}, texts: {} }))
    };
    if (list.some((c) => c.id === id)) list = list.map((c) => (c.id === id ? entry : c));
    else list = [entry, ...list];
    return list.slice(0, 20);
  };
  const isSessionEmpty = () =>
    !messagesRef.current.length && Object.keys(filesRef.current).length <= 2;

  useEffect(() => {
    const t = setTimeout(() => {
      // Never persist an empty session — no ghost "New chat" rows in history.
      if (isSessionEmpty()) return;
      const list = buildList();
      setConvos(list);
      persistConvos(list);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, files, overrides, activeConvoId]);

  // Closing the tab inside the 900ms debounce window must not lose the last
  // edit — flush synchronously on hide/unload (best effort, never throws).
  useEffect(() => {
    const flush = () => {
      try {
        if (isSessionEmpty()) return;
        const list = buildList();
        persistConvos(list);
      } catch {
        /* unload path — nothing to do */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Multi-tab: another tab saving history refreshes our sidebar list. The
  // active workspace is never touched (no clobbering) — and we stay quiet
  // while a generation owns the state.
  useEffect(() => {
    const onStorage = (e) => {
      if (!e || e.key !== CONVO_KEY || busyRef.current) return;
      try {
        const list = JSON.parse(e.newValue || '[]');
        if (Array.isArray(list)) {
          convosRef.current = list;
          setConvos(list);
        }
      } catch {
        /* corrupt write from elsewhere — ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasBuild && !prevBuild.current) setShowPreview(true);
    prevBuild.current = hasBuild;
  }, [hasBuild]);

  const resetWorkspace = () => {
    messagesRef.current = [];
    setMessages([]);
    filesRef.current = { ...STARTER_FILES };
    setFiles(filesRef.current);
    setActiveFile('/App.jsx');
    setEntryOverride(null);
    setHasBuild(false);
    overridesRef.current = { styles: {}, texts: {} };
    setOverrides(overridesRef.current);
    setBaked(overridesRef.current);
    setLiveApply(null);
    setSelection(null);
    setPinned(null);
    setRuntimeErrors([]);
    clearEphemera();
  };
  // Per-convo ephemera: approvals, diffs, audit, canvas annotations. They are
  // memory-only and tied to the loaded files — never leak them into another
  // convo (stale approvals/diffs acting on the wrong files).
  const clearEphemera = () => {
    setPendingTools([]);
    setVersions([]);
    setFileChanges([]);
    setAudit(null);
    setLocked({});
    setComments([]);
    setHasPaste(false);
    setLayers([]);
    try {
      copiedRef.current = null;
    } catch {
      /* noop */
    }
  };
  // Every "start over" entry routes through here: flush dirty work to history
  // (even inside the persist debounce window), abandon in-flight streams so
  // they can't write into the fresh workspace, then open a clean thread.
  const startFreshThread = () => {
    abandonWork();
    if (!isSessionEmpty()) {
      const list = buildList();
      setConvos(list);
      persistConvos(list);
    }
    resetWorkspace();
    setActiveConvoId(nid());
    setShowPreview(false);
  };
  const newConvo = () => {
    startFreshThread();
    // No placeholder entry here — history gains the chat only once it has content.
    setView('chat');
    setSideOpen(false);
  };
  const switchConvo = (id) => {
    if (id === activeConvoIdRef.current) {
      setSideOpen(false);
      // Already loaded (e.g. right after a reload while on Home) — just open it.
      setView('chat');
      return;
    }
    abandonWork();
    if (!isSessionEmpty()) {
      const list = buildList();
      setConvos(list);
      persistConvos(list);
    }
    const c = convosRef.current.find((x) => x.id === id);
    if (!c) return;
    messagesRef.current = c.messages || [];
    setMessages(messagesRef.current);
    filesRef.current = c.files && Object.keys(c.files).length ? { ...c.files } : { ...STARTER_FILES };
    setFiles(filesRef.current);
    setHasBuild(Object.keys(filesRef.current).length > 2);
    setActiveFile(pickEntry(filesRef.current));
    setEntryOverride(null);
    overridesRef.current = c.overrides ? JSON.parse(JSON.stringify(c.overrides)) : { styles: {}, texts: {} };
    setOverrides(overridesRef.current);
    setBaked(overridesRef.current);
    setLiveApply(null);
    setSelection(null);
    setPinned(null);
    setRuntimeErrors([]);
    setPendingTools([]);
    clearEphemera();
    setActiveConvoId(id);
    setSideOpen(false);
    setShowPreview(Object.keys(filesRef.current).length > 2);
    setView('chat');
  };
  const deleteConvo = (id) => {
    abandonWork();
    const list = convosRef.current.filter((c) => c.id !== id);
    setConvos(list);
    persistConvos(list);
    if (id === activeConvoIdRef.current) {
      resetWorkspace();
      setActiveConvoId(nid());
      setShowPreview(false);
    }
  };

  // Home always starts a brand-new chat (never continues the recent one).
  const homeSubmit = async (text, atts) => {
    startFreshThread();
    await run(text, undefined, atts);
  };
  const [pendingTools, setPendingTools] = useState([]);
  const [runtimeErrors, setRuntimeErrors] = useState([]);
  const [folding, setFolding] = useState(false);
  // Framer-style right panel: Agent session, pinned scope, versions, audit
  const [rightTab, setRightTab] = useState('design');
  const [agentBusy, setAgentBusy] = useState(false);
  const [pinned, setPinned] = useState(null);
  const [versions, setVersions] = useState([]);
  const [audit, setAudit] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [fixingAudit, setFixingAudit] = useState(false);
  // Framer shell state
  const [leftTab, setLeftTab] = useState('pages');
  const [layers, setLayers] = useState([]);
  const [layersRequest, setLayersRequest] = useState(0);
  const [selectLayerSignal, setSelectLayerSignal] = useState(null);
  const [toast, setToast] = useState(null);
  const [branchOpen, setBranchOpen] = useState(false);
  // canvas ops: locked layers, comments, clipboard, command bridge
  const [locked, setLocked] = useState({});
  const [comments, setComments] = useState([]);
  const [hasPaste, setHasPaste] = useState(false);
  const [cmdSignal, setCmdSignal] = useState(null);
  const copiedRef = useRef(null);
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  // Codex-like panels: file tree, diff, terminal
  const [fileChanges, setFileChanges] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [rightPanelTab, setRightPanelTab] = useState('chat');
  const addLog = (type, message) => {
    setActivityLogs((prev) => [...prev.slice(-50), { id: nid(), type, message, time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);
  };
  // generation timing + cancellation
  const [liveStats, setLiveStats] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | contacting | streaming | building
  const abortRef = useRef(null);
  const timeoutRef = useRef(null);
  const buildTimer = useRef(null);
  const t0Ref = useRef(0);
  const tokRef = useRef(0);
  const tickRef = useRef(0);
  const genRef = useRef(0);
  // Set while any generation pipeline is in flight (stream, verify, repair,
  // tools). Guards run() against overlapping generations that would share
  // abortRef/streamingText and corrupt the file merge.
  const busyRef = useRef(false);
  // Async audit runs are tagged so a convo switch can't file results wrong.
  const auditGen = useRef(0);
  // Set only by the Stop button so the abort catch can tell user-cancel
  // apart from convo-switch abandonment (which stays silent).
  const userStoppedRef = useRef(false);
  const startGen = () => {
    genRef.current += 1;
    busyRef.current = true;
    userStoppedRef.current = false;
    clearTimeout(buildTimer.current);
    t0Ref.current = Date.now();
    tokRef.current = 0;
    tickRef.current = 0;
    abortRef.current = new AbortController();
    clearTimeout(timeoutRef.current);
    setPhase('contacting');
    // Hard stop: never hang forever on a stalled stream.
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = 'fired';
      try {
        abortRef.current?.abort();
      } catch {
        /* noop */
      }
    }, 360000);
    setLiveStats({ secs: 0, tokens: 0 });
    return genRef.current;
  };
  // The selection agent gets its own abort controller + timeout: sharing the
  // main abortRef meant starting a main generation silently stole (or leaked)
  // the agent request, and the agent could hang forever with no 6-min stop.
  const agentAbortRef = useRef(null);
  const agentTimeoutRef = useRef(null);
  // Abandon any in-flight generation so late responses never land in the wrong thread.
  const abandonWork = () => {
    genRef.current += 1;
    busyRef.current = false;
    userStoppedRef.current = false;
    auditGen.current += 1;
    try {
      abortRef.current?.abort();
    } catch {
      /* noop */
    }
    try {
      agentAbortRef.current?.abort();
    } catch {
      /* noop */
    }
    clearTimeout(agentTimeoutRef.current);
    clearTimeout(timeoutRef.current);
    clearTimeout(buildTimer.current);
    setStreaming(false);
    clearStreamText();
    setLiveStats(null);
    setPhase('idle');
    setAgentBusy(false);
  };
  // Token storm guard: flushing every token re-renders + copies the whole
  // transcript per token (O(n²) on 100KB outputs). Buffer ~120ms instead.
  const streamBuf = useRef('');
  const streamFlushTimer = useRef(null);
  const flushStreamText = () => {
    const b = streamBuf.current;
    streamBuf.current = '';
    if (b) setStreamingText((s) => s + b);
  };
  const clearStreamText = () => {
    streamBuf.current = '';
    clearTimeout(streamFlushTimer.current);
    streamFlushTimer.current = null;
    setStreamingText('');
  };
  const countToken = (d) => {
    if (tokRef.current === 0) setPhase('streaming');
    tokRef.current += String(d).length;
    streamBuf.current += d;
    if (!streamFlushTimer.current) {
      streamFlushTimer.current = setTimeout(() => {
        streamFlushTimer.current = null;
        flushStreamText();
      }, 120);
    }
    const now = Date.now();
    if (now - tickRef.current > 500) {
      tickRef.current = now;
      setLiveStats({ secs: (now - t0Ref.current) / 1000, tokens: Math.round(tokRef.current / 4) });
    }
  };
  const finishStats = (full) => {
    clearTimeout(timeoutRef.current);
    const secs = (Date.now() - t0Ref.current) / 1000;
    setLiveStats(null);
    return { tokens: Math.max(1, Math.round(String(full).length / 4)), secs: Math.round(secs) };
  };
  const stopGen = () => {
    // User-cancel: invalidate this generation so nothing commits afterwards
    // (files, messages, tool calls), but remember it was a Stop — not a convo
    // switch — so the catch below reports "stopped by user" instead of silence.
    userStoppedRef.current = true;
    genRef.current += 1;
    busyRef.current = false;
    try {
      abortRef.current?.abort();
    } catch {
      /* noop */
    }
    try {
      agentAbortRef.current?.abort();
    } catch {
      /* noop */
    }
  };

  // mirrors for async loops
  const messagesRef = useRef([]);
  const filesRef = useRef(files);
  const overridesRef = useRef(overrides);
  const settingsRef = useRef(settings);
  const selectionRef = useRef(null);
  messagesRef.current = messages;
  filesRef.current = files;
  overridesRef.current = overrides;
  settingsRef.current = settings;

  const pushMsgs = (arr) => {
    messagesRef.current = [...messagesRef.current, ...arr];
    setMessages(messagesRef.current);
  };
  // selection mirror for event/async handlers (onPatch adopts fresh geometry)
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // (messageToContent lives in lib/llm.js so it can be unit-tested)

  const updateSettings = (partial) => {
    // Updaters must stay pure (StrictMode double-invokes them) — persist in
    // an effect below instead of inside setSettings.
    setSettings((s) => ({ ...s, ...partial }));
  };
  const lastSettingsSave = useRef(true);
  useEffect(() => {
    const ok = saveSettings(settings);
    // Toast only on the ok->fail transition, not on every keystroke.
    if (!ok && lastSettingsSave.current) showToast('Settings too large — could not save in this browser');
    lastSettingsSave.current = ok;
  }, [settings]);

  // debounced overrides -> preview rebuild
  useEffect(() => {
    const t = setTimeout(() => setBaked(overrides), 800);
    return () => clearTimeout(t);
  }, [overrides]);

  // keep server entries for configured URLs
  useEffect(() => {
    setMcpServers((prev) => {
      const have = new Set(prev.map((s) => s.url));
      const add = settings.mcpUrls
        .filter((u) => u && !have.has(u))
        .map((url) => ({ url, status: 'idle', tools: [], error: null }));
      return add.length ? [...prev, ...add] : prev;
    });
  }, [settings.mcpUrls]);

  const enabledTools = useMemo(
    () =>
      mcpServers.flatMap((s) =>
        s.status === 'connected' ? s.tools.filter((t) => t.enabled !== false).map((t) => ({ ...t, serverUrl: s.url })) : []
      ),
    [mcpServers]
  );
  const enabledToolsRef = useRef([]);
  enabledToolsRef.current = enabledTools;

  // Multi-file navigation: preview entry (page) switcher.
  const entries = useMemo(
    () => Object.keys(files).filter((f) => f.endsWith('.jsx') || f.endsWith('.js')).sort(),
    [files]
  );
  const entry = entryOverride && files[entryOverride] ? entryOverride : pickEntry(files);
  const setEntry = (p) => {
    setEntryOverride(p);
    setSelection(null);
  };

  // ---------- chat / agent loop ----------
  const continueFrom = async (history, depth = 0) => {
    setStreaming(true);
    clearStreamText();
    setFileChanges([]);
    addLog('info', 'Generating response…');
    const myGen = startGen();
    const filesSnapshot = Object.entries(filesRef.current)
      .map(([p, c]) => '\n--- ' + p + ' ---\n' + c)
      .join('\n')
      .slice(0, 22000);
    const system =
      buildSystemPrompt({ files: filesRef.current, mcpTools: enabledToolsRef.current, overrides: overridesRef.current, skills: getActiveSkills(settingsRef.current) }) +
      '\nCURRENT FILE CONTENTS:' +
      filesSnapshot;
    const llmHistory = [
      { role: 'system', content: system },
      ...history.map((m, i) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: messageToContent(m, i === history.length - 1)
      }))
    ];
    let full = '';
    try {
      full = await sendChatCompletionRetry({
        baseUrl: settingsRef.current.baseUrl,
        apiKey: settingsRef.current.apiKey,
        model: settingsRef.current.modelId,
        messages: llmHistory,
        signal: abortRef.current?.signal,
        onToken: countToken
      });
    } catch (e) {
      setLiveStats(null);
      clearTimeout(timeoutRef.current);
      setPhase('idle');
      busyRef.current = false;
      const wasStopped = userStoppedRef.current;
      userStoppedRef.current = false;
      const alive = myGen === genRef.current;
      if (!alive && !wasStopped) {
        // abandoned (convo switched) — stay silent, and never touch UI state
        // a newer generation may already own (busyRef is true then)
        if (!busyRef.current) {
          setStreaming(false);
          clearStreamText();
        }
        return;
      }
      if (e && (e.name === 'AbortError' || /abort/i.test(String(e.message)))) {
        const timedOut = timeoutRef.current === 'fired' && alive;
        addLog('error', timedOut ? 'Generation timed out (6 min limit)' : 'Generation stopped by user');
        if (alive || wasStopped) {
          pushMsgs([{
            role: 'assistant',
            content: timedOut
              ? 'Generation timed out after 6 minutes with no completion. Try a smaller request (one section at a time) or a faster model.'
              : 'Generation stopped by user.'
          }]);
        }
      } else {
        if (!alive) {
          // failed after abandonment — must not land in the new convo
          if (!busyRef.current) {
            setStreaming(false);
            clearStreamText();
            setFolding(false);
          }
          return;
        }
        addLog('error', 'Generation failed: ' + String((e && e.message) || e).slice(0, 120));
        pushMsgs([{ role: 'assistant', content: String((e && e.message) || e), error: true }]);
      }
      setStreaming(false);
      clearStreamText();
      setFolding(false);
      return;
    }
    if (myGen !== genRef.current) {
      // abandoned mid-flight (convo switched) — same ownership rule as above
      if (!busyRef.current) {
        setStreaming(false);
        clearStreamText();
        setLiveStats(null);
        setPhase('idle');
        setFolding(false);
      }
      return;
    }
    try {
    const { chatText, files: parsedFiles, toolCalls } = parseAssistantOutput(full);
    // Fallback: some models emit valid file JSON the fence parser missed
    // (array shape, odd labels, or unfenced). Never lose generated files.
    let newFiles = parsedFiles;
    if (!Object.keys(newFiles).length) {
      const fb = extractJsonFiles(full);
      if (Object.keys(fb).length) newFiles = fb;
    }
    // Last resort: carve components out of free-form replies so the canvas
    // still updates instead of dying silently.
    let autoNote = '';
    if (!Object.keys(newFiles).length && !toolCalls.length) {
      const split = splitComponentsFromText(full);
      if (Object.keys(split).length) {
        newFiles = split;
        autoNote = 'Healed reply format — auto-saved ' + Object.keys(split).length + ' file(s): ' + Object.keys(split).join(', ') + '.';
      }
    }
    const paths = Object.keys(newFiles);
    if (paths.length) {
      const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user');
      snapshot('Agent: ' + String(lastUser?.content || 'generate').slice(0, 42));
      const merged = { ...filesRef.current };
      const changes = [];
      paths.forEach((p) => {
        const np = normalizePath(p);
        changes.push({ path: np, oldContent: merged[np], newContent: newFiles[p] });
        merged[np] = newFiles[p];
      });
      filesRef.current = merged;
      setFiles(merged);
      setHasBuild(true);
      setFileChanges(changes);
      addLog('success', 'Updated ' + paths.length + ' file(s): ' + paths.join(', '));
      const entry = pickEntry(merged);
      if (entry) setActiveFile(entry);
    }
    // Self-healing verify: transpile + resolve locally, auto-repair up to 2 passes.
    let repairNote = '';
    if (paths.length) {
      setPhase('verifying');
      snapshot('Before auto-repair');
      let problems = [];
      try {
        problems = verifyProject(filesRef.current);
      } catch (e) {
        problems = [{ path: '(verify)', error: String((e && e.message) || e).slice(0, 160) }];
      }
      let repairs = 0;
      while (problems.length && repairs < 2) {
        repairs++;
        setPhase('repairing');
        const desc = problems.map((p) => p.path + ': ' + p.error).join('\n');
        const snap2 = Object.entries(filesRef.current)
          .map(([p, c]) => '\n--- ' + p + ' ---\n' + c)
          .join('\n')
          .slice(0, 14000);
        let fixFull = '';
        try {
          fixFull = await sendChatCompletionRetry({
            baseUrl: settingsRef.current.baseUrl,
            apiKey: settingsRef.current.apiKey,
            model: settingsRef.current.modelId,
            expectContent: true,
            messages: [
              {
                role: 'system',
                content: buildSystemPrompt({ files: filesRef.current, mcpTools: [], overrides: {}, skills: getActiveSkills(settingsRef.current) }) +
                  '\nREPAIR TASK: the previous output has build errors. Fix ONLY what is broken, return the COMPLETE corrected FILES_JSON for ALL files (full contents, no truncation).'
              },
              { role: 'user', content: 'These build errors were detected:\n' + desc + '\nCurrent files:\n' + snap2 }
            ],
            signal: abortRef.current?.signal,
            onToken: countToken
          });
        } catch (e) {
          break;
        }
        // The repair round-trip yields — a Stop/switch/new-chat during it must
        // not write another convo's files into this one.
        if (myGen !== genRef.current) break;
        const pf = parseAssistantOutput(fixFull);
        let fixed = pf.files;
        if (!Object.keys(fixed).length) fixed = extractJsonFiles(fixFull);
        if (!Object.keys(fixed).length) break;
        const m2 = { ...filesRef.current };
        Object.keys(fixed).forEach((p) => {
          m2[normalizePath(p)] = fixed[p];
        });
        filesRef.current = m2;
        setFiles(m2);
        try {
          problems = verifyProject(filesRef.current);
        } catch (e) {
          problems = [];
        }
      }
      if (repairs > 0) {
        repairNote = problems.length
          ? 'Self-check: ' + problems.length + ' issue(s) remain after ' + repairs + ' repair pass(es) — open the preview errors or ask for a fix.'
          : 'Self-check: fixed build errors automatically (' + repairs + ' pass(es)).';
      }
    }
    // Preview rebuild phase — visible progress until the canvas settles.
    clearTimeout(buildTimer.current);
    if (paths.length) {
      setPhase('building');
      addLog('success', 'Build complete — preview updated');
      buildTimer.current = setTimeout(() => setPhase('idle'), 2000);
    } else {
      setPhase('idle');
      addLog('info', 'Response received (no file changes)');
    }
    // A Stop/switch/new-chat during verify+repair must not commit anything.
    if (myGen !== genRef.current) {
      if (!busyRef.current) {
        setStreaming(false);
        clearStreamText();
        setLiveStats(null);
        setPhase('idle');
        setFolding(false);
      }
      return;
    }
    pushMsgs([{
      role: 'assistant',
      content: (chatText || '(files updated — no text reply)') + (autoNote ? '\n' + autoNote : '') + (repairNote ? '\n' + repairNote : ''),
      files: paths,
      genStats: finishStats(full),
      ...(paths.length === 0 && !toolCalls.length ? { noFiles: true, raw: full.slice(0, 60000) } : {})
    }]);
    clearStreamText();
    if (toolCalls.length && depth < 3) {
      // Same ownership rule before running tools or recursing — approvals and
      // results must never leak into a different convo.
      if (myGen !== genRef.current) {
        if (!busyRef.current) {
          setStreaming(false);
          clearStreamText();
          setLiveStats(null);
          setPhase('idle');
          setFolding(false);
        }
        return;
      }
      // Built-in read-only tools (web.search) run automatically, no approval needed.
      const findTool = (tc) =>
        enabledToolsRef.current.find((t) => t.name === tc.tool && (!tc.serverUrl || t.serverUrl === tc.serverUrl)) ||
        enabledToolsRef.current.find((t) => t.name === tc.tool);
      const auto = toolCalls.filter((tc) => {
        const m = findTool(tc);
        return m && m.serverUrl === 'local://builtin';
      });
      const manual = toolCalls.filter((tc) => auto.indexOf(tc) < 0);
      for (const tc of auto) await execToolCall(tc);
      if (manual.length) {
        if (settingsRef.current.autoApproveTools) {
          for (const tc of manual) await execToolCall(tc);
          await continueFrom(messagesRef.current, depth + 1);
          return;
        }
        setPendingTools((ps) => [...ps, ...manual.map((tc) => ({ id: nid(), depth, ...tc }))]);
      } else if (auto.length) {
        await continueFrom(messagesRef.current, depth + 1);
        return;
      }
    }
    setStreaming(false);
    setFolding(false);
    busyRef.current = false;
  } catch (err) {
    // Safety net: anything thrown while applying the reply (parsers, verify,
    // snapshots) must never leave streaming=true forever with a dead UI.
    clearTimeout(buildTimer.current);
    if (myGen === genRef.current) {
      busyRef.current = false;
      try {
        addLog('error', 'Reply processing failed: ' + String((err && err.message) || err).slice(0, 140));
      } catch {
        /* noop */
      }
      pushMsgs([{
        role: 'assistant',
        content: 'Something broke while applying that reply — your files were NOT changed. Try Regenerate or a smaller request. (' + String((err && err.message) || err).slice(0, 120) + ')',
        error: true
      }]);
      setStreaming(false);
      clearStreamText();
      setFolding(false);
      setPhase('idle');
      setLiveStats(null);
    }
  }
  };

  const execToolCall = async (tc) => {
    const match =
      enabledToolsRef.current.find((t) => t.name === tc.tool && (!tc.serverUrl || t.serverUrl === tc.serverUrl)) ||
      enabledToolsRef.current.find((t) => t.name === tc.tool);
    if (!match) {
      pushMsgs([{ role: 'tool', tool: tc.tool, content: 'ERROR: tool not connected. Connect its MCP server first.' }]);
      return 'ERROR: tool not connected';
    }
    const server = mcpServersRef.current.find((s) => s.url === match.serverUrl);
    try {
      const result = await callMcpTool(server, match.name, tc.args || {});
      pushMsgs([{ role: 'tool', tool: match.name, content: String(result).slice(0, 6000) }]);
      return String(result).slice(0, 6000);
    } catch (e) {
      pushMsgs([{ role: 'tool', tool: match.name, content: 'ERROR: ' + String((e && e.message) || e) }]);
      return 'ERROR: ' + String((e && e.message) || e);
    }
  };
  const mcpServersRef = useRef([]);
  mcpServersRef.current = mcpServers;

  const run = async (prompt, forceMode, attachments) => {
    if (!settingsRef.current.apiKey && !isLocal(settingsRef.current.baseUrl)) {
      // Transient: guidance only, never persisted to history (a blocked send
      // must not leave a hollow "New chat" entry behind).
      pushMsgs([{ role: 'assistant', content: 'Set your Base URL + API key + Model ID first (gear icon, top right).', error: true, transient: true }]);
      setView('chat');
      setSettingsOpen(true);
      return;
    }
    // One pipeline at a time: overlapping runs share the abort controller and
    // the streaming buffer and corrupt the file merge. Refuse with guidance.
    if (busyRef.current) {
      showToast('Already generating — press Stop to cancel it first');
      return;
    }
    const mode = forceMode || composerMode;
    setView('chat');
    setPaneTab('chat');
    pushMsgs([{ role: 'user', content: prompt, ...(attachments?.length ? { attachments } : {}) }]);
    if (mode === 'image') await runImage(prompt);
    else await continueFrom(messagesRef.current, 0);
  };

  // IMAGE mode: generate via a connected image MCP tool.
  const runImage = async (prompt) => {
    setStreaming(true);
    clearStreamText();
    const myGen = startGen();
    const tools = enabledToolsRef.current.filter((t) =>
      /image|picture|photo|draw|render|generate|art|video/i.test(t.name + ' ' + (t.description || ''))
    );
    if (!tools.length) {
      pushMsgs([{
        role: 'assistant',
        content: 'No image tool connected. Add an image MCP server (e.g. Higgsfield) in settings or the MCP tab — or “Add local demo tools” to try the flow. Then resend your prompt.',
        error: true
      }]);
      setStreaming(false);
      clearStreamText();
      setLiveStats(null);
      setPhase('idle');
      busyRef.current = false;
      clearTimeout(timeoutRef.current);
      return;
    }
    const system = buildImagePrompt({ tools });
    // The just-pushed user message (with attachments) is last — include it as
    // multimodal content instead of the bare prompt string, otherwise attached
    // images/files are stored but never sent to the model.
    const lastUser = messagesRef.current[messagesRef.current.length - 1];
    let full = '';
    try {
      full = await sendChatCompletionRetry({
        baseUrl: settingsRef.current.baseUrl,
        apiKey: settingsRef.current.apiKey,
        model: settingsRef.current.modelId,
        messages: [
          { role: 'system', content: system },
          ...messagesRef.current.slice(-7, -1).map((m) => ({ role: 'user', content: messageToContent(m, true, 1500) })),
          { role: 'user', content: messageToContent(lastUser, true, 6000) }
        ],
        signal: abortRef.current?.signal,
        onToken: countToken
      });
    } catch (e) {
      setLiveStats(null);
      clearTimeout(timeoutRef.current);
      setPhase('idle');
      busyRef.current = false;
      const wasStopped = userStoppedRef.current;
      userStoppedRef.current = false;
      if (myGen !== genRef.current && !wasStopped) {
        // abandoned — stay silent, don't touch a newer generation's UI
        if (!busyRef.current) {
          setStreaming(false);
          clearStreamText();
        }
        return;
      }
      const isAbort = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
      pushMsgs([{
        role: 'assistant',
        content: wasStopped ? 'Generation stopped by user.' : String((e && e.message) || e),
        ...(!wasStopped && !isAbort ? { error: true } : {})
      }]);
      setStreaming(false);
      clearStreamText();
      return;
    }
    if (myGen !== genRef.current) {
      if (!busyRef.current) {
        setStreaming(false);
        clearStreamText();
        setLiveStats(null);
        setPhase('idle');
      }
      return;
    }
    const { chatText, toolCalls } = parseAssistantOutput(full);
    if (toolCalls.length) {
      const tc = toolCalls[0];
      const known = enabledToolsRef.current.some((t) => t.name === tc.tool);
      const result = await execToolCall(known ? tc : { tool: tools[0].name, args: tc.args || { prompt } });
      const imgs = extractImages(result || '');
      pushMsgs([{
        role: 'assistant',
        content: (chatText || 'Image ready.') + (imgs.length ? '' : '\nThe tool returned no image URL — see tool result above.'),
        images: imgs,
        genStats: finishStats(full)
      }]);
    } else {
      const imgs = extractImages(full);
      pushMsgs([{ role: 'assistant', content: chatText || 'No image produced.', images: imgs, genStats: finishStats(full) }]);
    }
    clearStreamText();
    setStreaming(false);
    setPhase('idle');
    busyRef.current = false;
    clearTimeout(timeoutRef.current);
  };

  // Synchronously-claimed approvals: double-clicking Run can't exec twice.
  const approvingRef = useRef(new Set());
  const onRunTool = async (id) => {
    const tc = pendingTools.find((p) => p.id === id);
    if (!tc || approvingRef.current.has(id)) return;
    approvingRef.current.add(id);
    try {
      setPendingTools((ps) => ps.filter((p) => p.id !== id));
      const g = genRef.current;
      await execToolCall(tc);
      // A convo switch mid-call must not continue the old thread here.
      if (g !== genRef.current) return;
      // Thread the queued depth so tool chains still terminate (depth < 3).
      await continueFrom(messagesRef.current, (tc.depth ?? 0) + 1);
    } finally {
      approvingRef.current.delete(id);
    }
  };
  const onSkipTool = (id) => setPendingTools((ps) => ps.filter((p) => p.id !== id));
  // Regenerate: drop trailing assistant reply(s), resubmit same context.
  const onRegenerate = async () => {
    if (streaming || busyRef.current) return;
    const arr = [...messagesRef.current];
    while (arr.length && arr[arr.length - 1].role === 'assistant') arr.pop();
    if (!arr.length) return;
    messagesRef.current = arr;
    setMessages(arr);
    await continueFrom(arr, 0);
  };

  // ---------- canvas patches ----------
  const onPatch = (patch, freshSelection) => {
    if (!patch || !patch.selector) return;
    // Compute outside the updater: updaters must be pure (StrictMode may run
    // them twice) and the ref write below must not live inside setState.
    const o = overridesRef.current;
    const next = { styles: { ...o.styles }, texts: { ...o.texts } };
    if (patch.css) {
      // Empty values unset the property (clearing a panel field removes it
      // instead of storing a dead '' entry).
      const cur = { ...(next.styles[patch.selector] || {}) };
      Object.entries(patch.css).forEach(([k, v]) => {
        if (v === '' || v == null) delete cur[k];
        else cur[k] = v;
      });
      if (Object.keys(cur).length) next.styles[patch.selector] = cur;
      else delete next.styles[patch.selector];
    }
    if (typeof patch.text === 'string') next.texts[patch.selector] = patch.text;
    overridesRef.current = next;
    setOverrides(next);
    // Canvas-side edits (drag/nudge) ship a fresh describe() — adopt it so the
    // Design panel never shows stale geometry for the same selector.
    if (freshSelection && typeof freshSelection.selector === 'string' &&
        selectionRef.current && selectionRef.current.selector === freshSelection.selector) {
      setSelection(freshSelection);
    }
  };
  const applyStyle = (selector, css) => {
    onPatch({ selector, css });
    setLiveApply({ id: nid(), selector, css });
  };
  const applyText = (selector, text) => {
    onPatch({ selector, text });
    setLiveApply({ id: nid(), selector, text });
  };
  const removeOverride = (kind, selector) => {
    const o = overridesRef.current;
    const next = { styles: { ...o.styles }, texts: { ...o.texts } };
    delete next[kind][selector];
    overridesRef.current = next;
    setOverrides(next);
  };

  const foldIntoCode = async () => {
    const o = overridesRef.current;
    if (streaming) return;
    setFolding(true);
    await run(
      'Fold these canvas edits into the source files and return the updated FILES_JSON. ' +
        'Keep everything else the same. Edits: ' +
        JSON.stringify(o).slice(0, 3000),
      'build'
    );
  };

  // ---------- selection agent (pinned scope + patch flow, main thread) ----------
  // Replaces the last main-chat message (used for patch progress updates).
  const updateLastMsg = (msg) => {
    const arr = [...messagesRef.current];
    arr[arr.length - 1] = msg;
    messagesRef.current = arr;
    setMessages(arr);
  };

  const agentSend = async ({ instruction, scope }) => {
    const myGen = genRef.current;
    if (scope === 'page') {
      await run(instruction, 'build');
      return;
    }
    const target = pinned || selection;
    if (!target) {
      pushMsgs([{ role: 'assistant', content: 'Select an element on the canvas first (or pin one), then describe the edit.' }]);
      return;
    }
    if (!settingsRef.current.apiKey && !isLocal(settingsRef.current.baseUrl)) {
      pushMsgs([{ role: 'assistant', content: 'Set your API key first (gear icon, top right).' }]);
      setSettingsOpen(true);
      return;
    }
    setAgentBusy(true);
    const t1 = Date.now();
    const targetSnap = { ...target };
    agentAbortRef.current = new AbortController();
    clearTimeout(agentTimeoutRef.current);
    agentTimeoutRef.current = setTimeout(() => {
      try {
        agentAbortRef.current?.abort();
      } catch {
        /* noop */
      }
    }, 360000);
    // Single exit for the agent: clears its timeout so it can never fire into
    // a later session, and always releases the busy flag.
    const endAgent = () => {
      clearTimeout(agentTimeoutRef.current);
      agentAbortRef.current = null;
      setAgentBusy(false);
    };
    pushMsgs([
      { role: 'user', content: '(selection edit · <' + target.tag + '>) ' + String(instruction).replace(/^SELECTION PATCH:\s*/, '') },
      { role: 'assistant', content: 'Working on <' + target.tag + '>…' }
    ]);
    const system = buildPatchSystemPrompt({ selection: target, files: filesRef.current, skills: getActiveSkills(settingsRef.current) });
    const requestPatch = async (userText) => {
      let out = '';
      await sendChatCompletionRetry({
        baseUrl: settingsRef.current.baseUrl,
        apiKey: settingsRef.current.apiKey,
        model: settingsRef.current.modelId,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText }
        ],
        signal: agentAbortRef.current?.signal,
        onToken: (d) => {
          out += d;
        }
      });
      return out;
    };
    let full = '';
    try {
      full = await requestPatch(instruction);
    } catch (e) {
      if (myGen === genRef.current) {
        updateLastMsg({ role: 'assistant', content: 'Agent failed: ' + String((e && e.message) || e) });
      }
      endAgent();
      return;
    }
    let patch = parsePatchFromText(full);
    if (!patch) {
      // One strict retry before giving up — models often comply on second ask.
      if (myGen === genRef.current) {
        updateLastMsg({ role: 'assistant', content: 'First attempt came back unusable — retrying with a stricter format…' });
      }
      try {
        full = await requestPatch(
          'Reply with ONLY a ```patch fenced JSON block and absolutely nothing else. ' +
          'Original request: ' + instruction
        );
        patch = parsePatchFromText(full);
      } catch (e) {
        if (myGen === genRef.current) {
          updateLastMsg({ role: 'assistant', content: 'Agent failed: ' + String((e && e.message) || e) });
        }
        endAgent();
        return;
      }
    }
    if (myGen !== genRef.current) {
      endAgent();
      return;
    }
    const summary = full.replace(/```[\s\S]*?```/g, '').trim().slice(0, 200);
    if (patch && (patch.css || patch.text)) {
      snapshot('Agent edit: ' + (summary || target.tag).slice(0, 40));
      onPatch({ selector: target.selector, css: patch.css, text: patch.text });
      setLiveApply({ id: nid(), selector: target.selector, css: patch.css, text: patch.text });
      updateLastMsg({ role: 'assistant', content: 'Applied to <' + target.tag + '>: ' + (summary || 'style/text updated.'), secs: Math.round((Date.now() - t1) / 1000) });
    } else {
      updateLastMsg({
        role: 'assistant',
        content: 'Couldn\u2019t apply that — the model didn\u2019t return a usable edit after 2 tries.',
        secs: Math.round((Date.now() - t1) / 1000),
        raw: full.slice(0, 8000),
        target: targetSnap,
        actions: [
          { id: 'main', label: 'Do it as full edit' },
          { id: 'copy', label: 'Copy raw' }
        ]
      });
    }
    endAgent();
  };

  const onMessageAction = async (idx, actionId) => {
    const msg = messagesRef.current[idx];
    if (!msg) return;
    if (actionId === 'copy') {
      try {
        await navigator.clipboard.writeText(String(msg.raw || msg.content || ''));
        showToast('Raw reply copied');
      } catch {
        showToast('Clipboard unavailable');
      }
      return;
    }
    if (actionId === 'main') {
      const t = msg.target || pinned || selection;
      const ctx = t
        ? ' [target element: <' + t.tag + '> "' + String(t.text || '').slice(0, 120) + '"]'
        : '';
      const prevUser = [...messagesRef.current].slice(0, idx).reverse().find((m) => m.role === 'user');
      pushMsgs([{ role: 'assistant', content: 'Retrying as a full file edit.' }]);
      await run('FULL EDIT (the quick patch failed — implement via files): ' + String(prevUser?.content || '').replace(/^\(selection edit · <[^>]+>\)\s*/, '') + ctx, 'build');
    }
  };

  // Audits resolve async — tag each run so a convo switch in between can't
  // file audit results under the wrong files. Bumped by abandonWork.
  const runAudit = () => {
    const g = ++auditGen.current;
    const filesSnap = filesRef.current;
    const entrySnap = entry;
    setAuditing(true);
    setTimeout(() => {
      if (g !== auditGen.current) return;
      setAudit({ issues: auditFiles(filesSnap, entrySnap), time: Date.now() });
      setAuditing(false);
    }, 30);
  };
  const fixAudit = async () => {
    if (!audit?.issues?.length || streaming || busyRef.current) return;
    setFixingAudit(true);
    try {
      const findings = (audit.issues || []).map((i) => '- [' + i.type + '] ' + i.file + ': ' + i.detail).join('\n');
      await run(
        'AUDIT FIX — address every finding below and return the updated FILES_JSON. Keep the design and all working behavior identical except these fixes:\n' + findings,
        'build'
      );
    } finally {
      setFixingAudit(false);
    }
  };

  // ---------- versions (Framer-style rollback) ----------
  const snapshot = (label) => {
    const snap = {
      id: nid(),
      label: label || 'Snapshot',
      time: Date.now(),
      files: { ...filesRef.current },
      overrides: JSON.parse(JSON.stringify(overridesRef.current))
    };
    setVersions((v) => [snap, ...v].slice(0, 20));
  };
  const restoreVersion = (id) => {
    const v = versions.find((x) => x.id === id);
    if (!v) return;
    snapshot('Before restore "' + v.label + '"');
    filesRef.current = { ...v.files };
    setFiles(filesRef.current);
    setHasBuild(Object.keys(filesRef.current).length > 2);
    setEntryOverride(null);
    overridesRef.current = JSON.parse(JSON.stringify(v.overrides));
    setOverrides(overridesRef.current);
    setBaked(overridesRef.current);
    setLiveApply(null);
    setSelection(null);
    pushMsgs([{ role: 'assistant', content: 'Restored "' + v.label + '".' }]);
  };

  // ---------- files ----------
  const saveFile = (path, code) => {
    const merged = { ...filesRef.current, [path]: code };
    filesRef.current = merged;
    setFiles(merged);
    setHasBuild(Object.keys(merged).length > 2);
  };
  const addFile = () => {
    let i = 1;
    while (filesRef.current['/Component' + i + '.jsx']) i++;
    const p = '/Component' + i + '.jsx';
    saveFile(p, 'export default function Component' + i + '() {\n  return <div>New component</div>;\n}\n');
    setActiveFile(p);
    setPaneTab('files');
  };
  const deleteFile = (path) => {
    if (path === '/App.jsx') {
      showToast('Cannot delete /App.jsx — it is the entry file');
      return;
    }
    const merged = { ...filesRef.current };
    delete merged[path];
    filesRef.current = merged;
    setFiles(merged);
    setHasBuild(Object.keys(merged).length > 2);
    if (entryOverride === path) setEntryOverride(null);
    setActiveFile(pickEntry(merged));
  };

  // Recovery: model dumped files in an unexpected shape — save everything found.
  const adoptAsFile = (content) => {
    const found = extractJsonFiles(content || '');
    const paths = Object.keys(found);
    if (paths.length) {
      snapshot('Adopt reply (' + paths.length + ' files)');
      const merged = { ...filesRef.current };
      paths.forEach((p) => {
        // Normalize like the generation path — unnormalized keys (App.jsx vs
        // /App.jsx) split the project and edits look lost.
        merged[normalizePath(p)] = found[p];
      });
      filesRef.current = merged;
      setFiles(merged);
      setHasBuild(Object.keys(merged).length > 2);
      setActiveFile(pickEntry(merged));
      pushMsgs([{ role: 'assistant', content: 'Saved ' + paths.length + ' file(s) from reply: ' + paths.join(', ') + ' — preview updated.' }]);
      return;
    }
    const rec = recoverFileFromText(content || '');
    if (!rec) {
      pushMsgs([{ role: 'assistant', content: 'Could not find a usable component in that reply. Ask the model to return a FILES_JSON block.', error: true }]);
      return;
    }
    snapshot('Adopt reply as ' + rec.path);
    saveFile(rec.path, rec.code);
    setActiveFile(rec.path);
    pushMsgs([{ role: 'assistant', content: 'Saved reply as ' + rec.path + ' — preview updated. For cleaner results, ask the model to always end with a ```files block.' }]);
  };
  const copyRawReply = async (raw) => {
    try {
      await navigator.clipboard.writeText(String(raw || ''));
      showToast('Raw reply copied — paste it to the developer to debug');
    } catch {
      showToast('Clipboard unavailable in this browser');
    }
  };
  const continuePrompt = () => {
    if (streaming) return;
    run('Continue where you left off: output the COMPLETE files block now — all files, full contents, no truncation, same format as before.', 'build');
  };

  // Canvas selection always reveals the Design panel.
  const handleSelect = (sel) => {
    setSelection(sel);
    if (sel) setRightTab('design');
  };

  // ---------- canvas ops (context menu, layers) ----------
  const cmd = (op, selector) => {
    if (op === 'comment') {
      const text = typeof window !== 'undefined' ? window.prompt('Comment on <' + (selection?.tag || 'element') + '>:') : null;
      if (text && text.trim()) {
        setComments((c) => [...c, { id: nid(), selector: selector || selection?.selector, text: text.trim() }]);
        showToast('Comment added — see Layers tab');
      }
      return;
    }
    if (op === 'paste' && !copiedRef.current) {
      showToast('Nothing copied yet — right-click an element and Copy first');
      return;
    }
    setCmdSignal({ id: nid(), op, selector, html: op === 'paste' ? copiedRef.current?.html : undefined });
  };
  const removeStyleProp = (selector, key) => {
    const o = overridesRef.current;
    const next = { styles: { ...o.styles }, texts: { ...o.texts } };
    if (next.styles[selector]) {
      const entry = { ...next.styles[selector] };
      delete entry[key];
      if (Object.keys(entry).length) next.styles[selector] = entry;
      else delete next.styles[selector];
    }
    overridesRef.current = next;
    setOverrides(next);
    setLiveApply({ id: nid(), selector, css: { [key]: '' } });
  };
  const hiddenMap = useMemo(() => {
    const m = {};
    Object.entries(overrides.styles || {}).forEach(([sel, css]) => {
      if (css && css.display === 'none') m[sel] = true;
    });
    return m;
  }, [overrides]);
  const toggleHide = (selector) => {
    if (hiddenMap[selector]) {
      removeStyleProp(selector, 'display');
      setLiveApply({ id: nid(), selector, css: { display: '' } });
    } else {
      applyStyle(selector, { display: 'none' });
    }
  };
  const toggleLock = (selector) => {
    cmd(locked[selector] ? 'unlock' : 'lock', selector);
  };
  const alignSel = (dir) => {
    if (!selection) return;
    if (dir === 'left') applyStyle(selection.selector, { marginLeft: '0', marginRight: 'auto', textAlign: 'left' });
    else if (dir === 'center') applyStyle(selection.selector, { marginLeft: 'auto', marginRight: 'auto', textAlign: 'center' });
    else applyStyle(selection.selector, { marginLeft: 'auto', marginRight: '0', textAlign: 'right' });
  };

  // ---------- site pages / layers / assets ----------
  const addPage = () => {
    const raw = typeof window !== 'undefined' ? window.prompt('Page name (e.g. about):', 'about') : null;
    if (!raw) return;
    const slug = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
    const p = '/pages/' + slug + '.jsx';
    if (filesRef.current[p]) {
      setEntry(p);
      return;
    }
    const name = slug.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
    saveFile(
      p,
      "import '../index.css';\n\nexport default function " + name + "() {\n  return (\n    <main style={{ padding: 48, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>\n      <h1>" + name + "</h1>\n      <p>New page — describe what it should become in the Agent panel.</p>\n    </main>\n  );\n}\n"
    );
    setEntry(p);
    setLeftTab('pages');
    showToast('Page created: ' + p);
  };
  const selectLayer = (selector) => setSelectLayerSignal({ id: nid(), selector });
  const refreshLayers = () => setLayersRequest((k) => k + 1);

  const assets = useMemo(() => {
    const all = Object.entries(files).map(([, c]) => c).join('\n');
    const images = [
      ...new Set(
        [...all.matchAll(/https?:\/\/[^\s"'()]+?\.(png|jpe?g|gif|webp|svg|avif)(\?[^\s"'()]*)?/gi)].map((m) => m[0])
      )
    ].slice(0, 30);
    const colors = [...new Set([...all.matchAll(/#(?:[0-9a-f]{3,8})\b/gi)].map((m) => m[0].toLowerCase()))].slice(0, 30);
    const fonts = [...new Set([...all.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((m) => m[1].trim()))].slice(0, 12);
    return { images, colors, fonts };
  }, [files]);

  const exportDoc = () => buildSrcDoc({ files, overrides: overridesRef.current, editable: false, entry });
  const downloadHtml = () => {
    const res = exportDoc();
    if (!res.srcDoc) return;
    downloadBlob(new Blob([res.srcDoc], { type: 'text/html' }), 'site.html');
    showToast('Downloaded site.html');
  };
  const exportZip = () => {
    try {
      const { blob, fileCount, error } = exportProjectZip({
        files,
        overrides: overridesRef.current,
        entry,
        buildSrcDoc
      });
      downloadBlob(blob, 'inui-site.zip');
      showToast(
        error
          ? 'Exported ' + fileCount + ' file(s), but index.html is missing: ' + String(error).slice(0, 80)
          : 'Exported ' + fileCount + ' file(s) as inui-site.zip'
      );
    } catch (e) {
      showToast('Export failed: ' + String((e && e.message) || e).slice(0, 80));
    }
  };

  // ---------- MCP ----------
  const connectMcp = async (url) => {
    setMcpServers((prev) => prev.map((s) => (s.url === url ? { ...s, status: 'connecting', error: null } : s)));
    try {
      const res = await connectMcpServer(url);
      setMcpServers((prev) =>
        prev.map((s) =>
          s.url === url
            ? { ...s, status: 'connected', tools: res.tools.map((t) => ({ ...t, enabled: true })), mode: res.mode, sessionId: res.sessionId, endpoint: res.endpoint, error: null }
            : s
        )
      );
    } catch (e) {
      setMcpServers((prev) => prev.map((s) => (s.url === url ? { ...s, status: 'error', error: String((e && e.message) || e) } : s)));
    }
  };
  const addMcpUrl = (url) => {
    const u = String(url || mcpInput || '').trim();
    if (!u) return;
    if (!settings.mcpUrls.includes(u)) updateSettings({ mcpUrls: [...settings.mcpUrls, u] });
    setMcpServers((prev) => (prev.some((s) => s.url === u) ? prev : [...prev, { url: u, status: 'idle', tools: [], error: null }]));
    setMcpInput('');
    connectMcp(u);
  };
  const addDemo = () => {
    setMcpServers((prev) =>
      prev.some((s) => s.url === 'local://demo')
        ? prev
        : [...prev, { url: 'local://demo', status: 'connected', tools: DEMO_TOOLS.map((t) => ({ ...t, enabled: true })), error: null }]
    );
    setPaneTab('mcp');
  };

  // ---------- render ----------
  if (view === 'home' || view === 'builds' || view === 'templates') {
    const railNav = (id) => {
      if (id === 'chat') setView('home');
      else if (id === 'builds') setView('builds');
      else if (id === 'templates') setView('templates');
      else if (id === 'canvas') {
        if (hasBuild) setView('canvas');
        else showToast('Generate a site first — the canvas opens inside a chat');
      } else showToast(id + ' is coming soon');
    };
    const shared = {
      dark: !!settings.darkMode,
      onToggleDark: toggleDark,
      onOpenSettings: () => setSettingsOpen(true),
      accountLabel: settings.apiKey ? 'Connected' : 'You',
      canvasReady: hasBuild
    };
    if (view === 'builds') {
      return (
        <div className="h-screen flex bg-white">
          <IconRail active="builds" onNavigate={railNav} {...shared} />
          <BuildsView convos={convos} onOpen={switchConvo} onToast={showToast} />
          {settingsOpen && <SettingsModal settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
          {toast && <ToastBubble toast={toast} onDismiss={() => setToast(null)} />}
        </div>
      );
    }
    if (view === 'templates') {
      return (
        <div className="h-screen flex bg-white">
          <IconRail active="templates" onNavigate={railNav} {...shared} />
          <TemplatesView
            onSelect={(t) => {
              startFreshThread();
              setView('chat');
              run(t.prompt);
            }}
          />
          {settingsOpen && <SettingsModal settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
          {toast && <ToastBubble toast={toast} onDismiss={() => setToast(null)} />}
        </div>
      );
    }
    return (
      <div className="h-screen flex bg-white">
        <IconRail active="chat" onNavigate={railNav} {...shared} />
        <ConvoSidebar
          className="hidden md:flex"
          convos={convos}
          activeId={null}
          search={convoSearch}
          setSearch={setConvoSearch}
          onNew={() => {
            startFreshThread();
            setView('chat');
          }}
          onSelect={switchConvo}
          onDelete={() => {}}
          canDelete={false}
          keyOn={!!settings.apiKey}
          modelId={settings.modelId}
          onOpenSettings={() => setSettingsOpen(true)}
          onSignOut={() => {
            updateSettings({ apiKey: '' });
            showToast('Signed out — API key removed from this browser');
          }}
          onHome={null}
          onSelectTemplate={(t) => homeSubmit(t.prompt, undefined)}
        />
        <HomeView
          onSubmit={homeSubmit}
          onOpenSettings={() => setSettingsOpen(true)}
          hasKey={!!settings.apiKey}
          modelId={settings.modelId}
        />
      {settingsOpen && <SettingsModal settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#ffffff] border border-black/10 rounded-full px-4 py-2 text-xs shadow-2xl flex items-center gap-2">
          {toast}
          <button onClick={() => setToast(null)} className="text-zinc-500 hover:text-black"><X size={12} /></button>
        </div>
      )}
      </div>
    );
  }

  if (view === 'chat') {
    const railNav = (id) => {
      if (id === 'chat') setView('home');
      else if (id === 'builds') setView('builds');
      else if (id === 'templates') setView('templates');
      else if (id === 'canvas') {
        if (hasBuild) setView('canvas');
        else showToast('Generate a site first — the canvas opens inside a chat');
      } else showToast(id + ' is coming soon');
    };
    return (
      <div className="h-screen flex bg-[#fafafa] text-zinc-900">
        <IconRail
          active="chat"
          onNavigate={railNav}
          dark={!!settings.darkMode}
          onToggleDark={toggleDark}
          onOpenSettings={() => setSettingsOpen(true)}
          accountLabel={settings.apiKey ? 'Connected' : 'You'}
          canvasReady={hasBuild}
        />
        <div className="flex-1 min-w-0 flex flex-col relative">

        <div className="flex-1 min-h-0 flex relative">
          <ConvoSidebar
            className={sideOpen ? 'flex absolute inset-y-0 left-0 z-40 h-full shadow-2xl' : 'hidden md:flex'}
            mini={sideMini && !sideOpen}
            onToggleMini={() => setSideMini((v) => !v)}
            convos={convos}
            activeId={activeConvoId}
            search={convoSearch}
            setSearch={setConvoSearch}
            onNew={newConvo}
            onSelect={switchConvo}
            onDelete={deleteConvo}
            keyOn={!!settings.apiKey}
            modelId={settings.modelId}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          {sideOpen && (
            <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSideOpen(false)} />
          )}
          <div className="flex-1 min-h-0 flex">
            {/* main chat area */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 pb-10">
                <ChatPane
                  messages={messages}
                  streaming={streaming}
                  streamingText={streamingText}
                  liveStats={liveStats}
                  phase={phase}
                  onStop={stopGen}
                  onSend={run}
                  activeTab="chat"
                  setActiveTab={() => {}}
                  hideTabs
                  convoKey={activeConvoId}
                  composerMode={composerMode}
                  setComposerMode={setComposerMode}
                  pageScroll
                  files={files}
                  activeFile={activeFile}
                  setActiveFile={setActiveFile}
                  onSaveFile={saveFile}
                  onAddFile={addFile}
                  onDeleteFile={deleteFile}
                  mcpServers={mcpServers}
                  mcpInput={mcpInput}
                  setMcpInput={setMcpInput}
                  onAddMcp={() => addMcpUrl()}
                  onConnectMcp={connectMcp}
                  onRemoveMcp={(url) => {
                    setMcpServers((prev) => prev.filter((s) => s.url !== url));
                    updateSettings({ mcpUrls: settings.mcpUrls.filter((u) => u !== url) });
                  }}
                  onToggleTool={(url, name) =>
                    setMcpServers((prev) =>
                      prev.map((s) => (s.url === url ? { ...s, tools: s.tools.map((t) => (t.name === name ? { ...t, enabled: t.enabled === false } : t)) } : s))
                    )
                  }
                  onAddDemo={addDemo}
                  pendingTools={pendingTools}
                  onRunTool={onRunTool}
                  onSkipTool={onSkipTool}
                  onAdoptAsFile={adoptAsFile}
                  onCopyRaw={copyRawReply}
                  onContinuePrompt={continuePrompt}
                  onMessageAction={onMessageAction}
                  onRegenerate={onRegenerate}
                  modelId={settings.modelId}
                />
              </div>
            </div>

            {/* right panel: Files | Diff | Activity (hidden when preview is open) */}
            {hasBuild && !showPreview && (
              <div className="w-[280px] shrink-0 border-l border-black/10 hidden lg:flex flex-col min-h-0">
                <div className="flex items-center border-b border-black/10 text-[11px] shrink-0">
                  {[
                    { id: 'files', icon: FileText, label: 'Files' },
                    { id: 'diff', icon: GitCommit, label: 'Diff' },
                    { id: 'activity', icon: TerminalIcon, label: 'Activity' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setRightPanelTab(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 ${rightPanelTab === t.id ? 'text-zinc-900 font-medium border-b-2 border-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
                    >
                      <t.icon size={11} />
                      {t.label}
                      {t.id === 'diff' && fileChanges.length > 0 && (
                        <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] flex items-center justify-center">{fileChanges.length}</span>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowPreview(true)}
                    title="Open live preview"
                    className="ml-auto mr-2 w-6 h-6 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-black/5"
                  >
                    <Eye size={12} />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  {rightPanelTab === 'files' && (
                    <FileTree
                      files={files}
                      activeFile={activeFile}
                      onSelectFile={setActiveFile}
                      onAddFile={addFile}
                      onDeleteFile={deleteFile}
                    />
                  )}
                  {rightPanelTab === 'diff' && (
                    <DiffView changes={fileChanges} />
                  )}
                  {rightPanelTab === 'activity' && (
                    <TerminalPanel logs={activityLogs} streaming={streaming} phase={phase} />
                  )}
                </div>
              </div>
            )}
          </div>
          {showPreview && (
            <PreviewMini
              files={files}
              overrides={baked}
              entry={entry}
              hasBuild={hasBuild}
              onOpenCanvas={() => setView('canvas')}
              onClose={() => setShowPreview(false)}
              onToast={showToast}
            />
          )}
        </div>
        </div>
        {settingsOpen && <SettingsModal settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
      </div>
    );
  }
  return (
    <div className="h-screen flex flex-col bg-[#ffffff] text-zinc-900">
      {/* top bar */}
      <div className="h-11 shrink-0 border-b border-black/10 flex items-center gap-1 px-3 relative z-30">
        <button onClick={() => setView('home')} title="Home" className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-black hover:bg-black/5">
          <Home size={14} />
        </button>
        <button onClick={() => setView('chat')} title="Back to chat" className="text-[11px] text-zinc-500 hover:text-zinc-700 px-2 py-1 rounded-lg hover:bg-black/5 hidden sm:block">Chat</button>
        <span className="text-[11px] text-zinc-500 border border-black/10 rounded-lg px-2 py-0.5 hidden sm:block">Canvas</span>

        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-2 text-[13px]">
          <span className="font-medium">Site</span>
          <div className="relative">
            <button onClick={() => setBranchOpen((o) => !o)} className="flex items-center gap-1 text-[11px] text-zinc-500 border border-black/10 rounded-full px-2 py-0.5 hover:text-black hover:border-black/20">
              <GitBranch size={10} /> main <ChevronDown size={10} />
            </button>
            {branchOpen && (
              <>
              <div className="fixed inset-0 z-20" onClick={() => setBranchOpen(false)} />
              <div className="absolute top-8 left-1/2 -translate-x-1/2 w-64 bg-[#ffffff] border border-black/10 rounded-xl p-1.5 shadow-2xl z-30">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 py-1">History · click to restore</div>
                {versions.length === 0 && <div className="text-[11px] text-zinc-600 px-2 py-1.5">No snapshots yet.</div>}
                {versions.slice(0, 8).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      restoreVersion(v.id);
                      setBranchOpen(false);
                    }}
                    className="w-full text-left text-[11px] text-zinc-600 hover:bg-black/5 rounded-lg px-2 py-1.5 truncate"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              </>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setSettingsOpen(true)} title="Settings" className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-black hover:bg-black/5">
            <Settings size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* left panel */}
        <div className="w-[270px] shrink-0 border-r border-black/10 min-h-0 hidden sm:block">
          <LeftPanel
            tab={leftTab}
            setTab={setLeftTab}
            entries={entries}
            entry={entry}
            setEntry={setEntry}
            onAddPage={addPage}
            layers={layers}
            onSelectLayer={selectLayer}
            onRefreshLayers={refreshLayers}
            selectedSel={selection?.selector}
            lockedMap={locked}
            hiddenMap={hiddenMap}
            onToggleLock={toggleLock}
            onToggleHide={toggleHide}
            selection={selection}
            onAlign={alignSel}
            comments={comments}
            onSelectComment={(sel) => {
              setSelectLayerSignal({ id: nid(), selector: sel });
              setLeftTab('layers');
            }}
            onDeleteComment={(id) => setComments((c) => c.filter((x) => x.id !== id))}
            assets={assets}
            codeNode={(
              <ChatPane
            messages={messages}
            streaming={streaming}
            streamingText={streamingText}
            liveStats={liveStats}
            phase={phase}
            onStop={stopGen}
            onSend={run}
            activeTab={paneTab}
            setActiveTab={setPaneTab}
            hideTabs
            files={files}
            activeFile={activeFile}
            setActiveFile={setActiveFile}
            onSaveFile={saveFile}
            onAddFile={addFile}
            onDeleteFile={deleteFile}
            mcpServers={mcpServers}
            mcpInput={mcpInput}
            setMcpInput={setMcpInput}
            onAddMcp={() => addMcpUrl()}
            onConnectMcp={connectMcp}
            onRemoveMcp={(url) => {
              if (url.startsWith('local://')) return;
              setMcpServers((prev) => prev.filter((s) => s.url !== url));
              updateSettings({ mcpUrls: settings.mcpUrls.filter((u) => u !== url) });
            }}
            onToggleTool={(url, name) =>
              setMcpServers((prev) =>
                prev.map((s) => (s.url === url ? { ...s, tools: s.tools.map((t) => (t.name === name ? { ...t, enabled: t.enabled === false } : t)) } : s))
              )
            }
            onAddDemo={addDemo}
            pendingTools={pendingTools}
            onRunTool={onRunTool}
            onSkipTool={onSkipTool}
            onAdoptAsFile={adoptAsFile}
            onCopyRaw={copyRawReply}
            onContinuePrompt={continuePrompt}
            onMessageAction={onMessageAction}
            onRegenerate={onRegenerate}
            tabs={['files', 'mcp']}
            convoKey={activeConvoId}
            composerMode={composerMode}
            setComposerMode={setComposerMode}
            onOpenCanvas={() => setView('canvas')}
            modelId={settings.modelId}
              />
            )}
          />
        </div>

        {/* canvas */}
        <div className="flex-1 min-w-0 min-h-0">
          <PreviewCanvas
            files={files}
            bakedOverrides={baked}
            liveApply={liveApply}
            canvasMode={canvasMode}
            setCanvasMode={(m) => {
              if (m !== canvasMode) {
                setCanvasMode(m);
                setSelection(null);
              }
            }}
            entry={entry}
            onAddPage={addPage}
            layersRequest={layersRequest}
            onLayers={setLayers}
            selectLayerSignal={selectLayerSignal}
            selection={selection}
            onSelect={handleSelect}
            onDeselect={() => setSelection(null)}
            onDownloadHtml={downloadHtml}
            onExportZip={exportZip}
            lockedKeys={Object.keys(locked)}
            cmdSignal={cmdSignal}
            canPaste={hasPaste}
            onLockedChanged={(list) => setLocked(Object.fromEntries(list.map((s) => [s, true])))}
            onCopied={(d) => {
              copiedRef.current = { html: d.html, tag: d.tag };
              setHasPaste(true);
              showToast('Copied <' + d.tag + '> — right-click a container to paste inside');
            }}
            onChanged={() => setLayersRequest((k) => k + 1)}
            onLockedTap={() => showToast('Layer is locked — unlock it in Layers or right-click')}
            onCmdRequest={(op, selector) => cmd(op, selector)}
            onComment={() => {
              if (!selection) {
                showToast('Select an element first, then comment');
                return;
              }
              cmd('comment', selection.selector);
            }}
            onPatch={onPatch}
            onRuntimeError={(message) =>
              setRuntimeErrors((prev) => [...prev.slice(-5), { id: nid(), message: String(message).slice(0, 300) }])
            }
            runtimeErrors={runtimeErrors}
            onClearErrors={() => setRuntimeErrors([])}
          />
        </div>

        {/* right panel: Agent | Style (Framer) */}
        <div className="w-[280px] xl:w-[300px] shrink-0 border-l border-black/10 min-h-0 hidden md:flex flex-col">
          <div className="flex items-center gap-4 px-4 pt-2.5 pb-2 border-b border-black/10 text-xs shrink-0">
            {[
              { id: 'design', label: 'Design' },
              { id: 'agent', label: 'Agent' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setRightTab(t.id)}
                className={rightTab === t.id ? 'text-zinc-900 font-medium' : 'text-zinc-500 hover:text-zinc-600'}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            {rightTab === 'agent' ? (
              <AgentPanel
                pinned={pinned}
                selection={selection}
                onPin={() => selection && setPinned({ ...selection })}
                onUnpin={() => setPinned(null)}
                onSendAgent={agentSend}
                agentBusy={agentBusy || streaming}
                versions={versions}
                onRestoreVersion={restoreVersion}
                audit={audit}
                onRunAudit={runAudit}
                auditing={auditing}
                onFixAudit={fixAudit}
                fixingAudit={fixingAudit}
                currentPage={entry}
                modelId={settings.modelId}
                onOpenSettings={() => setSettingsOpen(true)}
                threadNode={(
                  <ChatPane
                    messages={messages}
                    streaming={streaming}
                    streamingText={streamingText}
                    liveStats={liveStats}
                    phase={phase}
                    onStop={stopGen}
                    onSend={run}
                    activeTab="chat"
                    setActiveTab={() => {}}
                    hideTabs
                    convoKey={activeConvoId}
                    composerMode={composerMode}
                    setComposerMode={setComposerMode}
                    files={files}
                    activeFile={activeFile}
                    setActiveFile={setActiveFile}
                    onSaveFile={saveFile}
                    onAddFile={addFile}
                    onDeleteFile={deleteFile}
                    mcpServers={mcpServers}
                    mcpInput={mcpInput}
                    setMcpInput={setMcpInput}
                    onAddMcp={() => addMcpUrl()}
                    onConnectMcp={connectMcp}
                    onRemoveMcp={(url) => {
                      setMcpServers((prev) => prev.filter((s) => s.url !== url));
                      updateSettings({ mcpUrls: settings.mcpUrls.filter((u) => u !== url) });
                    }}
                    onToggleTool={(url, name) =>
                      setMcpServers((prev) =>
                        prev.map((s) => (s.url === url ? { ...s, tools: s.tools.map((t) => (t.name === name ? { ...t, enabled: t.enabled === false } : t)) } : s))
                      )
                    }
                    onAddDemo={addDemo}
                    pendingTools={pendingTools}
                    onRunTool={onRunTool}
                    onSkipTool={onSkipTool}
                    onAdoptAsFile={adoptAsFile}
                    onCopyRaw={copyRawReply}
                    onContinuePrompt={continuePrompt}
                    onOpenCanvas={() => setView('canvas')}
                    onMessageAction={onMessageAction}
                    onRegenerate={onRegenerate}
                    modelId={settings.modelId}
                  />
                )}
              />
            ) : (
              <Inspector
            selection={selection}
            overrides={overrides}
            onApplyStyle={applyStyle}
            onApplyText={applyText}
            onRemoveOverride={removeOverride}
            onClearOverrides={() => {
              setOverrides({ styles: {}, texts: {} });
              overridesRef.current = { styles: {}, texts: {} };
            }}
            onFoldIntoCode={foldIntoCode}
            folding={folding || streaming}
            filesCount={Object.keys(files).length}
              />
            )}
          </div>
        </div>
      </div>
      {settingsOpen && <SettingsModal settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
