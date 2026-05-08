import { useAppStore } from "./store";
import { Toolbar } from "./components/Toolbar";
import { Sunburst } from "./components/sunburst/Sunburst";
import { TreeView } from "./components/tree/TreeView";
import { CompareView } from "./components/compare/CompareView";
import { SidePanel } from "./components/SidePanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { AddChildDialog } from "./components/AddChildDialog";
import { Legend } from "./components/Legend";

export function App() {
  const view = useAppStore((s) => s.view);
  const pendingDelete = useAppStore((s) => s.pendingDelete);
  const pendingAddChild = useAppStore((s) => s.pendingAddChild);

  return (
    <div className="app">
      <Toolbar />
      <main className="main">
        <section className="view">
          {view === "sunburst" && <Sunburst />}
          {view === "tree" && <TreeView />}
          {view === "compare" && <CompareView />}
        </section>
        <aside className="panel">
          <SidePanel />
        </aside>
      </main>
      <Legend />
      {pendingDelete && <ConfirmDialog />}
      {pendingAddChild && <AddChildDialog />}
    </div>
  );
}
