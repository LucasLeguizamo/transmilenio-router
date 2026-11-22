"use client";

import { useEffect, useRef } from "react";
import type { RoutePlan } from "@/lib/routing/types";
import type L from "leaflet";

type RouteMapProps = {
	plan: RoutePlan;
	theme?: "light" | "dark";
};

const SYSTEM_COLORS: Record<string, string> = {
	troncal: "#E31937",
	alimentador: "#00A651",
	dual: "#F7941D",
	zonal_urbano: "#0072BC",
	zonal_complementario: "#662D91",
	zonal_especial: "#00AEEF",
	transmicable: "#8DC63F",
	other: "#666666",
};

const TILE_URLS = {
	light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
	dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};

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
				.bindPopup(`<strong>Origin</strong><br/>${plan.origin.name}`);
			bounds.extend([plan.origin.latitude, plan.origin.longitude]);

			L.marker([plan.destination.latitude, plan.destination.longitude], {
				icon: destIcon,
			})
				.addTo(map)
				.bindPopup(`<strong>Destination</strong><br/>${plan.destination.name}`);
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
						`Walk ${segment.distanceMeters}m (~${segment.estimatedMinutes} min)`,
					);
				} else if (segment.kind === "transit") {
					const color =
						segment.route.color ??
						SYSTEM_COLORS[segment.route.system] ??
						"#666666";

					if (segment.geometry && segment.geometry.length > 0) {
						const coords = segment.geometry.map(
							([lng, lat]) => [lat, lng] as [number, number],
						);
						const routeLine = L.polyline(coords, {
							color,
							weight: 5,
							opacity: 0.8,
						}).addTo(map);
						routeLine.bindPopup(
							`<strong>${segment.route.short_name ?? segment.route.route_id}</strong><br/>${segment.route.long_name ?? ""}`,
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
								opacity: 0.8,
							},
						).addTo(map);
						simpleLine.bindPopup(
							`<strong>${segment.route.short_name ?? segment.route.route_id}</strong><br/>${segment.route.long_name ?? ""}`,
						);
					}

					const stopIcon = L.divIcon({
						className: "stop-marker",
						html: `<div class="stop-dot" style="background:${color};border:2px solid white;"></div>`,
						iconSize: [16, 16],
						iconAnchor: [8, 8],
					});

					L.marker(
						[segment.boardStop.latitude, segment.boardStop.longitude],
						{ icon: stopIcon },
					)
						.addTo(map)
						.bindPopup(`<strong>Board</strong><br/>${segment.boardStop.name}`);
					bounds.extend([
						segment.boardStop.latitude,
						segment.boardStop.longitude,
					]);

					L.marker(
						[segment.alightStop.latitude, segment.alightStop.longitude],
						{ icon: stopIcon },
					)
						.addTo(map)
						.bindPopup(`<strong>Alight</strong><br/>${segment.alightStop.name}`);
					bounds.extend([
						segment.alightStop.latitude,
						segment.alightStop.longitude,
					]);
				} else if (segment.kind === "transfer") {
					const transferIcon = L.divIcon({
						className: "transfer-marker",
						html: `<div class="transfer-dot" style="background:#f59e0b;border:2px solid white;"></div>`,
						iconSize: [20, 20],
						iconAnchor: [10, 10],
					});

					L.marker([segment.fromStop.latitude, segment.fromStop.longitude], {
						icon: transferIcon,
					})
						.addTo(map)
						.bindPopup(`<strong>Transfer</strong><br/>${segment.fromStop.name}`);
					bounds.extend([
						segment.fromStop.latitude,
						segment.fromStop.longitude,
					]);
				}
			}

			map.fitBounds(bounds, { padding: [50, 50] });
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
				}
				.marker-dot,
				.stop-dot,
				.transfer-dot {
					width: 100%;
					height: 100%;
					border-radius: 50%;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
				}
				.leaflet-popup-content-wrapper {
					border-radius: 8px;
				}
			`}</style>
			<div ref={mapRef} style={{ width: "100%", height: "100%" }} />
		</div>
	);
}
