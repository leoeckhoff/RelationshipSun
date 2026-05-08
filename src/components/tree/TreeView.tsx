import { useMemo, useState } from "react";
import { useAppStore, useChildrenIndex } from "../../store";
import { STATE_COLOR, type NodeRecord, type State } from "../../types";
import { humanize } from "../../util";

export function TreeView() {
  const rootUuid = useAppStore((s) => s.rootUuid);
  const nodes = useAppStore((s) => s.nodes);
  const childrenIdx = useChildrenIndex();
  const selectNode = useAppStore((s) => s.selectNode);
  const selectedUuid = useAppStore((s) => s.selectedUuid);
  const activeFilter = useAppStore((s) => s.activeFilter);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const byId = new Map<string, NodeRecord>();
    for (const n of nodes) byId.set(n.uuid, n);
    const out = new Set<string>();
    function walk(uuid: string): boolean {
      const node = byId.get(uuid);
      if (!node) return false;
      const kids = childrenIdx.get(uuid) ?? [];
      let anyChildVisible = false;
      for (const k of kids) {
        if (walk(k.uuid)) anyChildVisible = true;
      }
      const selfVisible = activeFilter.has(node.state as State);
      if (selfVisible || anyChildVisible) {
        out.add(uuid);
        return true;
      }
      return false;
    }
    walk(rootUuid);
    return out;
  }, [nodes, activeFilter, childrenIdx, rootUuid]);

  function toggle(uuid: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  function renderNode(uuid: string, depth: number): React.ReactNode {
    if (!visible.has(uuid)) return null;
    const kids = (childrenIdx.get(uuid) ?? []).filter((k) =>
      visible.has(k.uuid),
    );
    const isCollapsed = collapsed.has(uuid);
    return (
      <div key={uuid}>
        <Row
          uuid={uuid}
          hasChildren={kids.length > 0}
          collapsed={isCollapsed}
          selected={selectedUuid === uuid}
          onToggle={() => toggle(uuid)}
          onSelect={() => selectNode(uuid)}
          depth={depth}
        />
        {!isCollapsed && kids.length > 0 && (
          <div className="tree-children">
            {kids.map((c) => renderNode(c.uuid, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  if (!visible.has(rootUuid)) {
    return (
      <div className="tree">
        <div className="empty-state">
          No items match the current filter.
        </div>
      </div>
    );
  }

  return <div className="tree">{renderNode(rootUuid, 0)}</div>;
}

function Row({
  uuid,
  hasChildren,
  collapsed,
  selected,
  onToggle,
  onSelect,
}: {
  uuid: string;
  hasChildren: boolean;
  collapsed: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  depth: number;
}) {
  const node = useAppStore((s) => s.nodes.find((n) => n.uuid === uuid)) as
    | NodeRecord
    | undefined;
  if (!node) return null;
  return (
    <div
      className={`tree-row ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <span
        className="chevron"
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) onToggle();
        }}
      >
        {hasChildren ? (collapsed ? "▶" : "▼") : "·"}
      </span>
      <span
        className="swatch"
        style={{ background: STATE_COLOR[node.state] }}
      />
      <span className="key">{humanize(node.key)}</span>
      {node.note && <span className="note-marker" title={node.note}>✎</span>}
      {node.custom && (
        <span className="note-marker" title="Custom item">
          ＋
        </span>
      )}
    </div>
  );
}
