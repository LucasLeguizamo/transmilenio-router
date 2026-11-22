"use client";

import type { Alert } from "@/lib/croma/types";

type AlertsDisplayProps = {
	alerts: Alert[];
};

const EFFECT_ICONS: Record<string, string> = {
	detour: "↩️",
	no_service: "🚫",
	reduced_service: "⚠️",
	significant_delays: "⏰",
	stop_moved: "📍",
	modified_service: "🔄",
	other: "ℹ️",
};

const EFFECT_LABELS: Record<string, string> = {
	detour: "Detour",
	no_service: "No Service",
	reduced_service: "Reduced Service",
	significant_delays: "Delays",
	stop_moved: "Stop Moved",
	modified_service: "Modified Service",
	other: "Alert",
};

const CAUSE_LABELS: Record<string, string> = {
	technical_problem: "Technical Issue",
	accident: "Accident",
	construction: "Construction",
	demonstration: "Demonstration",
	police_activity: "Police Activity",
	weather: "Weather",
	maintenance: "Maintenance",
	other: "Other Cause",
};

function formatPeriod(period: { start: string | null; end: string | null }): string {
	const formatDate = (iso: string) => {
		const date = new Date(iso);
		return date.toLocaleString("es-CO", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	if (period.start && period.end) {
		return `${formatDate(period.start)} - ${formatDate(period.end)}`;
	}
	if (period.start) {
		return `From ${formatDate(period.start)}`;
	}
	if (period.end) {
		return `Until ${formatDate(period.end)}`;
	}
	return "Active now";
}

export function AlertsDisplay({ alerts }: AlertsDisplayProps) {
	if (alerts.length === 0) {
		return (
			<div className="alerts-display">
				<style jsx>{`
					.alerts-display {
						font-family: system-ui, -apple-system, sans-serif;
					}
					.empty-state {
						text-align: center;
						padding: 24px;
						color: var(--text-secondary, #6b7280);
						background: var(--bg-secondary, #f3f4f6);
						border-radius: 8px;
					}
					.empty-icon {
						font-size: 32px;
						margin-bottom: 8px;
					}
				`}</style>
				<div className="empty-state">
					<div className="empty-icon">✓</div>
					<div>No active service alerts</div>
				</div>
			</div>
		);
	}

	return (
		<div className="alerts-display">
			<style jsx>{`
				.alerts-display {
					font-family: system-ui, -apple-system, sans-serif;
				}
				.alerts-header {
					display: flex;
					align-items: center;
					gap: 8px;
					margin-bottom: 16px;
				}
				.alerts-title {
					font-size: 18px;
					font-weight: 600;
					color: var(--text-primary, #111827);
					margin: 0;
				}
				.alerts-count {
					background: #fef3c7;
					color: #92400e;
					padding: 2px 8px;
					border-radius: 12px;
					font-size: 12px;
					font-weight: 600;
				}
				.alerts-list {
					display: flex;
					flex-direction: column;
					gap: 12px;
				}
				.alert-item {
					padding: 16px;
					background: #fffbeb;
					border: 1px solid #fcd34d;
					border-radius: 8px;
				}
				.alert-header {
					display: flex;
					align-items: center;
					gap: 8px;
					margin-bottom: 8px;
				}
				.alert-icon {
					font-size: 20px;
				}
				.alert-effect {
					font-weight: 600;
					color: #92400e;
					text-transform: uppercase;
					font-size: 12px;
				}
				.alert-cause {
					font-size: 12px;
					color: #a16207;
					margin-left: auto;
				}
				.alert-title {
					font-size: 14px;
					font-weight: 500;
					color: #78350f;
					margin-bottom: 8px;
				}
				.alert-description {
					font-size: 13px;
					color: #92400e;
					margin-bottom: 8px;
					line-height: 1.4;
				}
				.alert-meta {
					display: flex;
					flex-wrap: wrap;
					gap: 8px;
					font-size: 12px;
				}
				.affected-routes {
					display: flex;
					align-items: center;
					gap: 4px;
					color: #a16207;
				}
				.route-tag {
					background: #fcd34d;
					padding: 1px 6px;
					border-radius: 4px;
					font-weight: 500;
				}
				.affected-stops {
					color: #a16207;
				}
				.alert-period {
					color: #a16207;
				}
				.alert-link {
					display: inline-block;
					margin-top: 8px;
					color: #b45309;
					font-size: 12px;
					text-decoration: underline;
				}
			`}</style>

			<div className="alerts-header">
				<h2 className="alerts-title">Service Alerts</h2>
				<span className="alerts-count">{alerts.length}</span>
			</div>

			<div className="alerts-list">
				{alerts.map((alert, i) => {
					const effect = alert.effect ?? "other";
					const icon = EFFECT_ICONS[effect] ?? EFFECT_ICONS.other;
					const effectLabel = EFFECT_LABELS[effect] ?? EFFECT_LABELS.other;
					const causeLabel = alert.cause
						? CAUSE_LABELS[alert.cause] ?? alert.cause
						: null;

					return (
						<div key={i} className="alert-item">
							<div className="alert-header">
								<span className="alert-icon">{icon}</span>
								<span className="alert-effect">{effectLabel}</span>
								{causeLabel && <span className="alert-cause">{causeLabel}</span>}
							</div>

							{alert.header && <div className="alert-title">{alert.header}</div>}

							{alert.description && (
								<div className="alert-description">{alert.description}</div>
							)}

							<div className="alert-meta">
								{alert.routes.length > 0 && (
									<div className="affected-routes">
										<span>Routes:</span>
										{alert.routes.slice(0, 5).map((r, j) => (
											<span key={j} className="route-tag">
												{r.route_code ?? r.route_id}
											</span>
										))}
										{alert.routes.length > 5 && (
											<span>+{alert.routes.length - 5}</span>
										)}
									</div>
								)}

								{alert.stops.length > 0 && (
									<div className="affected-stops">
										{alert.stops.length} stop
										{alert.stops.length !== 1 ? "s" : ""} affected
									</div>
								)}

								{alert.active_periods.length > 0 && (
									<div className="alert-period">
										{formatPeriod(alert.active_periods[0])}
									</div>
								)}
							</div>

							{alert.url && (
								<a
									href={alert.url}
									target="_blank"
									rel="noopener noreferrer"
									className="alert-link"
								>
									More information →
								</a>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
