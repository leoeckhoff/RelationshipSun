import { create } from "zustand";
import type {
  ComparePartner,
  NodeRecord,
  Settings,
  State,
  View,
} from "./types";
import { ALL_STATES } from "./types";
import { buildSeedNodes, SEED_ROOT_UUID } from "./seed";
import {
  loadNodes,
  loadProfileName,
  loadSettings,
  saveNodes,
  saveProfileName,
  saveSettings,
} from "./storage";

interface AppState {
  nodes: NodeRecord[];
  rootUuid: string;
  selectedUuid: string | null;
  view: View;
  settings: Settings;
  profileName: string;
  partner: ComparePartner | null;
  pendingDelete: string | null;
  pendingAddChild: string | null;
  activeFilter: Set<State>;

  setView: (v: View) => void;
  selectNode: (uuid: string | null) => void;
  setNodeState: (uuid: string, state: State) => void;
  setNodeNote: (uuid: string, note: string) => void;
  addChild: (parentUuid: string, key: string) => void;
  requestDelete: (uuid: string) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
  openAddChild: (parentUuid: string) => void;
  closeAddChild: () => void;
  importNodes: (nodes: NodeRecord[], name?: string) => void;
  resetToSeed: () => void;
  clearAllStates: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  setProfileName: (name: string) => void;
  loadPartner: (partner: ComparePartner) => void;
  clearPartner: () => void;
  toggleFilter: (state: State) => void;
  resetFilter: () => void;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function persist(nodes: NodeRecord[]) {
  saveNodes(nodes);
}

function collectDescendants(nodes: NodeRecord[], rootUuid: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    const list = childrenOf.get(n.parentUuid) ?? [];
    list.push(n.uuid);
    childrenOf.set(n.parentUuid, list);
  }
  const out = new Set<string>([rootUuid]);
  const queue = [rootUuid];
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of childrenOf.get(id) ?? []) {
      out.add(c);
      queue.push(c);
    }
  }
  return out;
}

const initialNodes = loadNodes() ?? buildSeedNodes();
const initialSettings = loadSettings();
const initialProfile = loadProfileName();

export const useAppStore = create<AppState>((set, get) => ({
  nodes: initialNodes,
  rootUuid: SEED_ROOT_UUID,
  selectedUuid: null,
  view: "sunburst",
  settings: initialSettings,
  profileName: initialProfile,
  partner: null,
  pendingDelete: null,
  pendingAddChild: null,
  activeFilter: new Set(ALL_STATES),

  setView: (v) => set({ view: v }),

  selectNode: (uuid) => set({ selectedUuid: uuid }),

  setNodeState: (uuid, state) => {
    const nodes = get().nodes.map((n) => (n.uuid === uuid ? { ...n, state } : n));
    persist(nodes);
    set({ nodes });
  },

  setNodeNote: (uuid, note) => {
    const trimmed = note.trim();
    const nodes = get().nodes.map((n) =>
      n.uuid === uuid ? { ...n, note: trimmed ? trimmed : undefined } : n,
    );
    persist(nodes);
    set({ nodes });
  },

  addChild: (parentUuid, key) => {
    const newNode: NodeRecord = {
      uuid: uuid(),
      parentUuid,
      key: key.trim(),
      state: "UNSET",
      custom: true,
    };
    const nodes = [...get().nodes, newNode];
    persist(nodes);
    set({ nodes, pendingAddChild: null, selectedUuid: newNode.uuid });
  },

  requestDelete: (uuid) => {
    if (get().settings.confirmDelete) {
      set({ pendingDelete: uuid });
    } else {
      const toRemove = collectDescendants(get().nodes, uuid);
      const nodes = get().nodes.filter((n) => !toRemove.has(n.uuid));
      persist(nodes);
      set({
        nodes,
        selectedUuid: null,
        pendingDelete: null,
      });
    }
  },

  cancelDelete: () => set({ pendingDelete: null }),

  confirmDelete: () => {
    const target = get().pendingDelete;
    if (!target) return;
    const toRemove = collectDescendants(get().nodes, target);
    const nodes = get().nodes.filter((n) => !toRemove.has(n.uuid));
    persist(nodes);
    set({ nodes, selectedUuid: null, pendingDelete: null });
  },

  openAddChild: (parentUuid) => set({ pendingAddChild: parentUuid }),
  closeAddChild: () => set({ pendingAddChild: null }),

  importNodes: (nodes, name) => {
    persist(nodes);
    if (name) {
      saveProfileName(name);
      set({ profileName: name });
    }
    set({ nodes, selectedUuid: null });
  },

  resetToSeed: () => {
    const fresh = buildSeedNodes();
    persist(fresh);
    set({ nodes: fresh, selectedUuid: null });
  },

  clearAllStates: () => {
    const nodes = get().nodes.map((n) => ({ ...n, state: "UNSET" as State }));
    persist(nodes);
    set({ nodes });
  },

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
  },

  setProfileName: (name) => {
    saveProfileName(name);
    set({ profileName: name });
  },

  loadPartner: (partner) => set({ partner, view: "compare" }),
  clearPartner: () => set({ partner: null }),

  toggleFilter: (state) => {
    const next = new Set(get().activeFilter);
    if (next.has(state)) next.delete(state);
    else next.add(state);
    set({ activeFilter: next });
  },

  resetFilter: () => set({ activeFilter: new Set(ALL_STATES) }),
}));

export function useNodeMap(): Map<string, NodeRecord> {
  const nodes = useAppStore((s) => s.nodes);
  const map = new Map<string, NodeRecord>();
  for (const n of nodes) map.set(n.uuid, n);
  return map;
}

export function useChildrenIndex(): Map<string, NodeRecord[]> {
  const nodes = useAppStore((s) => s.nodes);
  const idx = new Map<string, NodeRecord[]>();
  for (const n of nodes) {
    const list = idx.get(n.parentUuid) ?? [];
    list.push(n);
    idx.set(n.parentUuid, list);
  }
  for (const list of idx.values()) {
    list.sort((a, b) => a.key.localeCompare(b.key));
  }
  return idx;
}
