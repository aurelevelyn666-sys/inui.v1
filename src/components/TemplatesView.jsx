import { Blocks } from 'lucide-react';
import { TEMPLATES } from '../lib/templates.js';

// Templates: all six starters as one-tap cards.
export default function TemplatesView({ onSelect, onToast }) {
  const tags = [...new Set(TEMPLATES.map((t) => t.tag))];

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#fafafa] min-h-0">
      <div className="h-14 shrink-0 flex items-center px-5">
        <h1 className="text-[16px] font-semibold text-zinc-900">Templates</h1>
        <span className="ml-2 text-[11px] text-zinc-500">{TEMPLATES.length} starters</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-[980px] mx-auto px-6 pb-12 pt-2">
          {tags.map((tag) => (
            <div key={tag} className="mb-7">
              <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2.5">{tag}</div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {TEMPLATES.filter((t) => t.tag === tag).map((t) => (
                  <button
                    key={t.title}
                    onClick={() => {
                      if (onSelect) onSelect(t);
                      else if (onToast) onToast('Open a template from the home screen');
                    }}
                    className="text-left rounded-2xl p-4 bg-white border border-black/[0.07] hover:border-black/20 transition-colors flex flex-col min-h-[132px] group"
                  >
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: (t.color || '#3b66eb') + '1a' }}>
                      <Blocks size={14} style={{ color: t.color || '#3b66eb' }} />
                    </span>
                    <span className="text-[13.5px] font-medium text-zinc-900 mb-0.5 group-hover:underline">{t.title}</span>
                    <span className="text-[12px] text-zinc-500 leading-relaxed">{t.desc}</span>
                    <span className="mt-auto pt-3 text-[11px] font-medium text-[#3b66eb]">Use template</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
