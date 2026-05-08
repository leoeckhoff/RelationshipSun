import { useEffect, useMemo, useRef, useState } from "react";

import {
  hierarchy as d3hierarchy,
  partition as d3partition,
  type HierarchyRectangularNode,
} from "d3-hierarchy";
import { arc as d3arc } from "d3-shape";
import { useAppStore, useNodeMap } from "../../store";
import { STATE_COLOR, nextState, type NodeRecord } from "../../types";
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

const RADIUS = 320;
const MARGIN = 90; // room for label overflow
const VIEW = (RADIUS + MARGIN) * 2;
const DRAG_THRESHOLD_RAD = 0.02;
const DOUBLE_CLICK_MS = 260;

export function Sunburst() {
  const nodes = useAppStore((s) => s.nodes);
  const appRoot = useAppStore((s) => s.rootUuid);
  const selectNode = useAppStore((s) => s.selectNode);
  const setNodeState = useAppStore((s) => s.setNodeState);
  const selectedUuid = useAppStore((s) => s.selectedUuid);
  const activeFilter = useAppStore((s) => s.activeFilter);
  const focusUuid = useAppStore((s) => s.sunburstFocus);
  const setFocusUuid = useAppStore((s) => s.setSunburstFocus);
  const nodeMap = useNodeMap();

  const [rotation, setRotation] = useState(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    startMouseAngle: number;
    startRotation: number;
    dragged: boolean;
    pointerId: number;
  } | null>(null);
  const wasDragged = useRef(false);
  const clickTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!nodes.some((n) => n.uuid === focusUuid)) {
      setFocusUuid(appRoot);
    }
  }, [nodes, focusUuid, appRoot, setFocusUuid]);

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

  const breadcrumb: NodeRecord[] = [];
  {
    let cursor: NodeRecord | undefined = focusNode;
    while (cursor) {
      breadcrumb.unshift(cursor);
      cursor = cursor.parentUuid ? nodeMap.get(cursor.parentUuid) : undefined;
    }
  }

  function getMouseAngle(clientX: number, clientY: number): number | null {
    if (!svgRef.current) return null;
    const r = svgRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return Math.atan2(clientY - cy, clientX - cx);
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const angle = getMouseAngle(e.clientX, e.clientY);
    if (angle === null) return;
    dragRef.current = {
      startMouseAngle: angle,
      startRotation: rotation,
      dragged: false,
      pointerId: e.pointerId,
    };
    // Don't capture yet — capturing reroutes the upcoming click event from
    // the arc to the SVG, which kills the rate-on-click handler. We only
    // capture once we've actually detected a drag.
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const angle = getMouseAngle(e.clientX, e.clientY);
    if (angle === null) return;
    let delta = angle - drag.startMouseAngle;
    // wrap to [-π, π] so single drags rotate sensibly across the angle seam
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    if (Math.abs(delta) > DRAG_THRESHOLD_RAD) {
      if (!drag.dragged) {
        drag.dragged = true;
        // Now that this is clearly a drag, capture so we still get
        // pointermove/up if the cursor leaves the SVG.
        try {
          svgRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // ignore — some browsers throw if already captured
        }
      }
      setRotation(drag.startRotation + delta);
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      if (drag.dragged) wasDragged.current = true;
      dragRef.current = null;
      try {
        svgRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // not captured; nothing to release
      }
    }
  }

  function consumeDragFlag(): boolean {
    if (wasDragged.current) {
      wasDragged.current = false;
      return true;
    }
    return false;
  }

  function handleArcClick(d: HierarchyRectangularNode<TreeNode>, isFocus: boolean) {
    if (consumeDragFlag()) return;

    if (isFocus) {
      // Center: zoom out one level.
      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      if (focusParent) setFocusUuid(focusParent.uuid);
      selectNode(focusUuid);
      return;
    }

    // Defer single-click so we can detect double-click as "clear".
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      selectNode(d.data.uuid);
      setNodeState(d.data.uuid, "UNSET");
      return;
    }
    const uuid = d.data.uuid;
    const state = d.data.state;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      selectNode(uuid);
      setNodeState(uuid, nextState(state));
    }, DOUBLE_CLICK_MS);
  }

  const rotationDeg = (rotation * 180) / Math.PI;

  return (
    <div className="sunburst-wrap">
      <div className="sunburst-breadcrumb">
        {breadcrumb.length > 1 ? (
          breadcrumb.map((n, i) => (
            <span key={n.uuid}>
              {i > 0 && <span className="crumb-sep"> › </span>}
              <button
                className="crumb"
                onClick={() => {
                  if (i < breadcrumb.length - 1) setFocusUuid(n.uuid);
                  selectNode(n.uuid);
                }}
                disabled={i === breadcrumb.length - 1}
              >
                {humanize(n.key)}
              </button>
            </span>
          ))
        ) : (
          <span>
            Click to cycle ratings. Double-click to clear. Drag to rotate. Tap
            the center to zoom out.
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "none" }}
      >
        <g
          className={dragRef.current ? "spinning" : "spinnable"}
          transform={`rotate(${rotationDeg.toFixed(3)})`}
        >
          {allNodes.map((d) => {
            const isFocus = d.depth === 0;
            const arcPath = arcGen(d) ?? "";
            const fill = isFocus
              ? "var(--bg-elev-2)"
              : STATE_COLOR[d.data.state];
            const dimmed = !isFocus && !activeFilter.has(d.data.state);
            const midAngle = (d.x0 + d.x1) / 2;
            const ringHeight = (d.y1 - d.y0) * ringWidth;

            // Effective on-screen angle = midAngle + rotation, normalized [0, 2π).
            // Used only to decide flip direction so text never reads upside down.
            // The anchor position is fixed at the radial midpoint so the label
            // doesn't jump when crossing the flip threshold.
            const eff =
              ((midAngle + rotation) % (2 * Math.PI) + 2 * Math.PI) %
              (2 * Math.PI);
            const flip = eff > Math.PI / 2 && eff < (3 * Math.PI) / 2;

            const baseTextRot = (midAngle * 180) / Math.PI - 90;
            const textRot = flip ? baseTextRot + 180 : baseTextRot;

            const anchorR = ((d.y0 + d.y1) / 2) * ringWidth;
            const lx = Math.sin(midAngle) * anchorR;
            const ly = -Math.cos(midAngle) * anchorR;

            // Font size shrinks with depth so the deep rings don't smear.
            const fontSize = isFocus
              ? 14
              : d.depth >= 4
                ? 7
                : d.depth === 3
                  ? 8
                  : d.depth === 2
                    ? 9
                    : 10;

            return (
              <g
                key={d.data.uuid}
                style={{ opacity: dimmed ? 0.18 : 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleArcClick(d, isFocus);
                }}
              >
                <path d={arcPath} fill={fill} className="sunburst-arc">
                  <title>
                    {humanize(d.data.key)}
                    {d.data.note ? ` — ${d.data.note}` : ""}
                  </title>
                </path>
                {!isFocus && ringHeight > 14 && (
                  <text
                    className="sunburst-label"
                    transform={`translate(${lx},${ly}) rotate(${textRot})`}
                    style={{ fontSize }}
                    pointerEvents="none"
                  >
                    {humanize(d.data.key)}
                  </text>
                )}
                {isFocus && (
                  <text
                    className="sunburst-label sunburst-center"
                    style={{ fontSize: 16, fontWeight: 600 }}
                    transform={`rotate(${(-rotationDeg).toFixed(3)})`}
                    pointerEvents="none"
                  >
                    {focusParent ? "↑" : "·"}
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
        </g>
      </svg>
      {rotation !== 0 && (
        <button className="btn ghost" onClick={() => setRotation(0)}>
          ↺ Reset rotation
        </button>
      )}
    </div>
  );
}
