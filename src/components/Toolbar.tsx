import { useRef, useState } from "react";
import { useAppStore } from "../store";
import { exportToFile, parseImportData, readFileAsText } from "../importExport";
import { SettingsDialog } from "./Settings";
import type { View } from "../types";

const VIEWS: { id: View; label: string }[] = [
  { id: "sunburst", label: "Sunburst" },
  { id: "tree", label: "Tree" },
  { id: "compare", label: "Compare" },
];

export function Toolbar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const profileName = useAppStore((s) => s.profileName);
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const switchProfile = useAppStore((s) => s.switchProfile);
  const renameProfile = useAppStore((s) => s.renameProfile);
  const addProfile = useAppStore((s) => s.addProfile);
  const nodes = useAppStore((s) => s.nodes);
  const importNodes = useAppStore((s) => s.importNodes);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const partnerFileRef = useRef<HTMLInputElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function readFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return null;
    try {
      const text = await readFileAsText(file);
      return { result: parseImportData(text), file };
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
      return null;
    }
  }

  async function onSelfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const got = await readFile(e);
    if (!got) return;
    importNodes(got.result.nodes, got.result.name);
    const fmtNote =
      got.result.format === "smorgasbord"
        ? " Imported from the original Sunburst Smorgasbord — YES → Like, MAYBE → Change, NO → unset."
        : "";
    alert(`Loaded ${got.result.nodes.length} items into "${profileName}".${fmtNote}`);
  }

  async function onPartnerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const got = await readFile(e);
    if (!got) return;
    const name =
      got.result.name?.trim() || got.file.name.replace(/\.json$/, "");
    addProfile({ name, nodes: got.result.nodes });
    setView("compare");
  }

  function onAddPartner() {
    const name = prompt("Name for the new partner profile?", "Partner");
    if (name === null) return;
    addProfile({ name: name.trim() || "Partner" });
  }

  return (
    <header className="toolbar">
      <h1>Relationship Sun</h1>

      {profiles.length > 1 && (
        <select
          className="profile-select"
          value={activeProfileId}
          onChange={(e) => switchProfile(e.target.value)}
          aria-label="Switch profile"
          title="Switch profile"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      <input
        type="text"
        value={profileName}
        onChange={(e) => renameProfile(activeProfileId, e.target.value)}
        aria-label="Profile name"
        title="Edit this profile's name"
      />

      <button
        className="btn"
        onClick={onAddPartner}
        title="Create a new profile (e.g. for your partner) on this device"
      >
        + Add partner
      </button>

      <div className="btn-group" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`btn ${view === v.id ? "active" : ""}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="spacer" />

      <button className="btn" onClick={() => fileRef.current?.click()}>
        Import…
      </button>
      <button
        className="btn"
        onClick={() => partnerFileRef.current?.click()}
        title="Load a JSON your partner exported as a new profile on this device"
      >
        Load partner file…
      </button>
      <button
        className="btn primary"
        onClick={() => exportToFile(nodes, profileName)}
      >
        Export
      </button>
      <button className="btn ghost" onClick={() => setSettingsOpen(true)}>
        ⚙
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={onSelfFile}
      />
      <input
        ref={partnerFileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={onPartnerFile}
      />

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
