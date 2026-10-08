"""
app/models/scada.py

SQLAlchemy ORM model for ScadaReading.
Designed to be compatible with TimescaleDB hypertables.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional

from app.core.database import Base


class ScadaReading(Base):
    __tablename__ = "scada_readings"
    __table_args__ = (
        # Compound index for time-series queries — critical for TimescaleDB
        Index("ix_scada_plant_timestamp", "plant_id", "timestamp"),
        Index("ix_scada_timestamp", "timestamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plant_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    power_kw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    irradiance_w_m2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wind_speed_m_s: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    module_temperature_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    inverter_power_kw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    expected_power_kw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(tz=timezone.utc),
        nullable=False,
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant", back_populates="scada_readings")  # type: ignore[name-defined]
