import { create } from "zustand";
import type {
  ComparePartner,
  NodeRecord,
  Profile,
  Settings,
  State,
  View,
} from "./types";
import { ALL_STATES } from "./types";
import { buildSeedNodes, SEED_ROOT_UUID } from "./seed";
import {
  genId,
  loadProfiles,
  loadSettings,
  saveActiveId,
  saveProfiles,
  saveSettings,
} from "./storage";

interface AppState {
  // Source of truth
  profiles: Profile[];
  activeProfileId: string;

  // Mirrors of the active profile, updated on every change.
  nodes: NodeRecord[];
  profileName: string;

  rootUuid: string;
  selectedUuid: string | null;
  view: View;
  settings: Settings;
  partner: ComparePartner | null;
  pendingDelete: string | null;
  pendingAddChild: string | null;
  activeFilter: Set<State>;
  sunburstFocus: string;

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

  // Profile actions
  addProfile: (init?: { name?: string; nodes?: NodeRecord[] }) => string;
  switchProfile: (id: string) => void;
  renameProfile: (id: string, name: string) => void;
  deleteProfile: (id: string) => void;

  importNodes: (nodes: NodeRecord[], name?: string) => void;
  resetToSeed: () => void;
  clearAllStates: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  loadPartner: (partner: ComparePartner) => void;
  clearPartner: () => void;
  toggleFilter: (state: State) => void;
  resetFilter: () => void;
  setSunburstFocus: (uuid: string) => void;
}

function newUuid(): string {
  return genId();
}

function collectDescendants(
  nodes: NodeRecord[],
  rootUuid: string,
): Set<string> {
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

function pickActive(
  profiles: Profile[],
  activeId: string,
): Profile {
  return profiles.find((p) => p.id === activeId) ?? profiles[0];
}

function loadInitial(): {
  profiles: Profile[];
  activeId: string;
} {
  const loaded = loadProfiles();
  if (loaded) return loaded;
  const profile: Profile = {
    id: genId(),
    name: "Me",
    nodes: buildSeedNodes(),
  };
  saveProfiles([profile]);
  saveActiveId(profile.id);
  return { profiles: [profile], activeId: profile.id };
}

const initial = loadInitial();
const initialActive = pickActive(initial.profiles, initial.activeId);
const initialSettings = loadSettings();

function persistActive(profiles: Profile[]) {
  saveProfiles(profiles);
}

export const useAppStore = create<AppState>((set, get) => ({
  profiles: initial.profiles,
  activeProfileId: initial.activeId,
  nodes: initialActive.nodes,
  profileName: initialActive.name,

  rootUuid: SEED_ROOT_UUID,
  selectedUuid: null,
  view: "sunburst",
  settings: initialSettings,
  partner: null,
  pendingDelete: null,
  pendingAddChild: null,
  activeFilter: new Set(ALL_STATES),
  sunburstFocus: SEED_ROOT_UUID,

  setView: (v) => set({ view: v }),

  selectNode: (uuid) => set({ selectedUuid: uuid }),

  setNodeState: (uuid, state) => {
    const { profiles, activeProfileId } = get();
    const newProfiles = profiles.map((p) =>
      p.id !== activeProfileId
        ? p
        : {
            ...p,
            nodes: p.nodes.map((n) =>
              n.uuid === uuid ? { ...n, state } : n,
            ),
          },
    );
    persistActive(newProfiles);
    const active = pickActive(newProfiles, activeProfileId);
    set({ profiles: newProfiles, nodes: active.nodes });
  },

  setNodeNote: (uuid, note) => {
    const { profiles, activeProfileId } = get();
    const trimmed = note.trim();
    const newProfiles = profiles.map((p) =>
      p.id !== activeProfileId
        ? p
        : {
            ...p,
            nodes: p.nodes.map((n) =>
              n.uuid === uuid
                ? { ...n, note: trimmed ? trimmed : undefined }
                : n,
            ),
          },
    );
    persistActive(newProfiles);
    const active = pickActive(newProfiles, activeProfileId);
    set({ profiles: newProfiles, nodes: active.nodes });
  },

  addChild: (parentUuid, key) => {
    const { profiles, activeProfileId } = get();
    const newNode: NodeRecord = {
      uuid: newUuid(),
      parentUuid,
      key: key.trim(),
      state: "UNSET",
      custom: true,
    };
    const newProfiles = profiles.map((p) =>
      p.id !== activeProfileId ? p : { ...p, nodes: [...p.nodes, newNode] },
    );
    persistActive(newProfiles);
    const active = pickActive(newProfiles, activeProfileId);
    set({
      profiles: newProfiles,
      nodes: active.nodes,
      pendingAddChild: null,
      selectedUuid: newNode.uuid,
    });
  },

  requestDelete: (uuid) => {
    if (get().settings.confirmDelete) {
      set({ pendingDelete: uuid });
    } else {
      const { profiles, activeProfileId } = get();
      const active = pickActive(profiles, activeProfileId);
      const toRemove = collectDescendants(active.nodes, uuid);
      const newProfiles = profiles.map((p) =>
        p.id !== activeProfileId
          ? p
          : { ...p, nodes: p.nodes.filter((n) => !toRemove.has(n.uuid)) },
      );
      persistActive(newProfiles);
      const newActive = pickActive(newProfiles, activeProfileId);
      set({
        profiles: newProfiles,
        nodes: newActive.nodes,
        selectedUuid: null,
        pendingDelete: null,
      });
    }
  },

  cancelDelete: () => set({ pendingDelete: null }),

  confirmDelete: () => {
    const target = get().pendingDelete;
    if (!target) return;
    const { profiles, activeProfileId } = get();
    const active = pickActive(profiles, activeProfileId);
    const toRemove = collectDescendants(active.nodes, target);
    const newProfiles = profiles.map((p) =>
      p.id !== activeProfileId
        ? p
        : { ...p, nodes: p.nodes.filter((n) => !toRemove.has(n.uuid)) },
    );
    persistActive(newProfiles);
    const newActive = pickActive(newProfiles, activeProfileId);
    set({
      profiles: newProfiles,
      nodes: newActive.nodes,
      selectedUuid: null,
      pendingDelete: null,
    });
  },

  openAddChild: (parentUuid) => set({ pendingAddChild: parentUuid }),
  closeAddChild: () => set({ pendingAddChild: null }),

  addProfile: (init) => {
    const id = genId();
    const profile: Profile = {
      id,
      name: init?.name?.trim() || "Partner",
      nodes: init?.nodes ?? buildSeedNodes(),
    };
    const newProfiles = [...get().profiles, profile];
    persistActive(newProfiles);
    saveActiveId(id);
    set({
      profiles: newProfiles,
      activeProfileId: id,
      nodes: profile.nodes,
      profileName: profile.name,
      selectedUuid: null,
      sunburstFocus: SEED_ROOT_UUID,
    });
    return id;
  },

  switchProfile: (id) => {
    const { profiles } = get();
    if (!profiles.some((p) => p.id === id)) return;
    saveActiveId(id);
    const active = pickActive(profiles, id);
    set({
      activeProfileId: id,
      nodes: active.nodes,
      profileName: active.name,
      selectedUuid: null,
      sunburstFocus: SEED_ROOT_UUID,
    });
  },

  renameProfile: (id, name) => {
    const { profiles, activeProfileId } = get();
    const newProfiles = profiles.map((p) =>
      p.id === id ? { ...p, name } : p,
    );
    persistActive(newProfiles);
    set({
      profiles: newProfiles,
      profileName:
        id === activeProfileId
          ? name
          : pickActive(newProfiles, activeProfileId).name,
    });
  },

  deleteProfile: (id) => {
    const { profiles, activeProfileId } = get();
    if (profiles.length <= 1) return; // keep at least one profile
    const newProfiles = profiles.filter((p) => p.id !== id);
    persistActive(newProfiles);
    let newActiveId = activeProfileId;
    if (id === activeProfileId) {
      newActiveId = newProfiles[0].id;
      saveActiveId(newActiveId);
    }
    const active = pickActive(newProfiles, newActiveId);
    set({
      profiles: newProfiles,
      activeProfileId: newActiveId,
      nodes: active.nodes,
      profileName: active.name,
      selectedUuid: null,
      sunburstFocus: SEED_ROOT_UUID,
    });
  },

  importNodes: (nodes, name) => {
    const { profiles, activeProfileId } = get();
    const newProfiles = profiles.map((p) =>
      p.id !== activeProfileId
        ? p
        : { ...p, nodes, name: name?.trim() || p.name },
    );
    persistActive(newProfiles);
    const active = pickActive(newProfiles, activeProfileId);
    set({
      profiles: newProfiles,
      nodes: active.nodes,
      profileName: active.name,
      selectedUuid: null,
    });
  },

  resetToSeed: () => {
    const { profiles, activeProfileId } = get();
    const newProfiles = profiles.map((p) =>
      p.id !== activeProfileId ? p : { ...p, nodes: buildSeedNodes() },
    );
    persistActive(newProfiles);
    const active = pickActive(newProfiles, activeProfileId);
    set({
      profiles: newProfiles,
      nodes: active.nodes,
      selectedUuid: null,
      sunburstFocus: SEED_ROOT_UUID,
    });
  },

  clearAllStates: () => {
    const { profiles, activeProfileId } = get();
    const newProfiles = profiles.map((p) =>
      p.id !== activeProfileId
        ? p
        : {
            ...p,
            nodes: p.nodes.map((n) => ({ ...n, state: "UNSET" as State })),
          },
    );
    persistActive(newProfiles);
    const active = pickActive(newProfiles, activeProfileId);
    set({ profiles: newProfiles, nodes: active.nodes });
  },

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
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

  setSunburstFocus: (uuid) => set({ sunburstFocus: uuid }),
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
