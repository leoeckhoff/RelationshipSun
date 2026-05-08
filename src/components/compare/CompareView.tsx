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

  // Pair items by uuid first, then by (parentUuid + key) for custom-added items.
  const myByKey = new Map<string, NodeRecord>();
  for (const n of myNodes) myByKey.set(`${n.parentUuid}|${n.key}`, n);
  const theirByKey = new Map<string, NodeRecord>();
  for (const n of partner.nodes) theirByKey.set(`${n.parentUuid}|${n.key}`, n);

  const seen = new Set<string>();
  const pairs: Pair[] = [];

  function addPair(p: Pair) {
    if (seen.has(p.uuid)) return;
    seen.add(p.uuid);
    pairs.push(p);
  }

  const myPaths = buildPaths(myNodes, rootUuid);
  const theirPaths = buildPaths(partner.nodes, rootUuid);

  // First by uuid (covers seed items and identical custom uuids)
  const myById = new Map(myNodes.map((n) => [n.uuid, n]));
  const theirById = new Map(partner.nodes.map((n) => [n.uuid, n]));

  for (const n of myNodes) {
    const them = theirById.get(n.uuid);
    if (them) {
      addPair({
        uuid: n.uuid,
        key: n.key,
        pathLabel: myPaths.get(n.uuid) ?? humanize(n.key),
        mine: n.state,
        theirs: them.state,
      });
    } else {
      addPair({
        uuid: n.uuid,
        key: n.key,
        pathLabel: myPaths.get(n.uuid) ?? humanize(n.key),
        mine: n.state,
        theirs: "UNSET",
      });
    }
  }
  for (const n of partner.nodes) {
    if (myById.has(n.uuid)) continue;
    addPair({
      uuid: n.uuid,
      key: n.key,
      pathLabel: theirPaths.get(n.uuid) ?? humanize(n.key),
      mine: "UNSET",
      theirs: n.state,
    });
  }

  const ratedPairs = pairs.filter(
    (p) => p.mine !== "UNSET" || p.theirs !== "UNSET",
  );

  // Conflict: one says HARD_NO, the other says HAVE_LIKE/WANT.
  const conflicts = ratedPairs.filter(
    (p) =>
      (p.mine === "HARD_NO" &&
        (p.theirs === "HAVE_LIKE" || p.theirs === "WANT")) ||
      (p.theirs === "HARD_NO" &&
        (p.mine === "HAVE_LIKE" || p.mine === "WANT")),
  );

  // Mismatch on change/want vs status quo
  const wishesNotMet = ratedPairs.filter(
    (p) =>
      !conflicts.includes(p) &&
      ((p.mine === "WANT" && p.theirs !== "WANT" && p.theirs !== "HAVE_LIKE") ||
        (p.theirs === "WANT" && p.mine !== "WANT" && p.mine !== "HAVE_LIKE") ||
        (p.mine === "HAVE_CHANGE" && p.theirs === "HAVE_LIKE") ||
        (p.theirs === "HAVE_CHANGE" && p.mine === "HAVE_LIKE")),
  );

  const matches = ratedPairs.filter(
    (p) =>
      !conflicts.includes(p) &&
      !wishesNotMet.includes(p) &&
      p.mine !== "UNSET" &&
      p.theirs !== "UNSET" &&
      p.mine === p.theirs,
  );

  const oneSided = ratedPairs.filter(
    (p) =>
      !conflicts.includes(p) &&
      !wishesNotMet.includes(p) &&
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
        title={`Wishes (${wishesNotMet.length})`}
        muted="One of you would like a change. Worth talking about."
        rows={wishesNotMet}
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
      {rows.map((r) => (
        <div
          className="compare-row"
          key={r.uuid}
          onClick={() => nodeMap.has(r.uuid) && onSelect(r.uuid)}
          style={{ cursor: nodeMap.has(r.uuid) ? "pointer" : "default" }}
        >
          <div>
            <div className="key">{humanize(r.key)}</div>
            <div className="path">{r.pathLabel}</div>
          </div>
          <Chip label="You" state={r.mine} />
          <Chip label="Them" state={r.theirs} />
        </div>
      ))}
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
