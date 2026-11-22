"use client";

import dynamic from "next/dynamic";
import { RouteDetails } from "@/ui/components/RouteDetails";
import type { RoutePlan } from "@/lib/routing/types";

const RouteMap = dynamic(
	() => import("@/ui/components/RouteMap").then((m) => m.RouteMap),
	{
		ssr: false,
		loading: () => (
			<div
				style={{
					height: "400px",
					borderRadius: "8px",
					background: "#f3f4f6",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "#6b7280",
				}}
			>
				Loading map…
			</div>
		),
	},
);

/** Multimodal fixture: SITP zonal → walk transfer → TransMilenio trunk. */
const SAMPLE_PLAN: RoutePlan = {
	origin: {
		latitude: 4.6636,
		longitude: -74.0603,
		name: "Calle 76 con Carrera 20, Bogotá",
	},
	destination: {
		latitude: 4.7338,
		longitude: -74.0613,
		name: "Colina Campestre, Bogotá",
	},
	segments: [
		{
			kind: "walk",
			from: {
				latitude: 4.6636,
				longitude: -74.0603,
				name: "Calle 76 con Carrera 20",
			},
			to: {
				stop_id: "sitp-76",
				name: "Calle 76 / Carrera 20",
				latitude: 4.664,
				longitude: -74.0605,
			},
			distanceMeters: 180,
			estimatedMinutes: 3,
		},
		{
			kind: "transit",
			route: {
				route_id: "zonal-466",
				short_name: "466",
				long_name: "Calle 76 - Portal Norte",
				system: "zonal_urbano",
				color: "#0072BC",
			},
			boardStop: {
				stop_id: "sitp-76",
				name: "Calle 76 / Carrera 20",
				latitude: 4.664,
				longitude: -74.0605,
			},
			alightStop: {
				stop_id: "tm-calle100",
				name: "Calle 100",
				latitude: 4.6858,
				longitude: -74.0548,
			},
			intermediateStops: [],
			estimatedMinutes: 18,
			geometry: [
				[-74.0605, 4.664],
				[-74.058, 4.67],
				[-74.055, 4.68],
				[-74.0548, 4.6858],
			],
		},
		{
			kind: "transfer",
			fromStop: {
				stop_id: "tm-calle100",
				name: "Calle 100 (SITP)",
				latitude: 4.6858,
				longitude: -74.0548,
			},
			toStop: {
				stop_id: "55007",
				name: "Calle 100 (TransMilenio)",
				latitude: 4.6862,
				longitude: -74.0552,
			},
			walkMinutes: 4,
		},
		{
			kind: "transit",
			route: {
				route_id: "r-b907-n",
				short_name: "B907",
				long_name: "Portal del Norte",
				system: "troncal",
				color: "#E31937",
			},
			boardStop: {
				stop_id: "55007",
				name: "Calle 100",
				latitude: 4.6862,
				longitude: -74.0552,
			},
			alightStop: {
				stop_id: "55770",
				name: "Portal del Norte",
				latitude: 4.7616,
				longitude: -74.0463,
			},
			intermediateStops: [
				{
					stop_id: "56120",
					name: "Toberin",
					latitude: 4.74,
					longitude: -74.05,
				},
			],
			estimatedMinutes: 16,
			geometry: [
				[-74.0552, 4.6862],
				[-74.05, 4.74],
				[-74.0463, 4.7616],
			],
		},
		{
			kind: "walk",
			from: {
				latitude: 4.7616,
				longitude: -74.0463,
				name: "Portal del Norte",
			},
			to: {
				stop_id: "dest",
				name: "Colina Campestre",
				latitude: 4.7338,
				longitude: -74.0613,
			},
			distanceMeters: 900,
			estimatedMinutes: 12,
		},
	],
	totalMinutes: 53,
	totalWalkMinutes: 19,
	transferCount: 1,
	alerts: [],
	timestamp: new Date().toISOString(),
	limitations: [
		"Sample multimodal fixture (SITP Urbano + TransMilenio). Live planning requires CROMA_API_KEY.",
	],
};

export default function RouteMapPreviewPage() {
	return (
		<main
			style={{
				maxWidth: "960px",
				margin: "0 auto",
				padding: "1.5rem",
				fontFamily: "system-ui, sans-serif",
			}}
		>
			<header style={{ marginBottom: "1rem" }}>
				<p
					style={{
						margin: 0,
						fontSize: "0.75rem",
						letterSpacing: "0.08em",
						textTransform: "uppercase",
						color: "#6b7280",
					}}
				>
					TransMilenio MCP
				</p>
				<h1 style={{ margin: "0.25rem 0", fontSize: "1.5rem" }}>
					Multimodal route preview
				</h1>
				<p style={{ margin: 0, color: "#6b7280" }}>
					Calle 76 con Carrera 20 → Colina Campestre (SITP + TransMilenio)
				</p>
			</header>

			<section aria-label="Route map" style={{ marginBottom: "1.5rem" }}>
				<RouteMap plan={SAMPLE_PLAN} theme="light" />
			</section>

			<section aria-label="Route details">
				<RouteDetails plan={SAMPLE_PLAN} />
			</section>
		</main>
	);
}
