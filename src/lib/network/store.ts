import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "fs";
import {
	DEFAULT_NETWORK_MAX_AGE_HOURS,
	GRAPH_PATH,
	NETWORK_DIR,
	SNAPSHOT_PATH,
	SYNC_STATE_PATH,
} from "./paths";
import {
	NetworkSnapshotSchema,
	type NetworkGraph,
	type NetworkSnapshot,
	type SyncState,
} from "./types";

export function ensureNetworkDir(): void {
	mkdirSync(NETWORK_DIR, { recursive: true });
}

export function loadSnapshot(
	path = SNAPSHOT_PATH,
): NetworkSnapshot | null {
	if (!existsSync(path)) return null;
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8"));
		const parsed = NetworkSnapshotSchema.safeParse(raw);
		return parsed.success ? (parsed.data as NetworkSnapshot) : null;
	} catch {
		return null;
	}
}

export function saveSnapshot(
	snapshot: NetworkSnapshot,
	path = SNAPSHOT_PATH,
): void {
	ensureNetworkDir();
	writeFileSync(path, JSON.stringify(snapshot));
}

export function loadGraph(path = GRAPH_PATH): NetworkGraph | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as NetworkGraph;
	} catch {
		return null;
	}
}

export function saveGraph(graph: NetworkGraph, path = GRAPH_PATH): void {
	ensureNetworkDir();
	writeFileSync(path, JSON.stringify(graph));
}

export function loadSyncState(path = SYNC_STATE_PATH): SyncState | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as SyncState;
	} catch {
		return null;
	}
}

export function saveSyncState(state: SyncState, path = SYNC_STATE_PATH): void {
	ensureNetworkDir();
	writeFileSync(path, JSON.stringify(state, null, 2));
}

export function clearSyncState(path = SYNC_STATE_PATH): void {
	if (existsSync(path)) {
		unlinkSync(path);
	}
}

export function snapshotAgeHours(
	snapshot: NetworkSnapshot,
	now = Date.now(),
): number {
	const fetched = Date.parse(snapshot.fetched_at);
	if (Number.isNaN(fetched)) return Number.POSITIVE_INFINITY;
	return (now - fetched) / (1000 * 60 * 60);
}

export function isSnapshotFresh(
	snapshot: NetworkSnapshot | null,
	maxAgeHours = Number(
		process.env.NETWORK_MAX_AGE_HOURS ?? DEFAULT_NETWORK_MAX_AGE_HOURS,
	),
): boolean {
	if (!snapshot) return false;
	return snapshotAgeHours(snapshot) <= maxAgeHours;
}

export type LoadedNetwork = {
	snapshot: NetworkSnapshot;
	graph: NetworkGraph;
	fresh: boolean;
};

export function loadNetworkBundle(
	options?: { maxAgeHours?: number },
): LoadedNetwork | null {
	const snapshot = loadSnapshot();
	const graph = loadGraph();
	if (!snapshot || !graph) return null;
	if (graph.snapshot_fetched_at !== snapshot.fetched_at) return null;
	return {
		snapshot,
		graph,
		fresh: isSnapshotFresh(snapshot, options?.maxAgeHours),
	};
}
