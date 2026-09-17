// Follow-up suggestions (Manus-style): after a build, offer 3 contextual
// next actions so the user never wonders what to ask for. Pure + tested.
// Each suggestion is { id, label, prompt } — clicking sends the prompt.

const SECTION_IDEAS = [
  { key: 'pricing', label: 'Add a pricing section', match: /pricing/i, prompt: 'Add a pricing section with three tiers and a monthly/yearly toggle, matching the existing design system.' },
  { key: 'testimonials', label: 'Add testimonials', match: /testimon/i, prompt: 'Add a testimonials section with three quotes and avatars (initials, no external images), matching the existing design system.' },
  { key: 'faq', label: 'Add an FAQ section', match: /\bfaq\b/i, prompt: 'Add an FAQ section with an accordion (5 questions, keyboard accessible), matching the existing design system.' },
  { key: 'footer', label: 'Add a footer', match: /footer/i, prompt: 'Add a complete footer (nav columns, newsletter input, socials as inline SVG, copyright), matching the existing design system.' },
  { key: 'contact', label: 'Add a contact section', match: /contact/i, prompt: 'Add a contact section with a validated form (name, email, message) and contact details, matching the existing design system.' }
];

// Requests for a single file are honored as-is — never upsell a scaffold.
const SINGLE_RE = /single(\s|-)?file|one(\s|-)?file|satu file|1 file|single component|cuma (satu|1)\b/i;

export function suggestFollowUps(files, lastUserPrompt) {
  const entries = Object.entries(files || {});
  if (!entries.length) return [];
  const all = entries.map(([, c]) => c).join('\n');
  const out = [];
  const jsFiles = entries.filter(([p]) => p.endsWith('.jsx') || p.endsWith('.js'));

  // 0) model returned one file unasked → offer the full scaffold in one tap
  if (jsFiles.length <= 1 && !SINGLE_RE.test(String(lastUserPrompt || ''))) {
    out.push({
      id: 'scaffold',
      label: 'Expand to full scaffold',
      prompt: 'Expand this into a complete multi-file scaffold: /App.jsx composing sections, one component per file under /components/, shared logic under /hooks/ and /lib/ where it fits, styles in /index.css. Keep the design identical.'
    });
  }

  // 1) first missing section wins (concrete, visible progress)
  const missing = SECTION_IDEAS.find((s) => !s.match.test(all));
  if (missing) out.push({ id: 'sec-' + missing.key, label: missing.label, prompt: missing.prompt });

  // 2) single-file project → split into components (multi-file rule).
  // Skipped when the scaffold upsell above already covers it.
  if (jsFiles.length <= 1 && !out.some((s) => s.id === 'scaffold')) {
    out.push({
      id: 'split',
      label: 'Split into components',
      prompt: 'Refactor this into multiple focused files (one component per file under /components/, composed by /App.jsx) without changing the design.'
    });
  }

  // 3) mobile polish — always relevant, cheap to verify visually
  out.push({
    id: 'mobile',
    label: 'Polish for mobile',
    prompt: 'Polish the responsive behavior: no horizontal scroll at 360px, tap targets at least 44px, readable type sizes, hero stacks cleanly to one column.'
  });

  return out.slice(0, 3);
}
