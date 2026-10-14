"""
app/services/scada_service.py

Business logic for SCADA data ingestion and retrieval.

Phase 3 — Online Learning integration (ONLINE_LEARNING_SPEC.md §6.4):
When a new SCADA reading is persisted, the service looks up the most recent
forecast for the same plant and timestamp window, then drives the online
residual adapter via the ModelRegistry so the model learns from real-time
prediction errors.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.alert import AnomalyAlert
from app.models.forecast import ForecastRecord
from app.models.plant import Plant
from app.models.scada import ScadaReading
from app.schemas.scada import ScadaReadingCreate

logger = get_logger(__name__)

# \u2500\u2500 Lazy registry accessor \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

_registry = None


def _get_registry():
    global _registry
    if _registry is None:
        try:
            from backend.ml.serving.model_registry import ModelRegistry
        except ImportError:
            from ml.serving.model_registry import ModelRegistry  # type: ignore
        _registry = ModelRegistry()
    return _registry


# \u2500\u2500 Internal: online adapter feedback \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

_FORECAST_MATCH_WINDOW_MINUTES: int = 20   # \u00b120 min around SCADA timestamp


async def _trigger_online_adapter_update(
    db: AsyncSession,
    reading: ScadaReading,
) -> None:
    """
    Asynchronously step the OnlineResidualAdapter for the plant that owns *reading*.

    Called after every successful SCADA insert.  Errors are silently logged
    so that SCADA ingestion itself is never interrupted.
    """
    try:
        plant_id = reading.plant_id
        window = timedelta(minutes=_FORECAST_MATCH_WINDOW_MINUTES)
        ts = reading.timestamp

        # 1. Find the most recent forecast whose forecast_time is near this reading
        result = await db.execute(
            select(ForecastRecord)
            .where(
                ForecastRecord.plant_id == plant_id,
                ForecastRecord.forecast_time >= ts - window,
                ForecastRecord.forecast_time <= ts + window,
            )
            .order_by(
                func.abs(
                    func.extract("epoch", ForecastRecord.forecast_time)
                    - func.extract("epoch", ts)
                )
            )
            .limit(1)
        )
        matching_forecast: Optional[ForecastRecord] = result.scalar_one_or_none()

        if matching_forecast is None:
            logger.debug(
                "Plant %s: no forecast found near %s \u2014 skipping adapter update.",
                plant_id, ts.isoformat(),
            )
            return

        # 2. Count active (unresolved) anomaly alerts for this plant
        alert_result = await db.execute(
            select(func.count(AnomalyAlert.id)).where(
                AnomalyAlert.plant_id == plant_id,
                AnomalyAlert.is_resolved.is_(False),
            )
        )
        active_alert_count: int = alert_result.scalar_one() or 0

        # 3. Step the online adapter
        ghi = reading.irradiance_w_m2 or 0.0
        base_kw = matching_forecast.ml_power_kw or matching_forecast.predicted_power_kw

        applied = _get_registry().update_online_state(
            plant_id=str(plant_id),
            y_actual=reading.power_kw,
            y_pred_base=base_kw,
            ghi=ghi,
            has_active_anomaly=(active_alert_count > 0),
            persist=True,
        )

        logger.debug(
            "Plant %s: online adapter update %s (y_actual=%.2f kW, y_base=%.2f kW, ghi=%.0f W/m\u00b2, alerts=%d)",
            plant_id,
            "APPLIED" if applied else "SKIPPED",
            reading.power_kw, base_kw, ghi, active_alert_count,
        )

    except Exception as exc:
        # Online learning is best-effort \u2014 never interrupt SCADA ingestion
        logger.warning("Online adapter update failed for plant %s: %s", reading.plant_id, exc)


async def _assert_plant_exists(db: AsyncSession, plant_id: int) -> None:
    result = await db.execute(select(Plant.id).where(Plant.id == plant_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )


async def insert_reading(db: AsyncSession, data: ScadaReadingCreate) -> ScadaReading:
    """Insert a single SCADA reading and drive the online adapter feedback loop."""
    await _assert_plant_exists(db, data.plant_id)
    reading = ScadaReading(**data.model_dump())
    db.add(reading)
    await db.commit()
    await db.refresh(reading)
    # Phase 3 — Online adapter feedback (best-effort, non-blocking)
    await _trigger_online_adapter_update(db, reading)
    return reading


async def batch_insert_readings(
    db: AsyncSession, readings: List[ScadaReadingCreate]
) -> List[ScadaReading]:
    """Insert multiple SCADA readings and trigger online adapter updates."""
    if not readings:
        return []

    # Validate all plant IDs exist (deduplicated check)
    plant_ids = {r.plant_id for r in readings}
    for pid in plant_ids:
        await _assert_plant_exists(db, pid)

    orm_objects = [ScadaReading(**r.model_dump()) for r in readings]
    db.add_all(orm_objects)
    await db.commit()
    logger.info(f"Batch inserted {len(orm_objects)} SCADA readings")

    # Phase 3 — Drive online adapter for each ingested reading
    for reading in orm_objects:
        await _trigger_online_adapter_update(db, reading)

    return orm_objects


async def get_recent_readings(
    db: AsyncSession, plant_id: int, limit: int = 100
) -> List[ScadaReading]:
    """Return the most recent SCADA readings for a plant."""
    await _assert_plant_exists(db, plant_id)
    result = await db.execute(
        select(ScadaReading)
        .where(ScadaReading.plant_id == plant_id)
        .order_by(ScadaReading.timestamp.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_readings_by_range(
    db: AsyncSession,
    plant_id: int,
    start: datetime,
    end: datetime,
    limit: int = 1000,
) -> List[ScadaReading]:
    """Return SCADA readings within a time range."""
    await _assert_plant_exists(db, plant_id)
    result = await db.execute(
        select(ScadaReading)
        .where(
            ScadaReading.plant_id == plant_id,
            ScadaReading.timestamp >= start,
            ScadaReading.timestamp <= end,
        )
        .order_by(ScadaReading.timestamp.asc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_scada_statistics(
    db: AsyncSession, plant_id: int
) -> Dict[str, Optional[float]]:
    """Return basic statistics for a plant's SCADA data."""
    await _assert_plant_exists(db, plant_id)
    result = await db.execute(
        select(
            func.avg(ScadaReading.power_kw).label("avg_power_kw"),
            func.max(ScadaReading.power_kw).label("max_power_kw"),
            func.min(ScadaReading.power_kw).label("min_power_kw"),
            func.avg(ScadaReading.irradiance_w_m2).label("avg_irradiance"),
            func.count(ScadaReading.id).label("total_readings"),
        ).where(ScadaReading.plant_id == plant_id)
    )
    row = result.one()
    return {
        "avg_power_kw": row.avg_power_kw,
        "max_power_kw": row.max_power_kw,
        "min_power_kw": row.min_power_kw,
        "avg_irradiance_w_m2": row.avg_irradiance,
        "total_readings": row.total_readings,
    }
