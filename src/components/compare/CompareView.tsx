import { useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store";
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
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const profileName = useAppStore((s) => s.profileName);
  const myNodes = useAppStore((s) => s.nodes);
  const rootUuid = useAppStore((s) => s.rootUuid);
  const selectNode = useAppStore((s) => s.selectNode);
  const addProfile = useAppStore((s) => s.addProfile);
  const setView = useAppStore((s) => s.setView);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const otherProfiles = profiles.filter((p) => p.id !== activeProfileId);
  const [partnerId, setPartnerId] = useState<string | null>(() =>
    otherProfiles.length === 1 ? otherProfiles[0].id : null,
  );
  // If profiles change (e.g. one is added/removed) and current pick is gone,
  // reset.
  const partnerProfile = profiles.find((p) => p.id === partnerId);
  if (partnerId && !partnerProfile && otherProfiles.length === 1) {
    setPartnerId(otherProfiles[0].id);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const result = parseImportData(text);
      const name = result.name?.trim() || file.name.replace(/\.json$/, "");
      const id = addProfile({ name, nodes: result.nodes });
      // addProfile switches to the new profile — bounce back so we stay on
      // the same active profile and just pick the new one as partner.
      setPartnerId(id);
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    }
  }

  // Build pair list — must be unconditional for hooks rules even if we
  // later short-circuit the render.
  const pairs = useMemo<Pair[]>(() => {
    if (!partnerProfile) return [];
    const seen = new Set<string>();
    const out: Pair[] = [];

    const myPaths = buildPaths(myNodes, rootUuid);
    const theirPaths = buildPaths(partnerProfile.nodes, rootUuid);
    const myById = new Map(myNodes.map((n) => [n.uuid, n]));
    const theirById = new Map(
      partnerProfile.nodes.map((n) => [n.uuid, n]),
    );

    function add(p: Pair) {
      if (seen.has(p.uuid)) return;
      seen.add(p.uuid);
      out.push(p);
    }

    for (const n of myNodes) {
      const them = theirById.get(n.uuid);
      add({
        uuid: n.uuid,
        key: n.key,
        pathLabel: myPaths.get(n.uuid) ?? humanize(n.key),
        mine: n.state,
        theirs: them?.state ?? "UNSET",
        mineNote: n.note,
        theirNote: them?.note,
      });
    }
    for (const n of partnerProfile.nodes) {
      if (myById.has(n.uuid)) continue;
      add({
        uuid: n.uuid,
        key: n.key,
        pathLabel: theirPaths.get(n.uuid) ?? humanize(n.key),
        mine: "UNSET",
        theirs: n.state,
        theirNote: n.note,
      });
    }
    return out;
  }, [partnerProfile, myNodes, rootUuid]);

  if (!partnerProfile) {
    return (
      <div className="compare">
        <div className="empty-state">
          <h3 style={{ marginTop: 0 }}>Compare with a partner</h3>
          {otherProfiles.length > 0 ? (
            <>
              <p>Pick whose ratings to compare yours against:</p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                {otherProfiles.map((p) => (
                  <button
                    key={p.id}
                    className="btn primary"
                    onClick={() => setPartnerId(p.id)}
                  >
                    Compare with {p.name}
                  </button>
                ))}
              </div>
              <p style={{ marginTop: 16, color: "var(--text-dim)" }}>
                or{" "}
                <button
                  className="btn ghost"
                  onClick={() => fileRef.current?.click()}
                  style={{ padding: "2px 6px" }}
                >
                  load a partner file…
                </button>
              </p>
            </>
          ) : (
            <>
              <p>
                It's just you for now. Add a partner profile on this device
                so you can both fill it in, or load a JSON your partner
                exported elsewhere.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn primary"
                  onClick={() => {
                    const name =
                      prompt("Name for the partner profile?", "Partner") ??
                      "";
                    if (!name.trim()) return;
                    addProfile({ name: name.trim() });
                    setView("sunburst");
                  }}
                >
                  + Add a partner profile
                </button>
                <button
                  className="btn"
                  onClick={() => fileRef.current?.click()}
                >
                  Load partner file…
                </button>
              </div>
            </>
          )}
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
        <strong>{partnerProfile.name}</strong>
        {otherProfiles.length > 1 && (
          <select
            value={partnerId ?? ""}
            onChange={(e) => setPartnerId(e.target.value)}
            style={{
              background: "var(--bg-elev-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 6px",
            }}
          >
            {otherProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn ghost" onClick={() => setPartnerId(null)}>
          Pick someone else
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
        nodeMap={undefined}
        onSelect={selectNode}
      />
      <Section
        title={`Discuss (${discuss.length})`}
        muted="At least one of you said “unsure / open to discuss”."
        rows={discuss}
        nodeMap={undefined}
        onSelect={selectNode}
      />
      <Section
        title={`Wishes (${wishes.length})`}
        muted="One of you would like a change. Worth talking about."
        rows={wishes}
        nodeMap={undefined}
        onSelect={selectNode}
      />
      <Section
        title={`Matches (${matches.length})`}
        muted="You both said the same thing."
        rows={matches}
        nodeMap={undefined}
        onSelect={selectNode}
      />
      <Section
        title={`One-sided (${oneSided.length})`}
        muted="Only one of you has a rating."
        rows={oneSided}
        nodeMap={undefined}
        onSelect={selectNode}
      />
    </div>
  );
}

function Section({
  title,
  muted,
  rows,
  onSelect,
}: {
  title: string;
  muted: string;
  rows: Pair[];
  nodeMap: undefined;
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
            onClick={() => onSelect(r.uuid)}
            style={{ cursor: "pointer" }}
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
