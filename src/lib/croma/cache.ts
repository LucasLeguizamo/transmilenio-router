import { createHash } from "crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "fs";
import { join } from "path";
import {
	ALERTS_TTL_MS,
	CROMA_RESPONSES_DIR,
	DATASET_TTL_MS,
	LIVE_TTL_MS,
} from "./paths";

export type CacheRecord = {
	key: string;
	path: string;
	stored_at: string;
	ttl_ms: number;
	body: Record<string, unknown>;
	response: unknown;
	headers?: Record<string, string>;
};

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function cacheKey(path: string, body: Record<string, unknown>): string {
	const raw = `${path}|${stableStringify(body)}`;
	return createHash("sha256").update(raw).digest("hex");
}

export function ttlForEndpoint(path: string): number {
	if (path.includes("stop-arrivals") || path.includes("stop-departures")) {
		return LIVE_TTL_MS;
	}
	if (path.includes("vehicles")) return LIVE_TTL_MS;
	if (path.includes("alerts")) return ALERTS_TTL_MS;
	return DATASET_TTL_MS;
}

export function isDatasetEndpoint(path: string): boolean {
	return (
		path.includes("stops-search") ||
		path.includes("/stop/v1") ||
		path.includes("routes-search") ||
		path.includes("/route/v1")
	);
}

type MemoryEntry = {
	expires_at: number;
	response: unknown;
	headers?: Record<string, string>;
};

export class ResponseCache {
	private dir: string;
	private memory = new Map<string, MemoryEntry>();
	private enabled: boolean;

	constructor(options?: { dir?: string; enabled?: boolean }) {
		this.dir = options?.dir ?? CROMA_RESPONSES_DIR;
		this.enabled = options?.enabled !== false;
	}

	private filePath(key: string): string {
		return join(this.dir, `${key}.json`);
	}

	get(
		path: string,
		body: Record<string, unknown>,
	): { hit: true; response: unknown; headers?: Record<string, string> } | {
		hit: false;
		key: string;
	} {
		if (!this.enabled) return { hit: false, key: cacheKey(path, body) };
		const key = cacheKey(path, body);
		const now = Date.now();

		const mem = this.memory.get(key);
		if (mem && mem.expires_at > now) {
			return { hit: true, response: mem.response, headers: mem.headers };
		}

		const fp = this.filePath(key);
		if (!existsSync(fp)) return { hit: false, key };

		try {
			const record = JSON.parse(readFileSync(fp, "utf-8")) as CacheRecord;
			const stored = Date.parse(record.stored_at);
			const ttl = record.ttl_ms ?? ttlForEndpoint(path);
			if (Number.isNaN(stored) || now - stored > ttl) {
				return { hit: false, key };
			}
			this.memory.set(key, {
				expires_at: stored + ttl,
				response: record.response,
				headers: record.headers,
			});
			return {
				hit: true,
				response: record.response,
				headers: record.headers,
			};
		} catch {
			return { hit: false, key };
		}
	}

	set(
		path: string,
		body: Record<string, unknown>,
		response: unknown,
		headers?: Record<string, string>,
	): string {
		const key = cacheKey(path, body);
		if (!this.enabled) return key;
		const ttl = ttlForEndpoint(path);
		const now = Date.now();
		this.memory.set(key, {
			expires_at: now + ttl,
			response,
			headers,
		});

		if (!isDatasetEndpoint(path)) {
			// Live responses stay in memory only (short TTL).
			return key;
		}

		mkdirSync(this.dir, { recursive: true });
		const record: CacheRecord = {
			key,
			path,
			stored_at: new Date().toISOString(),
			ttl_ms: ttl,
			body,
			response,
			headers,
		};
		writeFileSync(this.filePath(key), JSON.stringify(record));
		return key;
	}

	/** Count on-disk dataset cache entries (for --estimate). */
	countDiskEntries(): number {
		if (!existsSync(this.dir)) return 0;
		return readdirSync(this.dir).filter((f) => f.endsWith(".json")).length;
	}

	/** Count fresh route/v1 cache files. */
	countFreshRouteDetails(now = Date.now()): number {
		if (!existsSync(this.dir)) return 0;
		let n = 0;
		for (const file of readdirSync(this.dir)) {
			if (!file.endsWith(".json")) continue;
			const fp = join(this.dir, file);
			try {
				const record = JSON.parse(readFileSync(fp, "utf-8")) as CacheRecord;
				if (!record.path?.includes("/route/v1")) continue;
				const stored = Date.parse(record.stored_at);
				const ttl = record.ttl_ms ?? DATASET_TTL_MS;
				if (!Number.isNaN(stored) && now - stored <= ttl) n += 1;
			} catch {
				// skip corrupt
			}
		}
		return n;
	}

	clearMemory(): void {
		this.memory.clear();
	}
}

export function inventoryCacheDir(dir = CROMA_RESPONSES_DIR): {
	files: number;
	bytes: number;
	fresh_route_details: number;
} {
	if (!existsSync(dir)) {
		return { files: 0, bytes: 0, fresh_route_details: 0 };
	}
	let files = 0;
	let bytes = 0;
	let fresh_route_details = 0;
	const now = Date.now();
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".json")) continue;
		const fp = join(dir, name);
		files += 1;
		try {
			bytes += statSync(fp).size;
			const record = JSON.parse(readFileSync(fp, "utf-8")) as CacheRecord;
			if (record.path?.includes("/route/v1")) {
				const stored = Date.parse(record.stored_at);
				const ttl = record.ttl_ms ?? DATASET_TTL_MS;
				if (!Number.isNaN(stored) && now - stored <= ttl) {
					fresh_route_details += 1;
				}
			}
		} catch {
			// ignore
		}
	}
	return { files, bytes, fresh_route_details };
}
