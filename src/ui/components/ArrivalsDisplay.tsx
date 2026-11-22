"use client";

import type { Arrival } from "@/lib/croma/types";

type ArrivalsDisplayProps = {
	stopId: string;
	stopName: string;
	arrivals: Arrival[];
	isLive?: boolean;
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

function formatTime(arrival: Arrival): string {
	if (arrival.minutes_away !== null) {
		if (arrival.minutes_away === 0) return "Now";
		if (arrival.minutes_away === 1) return "1 min";
		return `${arrival.minutes_away} min`;
	}
	if (arrival.predicted_at) {
		const date = new Date(arrival.predicted_at);
		return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
	}
	return "—";
}

function formatDelay(arrival: Arrival): React.ReactNode {
	if (arrival.delay_seconds === null) return null;
	if (Math.abs(arrival.delay_seconds) < 60) return null;

	const minutes = Math.round(arrival.delay_seconds / 60);
	if (minutes > 0) {
		return <span className="delay late">+{minutes} min late</span>;
	}
	return <span className="delay early">{Math.abs(minutes)} min early</span>;
}

export function ArrivalsDisplay({
	stopId,
	stopName,
	arrivals,
	isLive = true,
}: ArrivalsDisplayProps) {
	return (
		<div className="arrivals-display">
			<style jsx>{`
				.arrivals-display {
					font-family: system-ui, -apple-system, sans-serif;
					max-width: 400px;
				}
				.arrivals-header {
					margin-bottom: 16px;
				}
				.stop-name {
					font-size: 18px;
					font-weight: 600;
					color: var(--text-primary, #111827);
					margin: 0;
				}
				.stop-meta {
					font-size: 12px;
					color: var(--text-secondary, #6b7280);
					display: flex;
					gap: 8px;
					align-items: center;
					margin-top: 4px;
				}
				.live-indicator {
					display: inline-flex;
					align-items: center;
					gap: 4px;
				}
				.live-dot {
					width: 8px;
					height: 8px;
					border-radius: 50%;
					background: #22c55e;
					animation: pulse 2s infinite;
				}
				@keyframes pulse {
					0%,
					100% {
						opacity: 1;
					}
					50% {
						opacity: 0.5;
					}
				}
				.arrivals-list {
					display: flex;
					flex-direction: column;
					gap: 12px;
				}
				.arrival-item {
					display: flex;
					align-items: center;
					gap: 12px;
					padding: 12px;
					background: var(--bg-secondary, #f3f4f6);
					border-radius: 8px;
				}
				.route-badge {
					min-width: 48px;
					padding: 4px 8px;
					border-radius: 4px;
					font-weight: 600;
					font-size: 14px;
					text-align: center;
					color: white;
				}
				.arrival-info {
					flex: 1;
				}
				.route-name {
					font-size: 14px;
					color: var(--text-primary, #111827);
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.arrival-basis {
					font-size: 12px;
					color: var(--text-secondary, #6b7280);
				}
				.arrival-time {
					font-size: 20px;
					font-weight: 600;
					color: var(--text-primary, #111827);
					text-align: right;
				}
				.delay {
					display: block;
					font-size: 11px;
					font-weight: 400;
				}
				.delay.late {
					color: #dc2626;
				}
				.delay.early {
					color: #16a34a;
				}
				.empty-state {
					text-align: center;
					padding: 24px;
					color: var(--text-secondary, #6b7280);
				}
			`}</style>

			<div className="arrivals-header">
				<h2 className="stop-name">{stopName}</h2>
				<div className="stop-meta">
					<span>ID: {stopId}</span>
					{isLive && (
						<span className="live-indicator">
							<span className="live-dot" />
							Live
						</span>
					)}
					{!isLive && <span>Scheduled</span>}
				</div>
			</div>

			{arrivals.length === 0 ? (
				<div className="empty-state">No upcoming arrivals</div>
			) : (
				<div className="arrivals-list">
					{arrivals.map((arrival, i) => {
						const color =
							SYSTEM_COLORS[arrival.system ?? "other"] ?? SYSTEM_COLORS.other;
						return (
							<div key={i} className="arrival-item">
								<div className="route-badge" style={{ backgroundColor: color }}>
									{arrival.route_code ?? arrival.route_id ?? "?"}
								</div>
								<div className="arrival-info">
									<div className="route-name">
										{arrival.route_name ?? ""}
									</div>
									<div className="arrival-basis">
										{arrival.basis === "predicted"
											? "Predicted"
											: arrival.basis === "estimated"
												? "Estimated"
												: "Scheduled"}
									</div>
								</div>
								<div className="arrival-time">
									{formatTime(arrival)}
									{formatDelay(arrival)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
