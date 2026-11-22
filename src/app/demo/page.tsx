"use client";

import { useState } from "react";
import { useChat } from "ai/react";

export default function DemoPage() {
	const [tool, setTool] = useState<string>("plan_route");
	const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
		api: "/api/chat",
	});

	const exampleQueries: Record<string, string[]> = {
		plan_route: [
			"Plan a route from Portal Norte to Museo Nacional",
			"How do I get from Calle 72 to Portal Sur?",
			"Route from 4.6486,-74.0633 to Portal 80",
		],
		find_stops: [
			"Find stops near Portal Norte",
			"What TransMilenio stations are near Calle 100?",
			"Show me stops served by route B10",
		],
		stop_arrivals: [
			"When is the next bus at Portal Norte?",
			"Show arrivals at Calle 72 station",
			"What buses are coming to stop 10001?",
		],
		service_alerts: [
			"Are there any service alerts?",
			"Show alerts for route B10",
			"What disruptions affect Portal Norte?",
		],
	};

	return (
		<main style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem" }}>
			<style jsx>{`
				.demo-header {
					margin-bottom: 2rem;
				}
				.demo-title {
					font-size: 1.5rem;
					font-weight: 600;
					margin-bottom: 0.5rem;
				}
				.demo-subtitle {
					color: #6b7280;
					font-size: 0.875rem;
				}
				.tool-selector {
					display: flex;
					gap: 0.5rem;
					margin-bottom: 1rem;
					flex-wrap: wrap;
				}
				.tool-button {
					padding: 0.5rem 1rem;
					border: 1px solid #e5e7eb;
					border-radius: 0.375rem;
					background: white;
					cursor: pointer;
					font-size: 0.875rem;
				}
				.tool-button.active {
					background: #e31937;
					color: white;
					border-color: #e31937;
				}
				.examples {
					background: #f3f4f6;
					padding: 1rem;
					border-radius: 0.5rem;
					margin-bottom: 1rem;
				}
				.examples-title {
					font-size: 0.75rem;
					text-transform: uppercase;
					color: #6b7280;
					margin-bottom: 0.5rem;
				}
				.example-query {
					background: white;
					padding: 0.5rem 0.75rem;
					border-radius: 0.25rem;
					margin-bottom: 0.25rem;
					cursor: pointer;
					font-size: 0.875rem;
				}
				.example-query:hover {
					background: #e5e7eb;
				}
				.chat-container {
					border: 1px solid #e5e7eb;
					border-radius: 0.5rem;
					overflow: hidden;
				}
				.messages {
					padding: 1rem;
					min-height: 300px;
					max-height: 500px;
					overflow-y: auto;
				}
				.message {
					margin-bottom: 1rem;
					padding: 0.75rem;
					border-radius: 0.5rem;
				}
				.message.user {
					background: #e31937;
					color: white;
					margin-left: 2rem;
				}
				.message.assistant {
					background: #f3f4f6;
					margin-right: 2rem;
				}
				.message pre {
					margin: 0;
					white-space: pre-wrap;
					font-family: inherit;
				}
				.input-form {
					display: flex;
					border-top: 1px solid #e5e7eb;
				}
				.input-field {
					flex: 1;
					padding: 1rem;
					border: none;
					outline: none;
					font-size: 1rem;
				}
				.send-button {
					padding: 1rem 1.5rem;
					background: #e31937;
					color: white;
					border: none;
					cursor: pointer;
					font-weight: 500;
				}
				.send-button:disabled {
					background: #9ca3af;
					cursor: not-allowed;
				}
				.setup-notice {
					background: #fef3c7;
					border: 1px solid #f59e0b;
					padding: 1rem;
					border-radius: 0.5rem;
					margin-bottom: 1rem;
					font-size: 0.875rem;
				}
			`}</style>

			<div className="demo-header">
				<h1 className="demo-title">TransMilenio MCP Demo</h1>
				<p className="demo-subtitle">
					Test the MCP tools with an AI assistant. This demo uses the Vercel AI
					SDK to call the TransMilenio MCP server.
				</p>
			</div>

			<div className="setup-notice">
				<strong>Setup required:</strong> This demo requires{" "}
				<code>OPENAI_API_KEY</code> and <code>CROMA_API_KEY</code> environment
				variables. See the README for setup instructions.
			</div>

			<div className="tool-selector">
				{["plan_route", "find_stops", "stop_arrivals", "service_alerts"].map(
					(t) => (
						<button
							key={t}
							className={`tool-button ${tool === t ? "active" : ""}`}
							onClick={() => setTool(t)}
						>
							{t.replace("_", " ")}
						</button>
					),
				)}
			</div>

			<div className="examples">
				<div className="examples-title">Try these examples:</div>
				{exampleQueries[tool].map((query, i) => (
					<div
						key={i}
						className="example-query"
						onClick={() => {
							const form = document.querySelector("form");
							const inputEl = form?.querySelector("input");
							if (inputEl) {
								inputEl.value = query;
								inputEl.dispatchEvent(new Event("input", { bubbles: true }));
							}
						}}
					>
						{query}
					</div>
				))}
			</div>

			<div className="chat-container">
				<div className="messages">
					{messages.length === 0 && (
						<p style={{ color: "#9ca3af", textAlign: "center" }}>
							Ask a question about TransMilenio routes, stops, or arrivals.
						</p>
					)}
					{messages.map((m) => (
						<div key={m.id} className={`message ${m.role}`}>
							<pre>{m.content}</pre>
						</div>
					))}
				</div>

				<form className="input-form" onSubmit={handleSubmit}>
					<input
						className="input-field"
						value={input}
						onChange={handleInputChange}
						placeholder="Ask about TransMilenio..."
						disabled={isLoading}
					/>
					<button className="send-button" type="submit" disabled={isLoading}>
						{isLoading ? "..." : "Send"}
					</button>
				</form>
			</div>
		</main>
	);
}
