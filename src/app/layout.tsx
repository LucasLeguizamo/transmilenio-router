import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "TransMilenio MCP",
	description: "MCP server for TransMilenio route planning with interactive map UI",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<head>
				<link
					rel="stylesheet"
					href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
					integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
					crossOrigin=""
				/>
			</head>
			<body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
				{children}
			</body>
		</html>
	);
}
