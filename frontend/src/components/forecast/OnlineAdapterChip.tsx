"use client";

import React, { useEffect, useState, useCallback } from "react";
import { forecastApi, type OnlineAdapterStatus } from "@/lib/api";

interface OnlineAdapterChipProps {
  plantId: number | string | null;
  /** If true, renders the full expanded telemetry card. If false, renders compact pill with modal/popover capability. */
  expanded?: boolean;
  /** Optional callback when status is updated */
  onStatusChange?: (status: OnlineAdapterStatus | null) => void;
  className?: string;
}

export default function OnlineAdapterChip({
  plantId,
  expanded = false,
  onStatusChange,
  className = "",
}: OnlineAdapterChipProps) {
  const [status, setStatus] = useState<OnlineAdapterStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const fetchStatus = useCallback(async (isSilent = false) => {
    if (!plantId) return;
    if (!isSilent) setLoading(true);
    try {
      const data = await forecastApi.getOnlineStatus(plantId);
      setStatus(data);
      setError(null);
      setLastRefreshedAt(new Date());
      if (onStatusChange) onStatusChange(data);
    } catch (err: unknown) {
      // If 404 or not initialized yet, adapter might be idle
      const msg = err instanceof Error ? err.message : "Adapter status unavailable";
      setError(msg);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [plantId, onStatusChange]);

  // Polling every 30s
  useEffect(() => {
    if (!plantId) return;
    fetchStatus();

    const interval = setInterval(() => {
      fetchStatus(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [plantId, fetchStatus]);

  if (!plantId) return null;

  const gamma = status?.scaling_factor ?? 1.0;
  const biasKw = status?.bias_kw ?? 0.0;
  const samples = status?.samples_observed_today ?? 0;
  const rmse = status?.recent_rmse_kw ?? 0.0;
  const statusLabel = status?.status ?? "BASELINE_OPTIMAL";

  // Visual categorization
  let mode: "optimal" | "damping" | "boosted" = "optimal";
  if (gamma < 0.95 || statusLabel === "ADAPTING_SOILING_HAZE") {
    mode = "damping";
  } else if (gamma > 1.05 || statusLabel === "ADAPTING_ABOVE_NWP") {
    mode = "boosted";
  }

  const modeConfig = {
    optimal: {
      color: "var(--field)",
      bg: "rgba(26, 58, 42, 0.08)",
      border: "rgba(26, 58, 42, 0.25)",
      badgeText: "Baseline Optimal",
      dotClass: "pulse-green",
      description: "SCADA telemetry aligns with raw LightGBM physics curve (γ ≈ 1.00).",
    },
    damping: {
      color: "var(--sun)",
      bg: "rgba(201, 133, 42, 0.12)",
      border: "rgba(201, 133, 42, 0.35)",
      badgeText: "Atmospheric Damping",
      dotClass: "pulse-amber",
      description: "Local haze, aerosol, or intra-day soiling detected. Real-time damping applied.",
    },
    boosted: {
      color: "#2b6cb0",
      bg: "rgba(43, 108, 176, 0.10)",
      border: "rgba(43, 108, 176, 0.3)",
      badgeText: "Above NWP Expectation",
      dotClass: "pulse-blue",
      description: "Exceptional clear-sky conditions or high inverter efficiency observed.",
    },
  }[mode];

  const pctDiff = ((gamma - 1.0) * 100).toFixed(1);
  const formattedPct = gamma >= 1.0 ? `+${pctDiff}%` : `${pctDiff}%`;

  // Render expanded widget view
  if (expanded) {
    return (
      <div
        className={`dash-card ${className}`}
        style={{
          borderLeft: `4px solid ${modeConfig.color}`,
          background: "var(--panel)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.85rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: modeConfig.color,
                boxShadow: `0 0 0 3px ${modeConfig.bg}`,
              }}
            />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    fontFamily: "var(--font-display), sans-serif",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Online Learning & Residual Adapter
                </span>
                <span
                  className="dash-badge"
                  style={{
                    backgroundColor: modeConfig.bg,
                    color: modeConfig.color,
                    borderColor: modeConfig.border,
                    fontWeight: 600,
                    fontSize: "0.72rem",
                  }}
                >
                  {modeConfig.badgeText}
                </span>
              </div>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "var(--dash-muted)" }}>
                {modeConfig.description}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--dash-muted)" }}>
              {lastRefreshedAt ? `Updated ${lastRefreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Polling live…"}
            </span>
            <button
              type="button"
              onClick={() => fetchStatus(false)}
              disabled={loading}
              className="dash-btn"
              style={{
                padding: "0.25rem 0.6rem",
                fontSize: "0.75rem",
                cursor: loading ? "wait" : "pointer",
              }}
              title="Force refresh adapter telemetry"
            >
              {loading ? "…" : "↻"}
            </button>
          </div>
        </div>

        {/* Real-time metrics grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "0.75rem",
            background: "rgba(0,0,0,0.02)",
            border: "1px solid var(--line)",
            borderRadius: "4px",
            padding: "0.75rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--dash-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Clearness Factor (γ)
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: modeConfig.color, display: "flex", alignItems: "baseline", gap: "0.35rem", marginTop: "0.15rem" }}>
              <span>{gamma.toFixed(3)}x</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: modeConfig.color }}>
                ({formattedPct})
              </span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--dash-muted)", marginTop: "0.2rem" }}>
              Baseline = 1.000
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--dash-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Additive Bias
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ink)", marginTop: "0.15rem" }}>
              {biasKw >= 0 ? `+${biasKw.toFixed(1)}` : biasKw.toFixed(1)}
              <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--dash-muted)", marginLeft: "0.25rem" }}>kW</span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--dash-muted)", marginTop: "0.2rem" }}>
              Tracked residual drift
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--dash-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Live Residual RMSE
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ink)", marginTop: "0.15rem" }}>
              {rmse.toFixed(1)}
              <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--dash-muted)", marginLeft: "0.25rem" }}>kW</span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--dash-muted)", marginTop: "0.2rem" }}>
              EMA window
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--dash-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Telemetry Samples
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ink)", marginTop: "0.15rem" }}>
              {samples}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--dash-muted)", marginTop: "0.2rem" }}>
              SCADA cycles today
            </div>
          </div>
        </div>

        {/* Gauge bar visualization */}
        <div style={{ marginTop: "0.85rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--dash-muted)", marginBottom: "0.25rem" }}>
            <span>0.70x (Heavy Soiling/Haze)</span>
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>1.00x (Baseline)</span>
            <span>1.30x (Peak Clear-Sky)</span>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--line)",
              borderRadius: 3,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* 1.0 center marker line */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: "var(--ink)",
                opacity: 0.4,
                zIndex: 2,
              }}
            />
            {/* Value fill */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: gamma < 1.0 ? `${Math.max(0, ((gamma - 0.7) / 0.6) * 100)}%` : "50%",
                width: `${Math.min(50, Math.abs(gamma - 1.0) / 0.6 * 100)}%`,
                backgroundColor: modeConfig.color,
                transition: "all 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Explainability footnote */}
        <div style={{ marginTop: "0.75rem", fontSize: "0.72rem", color: "var(--dash-muted)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            <strong>Two-Tier Architecture:</strong> Base LightGBM frozen · Tier-2 updates in &lt;0.1ms per SCADA reading · Horizon decay λ = {status?.decay_factor ?? 0.90}
          </span>
          {status?.last_updated && (
            <span>Last reading: {new Date(status.last_updated).toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    );
  }

  // Render Compact Chip View (for headers / toolbars)
  return (
    <div className={`online-adapter-chip-container ${className}`} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setIsDetailsOpen((prev) => !prev)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.35rem 0.75rem",
          borderRadius: "9999px",
          border: `1px solid ${modeConfig.border}`,
          background: modeConfig.bg,
          color: modeConfig.color,
          fontSize: "0.8rem",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.15s ease",
          outline: "none",
        }}
        title="Click to view real-time online adaptation telemetry"
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: modeConfig.color,
            boxShadow: `0 0 0 2px ${modeConfig.border}`,
          }}
        />
        <span>Adaptive Trim:</span>
        <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
          γ {gamma.toFixed(3)} ({formattedPct})
        </span>
        <span
          style={{
            fontSize: "0.68rem",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            opacity: 0.85,
            paddingLeft: "0.2rem",
            borderLeft: `1px solid ${modeConfig.border}`,
          }}
        >
          {modeConfig.badgeText}
        </span>
        <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>▾</span>
      </button>

      {/* Popover overlay for detailed telemetry */}
      {isDetailsOpen && (
        <>
          <div
            onClick={() => setIsDetailsOpen(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 998,
              cursor: "default",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: "360px",
              zIndex: 999,
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: "6px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
              padding: "1rem",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontWeight: 700, fontSize: "0.88rem", fontFamily: "var(--font-display), sans-serif" }}>
                Tier-2 Online Residual Adapter
              </span>
              <button
                type="button"
                onClick={() => setIsDetailsOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem", color: "var(--dash-muted)" }}
              >
                ×
              </button>
            </div>

            {error && (
              <div style={{ color: "var(--danger)", background: "var(--dash-danger-dim)", padding: "0.4rem 0.6rem", borderRadius: "4px", fontSize: "0.72rem", marginBottom: "0.5rem" }}>
                Notice: {error}
              </div>
            )}

            <p style={{ fontSize: "0.75rem", color: "var(--dash-muted)", margin: "0 0 0.75rem" }}>
              {modeConfig.description}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.78rem", marginBottom: "0.75rem" }}>
              <div style={{ padding: "0.4rem 0.6rem", background: "rgba(0,0,0,0.02)", borderRadius: "4px", border: "1px solid var(--line)" }}>
                <div style={{ color: "var(--dash-muted)", fontSize: "0.68rem" }}>Scaling Factor γ</div>
                <div style={{ fontWeight: 700, color: modeConfig.color, fontSize: "1rem" }}>{gamma.toFixed(3)}x</div>
              </div>
              <div style={{ padding: "0.4rem 0.6rem", background: "rgba(0,0,0,0.02)", borderRadius: "4px", border: "1px solid var(--line)" }}>
                <div style={{ color: "var(--dash-muted)", fontSize: "0.68rem" }}>Additive Bias</div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>{biasKw >= 0 ? `+${biasKw.toFixed(1)}` : biasKw.toFixed(1)} kW</div>
              </div>
              <div style={{ padding: "0.4rem 0.6rem", background: "rgba(0,0,0,0.02)", borderRadius: "4px", border: "1px solid var(--line)" }}>
                <div style={{ color: "var(--dash-muted)", fontSize: "0.68rem" }}>Live Error (RMSE)</div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>{rmse.toFixed(1)} kW</div>
              </div>
              <div style={{ padding: "0.4rem 0.6rem", background: "rgba(0,0,0,0.02)", borderRadius: "4px", border: "1px solid var(--line)" }}>
                <div style={{ color: "var(--dash-muted)", fontSize: "0.68rem" }}>Telemetry Samples</div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>{samples} readings</div>
              </div>
            </div>

            <div style={{ fontSize: "0.7rem", color: "var(--dash-muted)", borderTop: "1px solid var(--line)", paddingTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
              <span>Learning Rate α = {status?.alpha ?? 0.12}</span>
              <span>Decay λ = {status?.decay_factor ?? 0.90}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
