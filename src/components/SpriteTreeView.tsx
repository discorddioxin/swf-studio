import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CharLabel, Project, SwfDocument } from '../types';
import { cn } from '../utils/cn';
import { buildSpriteTree, analyzeSpriteUsage, type SpriteTreeNode, type SpriteTreeScope } from '../lib/spriteTree';
import { charName } from './Sidebar';

export function SpriteTreeView({
  doc, project, selectedId, activeTimeline, onSelect, onOpenTimeline, onSetLabel,
}: {
  doc: SwfDocument;
  project: Project;
  selectedId: number | null;
  activeTimeline: string;
  onSelect: (id: number) => void;
  onOpenTimeline: (id: string) => void;
  onSetLabel: (id: number, patch: Partial<CharLabel>) => void;
}) {
  const [scope, setScope] = useState<SpriteTreeScope>('local');
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [addingTagTo, setAddingTagTo] = useState<number | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const discardTagOnBlur = useRef(false);
  const graph = useMemo(() => analyzeSpriteUsage(doc), [doc]);
  const localTree = useMemo(() => buildSpriteTree(doc, graph, 'local'), [doc, graph]);
  const globalTree = useMemo(() => buildSpriteTree(doc, graph, 'global'), [doc, graph]);
  const tree = scope === 'local' ? localTree : globalTree;

  useEffect(() => setExpanded(null), [scope, doc]);

  const localSpriteCount = [...graph.parentTimelineIds.values()].filter((parents) => parents.length <= 1).length;
  const globalSpriteCount = [...graph.parentTimelineIds.values()].filter((parents) => parents.length > 1).length;
  const spriteCount = scope === 'local' ? localSpriteCount : globalSpriteCount;

  const timelineName = (id: string) => {
    if (id === 'root') return 'Main Timeline';
    const timeline = doc.timelines.get(id);
    const character = timeline?.characterId != null ? doc.characters.get(timeline.characterId) : undefined;
    return character ? charName(character, project) : timeline?.name ?? id;
  };

  const toggleExpanded = (node: SpriteTreeNode) => {
    setExpanded((current) => {
      // Root nodes are expanded on first display. Materialize that default
      // before applying a user toggle so a click always has an immediate effect.
      const next = current ? new Set(current) : new Set(tree.map((root) => root.key));
      if (next.has(node.key)) next.delete(node.key);
      else next.add(node.key);
      return next;
    });
  };

  const saveTag = (id: number) => {
    const tag = tagDraft.trim().toLowerCase().replace(/\s+/g, '-');
    const current = project.characters[id]?.tags ?? [];
    if (tag && !current.includes(tag)) onSetLabel(id, { tags: [...current, tag] });
    setAddingTagTo(null);
    setTagDraft('');
  };

  const renderNode = (node: SpriteTreeNode, depth: number): ReactNode => {
    const character = graph.sprites.get(node.characterId);
    if (!character) return null;
    const timelineId = character.timelineId ?? `virtual:${character.id}`;
    const timeline = character.timelineId ? doc.timelines.get(character.timelineId) : undefined;
    const frameCount = Math.max(character.frameCount ?? 0, timeline?.frameCount ?? 0);
    const isOpen = activeTimeline === timelineId;
    const isSelected = selectedId === character.id;
    const isExpanded = expanded === null ? depth === 0 : expanded.has(node.key);
    const parents = node.parentTimelineIds;
    const parentNames = parents.length ? parents.map(timelineName).join(', ') : 'No parent timeline';
    const name = charName(character, project);
    const tags = project.characters[character.id]?.tags ?? [];
    const editingTag = addingTagTo === character.id;

    return (
      <div key={node.key} role="treeitem" data-character-id={character.id} aria-level={depth + 1} aria-selected={isSelected || isOpen} aria-expanded={node.children.length ? isExpanded : undefined}>
        <div className={cn(
          'group flex min-w-0 items-center gap-1 rounded-md pr-2 transition-colors',
          isSelected || isOpen ? 'bg-violet-500/10' : 'hover:bg-zinc-900',
          isOpen && 'ring-1 ring-inset ring-violet-500/25',
        )} style={{ paddingLeft: 6 + depth * 14 }}>
          {node.children.length > 0 ? (
            <button
              type="button"
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${name}`}
              aria-expanded={isExpanded}
              onClick={() => toggleExpanded(node)}
              className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >{isExpanded ? '▾' : '▸'}</button>
          ) : <span className="w-5 shrink-0" />}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-violet-500/20 bg-violet-500/10 text-[9px] font-semibold text-violet-300">MC</span>
          <div className="min-w-0 flex-1 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <InlineTreeName
                name={name}
                onStart={() => onSelect(character.id)}
                onSave={(next) => onSetLabel(character.id, { name: next })}
              />
              <span className="shrink-0 text-[9px] text-zinc-600">#{character.id}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-[9px] text-zinc-500">
              <span className="shrink-0">{frameCount} frames</span>
              <span aria-hidden="true" className="text-zinc-700">·</span>
              <span className="min-w-0 truncate" title={parentNames}>{parentNames}</span>
            </div>
            {tags.length > 0 && (
              <div className="mt-1 flex min-w-0 items-center gap-1" title={`Tags: ${tags.join(', ')}`}>
                {tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="max-w-20 truncate rounded border border-violet-500/25 bg-violet-500/10 px-1 py-0.5 text-[8px] text-violet-300">{tag}</span>
                ))}
                {tags.length > 3 && <span className="shrink-0 text-[8px] text-zinc-500">+{tags.length - 3}</span>}
              </div>
            )}
            {editingTag && (
              <input
                autoFocus
                aria-label={`New tag for ${name}`}
                className="mt-1 w-full rounded border border-violet-500/50 bg-zinc-950 px-1.5 py-1 text-[10px] text-zinc-100 outline-none placeholder:text-zinc-600"
                placeholder="tag name · Enter to add"
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onBlur={() => {
                  if (discardTagOnBlur.current) {
                    discardTagOnBlur.current = false;
                    return;
                  }
                  saveTag(character.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    discardTagOnBlur.current = true;
                    setAddingTagTo(null);
                    setTagDraft('');
                  }
                }}
              />
            )}
          </div>
          <span className={cn(
            'shrink-0 rounded border px-1 py-0.5 text-[8px] font-medium',
            parents.length > 1
              ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300'
              : 'border-zinc-700 bg-zinc-900 text-zinc-500',
          )}>
            {parents.length > 1 ? `${parents.length} parents` : parents.length === 1 ? '1 parent' : 'root'}
          </span>
          <button
            type="button"
            aria-label={`Open ${name} timeline`}
            title={`Open ${name} timeline`}
            onClick={() => {
              onSelect(character.id);
              onOpenTimeline(timelineId);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-violet-200"
          >↗</button>
          <button
            type="button"
            aria-label={`Add tag to ${name}`}
            title={`Add tag to ${name}`}
            onClick={() => {
              discardTagOnBlur.current = false;
              setTagDraft('');
              setAddingTagTo(character.id);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-base leading-none text-zinc-500 hover:bg-violet-500/15 hover:text-violet-200"
          >+</button>
        </div>
        {isExpanded && node.children.length > 0 && (
          <div role="group" className="border-l border-zinc-800/80" style={{ marginLeft: 16 + depth * 14 }}>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="shrink-0 border-b border-zinc-800/80 px-3 pb-2 pt-2">
        <div role="tablist" aria-label="Sprite tree scope" className="flex rounded-lg border border-zinc-800 bg-zinc-900/70 p-0.5">
          {(['local', 'global'] as const).map((tab) => {
            const count = tab === 'local' ? localSpriteCount : globalSpriteCount;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={scope === tab}
                onClick={() => setScope(tab)}
                title={tab === 'local' ? 'Sprites with zero or one parent timeline' : 'Sprites referenced by multiple parent timelines'}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium capitalize transition-colors',
                  scope === tab ? 'bg-violet-500/15 text-violet-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {tab}
                <span className={cn('rounded px-1 text-[9px]', scope === tab ? 'bg-violet-500/15 text-violet-300' : 'bg-zinc-800 text-zinc-600')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500">
            {scope === 'local' ? 'Single-parent & root sprites' : 'Shared across timelines'}
          </span>
          <span className="shrink-0 text-[9px] text-zinc-600">{spriteCount} sprites</span>
        </div>
      </div>

      <div role="tree" aria-label={`${scope} sprite tree`} className="min-h-0 flex-1 overflow-auto px-1.5 py-2">
        {tree.length ? tree.map((node) => renderNode(node, 0)) : (
          <div className="mx-2 mt-3 rounded-lg border border-dashed border-zinc-800 p-4 text-center">
            <div className="text-[11px] font-medium text-zinc-400">No {scope} sprites</div>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
              {scope === 'local'
                ? 'No multi-frame sprite has zero or one parent timeline.'
                : 'No multi-frame sprite is shared by multiple timelines.'}
            </p>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-zinc-800/80 px-3 py-2 text-[9px] text-zinc-600">
        Click a sprite name to rename it. Use ↗ to open its timeline and + to add a tag.
      </div>
    </div>
  );
}

function InlineTreeName({ name, onStart, onSave }: {
  name: string;
  onStart: () => void;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const finished = useRef(false);

  useEffect(() => {
    if (!editing) setValue(name);
  }, [editing, name]);

  const commit = () => {
    if (finished.current) return;
    finished.current = true;
    onSave(value.trim());
    setEditing(false);
  };

  const cancel = () => {
    finished.current = true;
    setValue(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={`Rename ${name}`}
        className="min-w-0 flex-1 rounded border border-violet-500/60 bg-zinc-950 px-1 py-0.5 text-[11px] font-medium text-zinc-100 outline-none"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (finished.current) return;
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={`Rename ${name}`}
      title={`Click to rename ${name}`}
      onClick={() => {
        finished.current = false;
        setValue(name);
        setEditing(true);
        onStart();
      }}
      className="min-w-0 truncate text-left text-[11px] font-medium text-zinc-200 decoration-violet-400/70 underline-offset-2 hover:text-violet-200 hover:underline"
    >{name}</button>
  );
}
