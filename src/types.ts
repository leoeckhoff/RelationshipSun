export type State =
  | "UNSET"
  | "HAVE_LIKE"
  | "HAVE_CHANGE"
  | "HARD_NO"
  | "WANT"
  | "UNSURE"
  | "WISHFUL";

export const STATES: State[] = [
  "HAVE_LIKE",
  "HAVE_CHANGE",
  "HARD_NO",
  "WANT",
  "UNSURE",
  "WISHFUL",
];

export const ALL_STATES: State[] = ["UNSET", ...STATES];

export const STATE_CYCLE: State[] = [
  "UNSET",
  "HAVE_LIKE",
  "HAVE_CHANGE",
  "HARD_NO",
  "WANT",
  "UNSURE",
  "WISHFUL",
];

export function nextState(s: State): State {
  const i = STATE_CYCLE.indexOf(s);
  return STATE_CYCLE[(i + 1) % STATE_CYCLE.length];
}

export interface NodeRecord {
  uuid: string;
  parentUuid: string;
  key: string;
  state: State;
  note?: string;
  custom?: boolean;
}

export interface Settings {
  confirmDelete: boolean;
}

export interface ExportFile {
  format: "relationship-sun";
  version: 1;
  name: string;
  exportedAt: string;
  nodes: NodeRecord[];
}

export interface ComparePartner {
  name: string;
  nodes: NodeRecord[];
}

export type View = "sunburst" | "tree" | "compare";

export const STATE_COLOR: Record<State, string> = {
  UNSET: "var(--c-unset)",
  HAVE_LIKE: "#22c55e",
  HAVE_CHANGE: "#f59e0b",
  HARD_NO: "#ef4444",
  WANT: "#3b82f6",
  UNSURE: "#a855f7",
  WISHFUL: "#14b8a6",
};

export const STATE_LABEL: Record<State, string> = {
  UNSET: "Not yet rated",
  HAVE_LIKE: "Part of us — I like it",
  HAVE_CHANGE: "Part of us — I'd like it different",
  HARD_NO: "Absolute no",
  WANT: "I'd appreciate this",
  UNSURE: "Unsure / open to discuss",
  WISHFUL: "I'd love to, but I don't think it's possible",
};

export const STATE_SHORT: Record<State, string> = {
  UNSET: "—",
  HAVE_LIKE: "Like",
  HAVE_CHANGE: "Change",
  HARD_NO: "Hard no",
  WANT: "Want",
  UNSURE: "Unsure",
  WISHFUL: "Wishful",
};
