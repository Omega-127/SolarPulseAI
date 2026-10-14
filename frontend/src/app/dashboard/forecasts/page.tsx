"use client";

import { useCallback, useEffect, useState } from "react";
import {
  forecastApi,
  plantsApi,
  type ForecastRecord,
  type Plant,
  type ProbabilisticForecastResponse,
} from "@/lib/api";
import ProbabilisticBandChart from "@/components/forecast/ProbabilisticBandChart";
import ForecastActualChart from "@/components/forecast/ForecastActualChart";
import OnlineAdapterChip from "@/components/forecast/OnlineAdapterChip";

export default function ForecastsPage() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"probabilistic" | "adaptive" | "history">("probabilistic");

  const [horizonMinutes, setHorizonMinutes] = useState<number>(240);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(15);
  const [probData, setProbData] = useState<ProbabilisticForecastResponse | null>(null);
  const [loadingProb, setLoadingProb] = useState(false);
  const [filterCriticalOnly, setFilterCriticalOnly] = useState(false);

  const [forecasts, setForecasts] = useState<ForecastRecord[]>([]);
  const [loadingPlants, setLoadingPlants] = useState(true);
  const [loadingFc, setLoadingFc] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await plantsApi.list();
        setPlants(data);
        if (data.length > 0) setSelectedPlantId(data[0].id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load plants.");
      } finally {
        setLoadingPlants(false);
      }
    })();
  }, []);

  const loadProbabilistic = useCallback(
    async (plantId: number, horizon: number, interval: number) => {
      setLoadingProb(true);
      setError(null);
      try {
        const data = await forecastApi.getProbabilistic(plantId, horizon, interval);
        setProbData(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load probabilistic forecast.");
      } finally {
        setLoadingProb(false);
      }
    },
    []
  );

  const loadForecasts = useCallback(async (plantId: number) => {
    setLoadingFc(true);
    setError(null);
    try {
      const data = await forecastApi.list(plantId, 100);
      setForecasts(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load forecasts.");
    } finally {
      setLoadingFc(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlantId != null) {
      if (activeTab === "probabilistic") {
        loadProbabilistic(selectedPlantId, horizonMinutes, intervalMinutes);
      } else {
        loadForecasts(selectedPlantId);
      }
    }
  }, [selectedPlantId, activeTab, horizonMinutes, intervalMinutes, loadProbabilistic, loadForecasts]);

  const handleGenerate = async () => {
    if (!selectedPlantId) return;
    setGenerating(true);
    setError(null);
    try {
      const record = await forecastApi.generate(selectedPlantId);
      setForecasts((prev) => [record, ...prev]);
      if (activeTab === "probabilistic") {
        loadProbabilistic(selectedPlantId, horizonMinutes, intervalMinutes);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Forecast generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const selectedPlant = plants.find((p) => p.id === selectedPlantId);

  const sortedForecasts = [...forecasts].sort(
    (a, b) => new Date(b.forecast_time).getTime() - new Date(a.forecast_time).getTime()
  );

  const displayedPoints =
    probData?.points.filter((pt) =>
      filterCriticalOnly
        ? pt.ramp_risk_level === "high" || pt.ramp_risk_level === "critical"
        : true
    ) || [];

  const getRiskColor = (level?: string) => {
    switch (level) {
      case "critical":
        return "var(--danger)";
      case "high":
        return "var(--sun)";
      case "medium":
        return "var(--field)";
      default:
        return "var(--dash-muted)";
    }
  };

  return (
    <>
      <div className="dash-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <p className="dash-eyebrow">Forecasting</p>
          <h1 className="dash-section-title">Forecasts</h1>
          <p className="dash-page-sub">
            Quantile bands (P10 / P50 / P90), Tier-2 online adaptation, and historical telemetry.
          </p>
        </div>
        {selectedPlantId && (
          <div style={{ marginTop: "0.25rem" }}>
            <OnlineAdapterChip plantId={selectedPlantId} />
          </div>
        )}
      </div>

      {error && <div className="dash-error">{error}</div>}

      <div className="dash-tabs">
        <button
          type="button"
          className={`dash-tab${activeTab === "probabilistic" ? " active" : ""}`}
          onClick={() => setActiveTab("probabilistic")}
        >
          Probabilistic & ramp
        </button>
        <button
          type="button"
          className={`dash-tab${activeTab === "adaptive" ? " active" : ""}`}
          onClick={() => setActiveTab("adaptive")}
        >
          Adaptive clearness & drift
        </button>
        <button
          type="button"
          className={`dash-tab${activeTab === "history" ? " active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Point history
        </button>
      </div>

      <div className="dash-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <label htmlFor="forecast-plant-select">Plant</label>
          {loadingPlants ? (
            <span style={{ color: "var(--dash-muted)", fontSize: "0.85rem" }}>Loading…</span>
          ) : (
            <select
              id="forecast-plant-select"
              className="dash-input"
              style={{ minWidth: 180, width: "auto", padding: "0.45rem 0.65rem" }}
              value={selectedPlantId ?? ""}
              onChange={(e) => setSelectedPlantId(parseInt(e.target.value, 10))}
            >
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.capacity_kw} kW)
                </option>
              ))}
            </select>
          )}
        </div>

        {activeTab === "probabilistic" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label htmlFor="forecast-horizon-select">Horizon</label>
              <select
                id="forecast-horizon-select"
                className="dash-input"
                style={{ width: "auto", padding: "0.45rem 0.65rem" }}
                value={horizonMinutes}
                onChange={(e) => setHorizonMinutes(parseInt(e.target.value, 10))}
              >
                <option value={120}>2 hours</option>
                <option value={240}>4 hours</option>
                <option value={480}>8 hours</option>
                <option value={720}>12 hours</option>
                <option value={1440}>24 hours</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label htmlFor="forecast-step-select">Interval</label>
              <select
                id="forecast-step-select"
                className="dash-input"
                style={{ width: "auto", padding: "0.45rem 0.65rem" }}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(parseInt(e.target.value, 10))}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
          </>
        )}

        <div className="dash-toolbar-spacer" style={{ display: "flex", gap: "0.5rem" }}>
          {activeTab === "probabilistic" ? (
            <button
              className="dash-btn dash-btn-primary"
              onClick={() =>
                selectedPlantId &&
                loadProbabilistic(selectedPlantId, horizonMinutes, intervalMinutes)
              }
              disabled={loadingProb || !selectedPlantId}
            >
              {loadingProb ? "Refreshing…" : "Refresh"}
            </button>
          ) : (
            <button
              className="dash-btn dash-btn-primary"
              onClick={handleGenerate}
              disabled={generating || !selectedPlantId}
            >
              {generating ? "Generating…" : "Generate forecast"}
            </button>
          )}
        </div>
      </div>

      {activeTab === "probabilistic" && (
        <>
          {loadingProb ? (
            <div className="dash-loading">
              <div className="dash-spinner" />
              <div>Calculating quantiles and ramp risk…</div>
            </div>
          ) : !probData ? (
            <div className="dash-card dash-empty">
              Select a plant to compute probabilistic forecasts.
            </div>
          ) : (
            <>
              <div className="dash-kpi-grid" style={{ marginBottom: "1.25rem" }}>
                <div className="dash-kpi">
                  <div className="dash-kpi-label">Ramp risk</div>
                  <div
                    className="dash-kpi-value"
                    style={{
                      color: getRiskColor(probData.summary.highest_risk_level),
                      fontSize: "1.35rem",
                      textTransform: "uppercase",
                    }}
                  >
                    {probData.summary.highest_risk_level}
                  </div>
                  <div className="dash-kpi-sub">
                    Score {probData.summary.ramp_risk_score}/100 ·{" "}
                    {probData.summary.critical_risk_event_count} critical,{" "}
                    {probData.summary.high_risk_event_count} high
                  </div>
                </div>

                <div className="dash-kpi">
                  <div className="dash-kpi-label">Peak ramp</div>
                  <div className="dash-kpi-value" style={{ fontSize: "1.45rem" }}>
                    {probData.summary.max_ramp_rate_kw_per_min.toFixed(2)}
                    <span className="dash-kpi-unit">kW/min</span>
                  </div>
                  <div className="dash-kpi-sub">
                    Drop −{probData.summary.max_ramp_down_kw_per_min.toFixed(1)} · Rise +
                    {probData.summary.max_ramp_up_kw_per_min.toFixed(1)}
                  </div>
                </div>

                <div className="dash-kpi">
                  <div className="dash-kpi-label">Mean uncertainty</div>
                  <div className="dash-kpi-value dash-kpi-sun" style={{ fontSize: "1.45rem" }}>
                    {probData.summary.avg_uncertainty_band_kw.toFixed(1)}
                    <span className="dash-kpi-unit">kW</span>
                  </div>
                  <div className="dash-kpi-sub">P10–P90 spread</div>
                </div>

                <div className="dash-kpi">
                  <div className="dash-kpi-label">BESS reserve</div>
                  <div className="dash-kpi-value dash-kpi-accent" style={{ fontSize: "1.45rem" }}>
                    {probData.summary.recommended_bess_capacity_kw.toFixed(1)}
                    <span className="dash-kpi-unit">kW</span>
                  </div>
                  <div className="dash-kpi-sub">Suggested buffer</div>
                </div>
              </div>

              <div
                className="dash-advisory"
                style={{
                  borderLeftColor: getRiskColor(probData.summary.highest_risk_level),
                }}
              >
                <div className="dash-advisory-title">Dispatch advisory</div>
                <div className="dash-advisory-body">
                  {probData.summary.primary_action_advisory}
                </div>
              </div>

              <div className="dash-card" style={{ marginBottom: "1.5rem" }}>
                <div className="dash-card-title">
                  <span>
                    Uncertainty ribbon
                    <span
                      className="dash-page-sub"
                      style={{
                        display: "block",
                        marginTop: "0.25rem",
                        textTransform: "none",
                        letterSpacing: 0,
                        fontWeight: 400,
                        fontSize: "0.82rem",
                      }}
                    >
                      Hover an interval for P10 / P50 / P90 and ramp detail.
                    </span>
                  </span>
                  <span className="dash-badge dash-badge-muted">{probData.model_name}</span>
                </div>
                <ProbabilisticBandChart
                  points={probData.points}
                  capacityKw={selectedPlant?.capacity_kw || 1000}
                />
              </div>

              <div className="dash-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "1rem",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ maxWidth: "28rem" }}>
                    <h2
                      style={{
                        fontFamily: "var(--font-display), sans-serif",
                        fontSize: "1.05rem",
                        fontWeight: 700,
                        margin: 0,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Interval schedule
                    </h2>
                    <p className="dash-page-sub" style={{ marginTop: "0.25rem" }}>
                      Ramp intervals with storage recommendations.
                    </p>
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      fontSize: "0.82rem",
                      cursor: "pointer",
                      color: filterCriticalOnly ? "var(--field)" : "var(--dash-muted)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterCriticalOnly}
                      onChange={(e) => setFilterCriticalOnly(e.target.checked)}
                    />
                    High & critical only (
                    {probData.summary.critical_risk_event_count +
                      probData.summary.high_risk_event_count}
                    )
                  </label>
                </div>

                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>P50</th>
                        <th>P10</th>
                        <th>P90</th>
                        <th>± Band</th>
                        <th>Ramp</th>
                        <th>Risk</th>
                        <th>BESS</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedPoints.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            style={{
                              textAlign: "center",
                              color: "var(--dash-muted)",
                              padding: "2rem",
                            }}
                          >
                            No high or critical ramp risks in this window.
                          </td>
                        </tr>
                      ) : (
                        displayedPoints.map((pt, idx) => (
                          <tr key={`pt-${idx}`}>
                            <td className="nowrap">
                              {new Date(pt.forecast_time).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="nowrap" style={{ color: "var(--field)", fontWeight: 600 }}>
                              {pt.p50_kw.toFixed(1)}
                            </td>
                            <td className="nowrap">{pt.p10_kw.toFixed(1)}</td>
                            <td className="nowrap" style={{ color: "var(--sun)" }}>
                              {pt.p90_kw.toFixed(1)}
                            </td>
                            <td className="nowrap">±{(pt.uncertainty_band_kw / 2).toFixed(1)}</td>
                            <td
                              className="nowrap"
                              style={{
                                color:
                                  pt.ramp_rate_kw_per_min < 0
                                    ? "var(--danger)"
                                    : pt.ramp_rate_kw_per_min > 0
                                      ? "var(--field)"
                                      : "var(--dash-muted)",
                                fontWeight: 500,
                              }}
                            >
                              {pt.ramp_rate_kw_per_min > 0 ? "+" : ""}
                              {pt.ramp_rate_kw_per_min.toFixed(2)}
                            </td>
                            <td className="nowrap">
                              <span
                                className="dash-badge"
                                style={{
                                  background: `color-mix(in srgb, ${getRiskColor(pt.ramp_risk_level)} 12%, transparent)`,
                                  color: getRiskColor(pt.ramp_risk_level),
                                }}
                              >
                                {pt.ramp_risk_level}
                              </span>
                            </td>
                            <td className="nowrap" style={{ color: "var(--sun)", fontWeight: 600 }}>
                              {pt.bess_reserve_recommendation_kw.toFixed(1)}
                            </td>
                            <td style={{ fontSize: "0.8rem", color: "var(--dash-muted)" }}>
                              {pt.reserve_action}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === "adaptive" && (
        <>
          {/* Expanded Online Learning & Residual Adapter Status Widget */}
          <div style={{ marginBottom: "1.5rem" }}>
            <OnlineAdapterChip plantId={selectedPlantId} expanded />
          </div>

          {/* Base vs Corrected vs Actual Forecast Overlay Chart */}
          <div className="dash-card" style={{ marginBottom: "1.5rem" }}>
            <div className="dash-card-title">
              <span>
                Adaptive Clearness & Drift Overlay
                <span
                  className="dash-page-sub"
                  style={{
                    display: "block",
                    marginTop: "0.25rem",
                    textTransform: "none",
                    letterSpacing: 0,
                    fontWeight: 400,
                    fontSize: "0.82rem",
                  }}
                >
                  Comparing Frozen Base LightGBM (dashed), Real-time Adapted Forecast (solid green), and Actual SCADA (amber).
                </span>
              </span>
              <span className="dash-badge dash-badge-accent">Two-Tier Hybrid</span>
            </div>

            {loadingFc ? (
              <div className="dash-loading" style={{ padding: "3rem 1rem" }}>
                <div className="dash-spinner" />
                <div>Loading adaptive telemetry...</div>
              </div>
            ) : sortedForecasts.length === 0 ? (
              <div className="dash-empty" style={{ padding: "2.5rem 1rem", textAlign: "center" }}>
                No forecast telemetry recorded for this plant yet. Click &quot;Generate forecast&quot; to initialize.
              </div>
            ) : (
              <ForecastActualChart
                records={sortedForecasts}
                capacityKw={selectedPlant?.capacity_kw}
                height={300}
                showControls
              />
            )}
          </div>

          {/* Telemetry Residual Breakdown Table */}
          <div className="dash-card" style={{ padding: 0 }}>
            <div style={{ padding: "1.1rem 1.25rem 0.75rem", borderBottom: "1px solid var(--line)" }}>
              <h2
                style={{
                  fontFamily: "var(--font-display), sans-serif",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                Real-Time Residual Calibration Log
              </h2>
              <p className="dash-page-sub" style={{ marginTop: "0.25rem" }}>
                Step-by-step transparency into Tier-1 LightGBM predictions vs Tier-2 Residual Adapter corrections.
              </p>
            </div>

            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Base LightGBM</th>
                    <th>Real-time Trim (Δ)</th>
                    <th>Online Adapted</th>
                    <th>Actual SCADA</th>
                    <th>Tracking Error</th>
                    <th>Model State</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedForecasts.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", color: "var(--dash-muted)", padding: "2rem" }}>
                        No calibration log points recorded.
                      </td>
                    </tr>
                  ) : (
                    sortedForecasts.map((r) => {
                      const base = r.ml_power_kw ?? r.predicted_power_kw;
                      const adapted = r.predicted_power_kw;
                      const delta = adapted - base;
                      const deltaPct = base > 0 ? (delta / base) * 100 : 0;
                      const errorKw = r.actual_power_kw != null ? r.actual_power_kw - adapted : null;

                      return (
                        <tr key={`adapt-row-${r.id}`}>
                          <td className="nowrap">{new Date(r.forecast_time).toLocaleString()}</td>
                          <td className="nowrap" style={{ color: "#4a5568", fontFamily: "monospace" }}>
                            {base.toFixed(2)} kW
                          </td>
                          <td
                            className="nowrap"
                            style={{
                              color: delta < -0.05 ? "var(--sun)" : delta > 0.05 ? "var(--field)" : "var(--dash-muted)",
                              fontWeight: 600,
                              fontFamily: "monospace",
                            }}
                          >
                            {delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)} kW{" "}
                            <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                              ({deltaPct >= 0 ? `+${deltaPct.toFixed(1)}` : deltaPct.toFixed(1)}%)
                            </span>
                          </td>
                          <td className="nowrap" style={{ color: "var(--field)", fontWeight: 700, fontFamily: "monospace" }}>
                            {adapted.toFixed(2)} kW
                          </td>
                          <td className="nowrap" style={{ fontFamily: "monospace" }}>
                            {r.actual_power_kw != null ? (
                              <span style={{ color: "var(--sun)", fontWeight: 600 }}>
                                {r.actual_power_kw.toFixed(2)} kW
                              </span>
                            ) : (
                              <span style={{ color: "var(--dash-muted)" }}>—</span>
                            )}
                          </td>
                          <td className="nowrap" style={{ fontFamily: "monospace" }}>
                            {errorKw != null ? (
                              <span style={{ color: Math.abs(errorKw) > 50 ? "var(--danger)" : "var(--dash-muted)" }}>
                                {errorKw >= 0 ? `+${errorKw.toFixed(1)}` : errorKw.toFixed(1)} kW
                              </span>
                            ) : (
                              <span style={{ color: "var(--dash-muted)" }}>—</span>
                            )}
                          </td>
                          <td>
                            <span className="dash-badge dash-badge-muted">
                              {r.model_name}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === "history" && (
        <>
          {loadingFc ? (
            <div className="dash-loading">
              <div className="dash-spinner" />
              <div>Loading forecasts…</div>
            </div>
          ) : sortedForecasts.length === 0 ? (
            <div className="dash-card dash-empty">
              No point forecasts yet. Generate one to populate history.
            </div>
          ) : (
            <div className="dash-card" style={{ padding: 0 }}>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Forecast time</th>
                      <th>Predicted</th>
                      <th>Actual</th>
                      <th>Physics</th>
                      <th>ML</th>
                      <th>Lower</th>
                      <th>Upper</th>
                      <th>Model</th>
                      <th>Generated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedForecasts.map((r) => (
                      <tr key={r.id}>
                        <td className="nowrap">{new Date(r.forecast_time).toLocaleString()}</td>
                        <td className="nowrap" style={{ color: "var(--field)", fontWeight: 600 }}>
                          {r.predicted_power_kw.toFixed(2)}
                        </td>
                        <td className="nowrap">
                          {r.actual_power_kw != null ? (
                            <span style={{ color: "var(--sun)" }}>
                              {r.actual_power_kw.toFixed(2)}
                            </span>
                          ) : (
                            <span style={{ color: "var(--dash-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="nowrap">
                          {r.physics_power_kw != null ? (
                            r.physics_power_kw.toFixed(2)
                          ) : (
                            <span style={{ color: "var(--dash-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="nowrap">
                          {r.ml_power_kw != null ? (
                            r.ml_power_kw.toFixed(2)
                          ) : (
                            <span style={{ color: "var(--dash-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="nowrap">
                          {r.confidence_lower != null ? r.confidence_lower.toFixed(2) : "—"}
                        </td>
                        <td className="nowrap" style={{ color: "var(--sun)" }}>
                          {r.confidence_upper != null ? r.confidence_upper.toFixed(2) : "—"}
                        </td>
                        <td>
                          <span className="dash-badge dash-badge-muted">{r.model_name}</span>
                        </td>
                        <td className="nowrap" style={{ color: "var(--dash-muted)" }}>
                          {new Date(r.generated_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
