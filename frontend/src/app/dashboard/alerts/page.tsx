"use client";

import { useCallback, useEffect, useState } from "react";
import { alertsApi, type Alert } from "@/lib/api";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await alertsApi.list(undefined, 200);
      setAlerts(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load alerts.");
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

  const filtered = alerts.filter((a) => {
    if (filter === "open") return !a.is_resolved;
    if (filter === "resolved") return a.is_resolved;
    return true;
  });

  const counts = {
    all: alerts.length,
    open: alerts.filter((a) => !a.is_resolved).length,
    resolved: alerts.filter((a) => a.is_resolved).length,
  };

  return (
    <>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 className="dash-section-title" style={{ marginBottom: "0.25rem" }}>
          Alerts
        </h1>
        <p style={{ color: "var(--dash-muted)", fontSize: "0.88rem" }}>
          Anomaly alerts and operational shortfall notifications.
        </p>
      </div>

      {error && <div className="dash-error">⚠ {error}</div>}

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.25rem",
        }}
      >
        {(["open", "all", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`dash-btn ${filter === f ? "dash-btn-primary" : "dash-btn-ghost"}`}
            style={{ fontSize: "0.82rem" }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}{" "}
            <span
              style={{
                background: "rgba(255,255,255,0.12)",
                borderRadius: 3,
                padding: "0 0.35rem",
                fontSize: "0.72rem",
              }}
            >
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="dash-loading">
          <div className="dash-spinner" />
          <div>Loading alerts…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dash-card dash-empty">
          {filter === "open" ? "No open alerts — all clear 🎉" : "No alerts in this category."}
        </div>
      ) : (
        <div className="dash-card">
          <div className="dash-alert-list">
            {filtered.map((a) => {
              const severity = a.severity as "CRITICAL" | "WARNING" | "INFO";
              return (
                <div key={a.id} className={`dash-alert-row ${severity}`}>
                  <span className={`dash-alert-badge ${severity}`}>{severity}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dash-alert-msg">{a.message}</div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--dash-muted)",
                        marginTop: "0.2rem",
                      }}
                    >
                      Plant #{a.plant_id} · {a.alert_type}
                      {a.deviation_percent != null && (
                        <> · {a.deviation_percent.toFixed(1)}% deviation</>
                      )}
                    </div>
                  </div>
                  <span className="dash-alert-time">
                    {new Date(a.timestamp).toLocaleString()}
                  </span>
                  {!a.is_resolved ? (
                    <button
                      className="dash-alert-resolve-btn"
                      onClick={() => handleResolve(a.id)}
                    >
                      Resolve
                    </button>
                  ) : (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--dash-accent)",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      ✓ Resolved
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
