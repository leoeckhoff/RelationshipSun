import type { NodeRecord, Profile, Settings } from "./types";

const PROFILES_KEY = "rsun:profiles:v1";
const ACTIVE_KEY = "rsun:active:v1";
const SETTINGS_KEY = "rsun:settings:v1";

// Legacy keys (migrated to profiles on first load)
const LEGACY_NODES_KEY = "rsun:nodes:v1";
const LEGACY_PROFILE_KEY = "rsun:profile:v1";

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function loadProfiles(): {
  profiles: Profile[];
  activeId: string;
} | null {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const profiles = JSON.parse(raw);
      if (Array.isArray(profiles) && profiles.length > 0) {
        const stored = localStorage.getItem(ACTIVE_KEY);
        const activeId =
          stored && profiles.some((p: Profile) => p.id === stored)
            ? stored
            : profiles[0].id;
        return { profiles: profiles as Profile[], activeId };
      }
    }
  } catch {
    // fall through
  }

  // Migration from the single-profile format.
  try {
    const oldNodesRaw = localStorage.getItem(LEGACY_NODES_KEY);
    if (oldNodesRaw) {
      const nodes = JSON.parse(oldNodesRaw);
      if (Array.isArray(nodes)) {
        const name =
          localStorage.getItem(LEGACY_PROFILE_KEY)?.trim() || "Me";
        const profile: Profile = {
          id: genId(),
          name,
          nodes: nodes as NodeRecord[],
        };
        const profiles = [profile];
        saveProfiles(profiles);
        saveActiveId(profile.id);
        localStorage.removeItem(LEGACY_NODES_KEY);
        localStorage.removeItem(LEGACY_PROFILE_KEY);
        return { profiles, activeId: profile.id };
      }
    }
  } catch {
    // fall through
  }

  return null;
}

export function saveProfiles(profiles: Profile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function saveActiveId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { confirmDelete: true };
    return { confirmDelete: true, ...JSON.parse(raw) };
  } catch {
    return { confirmDelete: true };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function clearAll(): void {
  localStorage.removeItem(PROFILES_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(LEGACY_NODES_KEY);
  localStorage.removeItem(LEGACY_PROFILE_KEY);
}

export { genId };
