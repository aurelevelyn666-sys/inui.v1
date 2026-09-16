// Built-in skills ship with the app and guide every generation unless disabled
// in Settings. Single source of truth lives in /skills/*.md (imported raw so
// it stays editable without touching code). Full HIG references for the
// apple-design skill live outside the browser bundle — see the .md header.
import appleDesign from '../../skills/apple-design.md?raw';

export const BUILTIN_SKILLS = [
  { id: 'builtin-apple-design', name: 'Apple Design', content: appleDesign }
];

// Built-ins first (highest priority), then user skills. Anything listed in
// settings.disabledSkills is skipped — default is all enabled so existing
// stored settings pick new built-ins up automatically.
export function getActiveSkills(settings) {
  const disabled = new Set((settings && settings.disabledSkills) || []);
  const builtin = BUILTIN_SKILLS.filter((s) => !disabled.has(s.id) && s.content);
  const user = ((settings && settings.skills) || []).filter((s) => s && s.content);
  return [...builtin, ...user];
}
