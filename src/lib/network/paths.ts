import { join } from "path";

/** Runtime network data (gitignored — regenerate with `pnpm network:sync`). */
export const NETWORK_DIR = join(process.cwd(), "data", "network");

export const SNAPSHOT_PATH = join(NETWORK_DIR, "snapshot.json");
export const GRAPH_PATH = join(NETWORK_DIR, "graph.json");
export const SYNC_STATE_PATH = join(NETWORK_DIR, "sync-state.json");

/** Default max age before plan_route falls back to live Croma routing. */
export const DEFAULT_NETWORK_MAX_AGE_HOURS = 168;
