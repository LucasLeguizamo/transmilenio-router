import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "fs";
import { dirname } from "path";
import { CROMA_LEDGER_PATH } from "./paths";

export type LedgerEntry = {
	ts: string;
	endpoint: string;
	params: Record<string, unknown>;
	cache: "hit" | "miss" | "bypass" | "coalesced";
	status?: number;
	code?: string;
	/** Credits consumed if response headers expose them; else null. */
	credits?: number | null;
	rate_limit_remaining?: number | null;
	error?: string;
	duration_ms?: number;
};

export class CallLedger {
	private entries: LedgerEntry[] = [];
	private path: string;
	private persist: boolean;

	constructor(options?: { path?: string; persist?: boolean }) {
		this.path = options?.path ?? CROMA_LEDGER_PATH;
		this.persist = options?.persist !== false;
	}

	record(entry: LedgerEntry): void {
		this.entries.push(entry);
		if (!this.persist) return;
		mkdirSync(dirname(this.path), { recursive: true });
		appendFileSync(this.path, `${JSON.stringify(entry)}\n`);
	}

	getEntries(): LedgerEntry[] {
		return [...this.entries];
	}

	countNetworkCalls(): number {
		return this.entries.filter(
			(e) => e.cache === "miss" || e.cache === "bypass",
		).length;
	}

	countHits(): number {
		return this.entries.filter(
			(e) => e.cache === "hit" || e.cache === "coalesced",
		).length;
	}

	summary(): {
		total: number;
		network: number;
		hits: number;
		by_endpoint: Record<string, number>;
	} {
		const by_endpoint: Record<string, number> = {};
		for (const e of this.entries) {
			if (e.cache !== "miss" && e.cache !== "bypass") continue;
			by_endpoint[e.endpoint] = (by_endpoint[e.endpoint] ?? 0) + 1;
		}
		return {
			total: this.entries.length,
			network: this.countNetworkCalls(),
			hits: this.countHits(),
			by_endpoint,
		};
	}

	clearMemory(): void {
		this.entries = [];
	}

	static readFile(path = CROMA_LEDGER_PATH): LedgerEntry[] {
		if (!existsSync(path)) return [];
		return readFileSync(path, "utf-8")
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				try {
					return JSON.parse(line) as LedgerEntry;
				} catch {
					return null;
				}
			})
			.filter((x): x is LedgerEntry => x != null);
	}

	static truncate(path = CROMA_LEDGER_PATH): void {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, "");
	}
}

/** Shared process ledger for sync / verify reporting. */
let sharedLedger: CallLedger | null = null;

export function getSharedLedger(): CallLedger {
	if (!sharedLedger) sharedLedger = new CallLedger();
	return sharedLedger;
}

export function resetSharedLedger(options?: {
	path?: string;
	persist?: boolean;
}): CallLedger {
	sharedLedger = new CallLedger(options);
	return sharedLedger;
}
