<div align="center">

# ☀️ SolarPulse AI

**Hybrid Solar Yield Forecasting & Plant Performance Monitoring**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15+-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![LightGBM](https://img.shields.io/badge/LightGBM-Gradient%20Boosting-8E44AD?style=flat)](https://lightgbm.readthedocs.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-TimescaleDB-336791?style=flat&logo=postgresql&logoColor=white)](https://www.timescale.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

*Combining solar physics (pvlib) with gradient boosting (LightGBM) to deliver accurate, constraint-aware AC generation forecasts and real-time operational anomaly detection.*

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture Overview](#-architecture-overview)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running with Docker](#running-with-docker)
  - [Running Locally](#running-locally)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Dashboard & UI](#-dashboard--ui)
- [Real Indian Solar Parks Dataset](#-real-indian-solar-parks-dataset)
- [ML Pipeline](#-ml-pipeline)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🔭 Overview

Solar generation is inherently variable — irradiance, cloud movement, ambient temperature, seasonal solar angles, panel soiling, inverter limits, and unplanned outages all compound to make raw weather-based forecasts systematically optimistic. SolarPulse AI bridges this gap with a three-layer architecture:

1. **Physical Layer** — pvlib-driven solar positioning, plane-of-array irradiance computation, and cell temperature modeling.
2. **ML Layer** — LightGBM regression trained on combined physical features + meteorological inputs + historical SCADA data.
3. **Operational Constraint Layer** — Hard AC export capping (inverter clipping) and dynamic soiling loss estimation to produce realistic *deliverable* forecasts.

A live anomaly engine then compares these deliverable forecasts against real SCADA telemetries and surfaces operational shortfalls before they become revenue losses.

---

## ✨ Key Features

### Core (MVP)

| Feature | Description |
|---|---|
| **Hybrid Yield Forecasting** | pvlib physics features feed into a LightGBM model for sub-hourly to hourly AC generation forecasts. |
| **Inverter Clipping** | Hard-caps DC output at the physical AC capacity limit of the inverter / grid interconnection agreement. |
| **Dynamic Soiling Estimation** | Models particulate buildup losses from time-since-rain and cleaning logs; rain events trigger automatic recovery. |
| **Anomaly Detection** | Continuously compares deliverable forecast vs. live SCADA. Configurable thresholds generate operational alerts. |
| **Live Weather Integration** | Real-time meteorological telemetry & multi-day hourly forecasts via WeatherAPI.com matched to plant latitude & longitude, with graceful physics-based offline mock fallback. |
| **Real Indian Solar Parks Dataset** | Pre-seeded with 7 flagship Indian solar installations (Bhadla, Pavagada, Kamuthi, Rewa, Charanka, NP Kunta, Adani Mundra) with realistic SCADA, 48h forecasts, and alerts. |

### Enhancements (Advanced / Optional)

| Feature | Description |
|---|---|
| **Probabilistic Forecasting** | P10 / P50 / P90 confidence intervals + ramp-risk indicators for reserve planning and grid scheduling. |
| **BESS Optimization** | Co-located battery charge/discharge schedule recommendations to reduce export clipping and capture price arbitrage. |
| **Location-Aware Weather Widget** | Interactive live weather card per plant displaying ambient temp, cloud cover %, irradiance proxy, humidity, UV index, and wind velocity. |

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend API** | FastAPI (Python 3.11+) | Async REST + WebSocket endpoints, auto OpenAPI docs |
| **ML & Physics** | pvlib, LightGBM, Pandas, NumPy | PV feature engineering, gradient-boosted forecasting |
| **Weather Telemetry** | WeatherAPI.com + HTTPX | Live weather conditions, GHI proxy estimation, and multi-day hourly forecasts |
| **Frontend UI** | React / Next.js (TypeScript) | Component-driven dashboard, SSR capability |
| **Styling** | Vanilla CSS / Custom Design System | Responsive layout, dark-mode solar telemetry theme |
| **Visualization** | SVG Time-Series / Native Charts | Interactive generation curves, confidence bands, weather cards |
| **Auth & RBAC** | OAuth2 + JWT (FastAPI) | Secure token management, role enforcement (Viewer/Operator/Admin) |
| **Database** | PostgreSQL + TimescaleDB | Optimized time-series storage for SCADA, metadata, alerts |

---

## 🏗 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│            React / Next.js Dashboard (TypeScript)                    │
│        Recharts · shadcn/ui · Tailwind CSS · NextAuth               │
└─────────────────────────────┬────────────────────────────────────────┘
                              │  REST / WebSocket
┌─────────────────────────────▼────────────────────────────────────────┐
│                         API GATEWAY                                  │
│               FastAPI (Python 3.11+) · OAuth2 / JWT                  │
│              RBAC Middleware · OpenAPI / Swagger Docs               │
└──────────┬──────────────────┬───────────────────┬────────────────────┘
           │                  │                   │
   ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
   │  Forecasting  │  │  Operational  │  │   Anomaly     │
   │    Engine     │  │     Layer     │  │    Engine     │
   │ pvlib + LGBM  │  │ Clip + Soil   │  │ Δ Forecast vs │
   │               │  │               │  │   SCADA       │
   └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
           │                  │                   │
┌──────────▼──────────────────▼───────────────────▼────────────────────┐
│                     DATA PERSISTENCE LAYER                           │
│              PostgreSQL + TimescaleDB (Hypertables)                  │
│            SCADA Signals · Forecasts · Alerts · Users                │
└──────────┬───────────────────────────────────────────────────────────┘
           │
   ┌───────▼───────┐
   │  Ingestion    │
   │  Workers      │
   │ NWP APIs +    │
   │ SCADA Feeds   │
   └───────────────┘
```

For the full architecture with directory structure and per-module details, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 🚀 Getting Started

### Prerequisites

- **Docker & Docker Compose** v24+ (recommended)
- OR, for local development:
  - Python 3.11+
  - Node.js 20+
  - PostgreSQL 15+ with TimescaleDB extension

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/solarpulse-ai.git
cd solarpulse-ai

# 2. Copy environment template
cp .env.example .env
# Edit .env with your NWP API keys, DB credentials, and JWT secret
```

### Environment Variables

Create a `.env` file at the project root (see `.env.example`):

```env
# --- Database ---
DATABASE_URL=postgresql+asyncpg://solarpulse:solarpulse_secret@localhost:5432/solarpulse

# --- Auth ---
JWT_SECRET_KEY=your-super-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# --- WeatherAPI.com (Optional / Recommended) ---
# Free tier key from https://www.weatherapi.com/
WEATHER_API_KEY=your_weatherapi_key_here
WEATHER_API_BASE_URL=https://api.weatherapi.com/v1

# --- ML ---
MODEL_ARTIFACT_DIR=./backend/ml/artifacts/models

# --- Frontend (Next.js) ---
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

### Running with Docker

```bash
# Build and start all services (API, frontend, PostgreSQL/TimescaleDB)
docker compose up --build

# Services will be available at:
#   Frontend  → http://localhost:3000
#   API       → http://localhost:8000
#   API Docs  → http://localhost:8000/docs
```

### Running Locally

**Backend (FastAPI)**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Apply database migrations
alembic upgrade head

# Seed initial demo roles, admin, and 7 real Indian solar parks with telemetry
python -m app.scripts.seed_data

# Start the API server
uvicorn app.main:app --reload --port 8000
```

**ML Training** (first-time or on new data)

```bash
cd backend
python ml/training/train.py --plant-id YOUR_PLANT_ID --start 2024-01-01 --end 2025-12-31
```

**Frontend (Next.js)**

```bash
cd frontend
npm install
npm run dev        # → http://localhost:3000
```

---

## 📁 Project Structure

```
solarpulse-ai/
├── backend/                    # FastAPI application + ML pipeline
│   ├── app/                    # API application package
│   ├── ml/                     # ML & physics pipeline
│   ├── tests/                  # Pytest test suites
│   ├── alembic/                # Database migration scripts
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # Next.js application
│   ├── src/
│   │   ├── app/                # Next.js App Router pages
│   │   ├── components/         # Reusable UI components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # API clients, utilities
│   │   ├── store/              # Global state (Zustand/Context)
│   │   └── types/              # TypeScript type definitions
│   ├── public/
│   ├── package.json
│   └── Dockerfile
├── infra/                      # Infrastructure configuration
│   ├── docker-compose.yml
│   ├── nginx/
│   └── postgres/
├── scripts/                    # Dev utility scripts
├── docs/                       # Extended documentation & PRD
├── .env.example
├── .gitignore
├── README.md
└── ARCHITECTURE.md
```

Full per-module directory breakdowns are in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 📡 API Reference

Interactive docs are auto-generated by FastAPI and available at `http://localhost:8000/docs` (Swagger UI) and `http://localhost:8000/redoc` (ReDoc).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/forecast/{plant_id}` | Fetch hourly/sub-hourly forecast for a plant |
| `GET` | `/api/v1/forecast/{plant_id}/probabilistic` | P10/P50/P90 uncertainty bands |
| `GET` | `/api/v1/weather/{plant_id}/current` | Real-time weather conditions & estimated irradiance proxy for plant lat/lon |
| `GET` | `/api/v1/weather/{plant_id}/forecast` | Multi-day hourly weather forecast (up to 3 days) for plant lat/lon |
| `GET` | `/api/v1/anomaly/{plant_id}/alerts` | List active anomaly alerts |
| `POST` | `/api/v1/anomaly/{plant_id}/threshold` | Update alert threshold config |
| `GET` | `/api/v1/plants` | List all plants for the authenticated tenant |
| `POST` | `/api/v1/plants` | Register a new plant site (requires latitude, longitude, and capacity) |
| `WS` | `/ws/scada/{plant_id}` | WebSocket stream for live SCADA telemetry |
| `POST` | `/auth/token` | Obtain JWT access token |
| `POST` | `/auth/refresh` | Refresh access token |

---

## 📊 Dashboard & UI

The React / Next.js dashboard provides:

- **Live Meteorological Panel** — Real-time weather conditions at each plant's exact latitude and longitude: temperature (°C), estimated solar irradiance (W/m²), cloud cover (%), relative humidity (%), wind speed (m/s), and UV index.
- **Generation Forecast & Actuals** — Interactive SVG time-series chart contrasting 48-hour deliverable generation forecasts against actual SCADA telemetry with confidence bands.
- **Constraint Overlays** — Visual indicators for physical inverter AC clipping limits and cumulative panel soiling loss.
- **Anomaly Alert Console** — Real-time shortfalls surfaced by severity (critical/warning/info) with impacted kW capacity and suggested remedies.
- **Multi-Plant Fleet Management** — Overview of all operational sites across diverse geographic regions, with one-click plant registration for new sites anywhere in the world.

---

## 🇮🇳 Real Indian Solar Parks Dataset

SolarPulse AI includes a pre-seeded database with 7 landmark utility-scale solar parks across India's key climatic and renewable energy corridors:

| Plant Name | State | Coordinates | Capacity | Region Profile |
|---|---|---|---|---|
| **Bhadla Solar Park (Block A)** | Rajasthan | 27.5387° N, 71.9161° E | 50.0 MW | Thar Desert (extreme GHI, intense soiling) |
| **Pavagada Solar Park (Sector 2)** | Karnataka | 14.1017° N, 77.2764° E | 25.0 MW | Semi-arid Deccan plateau (sustained clear sky) |
| **Kamuthi Solar Power Station** | Tamil Nadu | 9.3524° N, 78.3962° E | 30.0 MW | Southern coastal fringe (humid, monsoon cycles) |
| **Rewa Ultra Mega Solar (Unit 1)** | Madhya Pradesh | 24.5028° N, 81.3392° E | 20.0 MW | Central plateau (seasonal cloud variation) |
| **Charanka Solar Park (Plot 4)** | Gujarat | 23.9056° N, 71.2014° E | 15.0 MW | Rann of Kutch transition (high ambient heat) |
| **NP Kunta Ultra Mega Solar** | Andhra Pradesh | 14.1500° N, 78.2667° E | 25.0 MW | Rayalaseema arid zone (low rainfall, clear skies) |
| **Adani Mundra Solar Plant** | Gujarat | 22.8390° N, 69.7214° E | 20.0 MW | Coastal Gulf of Kutch (marine aerosols & wind) |

Each seeded plant features:
- Realistic physical specifications (module types, inverter capacity, tilt & azimuth)
- 48-hour forward forecast curves generated by the physics-informed pipeline
- 18+ historical SCADA intervals with simulated weather transients
- Site-tailored anomaly alerts (dust accumulation, inverter thermal throttling, partial string failures)
- Dynamic live weather pulled from WeatherAPI.com based on exact GPS coordinates


---

## 🤖 ML Pipeline

```
Weather NWP Data + SCADA History
        │
        ▼
pvlib Feature Engineering
  • Solar zenith / azimuth
  • Air mass & clear-sky irradiance
  • Plane-of-array irradiance (POA)
  • Cell temperature (Faiman / SAPM)
        │
        ▼
LightGBM Regression Model
  • Trained on physics features + meteorological inputs + SCADA history
  • Time-series cross-validation (no lookahead bias)
  • MAPE-optimised objective
        │
        ▼
Operational Post-Processing
  • Inverter clipping (hard AC cap)
  • Dynamic soiling loss (precipitation proxy)
        │
        ▼
Deliverable Forecast Output (kW / MW)
```

Model artefacts are versioned under `backend/ml/artifacts/models/` and served via the FastAPI prediction endpoint.

---

## 🗺 Roadmap

- [x] Core hybrid forecasting engine (pvlib + LightGBM)
- [x] Inverter clipping & dynamic soiling estimation
- [x] Forecast-vs-actual anomaly detection with configurable thresholds
- [x] Probabilistic P10/P50/P90 forecasting & ramp-risk indicators
- [ ] Co-located BESS charge/discharge optimization
- [ ] Multi-model ensemble (XGBoost + LightGBM + DeepAR)
- [ ] Automated root-cause diagnosis from inverter error codes
- [ ] Market-aware BESS dispatch with real-time grid pricing
- [ ] Multi-site fleet management console

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for coding standards, commit conventions, and the pull request process.

---

## 📄 License

This project is licensed under the MIT License — see the [`LICENSE`](./LICENSE) file for details.

---

<div align="center">
Built with ☀️ for smarter solar operations.
</div>
