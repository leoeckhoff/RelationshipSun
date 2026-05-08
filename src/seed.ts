import seedJson from "./seed.json";
import type { NodeRecord } from "./types";

interface RawSeedNode {
  uuid: string;
  parentUuid: string;
  key: string;
}

export function buildSeedNodes(): NodeRecord[] {
  const raw = seedJson as RawSeedNode[];
  return raw.map((n) => ({
    uuid: n.uuid,
    parentUuid: n.parentUuid,
    key: n.key,
    state: "UNSET",
  }));
}

export const SEED_ROOT_UUID = "342b4d3c-f6eb-11ec-b939-0242ac120002";
