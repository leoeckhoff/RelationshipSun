import { useAppStore, useChildrenIndex, useNodeMap } from "../store";
import { humanize } from "../util";

export function ConfirmDialog() {
  const pendingDelete = useAppStore((s) => s.pendingDelete);
  const cancelDelete = useAppStore((s) => s.cancelDelete);
  const confirmDelete = useAppStore((s) => s.confirmDelete);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const nodeMap = useNodeMap();
  const childrenIdx = useChildrenIndex();

  if (!pendingDelete) return null;
  const node = nodeMap.get(pendingDelete);
  if (!node) return null;

  function countDescendants(uuid: string): number {
    const kids = childrenIdx.get(uuid) ?? [];
    return kids.reduce((acc, k) => acc + 1 + countDescendants(k.uuid), 0);
  }
  const descendants = countDescendants(node.uuid);

  return (
    <div className="dialog-backdrop" onClick={cancelDelete}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Delete "{humanize(node.key)}"?</h3>
        <p className="muted">
          {descendants > 0
            ? `This will also delete ${descendants} sub-item${descendants === 1 ? "" : "s"} below it.`
            : "This item has no sub-items."}
        </p>
        <div className="checkbox-row">
          <input
            id="dont-ask-again"
            type="checkbox"
            checked={!settings.confirmDelete}
            onChange={(e) =>
              setSettings({ confirmDelete: !e.target.checked })
            }
          />
          <label htmlFor="dont-ask-again">
            Don't ask again (you can re-enable in Settings)
          </label>
        </div>
        <div className="actions">
          <button className="btn" onClick={cancelDelete}>
            Cancel
          </button>
          <button className="btn danger" onClick={confirmDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
