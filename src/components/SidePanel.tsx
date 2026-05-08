import { useAppStore, useChildrenIndex, useNodeMap } from "../store";
import { STATES, STATE_COLOR, STATE_LABEL, STATE_SHORT } from "../types";
import { humanize } from "../util";

export function SidePanel() {
  const selectedUuid = useAppStore((s) => s.selectedUuid);
  const rootUuid = useAppStore((s) => s.rootUuid);
  const setNodeState = useAppStore((s) => s.setNodeState);
  const setNodeNote = useAppStore((s) => s.setNodeNote);
  const requestDelete = useAppStore((s) => s.requestDelete);
  const openAddChild = useAppStore((s) => s.openAddChild);
  const selectNode = useAppStore((s) => s.selectNode);

  const nodeMap = useNodeMap();
  const childrenIdx = useChildrenIndex();

  if (!selectedUuid) {
    return (
      <div>
        <h2>No item selected</h2>
        <p style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>
          Click any segment of the sunburst (or row of the tree) to rate it,
          add a sub-item, or attach a note.
        </p>
        <p style={{ color: "var(--text-dim)", lineHeight: 1.5, marginTop: 16 }}>
          Your changes are saved automatically in this browser. Use{" "}
          <strong>Export</strong> in the toolbar to download a file you can
          share with your partner.
        </p>
      </div>
    );
  }

  const node = nodeMap.get(selectedUuid);
  if (!node) return null;

  const isRoot = node.uuid === rootUuid;
  const children = childrenIdx.get(node.uuid) ?? [];

  const path: string[] = [];
  let cursor = node;
  while (cursor.parentUuid) {
    const parent = nodeMap.get(cursor.parentUuid);
    if (!parent) break;
    path.unshift(humanize(parent.key));
    cursor = parent;
  }

  return (
    <div>
      <h2>Item</h2>
      <div className="breadcrumb">
        {path.length ? path.join(" › ") : "Root"}
      </div>
      <div className="item-title">{humanize(node.key)}</div>

      {!isRoot && (
        <>
          <div className="state-buttons">
            {STATES.map((s) => (
              <button
                key={s}
                className={`state-button ${node.state === s ? "active" : ""}`}
                style={{ color: STATE_COLOR[s] }}
                onClick={() => setNodeState(node.uuid, s)}
              >
                <span className="label">
                  <span
                    className="swatch"
                    style={{ background: STATE_COLOR[s] }}
                  />
                  {STATE_SHORT[s]}
                </span>
                <span style={{ color: "var(--text-dim)" }}>
                  {STATE_LABEL[s]}
                </span>
              </button>
            ))}
          </div>
          {node.state !== "UNSET" && (
            <button
              className="btn ghost"
              style={{ marginBottom: 12 }}
              onClick={() => setNodeState(node.uuid, "UNSET")}
            >
              Clear rating
            </button>
          )}

          <div className="field" style={{ marginTop: 12 }}>
            <label>Note (optional)</label>
            <NoteEditor
              key={node.uuid}
              uuid={node.uuid}
              initial={node.note ?? ""}
              onSave={(v) => setNodeNote(node.uuid, v)}
            />
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => openAddChild(node.uuid)}>
          + Add sub-item
        </button>
        {!isRoot && (
          <button
            className="btn danger"
            onClick={() => requestDelete(node.uuid)}
          >
            Delete
          </button>
        )}
      </div>

      {children.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>
            Sub-items ({children.length})
          </h2>
          <ul className="children-list">
            {children.map((c) => (
              <li key={c.uuid} onClick={() => selectNode(c.uuid)}>
                <span
                  className="swatch"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: STATE_COLOR[c.state],
                  }}
                />
                <span>{humanize(c.key)}</span>
                {c.note && (
                  <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                    ✎
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function NoteEditor({
  uuid: _uuid,
  initial,
  onSave,
}: {
  uuid: string;
  initial: string;
  onSave: (v: string) => void;
}) {
  return (
    <textarea
      className="note-area"
      defaultValue={initial}
      placeholder="e.g. only with prior agreement, or once a month is enough…"
      onBlur={(e) => {
        if (e.target.value !== initial) onSave(e.target.value);
      }}
    />
  );
}
