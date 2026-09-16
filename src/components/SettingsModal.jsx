import { useState } from 'react';
import { X, Loader2, Check, AlertTriangle, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';
import { testConnection } from '../lib/llm';
import { BUILTIN_SKILLS } from '../lib/builtin-skills.js';
import { PRESET_MCP } from '../lib/mcp';

export default function SettingsModal({ settings, onChange, onClose }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [mcpInput, setMcpInput] = useState('');
  const [tab, setTab] = useState('connection');
  const [skillName, setSkillName] = useState('');
  const [skillText, setSkillText] = useState('');
  const [skillMsg, setSkillMsg] = useState(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const msg = await testConnection(settings);
      setResult({ ok: true, msg });
    } catch (e) {
      setResult({ ok: false, msg: String(e.message || e) });
    } finally {
      setTesting(false);
    }
  };

  const addSkill = (name, content) => {
    const t = String(content || '').trim();
    if (!t) {
      setSkillMsg('Paste some text or pick a file first.');
      return;
    }
    const list = settings.skills || [];
    onChange({
      skills: [...list, {
        id: 'sk' + Date.now().toString(36),
        name: String(name || '').trim() || 'Skill ' + (list.length + 1),
        content: t.slice(0, 20000)
      }]
    });
    setSkillName('');
    setSkillText('');
    setSkillMsg('Skill added — it will guide every generation.');
  };
  const onSkillFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 80000) {
      setSkillMsg('File too large (max 80KB).');
      e.target.value = '';
      return;
    }
    const r = new FileReader();
    r.onload = () => addSkill(skillName || f.name.replace(/\.[^.]+$/, ''), String(r.result || ''));
    r.readAsText(f);
    e.target.value = '';
  };

  const addMcp = (url) => {
    const u = String(url || '').trim();
    const cur = Array.isArray(settings.mcpUrls) ? settings.mcpUrls : [];
    if (!u || cur.includes(u)) return;
    onChange({ mcpUrls: [...cur, u] });
    setMcpInput('');
  };
  // Stored settings from older versions (or corrupt storage) may lack arrays.
  const mcpUrls = Array.isArray(settings.mcpUrls) ? settings.mcpUrls : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#ffffff] border border-black/10 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Settings</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-700"><X size={18} /></button>
        </div>
        <div className="flex items-center gap-1.5 mb-4">
          {[
            { id: 'connection', label: 'Connection' },
            { id: 'skills', label: `Skills${(settings.skills || []).length ? ` · ${(settings.skills || []).length}` : ''}` }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-xs rounded-full px-3.5 py-1.5 ${tab === t.id ? 'bg-black text-white font-medium' : 'text-zinc-500 hover:text-zinc-900 border border-black/10'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'connection' ? (
        <>

        <label className="block text-xs text-zinc-500 mb-1">Base URL (OpenAI-compatible)</label>
        <Input
          value={settings.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="https://api.openai.com/v1"
          className="mb-3"
        />
        <label className="block text-xs text-zinc-500 mb-1">API key</label>
        <Input
          type="password"
          value={settings.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder="sk-…"
          className="mb-3"
        />
        <label className="block text-xs text-zinc-500 mb-1">Model ID</label>
        <Input
          value={settings.modelId}
          onChange={(e) => onChange({ modelId: e.target.value })}
          placeholder="gpt-4o-mini"
          className="mb-3"
        />
        <div className="flex items-center gap-2 mb-5">
          <Button onClick={runTest} disabled={testing} variant="outline" size="sm">
            {testing && <Loader2 size={12} className="animate-spin" />} Test connection
          </Button>
          {result && (
            <span className={`text-xs flex items-center gap-1 ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {result.ok ? <Check size={12} /> : <AlertTriangle size={12} />} {result.msg.slice(0, 90)}
            </span>
          )}
        </div>

        <h3 className="text-sm font-medium mb-2">External MCP servers</h3>
        <p className="text-[11px] text-zinc-500 mb-2">Remote HTTP / SSE URLs. Connect from the MCP tab after saving.</p>
        <div className="flex gap-2 mb-2">
          <input
            value={mcpInput}
            onChange={(e) => setMcpInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMcp(mcpInput)}
            placeholder="https://mcp.example.com/sse"
            className="flex-1 bg-[#ffffff] border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/20"
          />
          <button onClick={() => addMcp(mcpInput)} className="text-xs bg-black/5 rounded-lg px-3 hover:bg-black/10 flex items-center gap-1">
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {PRESET_MCP.map((p) => (
            <button
              key={p.url}
              onClick={() => addMcp(p.url)}
              className="text-[11px] text-zinc-500 border border-black/10 rounded-full px-2.5 py-1 hover:text-zinc-900 hover:border-black/20"
            >
              + {p.name}
            </button>
          ))}
        </div>
        <div className="space-y-1.5 mb-5">
          {mcpUrls.map((u) => (
            <div key={u} className="flex items-center gap-2 text-xs bg-[#ffffff] border border-black/10 rounded-lg px-2.5 py-1.5">
              <span className="flex-1 truncate text-zinc-600">{u}</span>
              <button onClick={() => onChange({ mcpUrls: mcpUrls.filter((x) => x !== u) })} className="text-zinc-500 hover:text-red-600">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {mcpUrls.length === 0 && <p className="text-[11px] text-zinc-600">No MCP servers yet.</p>}
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-600 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={!!settings.autoApproveTools}
            onChange={(e) => onChange({ autoApproveTools: e.target.checked })}
            className="accent-black"
          />
          Auto-run MCP tool calls (otherwise each needs approval)
        </label>
        </>
        ) : (
        <div>
          <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
            Skills are injected into every generation — brand voice, style rules, component patterns, copy guidelines. Paste text or drop any text file.
          </p>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Built-in · always guide generation unless off</div>
          <div className="space-y-1.5 mb-4">
            {BUILTIN_SKILLS.map((b) => {
              const off = (settings.disabledSkills || []).includes(b.id);
              return (
                <label key={b.id} className="flex items-center gap-2 text-xs bg-transparent border border-black/10 rounded-lg px-2.5 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!off}
                    onChange={(e) => {
                      const cur = settings.disabledSkills || [];
                      onChange({ disabledSkills: e.target.checked ? cur.filter((x) => x !== b.id) : [...cur, b.id] });
                    }}
                    className="accent-black shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-700 font-medium truncate">{b.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{String(b.content || '').length.toLocaleString()} chars · distilled from the apple-design skill (HIG rigor + craft)</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Yours</div>
          <label className="block text-xs text-zinc-500 mb-1">Skill name</label>
          <Input
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            placeholder="e.g. Brand voice"
            className="mb-2"
          />
          <label className="block text-xs text-zinc-500 mb-1">Skill content</label>
          <textarea
            value={skillText}
            onChange={(e) => setSkillText(e.target.value)}
            placeholder="Paste rules, guidelines, examples…"
            rows={6}
            className="w-full bg-transparent border border-input rounded-lg px-2.5 py-2 text-sm outline-none focus:border-black/20 placeholder:text-zinc-400 resize-y mb-2"
          />
          <div className="flex gap-2 mb-2">
            <label className="text-xs border border-black/10 rounded-lg px-3 py-2 text-zinc-600 hover:border-black/20 cursor-pointer flex items-center gap-1.5">
              <Upload size={12} /> Pick a file
              <input type="file" className="hidden" onChange={onSkillFile} />
            </label>
            <Button onClick={() => addSkill(skillName, skillText)} size="sm" className="rounded-lg">
              <Plus size={12} /> Add skill
            </Button>
          </div>
          {skillMsg && <p className="text-[11px] text-zinc-500 mb-2">{skillMsg}</p>}
          <div className="space-y-1.5 mb-5">
            {(settings.skills || []).map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs bg-transparent border border-black/10 rounded-lg px-2.5 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-700 font-medium truncate">{s.name}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{String(s.content || '').slice(0, 80)}… · {String(s.content || '').length.toLocaleString()} chars</div>
                </div>
                <button onClick={() => onChange({ skills: (settings.skills || []).filter((x) => x.id !== s.id) })} className="text-zinc-500 hover:text-red-600 shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {(settings.skills || []).length === 0 && <p className="text-[11px] text-zinc-600">No skills yet — e.g. paste your brand guidelines.</p>}
          </div>
        </div>
        )}

        <p className="text-[11px] text-zinc-600 mb-4">Keys stay in this browser's localStorage. They are only sent to your Base URL.</p>
        <Button onClick={onClose} className="w-full rounded-full">
          Done
        </Button>
      </div>
    </div>
  );
}
