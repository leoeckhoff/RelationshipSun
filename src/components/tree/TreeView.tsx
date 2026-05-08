import { useState } from "react";
import { useAppStore, useChildrenIndex } from "../../store";
import { STATE_COLOR, type NodeRecord } from "../../types";
import { humanize } from "../../util";

export function TreeView() {
  const rootUuid = useAppStore((s) => s.rootUuid);
  const childrenIdx = useChildrenIndex();
  const selectNode = useAppStore((s) => s.selectNode);
  const selectedUuid = useAppStore((s) => s.selectedUuid);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(uuid: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  function renderNode(uuid: string, depth: number): React.ReactNode {
    const kids = childrenIdx.get(uuid) ?? [];
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
