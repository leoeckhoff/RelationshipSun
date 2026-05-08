import { useState } from "react";
import { useAppStore, useNodeMap } from "../store";
import { humanize } from "../util";

export function AddChildDialog() {
  const pendingAddChild = useAppStore((s) => s.pendingAddChild);
  const closeAddChild = useAppStore((s) => s.closeAddChild);
  const addChild = useAppStore((s) => s.addChild);
  const nodeMap = useNodeMap();
  const [text, setText] = useState("");

  if (!pendingAddChild) return null;
  const parent = nodeMap.get(pendingAddChild);
  if (!parent) return null;

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    addChild(parent!.uuid, trimmed);
    setText("");
  }

  return (
    <div className="dialog-backdrop" onClick={closeAddChild}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Add sub-item to "{humanize(parent.key)}"</h3>
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") closeAddChild();
            }}
            placeholder="e.g. weekly date night"
          />
        </div>
        <div className="actions">
          <button className="btn" onClick={closeAddChild}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!text.trim()}
            onClick={submit}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
