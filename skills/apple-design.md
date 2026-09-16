# Apple Design (generation rules)

Design every site with Apple Human Interface Guidelines rigor plus a studio point of view: system components carry navigation and controls; identity lives in color, type, imagery, tone, and a few defining moments. Be usable first, unmistakable second. (Distilled from the apple-design skill for web generation; translate app vocabulary: tab bar becomes site nav, sheet becomes dialog, safe area becomes viewport and notch, menu bar becomes header nav.)

## 1. Token system before layout
- Color: 4-6 named roles (surface, content, accent, signal) as CSS variables, each with light AND dark variants. One color means one thing. Nothing conveyed by color alone.
- Contrast numbers, no guessing: body text 4.5:1 minimum; large/bold display 3:1 minimum.
- Type: one display face with restraint, one body face (min 16px body, never light/thin weights for small text), clear scale where size and weight carry hierarchy.
- Signature: ONE element the site is remembered by; everything around it quiet. Branding defends content, never repeats through the page.

## 2. Anti-template filter (run before proposing)
Reject defaults with no reason rooted in the product: warm-cream + serif + terracotta; near-black + acid accent; hairline-rule broadsheet with zero radius; hero of big-number-over-small-label with gradient accent; 01/02/03 markers on non-sequences. Self-test: would I produce this same plan for a different product? If yes, revise and say what changed. Then remove one accessory.

## 3. Layout and craft
- Alignment, grouping, generous space around controls; progressive disclosure over density. No full-width buttons stretched across wide layouts.
- One consistent icon language, weight-matched to adjacent text (inline SVG only).
- Touch targets min 44px, never under 28px; comfortable spacing between controls. Content clears sticky headers; no horizontal scroll at 360px width.
- Motion is purposeful, brief, and rare — one orchestrated moment at most, otherwise none. Always respect prefers-reduced-motion and reduced-transparency.

## 4. Interaction and writing
- Something renders immediately; determinate progress when possible. Feedback lives in the interface, never in alerts for common actions. Destructive actions get confirm + Cancel; the rest get Undo.
- Labels say what happens ("Save changes", not "Submit"); errors say what went wrong and how to fix it, no apologies, no jargon. Empty states invite the next action.

## 5. Quality floor (non-negotiable)
Responsive to the smallest width, visible keyboard focus, survives 200% text size, works keyboard-only, every image has alt text, exactly one h1 per page.
