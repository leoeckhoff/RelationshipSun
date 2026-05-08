import type { NodeRecord, Settings } from "./types";

const NODES_KEY = "rsun:nodes:v1";
const SETTINGS_KEY = "rsun:settings:v1";
const PROFILE_KEY = "rsun:profile:v1";

export function loadNodes(): NodeRecord[] | null {
  try {
    const raw = localStorage.getItem(NODES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as NodeRecord[];
  } catch {
    return null;
  }
}

export function saveNodes(nodes: NodeRecord[]): void {
  localStorage.setItem(NODES_KEY, JSON.stringify(nodes));
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

export function loadProfileName(): string {
  return localStorage.getItem(PROFILE_KEY) ?? "Me";
}

export function saveProfileName(name: string): void {
  localStorage.setItem(PROFILE_KEY, name);
}

export function clearAll(): void {
  localStorage.removeItem(NODES_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(PROFILE_KEY);
}
