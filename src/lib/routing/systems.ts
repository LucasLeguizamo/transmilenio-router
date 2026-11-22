import type { TransitSystem } from "../croma/types";

export const SYSTEM_LABELS: Record<TransitSystem | string, string> = {
	troncal: "TransMilenio",
	alimentador: "Alimentador",
	dual: "Dual",
	zonal_urbano: "SITP Urbano",
	zonal_complementario: "SITP Complementario",
	zonal_especial: "SITP Especial",
	transmicable: "TransMiCable",
	other: "Transit",
};

/** Distinct map/UI colors per Croma system (prefer over raw GTFS route color). */
export const SYSTEM_COLORS: Record<TransitSystem | string, string> = {
	troncal: "#E31937",
	alimentador: "#00A651",
	dual: "#F7941D",
	zonal_urbano: "#0072BC",
	zonal_complementario: "#662D91",
	zonal_especial: "#00AEEF",
	transmicable: "#8DC63F",
	other: "#666666",
};

export function systemLabel(system: string | null | undefined): string {
	if (!system) return SYSTEM_LABELS.other;
	return SYSTEM_LABELS[system] ?? system;
}

export function systemColor(system: string | null | undefined): string {
	if (!system) return SYSTEM_COLORS.other;
	return SYSTEM_COLORS[system] ?? SYSTEM_COLORS.other;
}
