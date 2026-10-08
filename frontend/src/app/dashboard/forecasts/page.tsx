"use client";

import { useCallback, useEffect, useState } from "react";
import { forecastApi, plantsApi, type ForecastRecord, type Plant } from "@/lib/api";

export default function ForecastsPage() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<number | null>(null);
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
    if (selectedPlantId != null) loadForecasts(selectedPlantId);
  }, [selectedPlantId, loadForecasts]);

  const handleGenerate = async () => {
    if (!selectedPlantId) return;
    setGenerating(true);
    setError(null);
    try {
      const record = await forecastApi.generate(selectedPlantId);
      setForecasts((prev) => [record, ...prev]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Forecast generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const sorted = [...forecasts].sort(
    (a, b) => new Date(b.forecast_time).getTime() - new Date(a.forecast_time).getTime()
  );

  return (
    <>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 className="dash-section-title" style={{ marginBottom: "0.25rem" }}>
          Forecasts
        </h1>
        <p style={{ color: "var(--dash-muted)", fontSize: "0.88rem" }}>
          Historical and on-demand yield forecast records.
        </p>
      </div>

      {error && <div className="dash-error">⚠ {error}</div>}

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        {loadingPlants ? (
          <span style={{ color: "var(--dash-muted)", fontSize: "0.85rem" }}>
            Loading plants…
          </span>
        ) : (
          <select
            id="forecast-plant-select"
            className="dash-input"
            style={{ maxWidth: 280, padding: "0.5rem 0.75rem" }}
            value={selectedPlantId ?? ""}
            onChange={(e) => setSelectedPlantId(parseInt(e.target.value, 10))}
          >
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <button
          className="dash-btn dash-btn-primary"
          onClick={handleGenerate}
          disabled={generating || !selectedPlantId}
        >
          {generating ? "Generating…" : "▶ Generate Forecast"}
        </button>
      </div>

      {loadingFc ? (
        <div className="dash-loading">
          <div className="dash-spinner" />
          <div>Loading forecasts…</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="dash-card dash-empty">
          No forecast records yet. Click &ldquo;Generate Forecast&rdquo; to create one.
        </div>
      ) : (
        <div className="dash-card">
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Forecast Time</th>
                  <th>Predicted (kW)</th>
                  <th>Actual (kW)</th>
                  <th>Physics (kW)</th>
                  <th>ML (kW)</th>
                  <th>Lower CI</th>
                  <th>Upper CI</th>
                  <th>Model</th>
                  <th>Generated At</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.forecast_time).toLocaleString()}</td>
                    <td style={{ color: "var(--dash-accent)", fontWeight: 600 }}>
                      {r.predicted_power_kw.toFixed(2)}
                    </td>
                    <td>
                      {r.actual_power_kw != null ? (
                        <span style={{ color: "var(--dash-sun)" }}>
                          {r.actual_power_kw.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--dash-muted)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {r.physics_power_kw != null
                        ? r.physics_power_kw.toFixed(2)
                        : <span style={{ color: "var(--dash-muted)" }}>—</span>}
                    </td>
                    <td>
                      {r.ml_power_kw != null
                        ? r.ml_power_kw.toFixed(2)
                        : <span style={{ color: "var(--dash-muted)" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--dash-muted)" }}>
                      {r.confidence_lower != null ? r.confidence_lower.toFixed(2) : "—"}
                    </td>
                    <td style={{ color: "var(--dash-muted)" }}>
                      {r.confidence_upper != null ? r.confidence_upper.toFixed(2) : "—"}
                    </td>
                    <td>
                      <span className="dash-badge dash-badge-muted">{r.model_name}</span>
                    </td>
                    <td style={{ color: "var(--dash-muted)" }}>
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
  );
}
