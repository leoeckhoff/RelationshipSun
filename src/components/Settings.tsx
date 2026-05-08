import { useAppStore } from "../store";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const resetToSeed = useAppStore((s) => s.resetToSeed);
  const clearAllStates = useAppStore((s) => s.clearAllStates);
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const profileName = useAppStore((s) => s.profileName);
  const deleteProfile = useAppStore((s) => s.deleteProfile);

  const canDelete = profiles.length > 1;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <div className="checkbox-row">
          <input
            id="confirm-delete"
            type="checkbox"
            checked={settings.confirmDelete}
            onChange={(e) =>
              setSettings({ confirmDelete: e.target.checked })
            }
          />
          <label htmlFor="confirm-delete">
            Always ask before deleting an item
          </label>
        </div>

        <h3 style={{ marginTop: 20 }}>Danger zone</h3>
        <p className="muted">These actions cannot be undone.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn"
            onClick={() => {
              if (
                confirm(
                  `Clear all ratings on "${profileName}" (keep all items)? Notes will also be removed.`,
                )
              ) {
                clearAllStates();
              }
            }}
          >
            Clear all ratings on this profile
          </button>
          <button
            className="btn"
            onClick={() => {
              if (
                confirm(
                  `Reset "${profileName}" to the original tree? Custom items, ratings, and notes will be lost.`,
                )
              ) {
                resetToSeed();
              }
            }}
          >
            Reset this profile to original tree
          </button>
          {canDelete && (
            <button
              className="btn danger"
              onClick={() => {
                if (
                  confirm(
                    `Delete the profile "${profileName}"? Everything in it will be lost.`,
                  )
                ) {
                  deleteProfile(activeProfileId);
                  onClose();
                }
              }}
            >
              Delete this profile
            </button>
          )}
        </div>

        <div className="actions">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
