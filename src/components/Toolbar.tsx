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
  const setProfileName = useAppStore((s) => s.setProfileName);
  const nodes = useAppStore((s) => s.nodes);
  const importNodes = useAppStore((s) => s.importNodes);
  const loadPartner = useAppStore((s) => s.loadPartner);
  const partner = useAppStore((s) => s.partner);

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
    alert(`Loaded ${got.result.nodes.length} items.${fmtNote}`);
  }

  async function onPartnerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const got = await readFile(e);
    if (!got) return;
    const name =
      got.result.name?.trim() || got.file.name.replace(/\.json$/, "");
    loadPartner({ name, nodes: got.result.nodes });
  }

  return (
    <header className="toolbar">
      <h1>Relationship Sun</h1>

      <input
        type="text"
        value={profileName}
        onChange={(e) => setProfileName(e.target.value)}
        aria-label="Your profile name"
        title="Your profile name (used in exports)"
      />

      <div className="btn-group" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`btn ${view === v.id ? "active" : ""}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
            {v.id === "compare" && partner ? ` · ${partner.name}` : ""}
          </button>
        ))}
      </div>

      <div className="spacer" />

      <button className="btn" onClick={() => fileRef.current?.click()}>
        Import…
      </button>
      <button className="btn" onClick={() => partnerFileRef.current?.click()}>
        Load partner…
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
