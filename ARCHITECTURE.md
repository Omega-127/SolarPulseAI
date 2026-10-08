# SolarPulse AI — Architecture Document

> **Scope:** End-to-end system design — data flow, component responsibilities, complete monorepo directory structure, and per-module file breakdowns for every layer of the stack.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Flow Architecture](#2-data-flow-architecture)
3. [Full Directory Structure](#3-full-directory-structure)
4. [Module Breakdowns](#4-module-breakdowns)
   - 4.1 [Backend — FastAPI](#41-backend--fastapi)
   - 4.2 [ML & Physics Pipeline](#42-ml--physics-pipeline)
   - 4.3 [Frontend — Next.js](#43-frontend--nextjs)
   - 4.4 [Database Layer](#44-database-layer)
   - 4.5 [Auth & RBAC](#45-auth--rbac)
   - 4.6 [Infrastructure](#46-infrastructure)
5. [Inter-Service Communication](#5-inter-service-communication)
6. [Security Architecture](#6-security-architecture)
7. [Deployment Architecture](#7-deployment-architecture)

---

## 1. System Overview

SolarPulse AI is a **decoupled, microservice-ready monorepo** structured into three primary domains:

| Domain | Stack | Responsibility |
|---|---|---|
| **Backend API** | FastAPI, Python 3.11+ | REST & WebSocket endpoints, background workers, model serving, anomaly engine |
| **ML & Physics** | pvlib, LightGBM, Pandas, NumPy | Feature engineering, model training/evaluation, operational post-processing |
| **Frontend Dashboard** | Next.js 15+, TypeScript, Tailwind CSS, shadcn/ui | Real-time operational dashboard, authentication UI, advanced analytics view |

Supporting infrastructure uses **PostgreSQL + TimescaleDB** for all time-series and relational storage, **OAuth2 + JWT** for authentication, and **Docker Compose** for local and staging environments.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               CLIENT LAYER                                       │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │                    Next.js 15 · TypeScript · App Router                   │   │
│  │   shadcn/ui · Tailwind CSS · Recharts · Chart.js · NextAuth.js            │   │
│  └───────────────────────────────┬───────────────────────────────────────────┘   │
└──────────────────────────────────│───────────────────────────────────────────────┘
                                   │  HTTPS REST  /  wss:// WebSocket
┌──────────────────────────────────▼───────────────────────────────────────────────┐
│                              API GATEWAY LAYER                                   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐    │
│  │                  FastAPI (Python 3.11+) · Uvicorn · ASGI                 │    │
│  │          JWT Middleware · RBAC Dependencies · OpenAPI / Swagger          │    │
│  └─────┬────────────────────────┬───────────────────────┬────────────────────┘   │
│        │                        │                       │                        │
│  ┌─────▼──────┐         ┌───────▼───────┐       ┌───────▼────────┐              │
│  │ Forecasting│         │  Operational  │       │    Anomaly     │              │
│  │  Router    │         │    Router     │       │    Router      │              │
│  └─────┬──────┘         └───────┬───────┘       └───────┬────────┘              │
│        │                        │                       │                        │
│  ┌─────▼──────┐         ┌───────▼───────┐       ┌───────▼────────┐              │
│  │ Forecast   │         │  Clipping &   │       │  Alert Engine  │              │
│  │ Service    │         │  Soiling Svc  │       │  + WebSocket   │              │
│  └─────┬──────┘         └───────────────┘       └────────────────┘              │
│        │                                                                         │
│  ┌─────▼──────────────────────────────────────────────────────────────────────┐  │
│  │                    Background Workers (asyncio / ARQ)                       │  │
│  │         pvlib Physics Worker          LightGBM Inference Worker             │  │
│  └─────┬──────────────────────────────────────────────────────────────────────┘  │
└────────│─────────────────────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────────────────────────┐
│                           DATA PERSISTENCE LAYER                                  │
│                                                                                   │
│    PostgreSQL 15 + TimescaleDB                                                    │
│  ┌───────────────┐  ┌──────────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ scada_readings│  │  forecasts       │  │ anomaly_alerts│  │  users/plants  │  │
│  │ (hypertable) │  │  (hypertable)    │  │               │  │                │  │
│  └───────────────┘  └──────────────────┘  └───────────────┘  └────────────────┘  │
└──────────┬────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────────────────────────────────────┐
│                              INGESTION LAYER                                       │
│                                                                                    │
│    NWP / Weather API Connectors          SCADA Telemetry Adapters                  │
│  (Open-Meteo · ECMWF · NREL)           (Modbus · OPC-UA · CSV import)             │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow Architecture

```
Step 1 — INGESTION
  Weather APIs (NWP)  ──┐
  SCADA Telemetry     ──┴──► PostgreSQL / TimescaleDB (raw_scada, weather_raw)

Step 2 — PHYSICS & ML PROCESSING  (FastAPI Background Worker)
  TimescaleDB ──► pvlib feature extraction
    • Solar zenith / azimuth
    • Air mass
    • Clear-sky irradiance (Ineichen)
    • Plane-of-array irradiance (POA)
    • Cell temperature (Faiman model)
  pvlib features + weather features ──► LightGBM model inference
    • Gross DC generation estimate (kW)

Step 3 — OPERATIONAL POST-PROCESSING
  Gross DC estimate
    ──► Inverter Clipping Module  (cap at AC export limit)
    ──► Dynamic Soiling Estimator  (loss % from precipitation proxy)
    ──► Deliverable AC Forecast (kW / MW)  ──► stored in forecasts hypertable

Step 4 — ANOMALY ENGINE  (real-time, per SCADA heartbeat)
  Deliverable Forecast ──┐
  Live SCADA Power     ──┴──► Δ = (Forecast − Actual) / Forecast × 100
  If |Δ| > threshold and persists N steps ──► INSERT anomaly_alerts
  Alert ──► WebSocket broadcast to connected dashboard clients

Step 5 — PRESENTATION
  REST GET /forecast/{plant_id}    ──► Recharts time-series chart
  REST GET /anomaly/{plant_id}     ──► Anomaly Alert Console
  WS  /ws/scada/{plant_id}        ──► Live power gauge & alert ticker
```

---

## 3. Full Directory Structure

```
solarpulse-ai/
│
├── backend/                            # Python backend — API + ML
│   ├── app/                            # FastAPI application package
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── routes/
│   │   │   │   │   ├── __init__.py
│   │   │   │   │   ├── forecast.py     # GET /forecast endpoints
│   │   │   │   │   ├── anomaly.py      # GET /anomaly, POST /threshold
│   │   │   │   │   ├── plants.py       # CRUD /plants
│   │   │   │   │   ├── alerts.py       # GET /alerts
│   │   │   │   │   └── auth.py         # POST /token, /refresh
│   │   │   │   └── __init__.py
│   │   │   ├── websockets/
│   │   │   │   ├── __init__.py
│   │   │   │   └── scada_ws.py         # WS /ws/scada/{plant_id}
│   │   │   └── deps.py                 # Shared FastAPI dependencies (DB, auth)
│   │   │
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py               # Pydantic Settings (env vars)
│   │   │   ├── security.py             # JWT encode/decode, password hashing
│   │   │   ├── database.py             # SQLAlchemy async engine + session factory
│   │   │   └── logging.py              # Structured JSON logging config
│   │   │
│   │   ├── models/                     # SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── user.py                 # User, Role, Permission
│   │   │   ├── plant.py                # Plant, PlantConfig
│   │   │   ├── scada.py                # ScadaReading (TimescaleDB hypertable)
│   │   │   ├── forecast.py             # ForecastRecord (TimescaleDB hypertable)
│   │   │   └── alert.py                # AnomalyAlert
│   │   │
│   │   ├── schemas/                    # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── plant.py
│   │   │   ├── forecast.py
│   │   │   ├── scada.py
│   │   │   └── alert.py
│   │   │
│   │   ├── services/                   # Business logic layer
│   │   │   ├── __init__.py
│   │   │   ├── forecast_service.py     # Orchestrates physics + ML + post-processing
│   │   │   ├── anomaly_service.py      # Shortfall detection, alert persistence
│   │   │   ├── soiling_service.py      # Dynamic soiling loss calculation
│   │   │   ├── clipping_service.py     # Inverter AC export capping
│   │   │   ├── scada_service.py        # SCADA ingestion & retrieval
│   │   │   └── plant_service.py        # Plant CRUD & config management
│   │   │
│   │   ├── workers/                    # Async background workers
│   │   │   ├── __init__.py
│   │   │   ├── physics_worker.py       # pvlib feature extraction job
│   │   │   ├── ml_worker.py            # LightGBM batch inference job
│   │   │   ├── ingestion_worker.py     # NWP API polling + SCADA ingestion
│   │   │   └── alert_worker.py         # Anomaly persistence + notification dispatch
│   │   │
│   │   └── main.py                     # FastAPI app factory, router registration, lifespan
│   │
│   ├── ml/                             # ML & physics pipeline (standalone, importable)
│   │   ├── features/
│   │   │   ├── __init__.py
│   │   │   ├── pvlib_features.py       # All pvlib-derived feature computation
│   │   │   ├── weather_features.py     # NWP feature normalization & encoding
│   │   │   └── feature_pipeline.py     # Composed feature pipeline (sklearn-compatible)
│   │   │
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── base_model.py           # Abstract base class for all forecasting models
│   │   │   ├── lightgbm_model.py       # LightGBM wrapper: fit, predict, SHAP
│   │   │   └── probabilistic_model.py  # P10/P50/P90 quantile regression (enhancement)
│   │   │
│   │   ├── postprocessing/
│   │   │   ├── __init__.py
│   │   │   ├── clipping.py             # AC inverter export cap logic
│   │   │   └── soiling.py              # Precipitation-proxy soiling loss estimator
│   │   │
│   │   ├── training/
│   │   │   ├── __init__.py
│   │   │   ├── train.py                # CLI entry point for model training
│   │   │   ├── evaluate.py             # MAPE, RMSE, bias evaluation + CV report
│   │   │   ├── cross_validate.py       # Time-series k-fold without lookahead
│   │   │   └── hyperparams.py          # Optuna hyperparameter search config
│   │   │
│   │   ├── serving/
│   │   │   ├── __init__.py
│   │   │   └── model_registry.py       # Load/cache model artefacts from disk
│   │   │
│   │   └── artifacts/
│   │       └── models/                 # Versioned serialised model files
│   │           ├── lgbm_v1.0.0.pkl
│   │           └── lgbm_latest.pkl     # symlink → current production model
│   │
│   ├── tests/
│   │   ├── conftest.py                 # Pytest fixtures (test DB, mock SCADA)
│   │   ├── test_forecast_api.py
│   │   ├── test_anomaly_service.py
│   │   ├── test_pvlib_features.py
│   │   ├── test_soiling.py
│   │   └── test_clipping.py
│   │
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/                   # Migration scripts
│   │       ├── 0001_initial_schema.py
│   │       ├── 0002_create_hypertables.py
│   │       └── 0003_add_rbac.py
│   │
│   ├── requirements.txt                # Production dependencies
│   ├── requirements-dev.txt            # Dev/test dependencies
│   ├── pyproject.toml                  # Ruff lint config, pytest config
│   └── Dockerfile
│
├── frontend/                           # Next.js 15 application
│   ├── src/
│   │   ├── app/                        # Next.js App Router
│   │   │   ├── layout.tsx              # Root layout (ThemeProvider, Auth)
│   │   │   ├── page.tsx                # Landing / redirect
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx        # Login form (NextAuth)
│   │   │   │   └── layout.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx            # Main generation overview
│   │   │   │   └── layout.tsx
│   │   │   ├── plants/
│   │   │   │   ├── page.tsx            # Plant list
│   │   │   │   ├── [plantId]/
│   │   │   │   │   ├── page.tsx        # Per-plant forecast + alerts
│   │   │   │   │   └── analytics/
│   │   │   │   │       └── page.tsx    # P10/P50/P90 advanced analytics view
│   │   │   │   └── new/
│   │   │   │       └── page.tsx        # Register new plant
│   │   │   ├── alerts/
│   │   │   │   └── page.tsx            # Anomaly alert console
│   │   │   └── api/
│   │   │       └── auth/
│   │   │           └── [...nextauth]/
│   │   │               └── route.ts    # NextAuth route handler
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                     # shadcn/ui base components (auto-generated)
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   └── ...
│   │   │   ├── charts/                 # Recharts-based custom chart wrappers
│   │   │   │   ├── ForecastActualChart.tsx   # Main forecast vs actual time-series
│   │   │   │   ├── ProbabilisticBandChart.tsx # P10/P50/P90 band chart
│   │   │   │   ├── SoilingGauge.tsx           # Cumulative soiling % gauge
│   │   │   │   ├── ClippingOverlay.tsx        # Inverter clipping loss overlay
│   │   │   │   └── BessHeatmap.tsx            # BESS charge/discharge heatmap
│   │   │   ├── dashboard/
│   │   │   │   ├── GenerationOverview.tsx     # KPI summary cards + main chart
│   │   │   │   ├── ConstraintBar.tsx          # Live clipping & soiling indicators
│   │   │   │   ├── LivePowerGauge.tsx         # Real-time SCADA power via WebSocket
│   │   │   │   └── PlantSelector.tsx          # Multi-plant dropdown
│   │   │   ├── alerts/
│   │   │   │   ├── AlertConsole.tsx           # Filterable alert list table
│   │   │   │   ├── AlertBadge.tsx             # Severity color-coded badge
│   │   │   │   └── AlertDetailModal.tsx       # Drill-down alert view
│   │   │   ├── plants/
│   │   │   │   ├── PlantCard.tsx
│   │   │   │   └── PlantForm.tsx
│   │   │   └── layout/
│   │   │       ├── Sidebar.tsx
│   │   │       ├── Topbar.tsx
│   │   │       └── ThemeToggle.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useScadaStream.ts        # WebSocket connection hook
│   │   │   ├── useForecast.ts           # SWR/React Query forecast fetcher
│   │   │   ├── useAlerts.ts             # Alert list with auto-refresh
│   │   │   └── usePlants.ts             # Plant list fetcher
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts                   # Typed axios/fetch API client
│   │   │   ├── auth.ts                  # NextAuth config options
│   │   │   ├── utils.ts                 # cn() helper, date formatters
│   │   │   └── constants.ts             # Alert severity levels, colour tokens
│   │   │
│   │   ├── store/
│   │   │   └── plant-store.ts           # Zustand store: active plant, theme
│   │   │
│   │   └── types/
│   │       ├── forecast.ts              # ForecastPoint, ProbabilisticForecast
│   │       ├── scada.ts                 # ScadaReading, LiveTelemetry
│   │       ├── alert.ts                 # AnomalyAlert, Severity
│   │       └── plant.ts                 # Plant, PlantConfig
│   │
│   ├── public/
│   │   └── favicon.ico
│   ├── .env.local.example
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── Dockerfile
│
├── infra/                               # Infrastructure config
│   ├── docker-compose.yml               # All services (api, frontend, db, redis)
│   ├── docker-compose.override.yml      # Dev overrides (hot-reload mounts)
│   ├── nginx/
│   │   ├── nginx.conf                   # Reverse proxy config (API + frontend)
│   │   └── ssl/                         # TLS certificates (gitignored)
│   └── postgres/
│       ├── init.sql                     # TimescaleDB extension + hypertable setup
│       └── seed.sql                     # Optional development seed data
│
├── scripts/
│   ├── seed_data.py                     # Populate dev DB with synthetic plant data
│   ├── simulate_scada.py                # Replay SCADA CSV into WebSocket stream
│   └── retrain.sh                       # Convenience wrapper for model retraining
│
├── docs/
│   ├── PRD.pdf                          # Original Product Requirements Document
│   ├── api/
│   │   └── openapi.yaml                 # Exported OpenAPI spec
│   └── diagrams/
│       └── architecture.drawio
│
├── .env.example                         # Environment variable template
├── .gitignore
├── README.md
└── ARCHITECTURE.md                      # ← this file
```

---

## 4. Module Breakdowns

### 4.1 Backend — FastAPI

**Entry Point: `backend/app/main.py`**

Responsibilities:
- Creates the `FastAPI` application instance with metadata (title, version, OpenAPI tags).
- Registers all API routers under `/api/v1/` prefix.
- Mounts the WebSocket router at `/ws/`.
- Configures lifespan hooks for database connection pool setup/teardown and background worker startup.
- Attaches JWT middleware via a dependency on all protected routes.

```
app/main.py
 └─ app = FastAPI(lifespan=lifespan)
     ├─ app.include_router(forecast_router, prefix="/api/v1/forecast")
     ├─ app.include_router(anomaly_router,  prefix="/api/v1/anomaly")
     ├─ app.include_router(plants_router,   prefix="/api/v1/plants")
     ├─ app.include_router(alerts_router,   prefix="/api/v1/alerts")
     ├─ app.include_router(auth_router,     prefix="/auth")
     └─ app.include_router(ws_router,       prefix="/ws")
```

**`app/api/v1/routes/`**

| File | Key Endpoints | Notes |
|---|---|---|
| `forecast.py` | `GET /{plant_id}`, `GET /{plant_id}/probabilistic` | Returns `ForecastResponse` schema with hourly points |
| `anomaly.py` | `GET /{plant_id}/alerts`, `POST /{plant_id}/threshold` | RBAC: Viewer (GET), Operator+ (POST) |
| `plants.py` | `GET /`, `POST /`, `GET /{id}`, `PUT /{id}` | Admin-only: POST, PUT |
| `alerts.py` | `GET /`, `GET /{id}` | Paginated alert list with severity filter |
| `auth.py` | `POST /token`, `POST /refresh`, `POST /logout` | Issues HttpOnly JWT cookies |

**`app/core/config.py`** — Pydantic `BaseSettings` class reading from `.env`:

```python
class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    nwp_api_provider: str
    nwp_api_key: str
    model_artifact_dir: Path
    anomaly_persistence_steps: int = 3   # N consecutive steps before alert fires
    default_alert_threshold_pct: float = 10.0
```

**`app/services/forecast_service.py`** — Core orchestration:

```
forecast_service.get_forecast(plant_id, horizon_hours)
  1. Load plant config (location, capacity, inverter limit)
  2. Fetch NWP weather forecast from DB (or trigger ingestion if stale)
  3. Dispatch physics_worker.compute_pvlib_features()
  4. Dispatch ml_worker.predict() with combined feature matrix
  5. Apply clipping_service.apply_ac_cap()
  6. Apply soiling_service.apply_soiling_loss()
  7. Persist to forecasts hypertable
  8. Return ForecastResponse
```

**`app/workers/`** — All workers are `async def` functions executed via `asyncio` tasks or an ARQ queue:

| Worker | Trigger | Description |
|---|---|---|
| `physics_worker.py` | On forecast request | Calls `ml/features/pvlib_features.py`, returns DataFrame |
| `ml_worker.py` | After physics features ready | Loads model artefact, runs `model.predict()`, returns Series |
| `ingestion_worker.py` | Scheduled (cron or ARQ) | Polls NWP APIs, inserts into `weather_raw`; consumes SCADA stream |
| `alert_worker.py` | On each SCADA heartbeat | Computes shortfall %, triggers alert if threshold exceeded N times |

---

### 4.2 ML & Physics Pipeline

**Feature Engineering: `ml/features/pvlib_features.py`**

All pvlib computations are wrapped here into a single `compute_pvlib_features(df: pd.DataFrame, plant: PlantConfig) -> pd.DataFrame` function:

| Feature Group | pvlib Functions Used | Output Columns |
|---|---|---|
| Solar position | `pvlib.solarposition.get_solarposition()` | `solar_zenith`, `solar_azimuth`, `solar_elevation` |
| Air mass | `pvlib.atmosphere.get_relative_airmass()` | `airmass_relative` |
| Clear-sky irradiance | `pvlib.clearsky.ineichen()` | `clearsky_ghi`, `clearsky_dni`, `clearsky_dhi` |
| POA irradiance | `pvlib.irradiance.get_total_irradiance()` | `poa_global`, `poa_direct`, `poa_diffuse` |
| Cell temperature | `pvlib.temperature.faiman()` | `cell_temp` |
| Clear-sky index | computed | `clearsky_index` (GHI / clearsky_GHI) |

**LightGBM Model: `ml/models/lightgbm_model.py`**

```python
class LightGBMForecaster(BaseForecaster):
    def fit(self, X_train, y_train, X_val, y_val): ...
    def predict(self, X) -> np.ndarray: ...
    def explain(self, X) -> pd.DataFrame:   # SHAP feature importance
    def save(self, path: Path): ...
    @classmethod
    def load(cls, path: Path) -> "LightGBMForecaster": ...
```

Input features to LightGBM (combined physical + meteorological + temporal):

```
poa_global, cell_temp, solar_zenith, solar_azimuth, airmass_relative,
clearsky_index, ghi_nwp, dni_nwp, dhi_nwp, temp_ambient_nwp,
wind_speed_nwp, cloud_cover_pct, hour_of_day, day_of_year,
sin_hour, cos_hour, sin_doy, cos_doy,    ← cyclic encodings
lag_power_1h, lag_power_2h, lag_power_24h   ← SCADA history lags
```

Target: `gross_dc_power_kw` (pre-clipping)

**Operational Post-Processing**

`ml/postprocessing/clipping.py`:
```
clipped_kw = min(gross_dc_kw, plant.ac_export_limit_kw)
```

`ml/postprocessing/soiling.py`:
```
days_since_rain = query_precipitation_gap(plant_id, timestamp)
soiling_loss_factor = soiling_rate_per_day × days_since_rain
if rain_event_today:
    soiling_loss_factor = partial_cleaning_recovery(precipitation_mm)
deliverable_kw = clipped_kw × (1 − soiling_loss_factor)
```

**Training Pipeline: `ml/training/train.py`**

```
CLI: python ml/training/train.py --plant-id P01 --start 2024-01-01 --end 2025-12-31

1. Load SCADA + weather data from TimescaleDB
2. Compute pvlib features
3. Build feature matrix X, target vector y
4. Time-series cross-validation (5 folds, gap = 24h, no lookahead)
5. Optuna hyperparameter search (n_trials=100)
6. Refit best model on full training set
7. Evaluate on held-out test period (MAPE, RMSE, MBE)
8. Serialize to ml/artifacts/models/lgbm_{plant_id}_v{version}.pkl
9. Update lgbm_latest.pkl symlink
```

---

### 4.3 Frontend — Next.js

**App Router Page Structure**

```
src/app/
├── layout.tsx            → ThemeProvider (dark/light), SessionProvider, global CSS
├── page.tsx              → Redirect to /dashboard if authenticated, else /login
├── (auth)/login/         → Credentials login form, OAuth provider buttons
├── dashboard/            → Main KPI tiles + ForecastActualChart for default plant
├── plants/               → Grid of PlantCard components
├── plants/[plantId]/     → Per-plant forecast chart + alert panel + constraints bar
├── plants/[plantId]/analytics/ → P10/P50/P90 probabilistic chart + BESS heatmap
└── alerts/               → AlertConsole table with severity filter + date range
```

**Key Components**

`ForecastActualChart.tsx`:
- Uses `recharts` `ComposedChart` with `Line` (forecast) + `Line` (actual SCADA) + `Area` (P10/P90 bands when available).
- Zoom via `ReferenceArea` drag-select; range via `Brush` component.
- Data fetched via `useForecast(plantId, range)` SWR hook.

`LivePowerGauge.tsx`:
- Connects to `WS /ws/scada/{plantId}` via `useScadaStream()`.
- Renders a `recharts` `RadialBarChart` updated on every WebSocket message.
- Shows current power (kW), forecast value, and shortfall %.

`AlertConsole.tsx`:
- Server-side paginated table using `@tanstack/react-table`.
- Columns: timestamp, duration, severity badge, estimated deficit (kWh), diagnostic hint.
- Filter by severity level (Critical / Warning / Info) and time range.

**State Management**

```
src/store/plant-store.ts  (Zustand)
  state:
    activePlantId: string | null
    alertCount: number
    theme: "dark" | "light"
  actions:
    setActivePlant(id)
    incrementAlertCount()
    toggleTheme()
```

**API Client: `src/lib/api.ts`**

```typescript
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,    // send HttpOnly JWT cookie
});

export const forecastApi = {
  get: (plantId: string, params: ForecastParams) =>
    apiClient.get<ForecastResponse>(`/api/v1/forecast/${plantId}`, { params }),
  getProbabilistic: (plantId: string, params: ForecastParams) =>
    apiClient.get<ProbabilisticForecastResponse>(
      `/api/v1/forecast/${plantId}/probabilistic`, { params }),
};

export const alertApi = {
  list: (plantId: string, params: AlertParams) =>
    apiClient.get<PaginatedAlerts>(`/api/v1/alerts`, { params }),
  updateThreshold: (plantId: string, threshold: number) =>
    apiClient.post(`/api/v1/anomaly/${plantId}/threshold`, { threshold }),
};
```

---

### 4.4 Database Layer

**Engine:** PostgreSQL 15 + TimescaleDB 2.x

**Hypertables** (time-series optimised, partitioned by time):

```sql
-- Raw SCADA readings from physical plant sensors
CREATE TABLE scada_readings (
    time            TIMESTAMPTZ       NOT NULL,
    plant_id        UUID              NOT NULL REFERENCES plants(id),
    active_power_kw DOUBLE PRECISION,
    ghi_sensor      DOUBLE PRECISION,
    module_temp_c   DOUBLE PRECISION,
    inverter_status SMALLINT,
    PRIMARY KEY (time, plant_id)
);
SELECT create_hypertable('scada_readings', 'time');

-- Computed forecast output (post-processing applied)
CREATE TABLE forecasts (
    time              TIMESTAMPTZ       NOT NULL,
    plant_id          UUID              NOT NULL REFERENCES plants(id),
    gross_dc_kw       DOUBLE PRECISION,
    clipped_kw        DOUBLE PRECISION,
    deliverable_kw    DOUBLE PRECISION,
    soiling_loss_pct  DOUBLE PRECISION,
    p10_kw            DOUBLE PRECISION,   -- NULL until enhancement enabled
    p50_kw            DOUBLE PRECISION,
    p90_kw            DOUBLE PRECISION,
    model_version     VARCHAR(32),
    PRIMARY KEY (time, plant_id)
);
SELECT create_hypertable('forecasts', 'time');
```

**Relational Tables:**

```sql
-- Plants / sites
CREATE TABLE plants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    latitude          DOUBLE PRECISION NOT NULL,
    longitude         DOUBLE PRECISION NOT NULL,
    tilt_deg          DOUBLE PRECISION,
    azimuth_deg       DOUBLE PRECISION,
    capacity_dc_kw    DOUBLE PRECISION NOT NULL,
    ac_export_limit_kw DOUBLE PRECISION NOT NULL,
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- Anomaly alerts
CREATE TABLE anomaly_alerts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id         UUID NOT NULL REFERENCES plants(id),
    started_at       TIMESTAMPTZ NOT NULL,
    resolved_at      TIMESTAMPTZ,
    severity         VARCHAR(16) CHECK (severity IN ('critical','warning','info')),
    shortfall_pct    DOUBLE PRECISION,
    deficit_kwh      DOUBLE PRECISION,
    diagnostic_hint  TEXT
);

-- Users + RBAC
CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        VARCHAR(255) UNIQUE NOT NULL,
    hashed_pw    VARCHAR(255),
    role         VARCHAR(32) CHECK (role IN ('viewer','operator','admin')),
    tenant_id    UUID NOT NULL REFERENCES tenants(id)
);
```

**TimescaleDB Continuous Aggregates** (materialised for dashboard performance):

```sql
-- Pre-aggregated hourly SCADA stats for chart rendering
CREATE MATERIALIZED VIEW scada_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    plant_id,
    avg(active_power_kw)  AS avg_power_kw,
    max(active_power_kw)  AS peak_power_kw,
    avg(ghi_sensor)       AS avg_ghi
FROM scada_readings
GROUP BY bucket, plant_id;
```

---

### 4.5 Auth & RBAC

**Flow:**

```
User → POST /auth/token (email + password)
     → FastAPI verifies credentials against hashed_pw (bcrypt)
     → Issues JWT (sub=user_id, role=operator, exp=60min)
     → Sets JWT in HttpOnly, Secure, SameSite=Strict cookie
     → Frontend (NextAuth) reads session from cookie

Protected Route Request:
     → JWT cookie sent automatically
     → FastAPI dependency: get_current_user() decodes JWT, loads user from DB
     → RBAC dependency: require_role("operator") checks user.role
     → 403 if insufficient role
```

**Role Permissions Matrix:**

| Resource | Viewer | Operator | Admin |
|---|---|---|---|
| View forecast charts | ✅ | ✅ | ✅ |
| View anomaly alerts | ✅ | ✅ | ✅ |
| Update alert thresholds | ❌ | ✅ | ✅ |
| Register / edit plants | ❌ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ✅ |
| Trigger model retrain | ❌ | ❌ | ✅ |

---

### 4.6 Infrastructure

**`infra/docker-compose.yml`** — Services:

```yaml
services:
  db:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_DB: solarpulse
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

  api:
    build: ../backend
    depends_on: [db]
    env_file: ../.env
    ports: ["8000:8000"]
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000

  frontend:
    build: ../frontend
    depends_on: [api]
    env_file: ../frontend/.env.local
    ports: ["3000:3000"]

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
    ports: ["80:80", "443:443"]
    depends_on: [api, frontend]
```

**`infra/nginx/nginx.conf`** — Reverse proxy routing:

```
/api/*    → http://api:8000
/ws/*     → http://api:8000 (WebSocket upgrade)
/*        → http://frontend:3000
```

---

## 5. Inter-Service Communication

| Path | Protocol | Direction | Payload |
|---|---|---|---|
| Frontend → API | HTTPS REST | Request/Response | JSON (ForecastResponse, AlertList) |
| Frontend → API | WSS WebSocket | Bidirectional | JSON frames (LiveTelemetry) |
| API Workers → DB | asyncpg (TCP) | Read/Write | SQL / TimescaleDB |
| Ingestion Worker → NWP APIs | HTTPS | Outbound | Provider-specific JSON |
| API → Frontend (alerts) | WebSocket push | Server-initiated | JSON alert frame |

---

## 6. Security Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Security Layers                        │
│                                                          │
│  1. Transport    → TLS 1.3 (nginx terminates SSL)        │
│                                                          │
│  2. Auth         → OAuth2 Resource Owner Password Flow   │
│                    JWT HS256, 60-min expiry              │
│                    Refresh tokens (7-day, rotated)       │
│                    HttpOnly · Secure · SameSite=Strict   │
│                                                          │
│  3. RBAC         → FastAPI Depends(require_role(...))    │
│                    Three roles: viewer / operator / admin│
│                                                          │
│  4. Tenant       → All DB queries filtered by tenant_id  │
│     Isolation      via SQLAlchemy row-level scoping      │
│                                                          │
│  5. Input        → Pydantic schema validation on all     │
│     Validation     request bodies and query params       │
│                                                          │
│  6. Secrets      → All credentials in env vars          │
│                    Never committed to version control    │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Deployment Architecture

**Local Development:**
```
docker compose up --build
  → PostgreSQL/TimescaleDB on :5432
  → FastAPI on :8000 (hot-reload via --reload)
  → Next.js on :3000 (hot-reload via next dev)
  → nginx on :80 (optional; can be bypassed locally)
```

**Staging / Production:**
```
Cloud VM / Kubernetes Pod:
  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────────┐
  │  nginx      │───►│  FastAPI    │───►│  PostgreSQL + TimescaleDB│
  │  (ingress)  │    │  (Gunicorn/ │    │  (managed PaaS or        │
  │             │    │   Uvicorn)  │    │   self-hosted + WAL-G)   │
  └──────┬──────┘    └─────────────┘    └──────────────────────────┘
         │
         └──► Next.js (Vercel / self-hosted Node container)
```

**Recommended managed services:**
- Database: [Timescale Cloud](https://www.timescale.com/cloud) or AWS RDS + TimescaleDB extension
- API: AWS ECS / GCP Cloud Run / Railway
- Frontend: Vercel (optimal for Next.js)
- Secrets: AWS Secrets Manager / Doppler

---

*Last updated: 2026-10-07*
