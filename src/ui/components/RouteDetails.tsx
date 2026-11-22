"use client";

import type { RoutePlan, RoutePlanSegment } from "@/lib/routing/types";
import { systemColor, systemLabel } from "@/lib/routing/systems";

type RouteDetailsProps = {
	plan: RoutePlan;
};

function SegmentIcon({ segment }: { segment: RoutePlanSegment }) {
	if (segment.kind === "walk") {
		return (
			<svg className="segment-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
				<path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" />
			</svg>
		);
	}
	if (segment.kind === "transfer") {
		return (
			<svg className="segment-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
				<path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z" />
			</svg>
		);
	}
	return (
		<svg className="segment-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
			<path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" />
		</svg>
	);
}

function formatSegment(segment: RoutePlanSegment, index: number): React.ReactNode {
	const stepNumber = index + 1;

	switch (segment.kind) {
		case "walk":
			return (
				<div className="segment walk-segment">
					<div className="segment-header">
						<span className="step-number">{stepNumber}</span>
						<SegmentIcon segment={segment} />
						<span className="segment-title">Walk</span>
						<span className="segment-time">~{segment.estimatedMinutes} min</span>
					</div>
					<div className="segment-body">
						<p>
							Walk {segment.distanceMeters}m from {segment.from.name} to{" "}
							<strong>{segment.to.name}</strong>
						</p>
					</div>
				</div>
			);

		case "transit": {
			const color = systemColor(segment.route.system);
			const label = systemLabel(segment.route.system);
			return (
				<div
					className="segment transit-segment"
					style={{ borderLeftColor: color }}
				>
					<div className="segment-header">
						<span className="step-number">{stepNumber}</span>
						<SegmentIcon segment={segment} />
						<span
							className="route-badge"
							style={{ backgroundColor: color, color: "#fff" }}
						>
							{segment.route.short_name ?? segment.route.route_id}
						</span>
						<span className="segment-title">
							{label}{" "}
							<span className="system-code">({segment.route.system})</span>
						</span>
						<span className="segment-time">~{segment.estimatedMinutes} min</span>
					</div>
					<div className="segment-body">
						<p>
							Board at <strong>{segment.boardStop.name}</strong>
						</p>
						{segment.intermediateStops.length > 0 && (
							<p className="intermediate-stops">
								{segment.intermediateStops.length} stop
								{segment.intermediateStops.length !== 1 ? "s" : ""}
							</p>
						)}
						<p>
							Alight at <strong>{segment.alightStop.name}</strong>
						</p>
					</div>
				</div>
			);
		}

		case "transfer":
			return (
				<div className="segment transfer-segment">
					<div className="segment-header">
						<span className="step-number">{stepNumber}</span>
						<SegmentIcon segment={segment} />
						<span className="segment-title">Transfer</span>
						<span className="segment-time">~{segment.walkMinutes} min</span>
					</div>
					<div className="segment-body">
						<p>
							Transfer at <strong>{segment.fromStop.name}</strong>
							{segment.fromStop.stop_id !== segment.toStop.stop_id
								? ` → ${segment.toStop.name}`
								: ""}
						</p>
					</div>
				</div>
			);
		default: {
			const _exhaustive: never = segment;
			return _exhaustive;
		}
	}
}

export function RouteDetails({ plan }: RouteDetailsProps) {
	return (
		<div className="route-details">
			<style jsx>{`
				.route-details {
					font-family: system-ui, -apple-system, sans-serif;
				}
				.route-summary {
					display: flex;
					gap: 16px;
					padding: 16px;
					background: var(--bg-secondary, #f3f4f6);
					border-radius: 8px;
					margin-bottom: 16px;
				}
				.summary-item {
					text-align: center;
				}
				.summary-value {
					font-size: 24px;
					font-weight: 600;
					color: var(--text-primary, #111827);
				}
				.summary-label {
					font-size: 12px;
					color: var(--text-secondary, #6b7280);
					text-transform: uppercase;
				}
				.segment {
					border-left: 3px solid var(--border-color, #e5e7eb);
					padding-left: 16px;
					margin-bottom: 16px;
				}
				.segment:last-child {
					margin-bottom: 0;
				}
				.segment-header {
					display: flex;
					align-items: center;
					gap: 8px;
					margin-bottom: 8px;
				}
				.step-number {
					width: 24px;
					height: 24px;
					border-radius: 50%;
					background: var(--bg-secondary, #f3f4f6);
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 12px;
					font-weight: 600;
				}
				.segment-icon {
					color: var(--text-secondary, #6b7280);
				}
				.segment-title {
					font-weight: 500;
				}
				.segment-time {
					margin-left: auto;
					color: var(--text-secondary, #6b7280);
					font-size: 14px;
				}
				.route-badge {
					padding: 2px 8px;
					border-radius: 4px;
					font-weight: 600;
					font-size: 14px;
				}
				.system-code {
					font-weight: 400;
					color: var(--text-secondary, #6b7280);
					font-size: 12px;
				}
				.transfer-segment {
					border-left-color: #f59e0b;
				}
				.segment-body {
					color: var(--text-secondary, #6b7280);
					font-size: 14px;
				}
				.segment-body p {
					margin: 4px 0;
				}
				.segment-body strong {
					color: var(--text-primary, #111827);
				}
				.intermediate-stops {
					font-style: italic;
				}
				.transit-segment {
					border-left-color: var(--route-color, #e31937);
				}
				.alerts-section {
					margin-top: 16px;
					padding: 12px;
					background: #fef3c7;
					border-radius: 8px;
					border: 1px solid #f59e0b;
				}
				.alerts-title {
					font-weight: 600;
					color: #92400e;
					margin-bottom: 8px;
				}
				.alert-item {
					font-size: 14px;
					color: #92400e;
					margin: 4px 0;
				}
				.limitations {
					margin-top: 16px;
					padding: 12px;
					background: var(--bg-secondary, #f3f4f6);
					border-radius: 8px;
					font-size: 12px;
					color: var(--text-secondary, #6b7280);
				}
			`}</style>

			<div className="route-summary">
				<div className="summary-item">
					<div className="summary-value">{plan.totalMinutes}</div>
					<div className="summary-label">Minutes</div>
				</div>
				<div className="summary-item">
					<div className="summary-value">{plan.totalWalkMinutes}</div>
					<div className="summary-label">Walking</div>
				</div>
				<div className="summary-item">
					<div className="summary-value">{plan.transferCount}</div>
					<div className="summary-label">Transfers</div>
				</div>
			</div>

			<div className="segments">
				{plan.segments.map((segment, i) => (
					<div key={i}>{formatSegment(segment, i)}</div>
				))}
			</div>

			{plan.alerts.length > 0 && (
				<div className="alerts-section">
					<div className="alerts-title">⚠️ Service Alerts</div>
					{plan.alerts.map((alert, i) => (
						<div key={i} className="alert-item">
							{alert.effect}: {alert.header}
						</div>
					))}
				</div>
			)}

			{plan.limitations.length > 0 && (
				<div className="limitations">
					<strong>Note:</strong> {plan.limitations[0]}
				</div>
			)}
		</div>
	);
}
