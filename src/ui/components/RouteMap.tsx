"use client";

import { useEffect, useRef } from "react";
import type { RoutePlan } from "@/lib/routing/types";
import { SYSTEM_COLORS, SYSTEM_LABELS, systemColor } from "@/lib/routing/systems";
import type L from "leaflet";

type RouteMapProps = {
	plan: RoutePlan;
	theme?: "light" | "dark";
};

const TILE_URLS = {
	light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
	dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};

function systemIconHtml(system: string, color: string): string {
	const label = (SYSTEM_LABELS[system] ?? system).slice(0, 1);
	if (system === "troncal") {
		return `<div class="system-badge" style="background:${color};">TM</div>`;
	}
	if (system === "alimentador") {
		return `<div class="system-badge" style="background:${color};">A</div>`;
	}
	if (system.startsWith("zonal")) {
		return `<div class="system-badge" style="background:${color};">S</div>`;
	}
	if (system === "transmicable") {
		return `<div class="system-badge" style="background:${color};">C</div>`;
	}
	return `<div class="system-badge" style="background:${color};">${label}</div>`;
}

export function RouteMap({ plan, theme = "light" }: RouteMapProps) {
	const mapRef = useRef<HTMLDivElement>(null);
	const mapInstanceRef = useRef<L.Map | null>(null);

	useEffect(() => {
		if (!mapRef.current || mapInstanceRef.current) return;

		let cancelled = false;

		async function setupMap() {
			const leaflet = await import("leaflet");
			if (cancelled || !mapRef.current) return;

			const L = leaflet.default;
			const map = L.map(mapRef.current);
			mapInstanceRef.current = map;

			L.tileLayer(TILE_URLS[theme], {
				attribution:
					'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
				maxZoom: 19,
			}).addTo(map);

			const bounds = L.latLngBounds([]);
			const systemsUsed = new Set<string>();

			const originIcon = L.divIcon({
				className: "route-marker origin-marker",
				html: `<div class="marker-dot" style="background:#22c55e;"></div>`,
				iconSize: [24, 24],
				iconAnchor: [12, 12],
			});

			const destIcon = L.divIcon({
				className: "route-marker dest-marker",
				html: `<div class="marker-dot" style="background:#ef4444;"></div>`,
				iconSize: [24, 24],
				iconAnchor: [12, 12],
			});

			L.marker([plan.origin.latitude, plan.origin.longitude], { icon: originIcon })
				.addTo(map)
				.bindPopup(`<strong>Origen</strong><br/>${plan.origin.name}`);
			bounds.extend([plan.origin.latitude, plan.origin.longitude]);

			L.marker([plan.destination.latitude, plan.destination.longitude], {
				icon: destIcon,
			})
				.addTo(map)
				.bindPopup(`<strong>Destino</strong><br/>${plan.destination.name}`);
			bounds.extend([plan.destination.latitude, plan.destination.longitude]);

			for (const segment of plan.segments) {
				if (segment.kind === "walk") {
					const walkLine = L.polyline(
						[
							[segment.from.latitude, segment.from.longitude],
							[segment.to.latitude, segment.to.longitude],
						],
						{
							color: "#6b7280",
							weight: 3,
							dashArray: "5, 10",
							opacity: 0.7,
						},
					).addTo(map);
					walkLine.bindPopup(
						`Caminar ${segment.distanceMeters}m (~${segment.estimatedMinutes} min)`,
					);
				} else if (segment.kind === "transit") {
					const system = segment.route.system;
					systemsUsed.add(system);
					// Prefer system color so multimodal legs stay visually distinct.
					const color = systemColor(system);

					if (segment.geometry && segment.geometry.length > 0) {
						const coords = segment.geometry.map(
							([lng, lat]) => [lat, lng] as [number, number],
						);
						const routeLine = L.polyline(coords, {
							color,
							weight: 5,
							opacity: 0.85,
						}).addTo(map);
						routeLine.bindPopup(
							`<strong>${segment.route.short_name ?? segment.route.route_id}</strong> · ${SYSTEM_LABELS[system] ?? system}<br/>${segment.route.long_name ?? ""}`,
						);
						coords.forEach((coord) => bounds.extend(coord));
					} else {
						const simpleLine = L.polyline(
							[
								[segment.boardStop.latitude, segment.boardStop.longitude],
								[segment.alightStop.latitude, segment.alightStop.longitude],
							],
							{
								color,
								weight: 5,
								opacity: 0.85,
							},
						).addTo(map);
						simpleLine.bindPopup(
							`<strong>${segment.route.short_name ?? segment.route.route_id}</strong> · ${SYSTEM_LABELS[system] ?? system}`,
						);
					}

					const boardIcon = L.divIcon({
						className: "system-marker",
						html: systemIconHtml(system, color),
						iconSize: [28, 28],
						iconAnchor: [14, 14],
					});

					L.marker(
						[segment.boardStop.latitude, segment.boardStop.longitude],
						{ icon: boardIcon },
					)
						.addTo(map)
						.bindPopup(
							`<strong>Abordar · ${SYSTEM_LABELS[system] ?? system}</strong><br/>${segment.boardStop.name}`,
						);
					bounds.extend([
						segment.boardStop.latitude,
						segment.boardStop.longitude,
					]);

					L.marker(
						[segment.alightStop.latitude, segment.alightStop.longitude],
						{ icon: boardIcon },
					)
						.addTo(map)
						.bindPopup(
							`<strong>Bajar · ${SYSTEM_LABELS[system] ?? system}</strong><br/>${segment.alightStop.name}`,
						);
					bounds.extend([
						segment.alightStop.latitude,
						segment.alightStop.longitude,
					]);
				} else if (segment.kind === "transfer") {
					const transferIcon = L.divIcon({
						className: "transfer-marker",
						html: `<div class="transfer-dot" title="Transfer">⇄</div>`,
						iconSize: [28, 28],
						iconAnchor: [14, 14],
					});

					L.marker([segment.fromStop.latitude, segment.fromStop.longitude], {
						icon: transferIcon,
					})
						.addTo(map)
						.bindPopup(
							`<strong>Transferencia</strong><br/>${segment.fromStop.name}${
								segment.fromStop.stop_id !== segment.toStop.stop_id
									? ` → ${segment.toStop.name}`
									: ""
							}`,
						);
					bounds.extend([
						segment.fromStop.latitude,
						segment.fromStop.longitude,
					]);
					if (segment.fromStop.stop_id !== segment.toStop.stop_id) {
						L.polyline(
							[
								[segment.fromStop.latitude, segment.fromStop.longitude],
								[segment.toStop.latitude, segment.toStop.longitude],
							],
							{
								color: "#f59e0b",
								weight: 3,
								dashArray: "4, 6",
								opacity: 0.9,
							},
						).addTo(map);
						bounds.extend([
							segment.toStop.latitude,
							segment.toStop.longitude,
						]);
					}
				}
			}

			map.fitBounds(bounds, { padding: [50, 50] });

			const legend = document.createElement("div");
			legend.className = "route-legend";
			const items = [...systemsUsed]
				.map((system) => {
					const color = SYSTEM_COLORS[system] ?? SYSTEM_COLORS.other;
					const label = SYSTEM_LABELS[system] ?? system;
					return `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${label}</span>`;
				})
				.join("");
			legend.innerHTML = `${items}<span class="legend-item"><span class="legend-swatch transfer"></span>Transfer</span>`;
			mapRef.current?.appendChild(legend);
		}

		void setupMap();

		return () => {
			cancelled = true;
			mapInstanceRef.current?.remove();
			mapInstanceRef.current = null;
		};
	}, [plan, theme]);

	return (
		<div className="route-map-container">
			<style jsx global>{`
				.route-map-container {
					width: 100%;
					height: 400px;
					border-radius: 8px;
					overflow: hidden;
					position: relative;
				}
				.marker-dot,
				.stop-dot {
					width: 100%;
					height: 100%;
					border-radius: 50%;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
				}
				.system-badge {
					width: 28px;
					height: 28px;
					border-radius: 6px;
					color: #fff;
					font-size: 11px;
					font-weight: 700;
					display: flex;
					align-items: center;
					justify-content: center;
					border: 2px solid #fff;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
				}
				.transfer-dot {
					width: 28px;
					height: 28px;
					border-radius: 50%;
					background: #f59e0b;
					color: #111;
					font-size: 14px;
					font-weight: 700;
					display: flex;
					align-items: center;
					justify-content: center;
					border: 2px solid #fff;
					box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
				}
				.route-legend {
					position: absolute;
					left: 10px;
					bottom: 10px;
					z-index: 500;
					display: flex;
					flex-wrap: wrap;
					gap: 8px;
					background: rgba(255, 255, 255, 0.92);
					padding: 8px 10px;
					border-radius: 8px;
					font-size: 12px;
					box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
					max-width: calc(100% - 20px);
				}
				.legend-item {
					display: inline-flex;
					align-items: center;
					gap: 4px;
					color: #111827;
				}
				.legend-swatch {
					width: 12px;
					height: 12px;
					border-radius: 3px;
					display: inline-block;
				}
				.legend-swatch.transfer {
					background: #f59e0b;
					border-radius: 50%;
				}
				.leaflet-popup-content-wrapper {
					border-radius: 8px;
				}
			`}</style>
			<div ref={mapRef} style={{ width: "100%", height: "100%" }} />
		</div>
	);
}
