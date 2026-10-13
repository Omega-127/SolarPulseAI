---
name: solarpulse-diagnostics
description: Domain knowledge about SolarPulseAI's alert diagnostic engine and root cause analysis.
---

# SolarPulseAI Diagnostics

When dealing with alerts, anomalies, or root cause analysis in the SolarPulseAI repository, the core logic is located in `backend/app/services/diagnosis_service.py`.

The system uses a two-layered approach to infer the root cause of an anomaly:

### 1. Keyword Matching (NLP)
It scans the raw alert message or error code for specific textual clues:
- **"CLIP" / "SATURAT"** -> `INVERTER_CLIPPING_SATURATION` (97% confidence)
- **"SOIL" / "DIRT" / "DUST"** -> `SOILING_DEGRADATION` (94% confidence)
- **"TRIP" / "OVERHEAT" / "DISCONNECT"** -> `INVERTER_TRIP_OVERTEMP`
- **"ARC" / "AFCI"** -> `ARC_FAULT_AFCI`

### 2. Physics & Telemetry Heuristics
If the alert message is generic (e.g. "Power Shortfall"), it falls back to SCADA telemetry heuristics:
- **Inverter Clipping**: Small power deficit (<8%) under blazing sun (>750 W/m²).
- **Soiling/Dust**: Moderate, gradual deficit (8-24%), especially if `days_since_cleaning` >= 10.
- **Inverter Trip**: Steep power drop (>25%) during high sun.
