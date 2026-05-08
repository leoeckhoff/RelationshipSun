import { STATE_COLOR, STATE_LABEL, STATES } from "../types";

export function Legend() {
  return (
    <div className="legend">
      {STATES.map((s) => (
        <div key={s} className="item">
          <span className="swatch" style={{ background: STATE_COLOR[s] }} />
          <span>{STATE_LABEL[s]}</span>
        </div>
      ))}
      <div className="item">
        <span className="swatch" style={{ background: STATE_COLOR.UNSET }} />
        <span>Not yet rated</span>
      </div>
    </div>
  );
}
