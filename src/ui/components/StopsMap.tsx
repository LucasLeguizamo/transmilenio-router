"use client";

import { useEffect, useRef } from "react";
import type { Stop } from "@/lib/croma/types";
import type L from "leaflet";

type StopsMapProps = {
	stops: Stop[];
	center?: { lat: number; lon: number };
	theme?: "light" | "dark";
	onStopClick?: (stop: Stop) => void;
};

const TILE_URLS = {
	light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
	dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
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

function getStopColor(stop: Stop): string {
	if (stop.kind === "station") {
		return "#E31937";
	}
	const firstRoute = stop.route_codes[0];
	if (
		firstRoute?.startsWith("B") ||
		firstRoute?.startsWith("K") ||
		firstRoute?.startsWith("J")
	) {
		return SYSTEM_COLORS.troncal;
	}
	if (firstRoute?.startsWith("A")) {
		return SYSTEM_COLORS.alimentador;
	}
	return SYSTEM_COLORS.zonal_urbano;
}

export function StopsMap({
	stops,
	center,
	theme = "light",
	onStopClick,
}: StopsMapProps) {
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

			if (center) {
				const centerIcon = L.divIcon({
					className: "center-marker",
					html: `<div class="center-dot"></div>`,
					iconSize: [20, 20],
					iconAnchor: [10, 10],
				});
				L.marker([center.lat, center.lon], { icon: centerIcon })
					.addTo(map)
					.bindPopup("Search center");
				bounds.extend([center.lat, center.lon]);
			}

			for (const stop of stops) {
				const color = getStopColor(stop);
				const size = stop.kind === "station" ? 14 : 10;

				const icon = L.divIcon({
					className: "stop-marker",
					html: `<div class="stop-dot" style="background:${color};width:${size}px;height:${size}px;"></div>`,
					iconSize: [size, size],
					iconAnchor: [size / 2, size / 2],
				});

				const routes = stop.route_codes.slice(0, 5).join(", ");
				const moreRoutes =
					stop.route_codes.length > 5
						? ` +${stop.route_codes.length - 5} more`
						: "";
				const distance = stop.distance_m
					? `<br/>Distance: ${Math.round(stop.distance_m)}m`
					: "";

				const marker = L.marker([stop.latitude, stop.longitude], { icon })
					.addTo(map)
					.bindPopup(
						`<strong>${stop.name}</strong><br/>` +
							`ID: ${stop.stop_id}<br/>` +
							`Routes: ${routes}${moreRoutes}${distance}`,
					);

				if (onStopClick) {
					marker.on("click", () => onStopClick(stop));
				}

				bounds.extend([stop.latitude, stop.longitude]);
			}

			if (bounds.isValid()) {
				map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
			} else if (center) {
				map.setView([center.lat, center.lon], 15);
			} else {
				map.setView([4.6486, -74.0633], 12);
			}
		}

		void setupMap();

		return () => {
			cancelled = true;
			mapInstanceRef.current?.remove();
			mapInstanceRef.current = null;
		};
	}, [stops, center, theme, onStopClick]);

	return (
		<div className="stops-map-container">
			<style jsx global>{`
				.stops-map-container {
					width: 100%;
					height: 400px;
					border-radius: 8px;
					overflow: hidden;
				}
				.stop-dot {
					border-radius: 50%;
					border: 2px solid white;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
				}
				.center-dot {
					width: 100%;
					height: 100%;
					border-radius: 50%;
					background: #3b82f6;
					border: 3px solid white;
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
