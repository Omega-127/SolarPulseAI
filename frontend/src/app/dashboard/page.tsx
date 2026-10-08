"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  alertsApi,
  forecastApi,
  plantsApi,
  weatherApi,
  type Alert,
  type ForecastRecord,
  type Plant,
  type WeatherData,
} from "@/lib/api";

function ForecastChart({ records }: { records: ForecastRecord[] }) {
  if (records.length < 2) {
    return (
      <div className="dash-empty" style={{ padding: "2rem 0" }}>
        No forecast data yet — run a forecast on a plant to populate this chart.
      </div>
    );
  }

  const W = 800;
  const H = 200;
  const PAD = { top: 10, right: 16, bottom: 36, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const sorted = [...records].sort(
    (a, b) =>
      new Date(a.forecast_time).getTime() - new Date(b.forecast_time).getTime()
  );

  const values = sorted.map((r) => r.predicted_power_kw);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(...values, 1);

  const xScale = (i: number) => PAD.left + (i / (sorted.length - 1)) * innerW;
  const yScale = (v: number) =>
    PAD.top + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const predictedPath = sorted
    .map((r, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(r.predicted_power_kw)}`)
    .join(" ");

  const actualPath = sorted
    .reduce<string[]>((acc, r, i) => {
      if (r.actual_power_kw != null) {
        acc.push(`${acc.length === 0 ? "M" : "L"}${xScale(i)},${yScale(r.actual_power_kw)}`);
      }
      return acc;
    }, [] as string[])
    .join(" ");

  const firstX = xScale(0);
  const lastX = xScale(sorted.length - 1);
  const baseY = yScale(minV);
  const areaPath = `${predictedPath} L${lastX},${baseY} L${firstX},${baseY} Z`;

  const step = Math.max(1, Math.floor(sorted.length / 6));
  const xLabels = sorted
    .filter((_, i) => i % step === 0 || i === sorted.length - 1)
    .map((r) => {
      const idx = sorted.indexOf(r);
      const d = new Date(r.forecast_time);
      const label = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
      return { x: xScale(idx), label };
    });

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = minV + ((maxV - minV) * i) / yTicks;
    return { y: yScale(v), label: v.toFixed(0) };
  });

  return (
    <div className="dash-chart-wrap">
      <svg
        className="dash-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--field)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--field)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yLabels.map(({ y, label }) => (
          <g key={label}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="var(--line)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted)"
            >
              {label}
            </text>
          </g>
        ))}

        {xLabels.map(({ x, label }) => (
          <text
            key={label + x}
            x={x}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fill="var(--muted)"
          >
            {label}
          </text>
        ))}

        <line
          x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom}
          stroke="var(--line)" strokeWidth="1"
        />
        <line
          x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom}
          stroke="var(--line)" strokeWidth="1"
        />

        <path d={areaPath} fill="url(#areaGrad)" />
        <path
          d={predictedPath}
          fill="none"
          stroke="var(--field)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {actualPath && (
          <path
            d={actualPath}
            fill="none"
            stroke="var(--sun)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      <div className="dash-legend">
        <LegendDot color="var(--field)" label="Predicted (kW)" />
        <LegendDot color="var(--sun)" label="Actual (kW)" dashed />
      </div>
    </div>
  );
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="dash-legend-item">
      <svg width="20" height="10">
        <line
          x1="0"
          y1="5"
          x2="20"
          y2="5"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "4 3" : "none"}
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}

function WeatherWidget({ weather }: { weather: WeatherData | null }) {
  if (!weather) {
    return (
      <div className="dash-card">
        <div className="dash-card-title">Current weather</div>
        <div className="dash-empty" style={{ padding: "1.5rem 0" }}>
          Loading weather…
        </div>
      </div>
    );
  }

  const c = weather.current;
  const isMock = weather.source === "mock";

  return (
    <div className="dash-card">
      <div className="dash-card-title">
        Current weather
        {isMock && <span className="dash-badge dash-badge-muted">mock</span>}
      </div>

      <div style={{ marginBottom: "0.85rem" }}>
        <div className="dash-weather-temp">{c.temperature_c.toFixed(1)}°C</div>
        <div className="dash-weather-meta">
          {c.condition} · {weather.location_name}
        </div>
      </div>

      <div className="dash-stat-row">
        <span className="dash-stat-label">Irradiance</span>
        <span className="dash-stat-value" style={{ color: "var(--sun)" }}>
          {c.irradiance_w_m2.toFixed(0)} W/m²
        </span>
      </div>
      <div className="dash-stat-row">
        <span className="dash-stat-label">Humidity</span>
        <span className="dash-stat-value">{c.humidity_pct.toFixed(0)}%</span>
      </div>
      <div className="dash-stat-row">
        <span className="dash-stat-label">Cloud cover</span>
        <span className="dash-stat-value">{c.cloud_cover_pct.toFixed(0)}%</span>
      </div>
      <div className="dash-stat-row">
        <span className="dash-stat-label">Wind</span>
        <span className="dash-stat-value">{c.wind_speed_kph.toFixed(1)} km/h</span>
      </div>
      <div className="dash-stat-row">
        <span className="dash-stat-label">UV index</span>
        <span
          className="dash-stat-value"
          style={{ color: c.uv_index >= 6 ? "var(--sun)" : undefined }}
        >
          {c.uv_index.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function AlertRow({
  alert,
  onResolve,
}: {
  alert: Alert;
  onResolve: (id: number) => void;
}) {
  const severity = alert.severity as "CRITICAL" | "WARNING" | "INFO";
  const time = new Date(alert.timestamp).toLocaleString();

  return (
    <div className={`dash-alert-row ${severity}`}>
      <span className={`dash-alert-badge ${severity}`}>{severity}</span>
      <span className="dash-alert-msg">{alert.message}</span>
      <span className="dash-alert-time">{time}</span>
      {!alert.is_resolved && (
        <div className="dash-alert-actions">
          <button
            className="dash-alert-resolve-btn"
            onClick={() => onResolve(alert.id)}
          >
            Resolve
          </button>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRecord[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, a] = await Promise.all([plantsApi.list(), alertsApi.list(undefined, 20)]);
      setPlants(p);
      setAlerts(a);

      if (p.length > 0) {
        const [fc, wx] = await Promise.all([
          forecastApi.list(p[0].id, 48),
          weatherApi.current(p[0].id).catch(() => null),
        ]);
        setForecasts(fc);
        setWeather(wx);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load dashboard data.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (id: number) => {
    try {
      await alertsApi.resolve(id);
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_resolved: true } : a))
      );
    } catch {
      // ignore
    }
  };

  const activePlants = plants.filter((p) => p.is_active).length;
  const totalCapacity = plants.reduce((s, p) => s + p.capacity_kw, 0);
  const openAlerts = alerts.filter((a) => !a.is_resolved);
  const criticalAlerts = openAlerts.filter((a) => a.severity === "CRITICAL").length;

  return (
    <>
      <div className="dash-page-header">
        <p className="dash-eyebrow">Fleet status</p>
        <h1 className="dash-section-title">Overview</h1>
        <p className="dash-page-sub">
          Live status across registered solar plants.
        </p>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {loading ? (
        <div className="dash-loading">
          <div className="dash-spinner" />
          <div>Loading dashboard…</div>
        </div>
      ) : (
        <>
          <div className="dash-kpi-grid">
            <div className="dash-kpi">
              <div className="dash-kpi-label">Active plants</div>
              <div className="dash-kpi-value dash-kpi-accent">
                {activePlants}
                <span className="dash-kpi-unit">/ {plants.length}</span>
              </div>
              <div className="dash-kpi-sub">registered sites</div>
            </div>

            <div className="dash-kpi">
              <div className="dash-kpi-label">Total capacity</div>
              <div className="dash-kpi-value dash-kpi-sun">
                {totalCapacity.toFixed(1)}
                <span className="dash-kpi-unit">kW</span>
              </div>
              <div className="dash-kpi-sub">across all plants</div>
            </div>

            <div className="dash-kpi">
              <div className="dash-kpi-label">Open alerts</div>
              <div className={`dash-kpi-value ${criticalAlerts > 0 ? "dash-kpi-danger" : "dash-kpi-warning"}`}>
                {openAlerts.length}
              </div>
              <div className="dash-kpi-sub">{criticalAlerts} critical</div>
            </div>

            <div className="dash-kpi">
              <div className="dash-kpi-label">Forecast records</div>
              <div className="dash-kpi-value">{forecasts.length}</div>
              <div className="dash-kpi-sub">
                {plants.length > 0 ? `for ${plants[0].name}` : "—"}
              </div>
            </div>
          </div>

          <div className="dash-split">
            <div className="dash-card">
              <div className="dash-card-title">
                <span>
                  Yield forecast
                  {plants.length > 0 && (
                    <span className="dash-card-title-meta" style={{ marginLeft: "0.5rem" }}>
                      {plants[0].name}
                    </span>
                  )}
                </span>
                <Link href="/dashboard/forecasts" className="dash-btn dash-btn-ghost dash-btn-sm">
                  Probabilistic view
                </Link>
              </div>
              <ForecastChart records={forecasts} />
            </div>

            <WeatherWidget weather={weather} />
          </div>

          <div className="dash-card" style={{ marginBottom: "1.5rem" }}>
            <div className="dash-card-title">Recent alerts</div>
            {openAlerts.length === 0 ? (
              <div className="dash-empty" style={{ padding: "1.5rem 0" }}>
                No open alerts.
              </div>
            ) : (
              <div className="dash-alert-list">
                {openAlerts.slice(0, 6).map((a) => (
                  <AlertRow key={a.id} alert={a} onResolve={handleResolve} />
                ))}
              </div>
            )}
            {openAlerts.length > 6 && (
              <div style={{ marginTop: "0.85rem" }}>
                <Link href="/dashboard/alerts" className="dash-btn dash-btn-ghost dash-btn-sm">
                  View all {openAlerts.length} alerts
                </Link>
              </div>
            )}
          </div>

          <div className="dash-page-header-row" style={{ marginBottom: "1rem" }}>
            <h2 className="dash-section-title" style={{ margin: 0, fontSize: "1.25rem" }}>
              Your plants
            </h2>
            <Link href="/dashboard/plants/new" className="dash-btn dash-btn-primary">
              Add plant
            </Link>
          </div>

          {plants.length === 0 ? (
            <div className="dash-card dash-empty">
              <p>No plants registered yet.</p>
              <Link
                href="/dashboard/plants/new"
                className="dash-btn dash-btn-primary"
                style={{ marginTop: "1rem" }}
              >
                Register your first plant
              </Link>
            </div>
          ) : (
            <div className="dash-plant-grid">
              {plants.map((plant) => (
                <Link
                  key={plant.id}
                  href={`/dashboard/plants/${plant.id}`}
                  className="dash-plant-card"
                >
                  <div className="dash-plant-name">
                    <span
                      className={`dash-status-dot ${plant.is_active ? "dash-status-active" : "dash-status-inactive"}`}
                    />
                    {plant.name}
                  </div>
                  <div className="dash-plant-loc">
                    {plant.location ??
                      `${plant.latitude.toFixed(3)}, ${plant.longitude.toFixed(3)}`}
                  </div>
                  <div className="dash-plant-stats">
                    <div>
                      <div className="dash-plant-stat-label">Capacity</div>
                      <div className="dash-plant-stat-value">{plant.capacity_kw} kW</div>
                    </div>
                    <div>
                      <div className="dash-plant-stat-label">Inverter</div>
                      <div className="dash-plant-stat-value">
                        {plant.inverter_capacity_kw} kW
                      </div>
                    </div>
                    {plant.module_count && (
                      <div>
                        <div className="dash-plant-stat-label">Modules</div>
                        <div className="dash-plant-stat-value">{plant.module_count}</div>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
