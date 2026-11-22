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

const SAMPLE_PLAN: RoutePlan = {
	origin: {
		latitude: 4.7616,
		longitude: -74.0463,
		name: "Portal Norte",
	},
	destination: {
		latitude: 4.601,
		longitude: -74.068,
		name: "Museo Nacional",
	},
	segments: [
		{
			kind: "walk",
			from: {
				latitude: 4.7616,
				longitude: -74.0463,
				name: "Portal Norte area",
			},
			to: {
				stop_id: "10001",
				name: "Portal Norte",
				latitude: 4.7616,
				longitude: -74.0463,
			},
			distanceMeters: 120,
			estimatedMinutes: 2,
		},
		{
			kind: "transit",
			route: {
				route_id: "10075",
				short_name: "B10",
				long_name: "Portal Norte - Museo Nacional",
				system: "troncal",
				color: "#E31937",
			},
			boardStop: {
				stop_id: "10001",
				name: "Portal Norte",
				latitude: 4.7616,
				longitude: -74.0463,
			},
			alightStop: {
				stop_id: "10050",
				name: "Calle 26",
				latitude: 4.609,
				longitude: -74.07,
			},
			intermediateStops: [
				{
					stop_id: "10020",
					name: "Calle 127",
					latitude: 4.71,
					longitude: -74.05,
				},
				{
					stop_id: "10030",
					name: "Calle 100",
					latitude: 4.68,
					longitude: -74.055,
				},
				{
					stop_id: "10040",
					name: "Calle 72",
					latitude: 4.65,
					longitude: -74.063,
				},
			],
			estimatedMinutes: 20,
			geometry: [
				[-74.0463, 4.7616],
				[-74.05, 4.71],
				[-74.055, 4.68],
				[-74.063, 4.65],
				[-74.07, 4.609],
			],
		},
		{
			kind: "walk",
			from: {
				latitude: 4.609,
				longitude: -74.07,
				name: "Calle 26",
			},
			to: {
				stop_id: "dest",
				name: "Museo Nacional",
				latitude: 4.601,
				longitude: -74.068,
			},
			distanceMeters: 350,
			estimatedMinutes: 5,
		},
	],
	totalMinutes: 27,
	totalWalkMinutes: 7,
	transferCount: 0,
	alerts: [],
	timestamp: new Date().toISOString(),
	limitations: [
		"Sample fixture route for UI verification. Live planning requires CROMA_API_KEY.",
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
					Route preview
				</h1>
				<p style={{ margin: 0, color: "#6b7280" }}>
					Portal Norte → Museo Nacional (fixture data)
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
