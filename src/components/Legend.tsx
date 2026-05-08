import { useAppStore } from "../store";
import { ALL_STATES, STATE_COLOR, STATE_LABEL } from "../types";

export function Legend() {
  const activeFilter = useAppStore((s) => s.activeFilter);
  const toggleFilter = useAppStore((s) => s.toggleFilter);
  const resetFilter = useAppStore((s) => s.resetFilter);
  const allActive = activeFilter.size === ALL_STATES.length;

  return (
    <div className="legend">
      <span style={{ marginRight: 4 }}>Filter:</span>
      {ALL_STATES.map((s) => {
        const active = activeFilter.has(s);
        return (
          <button
            key={s}
            className={`legend-item ${active ? "active" : "inactive"}`}
            onClick={() => toggleFilter(s)}
            title={`${active ? "Hide" : "Show"} ${STATE_LABEL[s]}`}
          >
            <span className="swatch" style={{ background: STATE_COLOR[s] }} />
            <span>{STATE_LABEL[s]}</span>
          </button>
        );
      })}
      {!allActive && (
        <button className="btn ghost legend-reset" onClick={resetFilter}>
          Show all
        </button>
      )}
    </div>
  );
}
