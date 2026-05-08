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
  const [importMode, setImportMode] = useState<"self" | "partner">("self");

  function pickFile(mode: "self" | "partner") {
    setImportMode(mode);
    if (mode === "self") fileRef.current?.click();
    else partnerFileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const result = parseImportData(text);
      if (importMode === "partner") {
        const partnerName = result.name?.trim() || file.name.replace(/\.json$/, "");
        loadPartner({ name: partnerName, nodes: result.nodes });
      } else {
        importNodes(result.nodes, result.name);
        const fmtNote =
          result.format === "smorgasbord"
            ? " Imported from the original Sunburst Smorgasbord — YES → Like, MAYBE → Change, NO → unset."
            : "";
        alert(`Loaded ${result.nodes.length} items.${fmtNote}`);
      }
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    } finally {
      e.target.value = "";
    }
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

      <button className="btn" onClick={() => pickFile("self")}>
        Import…
      </button>
      <button className="btn" onClick={() => pickFile("partner")}>
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
        onChange={handleFile}
      />
      <input
        ref={partnerFileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleFile}
      />

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
