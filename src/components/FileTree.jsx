import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Plus, Search } from 'lucide-react';

function buildTree(paths) {
  const root = { name: '/', children: {}, isDir: true };
  paths.forEach((p) => {
    const segs = p.replace(/^\//, '').split('/');
    let node = root;
    segs.forEach((seg, i) => {
      if (!node.children[seg]) {
        node.children[seg] = { name: seg, children: {}, isDir: i < segs.length - 1, path: p };
      }
      node = node.children[seg];
    });
  });
  return root;
}

function FolderRow({ child, activeFile, onSelect, depth }) {
  // Independent open state per folder (a shared flag toggles all siblings).
  const [open, setOpen] = useState(depth < 2);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 text-[12px] text-zinc-600 hover:text-zinc-900 hover:bg-black/[0.03] px-2 py-1 rounded"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        {open ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
        {open ? <FolderOpen size={13} className="shrink-0 text-zinc-400" /> : <Folder size={13} className="shrink-0 text-zinc-400" />}
        <span className="truncate">{child.name}</span>
      </button>
      {open && <TreeNode node={child} activeFile={activeFile} onSelect={onSelect} depth={depth + 1} />}
    </div>
  );
}

function TreeNode({ node, activeFile, onSelect, depth = 0 }) {
  const entries = Object.values(node.children).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (!node.isDir || Object.keys(node.children).length === 0) return null;

  return (
    <div>
      {entries.map((child) => {
        if (child.isDir) {
          return <FolderRow key={child.name} child={child} activeFile={activeFile} onSelect={onSelect} depth={depth} />;
        }
        const isActive = child.path === activeFile;
        return (
          <button
            key={child.name}
            onClick={() => onSelect(child.path)}
            className={`w-full flex items-center gap-1.5 text-[12px] px-2 py-1 rounded truncate ${
              isActive ? 'bg-black/5 text-zinc-900 font-medium' : 'text-zinc-500 hover:text-zinc-700 hover:bg-black/[0.03]'
            }`}
            style={{ paddingLeft: depth * 12 + 20 }}
          >
            <FileText size={12} className="shrink-0 text-zinc-400" />
            <span className="truncate">{child.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function FileTree({ files, activeFile, onSelectFile, onAddFile, onDeleteFile }) {
  const [search, setSearch] = useState('');
  // Memoize on `files` itself — a fresh key array every render defeats useMemo.
  const paths = useMemo(() => Object.keys(files).sort(), [files]);
  const tree = useMemo(() => buildTree(paths), [paths]);

  const filteredPaths = search
    ? paths.filter((p) => p.toLowerCase().includes(search.toLowerCase()))
    : paths;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-black/10">
        <span className="text-[11px] text-zinc-500 font-medium flex-1">Files</span>
        <span className="text-[10px] text-zinc-400">{paths.length}</span>
        {onAddFile && (
          <button onClick={onAddFile} title="Add file" className="w-5 h-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-black/5">
            <Plus size={11} />
          </button>
        )}
      </div>
      <div className="px-2 py-1.5 border-b border-black/10">
        <div className="flex items-center gap-1.5 bg-black/[0.03] rounded-lg px-2 py-1">
          <Search size={11} className="text-zinc-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter…"
            className="flex-1 bg-transparent outline-none text-[11px] placeholder:text-zinc-400"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1 min-h-0">
        {search ? (
          <div className="px-2">
            {filteredPaths.map((p) => {
              const isActive = p === activeFile;
              const name = p.split('/').pop();
              return (
                <button
                  key={p}
                  onClick={() => onSelectFile(p)}
                  className={`w-full flex items-center gap-1.5 text-[12px] px-2 py-1 rounded truncate ${
                    isActive ? 'bg-black/5 text-zinc-900 font-medium' : 'text-zinc-500 hover:text-zinc-700 hover:bg-black/[0.03]'
                  }`}
                >
                  <FileText size={12} className="shrink-0 text-zinc-400" />
                  <span className="truncate text-[11px]">{p}</span>
                </button>
              );
            })}
            {filteredPaths.length === 0 && (
              <p className="text-[11px] text-zinc-400 py-2">No matches</p>
            )}
          </div>
        ) : (
          <TreeNode node={tree} activeFile={activeFile} onSelect={onSelectFile} depth={0} />
        )}
      </div>
    </div>
  );
}
