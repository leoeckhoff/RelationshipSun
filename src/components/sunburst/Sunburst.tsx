import { useEffect, useMemo, useRef, useState } from "react";
import {
  hierarchy as d3hierarchy,
  partition as d3partition,
  type HierarchyRectangularNode,
} from "d3-hierarchy";
import { arc as d3arc } from "d3-shape";
import { useAppStore, useNodeMap } from "../../store";
import { STATE_COLOR, nextState, type NodeRecord } from "../../types";
import { fitLabel, humanize } from "../../util";

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

const RADIUS = 360;
const MARGIN = 90; // room for label overflow
const VIEW = (RADIUS + MARGIN) * 2;
const DRAG_THRESHOLD_RAD = 0.02;
const DOUBLE_CLICK_MS = 260;
const MIN_SCALE = 0.6;
const MAX_SCALE = 3;

interface RenderItem {
  uuid: string;
  isFocus: boolean;
  isLeaf: boolean;
  arcPath: string;
  fill: string;
  dimmed: boolean;
  showLabel: boolean;
  label: string;
  fullLabel: string;
  note: string | undefined;
  lx: number;
  ly: number;
  textRot: number;
  fontSize: number;
  depth: number;
  d: HierarchyRectangularNode<TreeNode>;
}

interface BranchDivider {
  key: string;
  angle: number;
  innerR: number;
  outerR: number;
  topLevel: boolean;
}

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
  const [scale, setScale] = useState(1);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 600 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setContainerSize({ w: r.width, h: r.height });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const focusNode = nodeMap.get(focusUuid);

  const partitionData = useMemo(() => {
    const tree = buildTree(nodes, focusUuid);
    if (!tree) return null;
    const root = d3hierarchy<TreeNode>(tree).count();
    return d3partition<TreeNode>().size([2 * Math.PI, root.height + 1])(root);
  }, [nodes, focusUuid]);

  const renderItems: RenderItem[] = useMemo(() => {
    if (!partitionData) return [];
    const totalDepth = (partitionData.height ?? 0) + 1;
    const ringWidth = RADIUS / totalDepth;

    const arcGen = d3arc<HierarchyRectangularNode<TreeNode>>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.004))
      .padRadius(RADIUS * 1.5)
      .innerRadius((d) => Math.max(d.y0 * ringWidth, 0))
      .outerRadius((d) => Math.max(d.y0 * ringWidth, d.y1 * ringWidth - 1));

    return partitionData.descendants().map((d) => {
      const isFocus = d.depth === 0;
      const isLeaf = !d.children || d.children.length === 0;
      const arcPath = arcGen(d) ?? "";
      const fill = isFocus
        ? "var(--bg-elev-2)"
        : STATE_COLOR[d.data.state];
      const dimmed = !isFocus && !activeFilter.has(d.data.state);

      const midAngle = (d.x0 + d.x1) / 2;
      const ringHeight = (d.y1 - d.y0) * ringWidth;
      const eff =
        ((midAngle + rotation) % (2 * Math.PI) + 2 * Math.PI) %
        (2 * Math.PI);
      // Flip when the label sits on the left half of the wheel — transitions
      // happen at 12 o'clock and 6 o'clock (the vertical axis).
      const flip = eff >= Math.PI;

      const baseTextRot = (midAngle * 180) / Math.PI - 90;
      const textRot = flip ? baseTextRot + 180 : baseTextRot;

      const anchorR = ((d.y0 + d.y1) / 2) * ringWidth;
      const lx = Math.sin(midAngle) * anchorR;
      const ly = -Math.cos(midAngle) * anchorR;

      const fontSize = isFocus
        ? 14
        : d.depth >= 4
          ? 7
          : d.depth === 3
            ? 8
            : d.depth === 2
              ? 9
              : 10;

      const fullLabel = humanize(d.data.key);
      // Allow a bit of overflow past the ring height so labels aren't clipped
      // too aggressively, but cap with an ellipsis for very long names.
      const label = isFocus
        ? fullLabel
        : fitLabel(fullLabel, ringHeight * 1.4, fontSize);
      const showLabel = !isFocus && ringHeight > 14 && label.length > 0;

      return {
        uuid: d.data.uuid,
        isFocus,
        isLeaf,
        arcPath,
        fill,
        dimmed,
        showLabel,
        label,
        fullLabel,
        note: d.data.note,
        lx,
        ly,
        textRot,
        fontSize,
        depth: d.depth,
        d,
      };
    });
  }, [partitionData, activeFilter, rotation]);

  // Radial dividers that visually group descendants under the same top-level
  // branch. We draw a line at every depth-1 sibling boundary, extending from
  // that branch's inner radius all the way out, so deeply nested arcs can be
  // traced back to the parent wedge they belong to.
  const branchDividers: BranchDivider[] = useMemo(() => {
    if (!partitionData) return [];
    const totalDepth = (partitionData.height ?? 0) + 1;
    const ringWidth = RADIUS / totalDepth;
    const divs: BranchDivider[] = [];
    const topLevel = partitionData
      .descendants()
      .filter((d) => d.depth === 1)
      .sort((a, b) => a.x0 - b.x0);
    if (topLevel.length <= 1) return [];
    for (const d of topLevel) {
      divs.push({
        key: `tl-${d.data.uuid}`,
        angle: d.x0,
        innerR: d.y0 * ringWidth,
        outerR: RADIUS,
        topLevel: true,
      });
    }
    return divs;
  }, [partitionData]);

  if (!partitionData || !focusNode) {
    return <div className="empty-state">No data — try resetting in Settings.</div>;
  }

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
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const angle = getMouseAngle(e.clientX, e.clientY);
    if (angle === null) return;
    let delta = angle - drag.startMouseAngle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    if (Math.abs(delta) > DRAG_THRESHOLD_RAD) {
      if (!drag.dragged) {
        drag.dragged = true;
        try {
          svgRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // ignore
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
        // ignore
      }
    }
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    if (!e.ctrlKey && !e.metaKey && e.shiftKey) {
      // Allow Shift+wheel to scroll horizontally if needed
      return;
    }
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setScale((s) => clamp(s + delta * s, MIN_SCALE, MAX_SCALE));
  }

  function consumeDragFlag(): boolean {
    if (wasDragged.current) {
      wasDragged.current = false;
      return true;
    }
    return false;
  }

  function handleArcClick(item: RenderItem) {
    if (consumeDragFlag()) return;

    if (item.isFocus) {
      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      if (focusParent) setFocusUuid(focusParent.uuid);
      selectNode(focusUuid);
      return;
    }

    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      selectNode(item.uuid);
      setNodeState(item.uuid, "UNSET");
      return;
    }
    const uuid = item.uuid;
    const state = item.d.data.state;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      selectNode(uuid);
      setNodeState(uuid, nextState(state));
    }, DOUBLE_CLICK_MS);
  }

  const rotationDeg = (rotation * 180) / Math.PI;

  const arcGenForSelection = d3arc<HierarchyRectangularNode<TreeNode>>()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.004))
    .padRadius(RADIUS * 1.5)
    .innerRadius((d) => {
      const totalDepth = (partitionData.height ?? 0) + 1;
      return Math.max(d.y0 * (RADIUS / totalDepth), 0);
    })
    .outerRadius((d) => {
      const totalDepth = (partitionData.height ?? 0) + 1;
      const ringWidth = RADIUS / totalDepth;
      return Math.max(d.y0 * ringWidth, d.y1 * ringWidth - 1);
    });

  const selectedItem = renderItems.find(
    (it) => it.uuid === selectedUuid && !it.isFocus,
  );

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
            Click to cycle ratings · double-click to clear · drag to rotate ·
            scroll to zoom
          </span>
        )}
      </div>
      <div className="sunburst-scroll" ref={scrollRef}>
        <svg
          ref={svgRef}
          viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          style={{
            touchAction: "none",
            width: Math.max(
              260,
              Math.min(containerSize.w, containerSize.h) * scale,
            ),
            height: Math.max(
              260,
              Math.min(containerSize.w, containerSize.h) * scale,
            ),
            maxWidth: "none",
            flex: "none",
          }}
        >
          <g
            className={dragRef.current ? "spinning" : "spinnable"}
            transform={`rotate(${rotationDeg.toFixed(3)})`}
          >
            {/* Pass 1: arc fills with the rate-on-click handler */}
            {renderItems.map((it) => (
              <g
                key={`arc-${it.uuid}`}
                style={{ opacity: it.dimmed ? 0.18 : 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleArcClick(it);
                }}
              >
                <path
                  d={it.arcPath}
                  fill={it.fill}
                  className={`sunburst-arc${it.depth === 1 ? " top-level" : ""}`}
                >
                  <title>
                    {it.fullLabel}
                    {it.note ? ` — ${it.note}` : ""}
                  </title>
                </path>
              </g>
            ))}

            {/* Radial dividers between top-level branches — drawn after arcs
                so they are visible across all nested rings. */}
            {branchDividers.map((div) => {
              const sx = Math.sin(div.angle) * div.innerR;
              const sy = -Math.cos(div.angle) * div.innerR;
              const ex = Math.sin(div.angle) * div.outerR;
              const ey = -Math.cos(div.angle) * div.outerR;
              return (
                <line
                  key={div.key}
                  x1={sx}
                  y1={sy}
                  x2={ex}
                  y2={ey}
                  className="sunburst-branch-divider"
                  pointerEvents="none"
                />
              );
            })}

            {/* Pass 2: labels — rendered on top so arcs never obscure text.
                Each label is wrapped in its own clickable <g> so clicks on a
                visible label always go to that label's arc, even if the text
                visually overlaps a neighbouring arc. */}
            {renderItems.map((it) =>
              it.isFocus ? (
                <text
                  key={`label-${it.uuid}`}
                  className="sunburst-label sunburst-center"
                  style={{ fontSize: 16, fontWeight: 600 }}
                  transform={`rotate(${(-rotationDeg).toFixed(3)})`}
                  pointerEvents="none"
                >
                  {focusParent ? "↑" : "·"}
                </text>
              ) : it.showLabel ? (
                <g
                  key={`label-${it.uuid}`}
                  style={{ opacity: it.dimmed ? 0.18 : 1 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArcClick(it);
                  }}
                >
                  <text
                    className="sunburst-label"
                    transform={`translate(${it.lx},${it.ly}) rotate(${it.textRot})`}
                    style={{ fontSize: it.fontSize }}
                  >
                    <title>
                      {it.fullLabel}
                      {it.note ? ` — ${it.note}` : ""}
                    </title>
                    {it.label}
                  </text>
                </g>
              ) : null,
            )}

            {selectedItem && (
              <path
                d={arcGenForSelection(selectedItem.d) ?? ""}
                fill="none"
                stroke="white"
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
      </div>
      <div className="sunburst-controls">
        <button
          className="btn"
          onClick={() => setScale((s) => clamp(s - 0.15, MIN_SCALE, MAX_SCALE))}
          disabled={scale <= MIN_SCALE + 0.001}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          className="btn"
          onClick={() => setScale(1)}
          disabled={scale === 1}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          className="btn"
          onClick={() => setScale((s) => clamp(s + 0.15, MIN_SCALE, MAX_SCALE))}
          disabled={scale >= MAX_SCALE - 0.001}
          aria-label="Zoom in"
        >
          +
        </button>
        {rotation !== 0 && (
          <button
            className="btn ghost"
            style={{ marginLeft: 8 }}
            onClick={() => setRotation(0)}
          >
            ↺ Reset rotation
          </button>
        )}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
