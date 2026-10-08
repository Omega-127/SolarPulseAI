"""
app/services/scada_service.py

Business logic for SCADA data ingestion and retrieval.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.plant import Plant
from app.models.scada import ScadaReading
from app.schemas.scada import ScadaReadingCreate

logger = get_logger(__name__)


async def _assert_plant_exists(db: AsyncSession, plant_id: int) -> None:
    result = await db.execute(select(Plant.id).where(Plant.id == plant_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )


async def insert_reading(db: AsyncSession, data: ScadaReadingCreate) -> ScadaReading:
    """Insert a single SCADA reading."""
    await _assert_plant_exists(db, data.plant_id)
    reading = ScadaReading(**data.model_dump())
    db.add(reading)
    await db.commit()
    await db.refresh(reading)
    return reading


async def batch_insert_readings(
    db: AsyncSession, readings: List[ScadaReadingCreate]
) -> List[ScadaReading]:
    """Insert multiple SCADA readings in a single transaction."""
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
