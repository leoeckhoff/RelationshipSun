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
const DRAG_THRESHOLD_PX = 4;
const DOUBLE_CLICK_MS = 260;
const MIN_SCALE = 0.4;
const MAX_SCALE = 8;

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

type Interaction =
  | {
      kind: "rotate";
      pointerId: number;
      startMouseAngle: number;
      startRotation: number;
      moved: boolean;
    }
  | {
      kind: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startPan: { x: number; y: number };
      moved: boolean;
    }
  | {
      kind: "pinch";
      pointerIdA: number;
      pointerIdB: number;
      startDist: number;
      startScale: number;
      // SVG-space midpoint at pinch start, and the world point under it,
      // so we can keep that world point pinned to the live midpoint.
      startWorld: { x: number; y: number };
    }
  | null;

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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Live refs so wheel/pointer handlers can compute new state without
  // re-binding when scale or pan changes.
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  const rotationRef = useRef(rotation);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  const interactionRef = useRef<Interaction>(null);
  const pointers = useRef<Map<number, { clientX: number; clientY: number }>>(
    new Map(),
  );
  const wasDragged = useRef(false);
  const clickTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!nodes.some((n) => n.uuid === focusUuid)) {
      setFocusUuid(appRoot);
    }
  }, [nodes, focusUuid, appRoot, setFocusUuid]);

  // Reset pan when focus changes so the new wheel is centred.
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setScale(1);
  }, [focusUuid]);

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

  // Native wheel handler: pinch-zoom (ctrl/meta) vs pan (plain wheel).
  // Attached non-passive so we can preventDefault and stop the page scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      // Trackpad pinch and Ctrl+wheel both arrive with ctrlKey=true (the
      // browser synthesises ctrlKey for pinches); meta is a Mac convenience.
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        zoomAroundClient(e.clientX, e.clientY, factor);
      } else {
        // Plain wheel / two-finger drag = pan. Use the SVG/world unit ratio
        // so the content tracks the cursor at any zoom level.
        const u = clientPxToSvgUnit();
        setPan((p) => ({
          x: p.x - e.deltaX * u,
          y: p.y - e.deltaY * u,
        }));
      }
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // -- coordinate helpers ----------------------------------------------------
  function clientToSvg(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function svgToWorld(p: { x: number; y: number }): { x: number; y: number } {
    return {
      x: (p.x - panRef.current.x) / scaleRef.current,
      y: (p.y - panRef.current.y) / scaleRef.current,
    };
  }

  function clientPxToSvgUnit(): number {
    const svg = svgRef.current;
    if (!svg) return 1;
    const r = svg.getBoundingClientRect();
    if (r.width === 0) return 1;
    return VIEW / r.width;
  }

  function zoomAroundClient(clientX: number, clientY: number, factor: number) {
    const svgPt = clientToSvg(clientX, clientY);
    if (!svgPt) return;
    const oldScale = scaleRef.current;
    const newScale = clamp(oldScale * factor, MIN_SCALE, MAX_SCALE);
    if (newScale === oldScale) return;
    const worldX = (svgPt.x - panRef.current.x) / oldScale;
    const worldY = (svgPt.y - panRef.current.y) / oldScale;
    const newPan = {
      x: svgPt.x - newScale * worldX,
      y: svgPt.y - newScale * worldY,
    };
    setScale(newScale);
    setPan(newPan);
  }

  function angleAtClient(clientX: number, clientY: number): number | null {
    const svgPt = clientToSvg(clientX, clientY);
    if (!svgPt) return null;
    const w = svgToWorld(svgPt);
    return Math.atan2(w.y, w.x);
  }

  function distanceFromCenter(clientX: number, clientY: number): number {
    const svgPt = clientToSvg(clientX, clientY);
    if (!svgPt) return Infinity;
    const w = svgToWorld(svgPt);
    return Math.hypot(w.x, w.y);
  }

  // -- pointer interactions --------------------------------------------------
  function startPinch(idA: number, idB: number) {
    const a = pointers.current.get(idA);
    const b = pointers.current.get(idB);
    if (!a || !b) return;
    const midClientX = (a.clientX + b.clientX) / 2;
    const midClientY = (a.clientY + b.clientY) / 2;
    const startDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const svgMid = clientToSvg(midClientX, midClientY);
    if (!svgMid) return;
    const world = svgToWorld(svgMid);
    interactionRef.current = {
      kind: "pinch",
      pointerIdA: idA,
      pointerIdB: idB,
      startDist: Math.max(1, startDist),
      startScale: scaleRef.current,
      startWorld: world,
    };
    wasDragged.current = true;
  }

  function capturePointer(id: number) {
    try {
      svgRef.current?.setPointerCapture(id);
    } catch {
      // ignore
    }
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // Ignore non-primary mouse buttons; allow touch and pen by default.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (pointers.current.size >= 2) {
      const ids = Array.from(pointers.current.keys()).slice(0, 2);
      // A pinch is a real gesture immediately, so capture both pointers
      // now so they can drift outside the SVG without losing tracking.
      capturePointer(ids[0]);
      capturePointer(ids[1]);
      startPinch(ids[0], ids[1]);
      return;
    }
    // Single-pointer: don't capture yet — capture would steal the click
    // that follows pointerup, breaking arc rate-cycle clicks. We capture
    // on first move once the drag threshold is exceeded.

    // Single pointer: rotate when the press lands on the wheel ring,
    // pan when it lands in the surrounding margin.
    const dist = distanceFromCenter(e.clientX, e.clientY);
    if (dist <= RADIUS) {
      const a = angleAtClient(e.clientX, e.clientY);
      if (a === null) return;
      interactionRef.current = {
        kind: "rotate",
        pointerId: e.pointerId,
        startMouseAngle: a,
        startRotation: rotationRef.current,
        moved: false,
      };
    } else {
      interactionRef.current = {
        kind: "pan",
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPan: { ...panRef.current },
        moved: false,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    const inter = interactionRef.current;
    if (!inter) return;

    if (inter.kind === "pinch") {
      const a = pointers.current.get(inter.pointerIdA);
      const b = pointers.current.get(inter.pointerIdB);
      if (!a || !b) return;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const midClientX = (a.clientX + b.clientX) / 2;
      const midClientY = (a.clientY + b.clientY) / 2;
      const newScale = clamp(
        inter.startScale * (dist / inter.startDist),
        MIN_SCALE,
        MAX_SCALE,
      );
      const svgMid = clientToSvg(midClientX, midClientY);
      if (!svgMid) return;
      // Keep the world point that started under the midpoint pinned there;
      // this also produces natural panning while pinching.
      const newPan = {
        x: svgMid.x - newScale * inter.startWorld.x,
        y: svgMid.y - newScale * inter.startWorld.y,
      };
      setScale(newScale);
      setPan(newPan);
      return;
    }

    if (inter.kind === "rotate" && inter.pointerId === e.pointerId) {
      const a = angleAtClient(e.clientX, e.clientY);
      if (a === null) return;
      let delta = a - inter.startMouseAngle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      if (Math.abs(delta) > DRAG_THRESHOLD_RAD) {
        if (!inter.moved) capturePointer(e.pointerId);
        inter.moved = true;
        setRotation(inter.startRotation + delta);
      }
      return;
    }

    if (inter.kind === "pan" && inter.pointerId === e.pointerId) {
      const dx = e.clientX - inter.startClientX;
      const dy = e.clientY - inter.startClientY;
      if (!inter.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!inter.moved) capturePointer(e.pointerId);
      inter.moved = true;
      const u = clientPxToSvgUnit();
      setPan({
        x: inter.startPan.x + dx * u,
        y: inter.startPan.y + dy * u,
      });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const inter = interactionRef.current;
    if (!inter) return;

    if (inter.kind === "pinch") {
      // If a finger lifted, fall back to single-pointer interaction with the
      // remaining one (or end the gesture if none remain).
      const remaining = Array.from(pointers.current.entries())[0];
      if (remaining) {
        const [pid, p] = remaining;
        const dist = distanceFromCenter(p.clientX, p.clientY);
        if (dist <= RADIUS) {
          const a = angleAtClient(p.clientX, p.clientY);
          interactionRef.current = a === null
            ? null
            : {
                kind: "rotate",
                pointerId: pid,
                startMouseAngle: a,
                startRotation: rotationRef.current,
                moved: true,
              };
        } else {
          interactionRef.current = {
            kind: "pan",
            pointerId: pid,
            startClientX: p.clientX,
            startClientY: p.clientY,
            startPan: { ...panRef.current },
            moved: true,
          };
        }
      } else {
        interactionRef.current = null;
      }
      return;
    }

    if (
      (inter.kind === "rotate" || inter.kind === "pan") &&
      inter.pointerId === e.pointerId
    ) {
      if (inter.moved) wasDragged.current = true;
      interactionRef.current = null;
    }
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

  function resetView() {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  }

  function bumpZoom(factor: number) {
    const svg = svgRef.current;
    if (!svg) {
      setScale((s) => clamp(s * factor, MIN_SCALE, MAX_SCALE));
      return;
    }
    const r = svg.getBoundingClientRect();
    zoomAroundClient(r.left + r.width / 2, r.top + r.height / 2, factor);
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

  const isPanning = interactionRef.current?.kind === "pan";
  const isRotating = interactionRef.current?.kind === "rotate";
  const viewDirty =
    scale !== 1 || pan.x !== 0 || pan.y !== 0 || rotation !== 0;

  return (
    <div className="sunburst-wrap" ref={wrapRef}>
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
            Click to cycle ratings · drag the wheel to rotate · drag outside to
            pan · pinch or Ctrl+scroll to zoom
          </span>
        )}
      </div>
      <div className="sunburst-stage">
        <svg
          ref={svgRef}
          viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={
            isPanning
              ? "sunburst-svg panning"
              : isRotating
                ? "sunburst-svg rotating"
                : "sunburst-svg"
          }
        >
          <g
            transform={`translate(${pan.x.toFixed(2)} ${pan.y.toFixed(2)}) scale(${scale.toFixed(4)})`}
          >
            <g
              className={isRotating ? "spinning" : "spinnable"}
              transform={`rotate(${rotationDeg.toFixed(3)})`}
            >
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
          </g>
        </svg>
      </div>
      <div className="sunburst-controls">
        <button
          className="btn"
          onClick={() => bumpZoom(1 / 1.2)}
          disabled={scale <= MIN_SCALE + 0.001}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          className="btn"
          onClick={() => bumpZoom(1.2)}
          disabled={scale >= MAX_SCALE - 0.001}
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="sunburst-zoom-readout">{Math.round(scale * 100)}%</span>
        {viewDirty && (
          <button
            className="btn ghost"
            style={{ marginLeft: 8 }}
            onClick={resetView}
          >
            ↺ Reset view
          </button>
        )}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
