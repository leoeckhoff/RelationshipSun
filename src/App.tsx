import { useEffect, useState } from "react";
import { useAppStore } from "./store";
import { Toolbar } from "./components/Toolbar";
import { Sunburst } from "./components/sunburst/Sunburst";
import { TreeView } from "./components/tree/TreeView";
import { CompareView } from "./components/compare/CompareView";
import { SidePanel } from "./components/SidePanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { AddChildDialog } from "./components/AddChildDialog";
import { Legend } from "./components/Legend";

const PANEL_COLLAPSED_KEY = "rsun:panel-collapsed:v1";

function loadPanelCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(PANEL_COLLAPSED_KEY);
    if (raw !== null) return raw === "1";
  } catch {
    // fall through
  }
  // Default to collapsed on narrow viewports so mobile users see the wheel.
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(max-width: 720px)").matches;
  }
  return false;
}

export function App() {
  const view = useAppStore((s) => s.view);
  const pendingDelete = useAppStore((s) => s.pendingDelete);
  const pendingAddChild = useAppStore((s) => s.pendingAddChild);
  const selectedUuid = useAppStore((s) => s.selectedUuid);

  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(() =>
    loadPanelCollapsed(),
  );

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, panelCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [panelCollapsed]);

  // When the user picks a new item on a small screen with the panel hidden,
  // surface the panel so they can see what they tapped.
  useEffect(() => {
    if (!selectedUuid) return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    if (panelCollapsed) setPanelCollapsed(false);
    // We intentionally only react to selection changes, not panel state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUuid]);

  return (
    <div className={`app${panelCollapsed ? " panel-collapsed" : ""}`}>
      <Toolbar />
      <main className="main">
        <section className="view">
          {view === "sunburst" && <Sunburst />}
          {view === "tree" && <TreeView />}
          {view === "compare" && <CompareView />}
        </section>
        {!panelCollapsed && (
          <aside className="panel">
            <button
              type="button"
              className="panel-collapse-btn"
              onClick={() => setPanelCollapsed(true)}
              title="Hide panel"
              aria-label="Hide side panel"
            >
              ›
            </button>
            <SidePanel />
          </aside>
        )}
        {panelCollapsed && (
          <button
            type="button"
            className="panel-expand-btn"
            onClick={() => setPanelCollapsed(false)}
            title="Show panel"
            aria-label="Show side panel"
          >
            ‹
          </button>
        )}
      </main>
      <Legend />
      {pendingDelete && <ConfirmDialog />}
      {pendingAddChild && <AddChildDialog />}
    </div>
  );
}
