export default function Home() {
	return (
		<main style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
			<h1>TransMilenio MCP</h1>
			<p>
				This is an MCP server for TransMilenio route planning. Connect it to
				Claude, ChatGPT, Cursor, or any MCP-compatible AI client to plan routes
				in Bogotá.
			</p>

			<h2>Available Tools</h2>
			<ul>
				<li>
					<strong>plan_route</strong> - Plan a route between two locations
				</li>
				<li>
					<strong>find_stops</strong> - Find TransMilenio and SITP stops
				</li>
				<li>
					<strong>stop_arrivals</strong> - Get live arrival times at a stop
				</li>
				<li>
					<strong>service_alerts</strong> - Get current service alerts
				</li>
			</ul>

			<h2>Setup</h2>
			<p>
				See the{" "}
				<a href="https://github.com/lucasleguizamon/transmilenio-mcp">
					README
				</a>{" "}
				for setup instructions.
			</p>

			<h2>Demo</h2>
			<p>
				Visit <a href="/demo">/demo</a> to try the AI SDK demo host.
			</p>
		</main>
	);
}
