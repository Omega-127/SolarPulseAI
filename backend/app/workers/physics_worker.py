"""
app/workers/physics_worker.py

Physics-based solar feature calculation worker.

Responsibilities:
- Fetch SCADA data for a plant
- Compute pvlib-based solar position and irradiance features
- Return/store physics-based expected power

Does NOT start an infinite loop on import.
Call run_physics_update() explicitly from a scheduler or route.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.plant import Plant, PlantConfig
from app.models.scada import ScadaReading

logger = get_logger(__name__)

try:
    import pvlib  # type: ignore
    import pandas as pd

    PVLIB_AVAILABLE = True
except ImportError:
    PVLIB_AVAILABLE = False
    logger.warning("pvlib not available — physics worker will use simplified model.")


def compute_physics_features(
    latitude: float,
    longitude: float,
    tilt: float,
    azimuth: float,
    capacity_kw: float,
    efficiency: float,
    timestamp: datetime,
    irradiance_w_m2: Optional[float] = None,
    temperature_c: Optional[float] = None,
) -> dict:
    """
    Compute physics-based solar features for a given timestamp.

    Returns a dictionary of computed features.
    """
    utc_time = timestamp.astimezone(timezone.utc)

    if PVLIB_AVAILABLE:
        try:
            location = pvlib.location.Location(
                latitude=latitude,
                longitude=longitude,
                tz="UTC",
            )
            times = pd.DatetimeIndex([utc_time])
            solar_pos = location.get_solarposition(times)
            clearsky = location.get_clearsky(times)

            solar_zenith = float(solar_pos["zenith"].iloc[0])
            solar_azimuth = float(solar_pos["azimuth"].iloc[0])
            ghi = irradiance_w_m2 if irradiance_w_m2 is not None else float(clearsky["ghi"].iloc[0])
            dni = float(clearsky["dni"].iloc[0])
            dhi = float(clearsky["dhi"].iloc[0])

            # Plane-of-array irradiance
            poa = pvlib.irradiance.get_total_irradiance(
                surface_tilt=tilt,
                surface_azimuth=azimuth,
                solar_zenith=solar_zenith,
                solar_azimuth=solar_azimuth,
                dni=dni,
                ghi=ghi,
                dhi=dhi,
            )
            poa_total = float(poa["poa_global"])
        except Exception as exc:
            logger.debug(f"pvlib calculation failed: {exc}")
            poa_total = irradiance_w_m2 or 600.0
            solar_zenith = 45.0
            solar_azimuth = 180.0
    else:
        poa_total = irradiance_w_m2 or 600.0
        solar_zenith = 45.0
        solar_azimuth = 180.0

    temp = temperature_c or 25.0
    temp_correction = 1.0 - max(0.0, (temp - 25.0) * 0.004)

    # Estimated DC power from physics
    physics_power_kw = min(
        (poa_total / 1000.0) * capacity_kw * temp_correction,
        capacity_kw,
    )

    return {
        "timestamp": utc_time.isoformat(),
        "poa_irradiance_w_m2": round(poa_total, 2),
        "solar_zenith_deg": round(solar_zenith, 2),
        "solar_azimuth_deg": round(solar_azimuth, 2),
        "temperature_c": temp,
        "temp_correction_factor": round(temp_correction, 4),
        "physics_power_kw": round(physics_power_kw, 4),
        "capacity_kw": capacity_kw,
    }


async def run_physics_update(db: AsyncSession, plant_id: int) -> dict:
    """
    Fetch the latest SCADA reading for a plant and compute physics features.

    Designed to be called from a periodic task or an API endpoint.
    """
    from app.services.plant_service import get_plant, get_plant_config

    plant = await get_plant(db, plant_id)
    config = await get_plant_config(db, plant_id)

    result = await db.execute(
        select(ScadaReading)
        .where(ScadaReading.plant_id == plant_id)
        .order_by(ScadaReading.timestamp.desc())
        .limit(1)
    )
    latest: Optional[ScadaReading] = result.scalar_one_or_none()

    timestamp = latest.timestamp if latest else datetime.now(tz=timezone.utc)
    irradiance = latest.irradiance_w_m2 if latest else None
    temperature = latest.temperature_c if latest else None

    features = compute_physics_features(
        latitude=plant.latitude,
        longitude=plant.longitude,
        tilt=config.tilt,
        azimuth=config.azimuth,
        capacity_kw=plant.capacity_kw,
        efficiency=config.efficiency,
        timestamp=timestamp,
        irradiance_w_m2=irradiance,
        temperature_c=temperature,
    )

    # Update expected_power_kw on the latest SCADA reading
    if latest:
        latest.expected_power_kw = features["physics_power_kw"]
        await db.commit()

    logger.info(f"Physics update: plant={plant_id} physics_power={features['physics_power_kw']:.2f} kW")
    return features
