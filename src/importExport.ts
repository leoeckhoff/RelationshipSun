import type { ExportFile, NodeRecord, State } from "./types";

export function exportToFile(nodes: NodeRecord[], name: string): void {
  const payload: ExportFile = {
    format: "relationship-sun",
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    nodes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = name.replace(/[^a-zA-Z0-9_-]+/g, "_") || "profile";
  a.download = `relationship-sun-${safeName}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  nodes: NodeRecord[];
  format: "relationship-sun" | "smorgasbord";
  name?: string;
}

const SMORG_STATE_MAP: Record<string, State> = {
  YES: "HAVE_LIKE",
  NO: "UNSET",
  MAYBE: "HAVE_CHANGE",
  DELETED: "UNSET",
};

export function parseImportData(text: string): ImportResult {
  const parsed = JSON.parse(text);

  if (Array.isArray(parsed)) {
    const nodes: NodeRecord[] = parsed.map((n: any) => ({
      uuid: String(n.uuid),
      parentUuid: String(n.parentUuid ?? ""),
      key: String(n.key),
      state: SMORG_STATE_MAP[n.state] ?? "UNSET",
      note: typeof n.note === "string" ? n.note : undefined,
    }));
    return { nodes, format: "smorgasbord" };
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    parsed.format === "relationship-sun" &&
    Array.isArray(parsed.nodes)
  ) {
    const nodes: NodeRecord[] = parsed.nodes.map((n: any) => ({
      uuid: String(n.uuid),
      parentUuid: String(n.parentUuid ?? ""),
      key: String(n.key),
      state: (n.state as State) ?? "UNSET",
      note: typeof n.note === "string" ? n.note : undefined,
      custom: !!n.custom,
    }));
    return {
      nodes,
      format: "relationship-sun",
      name: typeof parsed.name === "string" ? parsed.name : undefined,
    };
  }

  throw new Error(
    "Unrecognized file format. Expected a Relationship Sun or Sunburst Smorgasbord JSON file.",
  );
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
