import { useMemo, useState } from 'react';
import { Rocket, ArrowUpRight, RefreshCw, Download } from 'lucide-react';
import { buildSrcDoc, pickEntry } from '../lib/files.js';
import { exportProjectZip, downloadBlob, openBlobTab } from '../lib/zip.js';

// Builds: every conversation that produced files, rendered as live thumbnails
// (sandboxed iframes showing the real site, scaled down).
export default function BuildsView({ convos, onOpen, onToast }) {
  const [refresh, setRefresh] = useState(0);

  const builds = useMemo(() => {
    void refresh;
    return (convos || [])
      .filter((c) => c.files && Object.keys(c.files).length > 2)
      .map((c) => {
        try {
          const r = buildSrcDoc({ files: c.files, overrides: c.overrides || {}, editable: false, entry: pickEntry(c.files) });
          return r.srcDoc ? { id: c.id, title: c.title || 'Untitled build', updated: c.updatedAt, srcDoc: r.srcDoc, files: c.files, overrides: c.overrides || {} } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }, [convos, refresh]);

  const fmt = (ts) =>
    new Date(ts || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const openTab = (b) => {
    openBlobTab(new Blob([b.srcDoc], { type: 'text/html' }), () =>
      onToast ? onToast('Popup blocked — allow popups to open previews') : undefined
    );
  };

  const exportZip = (b) => {
    try {
      const { blob, fileCount, error } = exportProjectZip({ files: b.files, overrides: b.overrides, buildSrcDoc });
      downloadBlob(blob, 'inui-site.zip');
      if (onToast) {
        onToast(
          error
            ? 'Exported ' + fileCount + ' file(s), but index.html is missing: ' + String(error).slice(0, 80)
            : 'Exported ' + fileCount + ' file(s) as inui-site.zip'
        );
      }
    } catch (e) {
      if (onToast) onToast('Export failed: ' + String((e && e.message) || e).slice(0, 80));
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#fafafa] min-h-0">
      <div className="h-14 shrink-0 flex items-center px-5">
        <h1 className="text-[16px] font-semibold text-zinc-900">Builds</h1>
        <span className="ml-2 text-[11px] text-zinc-500">{builds.length} generated site{builds.length === 1 ? '' : 's'}</span>
        <button
          onClick={() => setRefresh((k) => k + 1)}
          title="Refresh thumbnails"
          className="ml-auto h-8 flex items-center gap-1.5 text-[12px] text-zinc-700 bg-white border border-black/[0.08] rounded-full px-3.5 hover:border-black/20"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {builds.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <span className="w-12 h-12 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center mb-3">
              <Rocket size={20} className="text-zinc-400" />
            </span>
            <p className="text-[14px] font-medium text-zinc-800">No builds yet</p>
            <p className="text-[12.5px] text-zinc-500 mt-1 max-w-xs">
              Generate a site from a template or a prompt — every build shows up here with a live thumbnail.
            </p>
          </div>
        ) : (
          <div className="max-w-[1080px] mx-auto px-6 pb-10 grid sm:grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
            {builds.map((b) => (
              <div key={b.id} className="group rounded-2xl bg-white border border-black/[0.07] overflow-hidden hover:border-black/20 transition-colors">
                <div className="relative h-40 bg-zinc-100 overflow-hidden">
                  <iframe
                    title={'build-' + b.id}
                    sandbox="allow-scripts"
                    srcDoc={b.srcDoc}
                    tabIndex={-1}
                    className="absolute pointer-events-none border-0 origin-top-left"
                    style={{ width: 1200, height: 800, transform: 'scale(0.33)' }}
                  />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 flex items-center justify-center gap-2">
                    <button
                      onClick={() => onOpen(b.id)}
                      className="h-8 flex items-center gap-1.5 text-[12px] font-medium bg-white text-zinc-900 rounded-full px-3.5"
                    >
                      Open chat <ArrowUpRight size={12} />
                    </button>
                    <button
                      onClick={() => openTab(b)}
                      title="Open site in new tab"
                      className="h-8 w-8 flex items-center justify-center bg-white/90 text-zinc-700 rounded-full"
                    >
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
                <div className="px-3.5 py-3 flex items-center gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-zinc-800 truncate">{b.title}</div>
                    <div className="text-[11px] text-zinc-400">{fmt(b.updated)} · {Object.keys(b.files).length} files</div>
                  </div>
                  <button
                    onClick={() => exportZip(b)}
                    title="Export as ZIP"
                    className="ml-auto p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04]"
                  >
                    <Download size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
