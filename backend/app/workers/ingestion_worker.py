"""
app/workers/ingestion_worker.py

SCADA/NWP data ingestion worker.

Architecture:
- WeatherAdapter: clean interface for external weather/NWP APIs
- MockWeatherAdapter: development mock when API credentials are absent
- run_ingestion_cycle(): call explicitly from a scheduler/startup hook

No real external API is required for local development.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.scada import ScadaReading
from app.schemas.scada import ScadaReadingCreate

logger = get_logger(__name__)


# ── Weather/NWP adapter interface ─────────────────────────────────────────────

class WeatherAdapter:
    """
    Base adapter interface for external weather/NWP data sources.

    Override fetch_weather() in a subclass to connect a real API.
    """

    def fetch_weather(self, latitude: float, longitude: float, timestamp: datetime) -> Dict:
        raise NotImplementedError


class MockWeatherAdapter(WeatherAdapter):
    """
    Development mock — generates plausible weather data without API credentials.

    The generated values are NOT real meteorological data.
    """

    def fetch_weather(self, latitude: float, longitude: float, timestamp: datetime) -> Dict:
        hour = timestamp.hour
        # Simple diurnal irradiance approximation
        if 6 <= hour <= 18:
            irradiance = max(0.0, 900.0 * abs((hour - 12) / 6.0 - 1.0 + 1.0) * random.uniform(0.7, 1.0))
        else:
            irradiance = 0.0

        return {
            "irradiance_w_m2": round(irradiance, 1),
            "temperature_c": round(random.uniform(20.0, 35.0), 1),
            "wind_speed_m_s": round(random.uniform(1.0, 8.0), 1),
        }


class RealWeatherAdapter(WeatherAdapter):
    """
    Placeholder for a real NWP/weather API adapter.

    Configure NWP_API_URL and NWP_API_KEY in .env to use this.
    """

    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url
        self.api_key = api_key

    def fetch_weather(self, latitude: float, longitude: float, timestamp: datetime) -> Dict:
        # TODO: implement real HTTP call to NWP API
        raise NotImplementedError(
            "Real weather adapter not implemented. "
            "Set NWP_API_URL and NWP_API_KEY in .env and implement the HTTP call."
        )


def get_weather_adapter() -> WeatherAdapter:
    """Return the appropriate adapter based on configuration."""
    if settings.NWP_API_URL and settings.NWP_API_KEY:
        logger.info("Using real weather adapter")
        return RealWeatherAdapter(settings.NWP_API_URL, settings.NWP_API_KEY)
    logger.debug("NWP credentials not configured — using mock weather adapter")
    return MockWeatherAdapter()


# ── Ingestion helpers ─────────────────────────────────────────────────────────


def _generate_mock_scada_reading(
    plant_id: int,
    weather: Dict,
    capacity_kw: float,
    timestamp: Optional[datetime] = None,
) -> ScadaReadingCreate:
    """Build a mock SCADA reading using weather data."""
    ts = timestamp or datetime.now(tz=timezone.utc)
    irr = weather.get("irradiance_w_m2", 0.0)
    temp = weather.get("temperature_c", 25.0)
    wind = weather.get("wind_speed_m_s", 2.0)

    # Simple power estimate
    power = min(irr / 1000.0 * capacity_kw * 0.18, capacity_kw)
    power *= random.uniform(0.93, 1.02)  # small noise
    power = max(0.0, power)

    return ScadaReadingCreate(
        plant_id=plant_id,
        timestamp=ts,
        power_kw=round(power, 3),
        irradiance_w_m2=irr,
        temperature_c=temp,
        wind_speed_m_s=wind,
        module_temperature_c=round(temp + irr * 0.03, 1),
        inverter_power_kw=round(power * 0.98, 3),
    )


async def run_ingestion_cycle(
    db: AsyncSession,
    plant_id: int,
    latitude: float,
    longitude: float,
    capacity_kw: float,
) -> ScadaReading:
    """
    Ingest one SCADA reading for a plant.

    Uses mock data in development when NWP credentials are not configured.
    """
    adapter = get_weather_adapter()
    now = datetime.now(tz=timezone.utc)

    try:
        weather = adapter.fetch_weather(latitude, longitude, now)
    except NotImplementedError:
        logger.warning("Real weather adapter not implemented. Falling back to mock.")
        weather = MockWeatherAdapter().fetch_weather(latitude, longitude, now)

    reading_schema = _generate_mock_scada_reading(plant_id, weather, capacity_kw, now)
    reading = ScadaReading(**reading_schema.model_dump())
    db.add(reading)
    await db.commit()
    await db.refresh(reading)
    logger.info(
        f"Ingestion cycle complete: plant={plant_id} "
        f"power={reading.power_kw:.2f} kW irr={reading.irradiance_w_m2:.1f} W/m²"
    )
    return reading
