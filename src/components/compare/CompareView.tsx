import { useRef } from "react";
import { useAppStore, useNodeMap } from "../../store";
import { parseImportData, readFileAsText } from "../../importExport";
import {
  STATE_COLOR,
  STATE_LABEL,
  STATE_SHORT,
  type NodeRecord,
  type State,
} from "../../types";
import { humanize } from "../../util";

interface Pair {
  uuid: string;
  key: string;
  pathLabel: string;
  mine: State;
  theirs: State;
  mineNote?: string;
  theirNote?: string;
}

function buildPaths(
  nodes: NodeRecord[],
  rootUuid: string,
): Map<string, string> {
  const byId = new Map<string, NodeRecord>();
  for (const n of nodes) byId.set(n.uuid, n);
  const out = new Map<string, string>();
  for (const n of nodes) {
    const path: string[] = [];
    let c: NodeRecord | undefined = n;
    while (c && c.uuid !== rootUuid) {
      path.unshift(humanize(c.key));
      c = c.parentUuid ? byId.get(c.parentUuid) : undefined;
    }
    out.set(n.uuid, path.join(" › "));
  }
  return out;
}

export function CompareView() {
  const partner = useAppStore((s) => s.partner);
  const clearPartner = useAppStore((s) => s.clearPartner);
  const loadPartner = useAppStore((s) => s.loadPartner);
  const myNodes = useAppStore((s) => s.nodes);
  const rootUuid = useAppStore((s) => s.rootUuid);
  const profileName = useAppStore((s) => s.profileName);
  const selectNode = useAppStore((s) => s.selectNode);
  const nodeMap = useNodeMap();

  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const result = parseImportData(text);
      const name = result.name?.trim() || file.name.replace(/\.json$/, "");
      loadPartner({ name, nodes: result.nodes });
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    } finally {
      e.target.value = "";
    }
  }

  if (!partner) {
    return (
      <div className="compare">
        <div className="empty-state">
          <h3 style={{ marginTop: 0 }}>Compare with a partner</h3>
          <p>
            Load a JSON file your partner exported. Their data stays local —
            it's only used to render this comparison view.
          </p>
          <button
            className="btn primary"
            onClick={() => fileRef.current?.click()}
          >
            Load partner file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </div>
      </div>
    );
  }

  const seen = new Set<string>();
  const pairs: Pair[] = [];

  function addPair(p: Pair) {
    if (seen.has(p.uuid)) return;
    seen.add(p.uuid);
    pairs.push(p);
  }

  const myPaths = buildPaths(myNodes, rootUuid);
  const theirPaths = buildPaths(partner.nodes, rootUuid);
  const myById = new Map(myNodes.map((n) => [n.uuid, n]));
  const theirById = new Map(partner.nodes.map((n) => [n.uuid, n]));

  for (const n of myNodes) {
    const them = theirById.get(n.uuid);
    addPair({
      uuid: n.uuid,
      key: n.key,
      pathLabel: myPaths.get(n.uuid) ?? humanize(n.key),
      mine: n.state,
      theirs: them?.state ?? "UNSET",
      mineNote: n.note,
      theirNote: them?.note,
    });
  }
  for (const n of partner.nodes) {
    if (myById.has(n.uuid)) continue;
    addPair({
      uuid: n.uuid,
      key: n.key,
      pathLabel: theirPaths.get(n.uuid) ?? humanize(n.key),
      mine: "UNSET",
      theirs: n.state,
      theirNote: n.note,
    });
  }

  const ratedPairs = pairs.filter(
    (p) => p.mine !== "UNSET" || p.theirs !== "UNSET",
  );

  const isPositive = (s: State) => s === "HAVE_LIKE" || s === "WANT";

  const conflicts = ratedPairs.filter(
    (p) =>
      (p.mine === "HARD_NO" && isPositive(p.theirs)) ||
      (p.theirs === "HARD_NO" && isPositive(p.mine)),
  );

  const discuss = ratedPairs.filter(
    (p) =>
      !conflicts.includes(p) &&
      (p.mine === "UNSURE" || p.theirs === "UNSURE"),
  );

  const wantsChange = (s: State) =>
    s === "WANT" || s === "HAVE_CHANGE" || s === "WISHFUL";

  const wishes = ratedPairs.filter(
    (p) =>
      !conflicts.includes(p) &&
      !discuss.includes(p) &&
      (wantsChange(p.mine) || wantsChange(p.theirs)) &&
      p.mine !== p.theirs,
  );

  const matches = ratedPairs.filter(
    (p) =>
      !conflicts.includes(p) &&
      !discuss.includes(p) &&
      !wishes.includes(p) &&
      p.mine !== "UNSET" &&
      p.theirs !== "UNSET" &&
      p.mine === p.theirs,
  );

  const oneSided = ratedPairs.filter(
    (p) =>
      !conflicts.includes(p) &&
      !discuss.includes(p) &&
      !wishes.includes(p) &&
      !matches.includes(p) &&
      (p.mine === "UNSET" || p.theirs === "UNSET"),
  );

  return (
    <div className="compare">
      <div className="compare-header">
        <strong>{profileName || "Me"}</strong>
        <span style={{ color: "var(--text-dim)" }}>vs</span>
        <strong>{partner.name}</strong>
        <button className="btn ghost" onClick={clearPartner}>
          Remove partner
        </button>
        <span style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
          {ratedPairs.length} item{ratedPairs.length === 1 ? "" : "s"} rated by
          at least one of you
        </span>
      </div>

      <Section
        title={`Conflicts (${conflicts.length})`}
        muted="Where one of you says hard no and the other wants it."
        rows={conflicts}
        nodeMap={nodeMap}
        onSelect={selectNode}
      />
      <Section
        title={`Discuss (${discuss.length})`}
        muted="At least one of you said “unsure / open to discuss”."
        rows={discuss}
        nodeMap={nodeMap}
        onSelect={selectNode}
      />
      <Section
        title={`Wishes (${wishes.length})`}
        muted="One of you would like a change. Worth talking about."
        rows={wishes}
        nodeMap={nodeMap}
        onSelect={selectNode}
      />
      <Section
        title={`Matches (${matches.length})`}
        muted="You both said the same thing."
        rows={matches}
        nodeMap={nodeMap}
        onSelect={selectNode}
      />
      <Section
        title={`One-sided (${oneSided.length})`}
        muted="Only one of you has a rating."
        rows={oneSided}
        nodeMap={nodeMap}
        onSelect={selectNode}
      />
    </div>
  );
}

function Section({
  title,
  muted,
  rows,
  nodeMap,
  onSelect,
}: {
  title: string;
  muted: string;
  rows: Pair[];
  nodeMap: Map<string, NodeRecord>;
  onSelect: (uuid: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="compare-section">
      <h3>{title}</h3>
      <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 8 }}>
        {muted}
      </div>
      {rows.map((r) => {
        const noteParts: string[] = [];
        if (r.mineNote) noteParts.push(`Your note: ${r.mineNote}`);
        if (r.theirNote) noteParts.push(`Their note: ${r.theirNote}`);
        const hoverTitle = noteParts.join("\n\n");
        return (
          <div
            className="compare-row"
            key={r.uuid}
            onClick={() => nodeMap.has(r.uuid) && onSelect(r.uuid)}
            style={{ cursor: nodeMap.has(r.uuid) ? "pointer" : "default" }}
            title={hoverTitle || undefined}
          >
            <div>
              <div className="key">
                {humanize(r.key)}
                {(r.mineNote || r.theirNote) && (
                  <span className="note-marker" style={{ marginLeft: 6 }}>
                    ✎
                  </span>
                )}
              </div>
              <div className="path">{r.pathLabel}</div>
              {(r.mineNote || r.theirNote) && (
                <div className="compare-notes">
                  {r.mineNote && (
                    <div className="compare-note">
                      <span className="compare-note-label">You</span>
                      <span>{r.mineNote}</span>
                    </div>
                  )}
                  {r.theirNote && (
                    <div className="compare-note">
                      <span className="compare-note-label">Them</span>
                      <span>{r.theirNote}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <Chip label="You" state={r.mine} />
            <Chip label="Them" state={r.theirs} />
          </div>
        );
      })}
    </section>
  );
}

function Chip({ label, state }: { label: string; state: State }) {
  return (
    <span className="chip" title={STATE_LABEL[state]}>
      <span className="swatch" style={{ background: STATE_COLOR[state] }} />
      <span>
        {label}: <strong style={{ color: "var(--text)" }}>{STATE_SHORT[state]}</strong>
      </span>
    </span>
  );
}
