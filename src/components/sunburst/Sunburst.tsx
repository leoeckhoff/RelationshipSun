import { useEffect, useMemo, useState } from "react";
import {
  hierarchy as d3hierarchy,
  partition as d3partition,
  type HierarchyRectangularNode,
} from "d3-hierarchy";
import { arc as d3arc } from "d3-shape";
import { useAppStore, useNodeMap } from "../../store";
import { STATE_COLOR, type NodeRecord } from "../../types";
import { humanize } from "../../util";

type TreeNode = NodeRecord & { children?: TreeNode[] };

function buildTree(nodes: NodeRecord[], rootUuid: string): TreeNode | null {
  const childrenIdx = new Map<string, NodeRecord[]>();
  for (const n of nodes) {
    const list = childrenIdx.get(n.parentUuid) ?? [];
    list.push(n);
    childrenIdx.set(n.parentUuid, list);
  }
  const root = nodes.find((n) => n.uuid === rootUuid);
  if (!root) return null;
  const walk = (n: NodeRecord): TreeNode => ({
    ...n,
    children: (childrenIdx.get(n.uuid) ?? []).map(walk),
  });
  return walk(root);
}

const SIZE = 720;
const RADIUS = SIZE / 2 - 4;

export function Sunburst() {
  const nodes = useAppStore((s) => s.nodes);
  const appRoot = useAppStore((s) => s.rootUuid);
  const selectNode = useAppStore((s) => s.selectNode);
  const selectedUuid = useAppStore((s) => s.selectedUuid);
  const nodeMap = useNodeMap();

  const [focusUuid, setFocusUuid] = useState(appRoot);

  useEffect(() => {
    if (!nodes.some((n) => n.uuid === focusUuid)) {
      setFocusUuid(appRoot);
    }
  }, [nodes, focusUuid, appRoot]);

  const focusNode = nodeMap.get(focusUuid);

  const partitionData = useMemo(() => {
    const tree = buildTree(nodes, focusUuid);
    if (!tree) return null;
    const root = d3hierarchy<TreeNode>(tree).count();
    return d3partition<TreeNode>().size([2 * Math.PI, root.height + 1])(root);
  }, [nodes, focusUuid]);

  if (!partitionData || !focusNode) {
    return <div className="empty-state">No data — try resetting in Settings.</div>;
  }

  const totalDepth = (partitionData.height ?? 0) + 1;
  const ringWidth = RADIUS / totalDepth;

  const arcGen = d3arc<HierarchyRectangularNode<TreeNode>>()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.004))
    .padRadius(RADIUS * 1.5)
    .innerRadius((d) => Math.max(d.y0 * ringWidth, 0))
    .outerRadius((d) => Math.max(d.y0 * ringWidth, d.y1 * ringWidth - 1));

  const allNodes = partitionData.descendants();
  const focusParent = focusNode.parentUuid
    ? nodeMap.get(focusNode.parentUuid)
    : null;

  const breadcrumb: string[] = [];
  let cursor: NodeRecord | undefined = focusNode;
  while (cursor) {
    breadcrumb.unshift(humanize(cursor.key));
    cursor = cursor.parentUuid ? nodeMap.get(cursor.parentUuid) : undefined;
  }

  return (
    <div className="sunburst-wrap">
      <div className="sunburst-breadcrumb">
        {breadcrumb.length > 1
          ? breadcrumb.join(" › ")
          : "Click a segment to rate it. Click an inner ring to zoom in. Tap the center to zoom out."}
      </div>
      <svg viewBox={`-${RADIUS + 4} -${RADIUS + 4} ${SIZE} ${SIZE}`}>
        {allNodes.map((d) => {
          const isFocus = d.depth === 0;
          const isLeaf = !d.children || d.children.length === 0;
          const angle = d.x1 - d.x0;
          const arcPath = arcGen(d) ?? "";
          const midR = ((d.y0 + d.y1) / 2) * ringWidth;
          const arcLen = angle * Math.max(midR, 1);
          const showLabel = !isFocus && arcLen > 28;
          const midAngle = (d.x0 + d.x1) / 2;
          const lx = Math.sin(midAngle) * midR;
          const ly = -Math.cos(midAngle) * midR;
          let rotate = (midAngle * 180) / Math.PI - 90;
          if (rotate > 90) rotate -= 180;
          if (rotate < -90) rotate += 180;
          const fill = isFocus ? "#222" : STATE_COLOR[d.data.state];

          return (
            <g key={d.data.uuid}>
              <path
                d={arcPath}
                fill={fill}
                className={`sunburst-arc ${
                  !isLeaf || isFocus ? "clickable" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isFocus) {
                    if (focusParent) setFocusUuid(focusParent.uuid);
                    selectNode(focusUuid);
                  } else {
                    selectNode(d.data.uuid);
                    if (!isLeaf) setFocusUuid(d.data.uuid);
                  }
                }}
              >
                <title>
                  {humanize(d.data.key)}
                  {d.data.note ? ` — ${d.data.note}` : ""}
                </title>
              </path>
              {showLabel && (
                <text
                  className="sunburst-label"
                  transform={`translate(${lx},${ly}) rotate(${rotate})`}
                >
                  {humanize(d.data.key)}
                </text>
              )}
              {isFocus && (
                <text
                  className="sunburst-label"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  {focusParent ? "↑" : "•"}
                </text>
              )}
            </g>
          );
        })}
        {selectedUuid &&
          allNodes.some((d) => d.data.uuid === selectedUuid) &&
          (() => {
            const d = allNodes.find((d) => d.data.uuid === selectedUuid)!;
            if (d.depth === 0) return null;
            return (
              <path
                d={arcGen(d) ?? ""}
                fill="none"
                stroke="white"
                strokeWidth={2}
                pointerEvents="none"
              />
            );
          })()}
      </svg>
    </div>
  );
}
